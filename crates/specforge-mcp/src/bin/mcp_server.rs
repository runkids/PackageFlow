// SpecForge MCP Server
// Provides MCP (Model Context Protocol) tools for AI assistants like Claude Code
//
// Run with: cargo run --bin specforge-mcp
// Or install: cargo install --path . --bin specforge-mcp
//
// This server provides spec-focused tools for managing specs, schemas, workflows, and git.

// MCP server modules (extracted for maintainability)
mod mcp;
use mcp::{
    // Types
    types::*,
    // Security
    ToolCategory, get_tool_category, is_tool_allowed,
    // State
    RATE_LIMITER, TOOL_RATE_LIMITERS,
    // Templates
    get_builtin_schemas,
    // Store (database access)
    read_store_data, log_request, open_database,
    // Background process management
    BACKGROUND_PROCESS_MANAGER, CLEANUP_INTERVAL_SECS,
    // Instance management
    InstanceManager,
};

use std::path::PathBuf;
use std::time::{Duration, Instant};

use chrono::Utc;
use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    handler::server::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::*,
    service::RequestContext,
    tool, tool_router,
};
use tokio::io::{stdin, stdout};
#[cfg(unix)]
use tokio::signal::unix::{signal, SignalKind};
use rusqlite::params;

// Import shared store utilities (for validation)
use specforge_lib::utils::shared_store::{
    validate_path,
};

// Import MCP types from models
use specforge_lib::models::mcp::MCPServerConfig;

// Import path_resolver for proper command execution on macOS GUI apps
use specforge_lib::utils::path_resolver;

// ============================================================================
// MCP Server Implementation
// ============================================================================

#[derive(Clone)]
pub struct SpecForgeMcp {
    /// Tool router for handling tool calls
    tool_router: ToolRouter<Self>,
}

impl SpecForgeMcp {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    /// Execute a git command and return the output
    fn git_command(cwd: &str, args: &[&str]) -> Result<String, String> {
        let mut cmd = path_resolver::create_command("git");
        let output = cmd
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to execute git: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// Check if a path is a git repository
    fn is_git_repo(path: &str) -> bool {
        Self::git_command(path, &["rev-parse", "--git-dir"]).is_ok()
    }

    /// Get the current branch name
    fn get_current_branch(path: &str) -> Option<String> {
        Self::git_command(path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .ok()
            .map(|s| s.trim().to_string())
    }

    // ========================================================================
    // Spec helpers (direct file I/O + SQLite)
    // ========================================================================

    /// Open a project-local SQLite database at .specforge/specforge.db
    /// Falls back to the global app database if project-local doesn't exist.
    fn open_project_db(_project_dir: &str) -> Result<specforge_lib::utils::database::Database, String> {
        // Use the global app database (shared with Tauri app)
        open_database()
    }

    /// Parse YAML frontmatter from a spec markdown file.
    /// Returns (frontmatter_yaml, body)
    fn parse_spec_frontmatter(content: &str) -> Result<(String, String), String> {
        let trimmed = content.trim_start();
        if !trimmed.starts_with("---") {
            return Err("Missing frontmatter: content must start with '---'".to_string());
        }

        let after_first = &trimmed[3..];
        let end_idx = after_first
            .find("\n---")
            .ok_or("Missing closing '---' for frontmatter")?;

        let yaml_content = after_first[..end_idx].to_string();
        let body_start = end_idx + 4;
        let body = if body_start < after_first.len() {
            after_first[body_start..].trim().to_string()
        } else {
            String::new()
        };

        Ok((yaml_content, body))
    }

    /// Read a spec from its markdown file, returning full JSON representation
    fn read_spec_file(project_dir: &str, id: &str) -> Result<serde_json::Value, String> {
        let file_path = PathBuf::from(project_dir)
            .join(".specforge")
            .join("specs")
            .join(format!("{}.md", id));

        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read spec file {}: {}", file_path.display(), e))?;

        let (yaml_str, body) = Self::parse_spec_frontmatter(&content)?;

        let mut spec: serde_json::Value = serde_yaml::from_str(&yaml_str)
            .map_err(|e| format!("Failed to parse frontmatter YAML: {}", e))?;

        if let Some(obj) = spec.as_object_mut() {
            obj.insert("body".to_string(), serde_json::Value::String(body));
            obj.insert("file_path".to_string(), serde_json::Value::String(
                file_path.to_string_lossy().to_string()
            ));
        }

        Ok(spec)
    }

    /// Generate a spec ID: spec-{YYYY-MM-DD}-{slug}-{4hex}
    fn generate_spec_id(title: &str) -> String {
        use rand::Rng;
        let date = chrono::Utc::now().format("%Y-%m-%d");
        let slug: String = title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect();
        let slug: String = slug
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");
        let slug: String = slug.chars().take(40).collect();
        let slug = slug.trim_end_matches('-');

        let mut rng = rand::thread_rng();
        let hex: String = format!("{:04x}", rng.gen_range(0..0x10000u32));
        format!("spec-{}-{}-{}", date, slug, hex)
    }

    /// Write a spec to disk as markdown with YAML frontmatter.
    /// Returns the relative file path.
    fn write_spec_file(
        project_dir: &str,
        spec: &serde_json::Value,
        body: &str,
    ) -> Result<String, String> {
        let specs_dir = PathBuf::from(project_dir).join(".specforge").join("specs");
        std::fs::create_dir_all(&specs_dir)
            .map_err(|e| format!("Failed to create specs directory: {}", e))?;

        let id = spec.get("id").and_then(|v| v.as_str())
            .ok_or("Spec missing 'id' field")?;

        // Build YAML frontmatter (exclude body and file_path)
        let mut frontmatter = spec.clone();
        if let Some(obj) = frontmatter.as_object_mut() {
            obj.remove("body");
            obj.remove("file_path");
        }

        let yaml = serde_yaml::to_string(&frontmatter)
            .map_err(|e| format!("Failed to serialize YAML: {}", e))?;

        let mut content = String::from("---\n");
        content.push_str(&yaml);
        content.push_str("---\n");
        if !body.is_empty() {
            content.push('\n');
            content.push_str(body);
            content.push('\n');
        }

        let abs_path = specs_dir.join(format!("{}.md", id));

        use fs2::FileExt;
        let file = std::fs::File::create(&abs_path)
            .map_err(|e| format!("Failed to create spec file: {}", e))?;
        file.lock_exclusive()
            .map_err(|e| format!("Failed to lock spec file: {}", e))?;
        std::fs::write(&abs_path, content)
            .map_err(|e| format!("Failed to write spec file: {}", e))?;
        file.unlock()
            .map_err(|e| format!("Failed to unlock spec file: {}", e))?;

        Ok(format!(".specforge/specs/{}.md", id))
    }

    /// Insert/update a spec row in the SQLite index
    fn upsert_spec_in_db(
        db: &specforge_lib::utils::database::Database,
        spec: &serde_json::Value,
        file_path: &str,
    ) -> Result<(), String> {
        let id = spec.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let schema_id = spec.get("schema").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let title = spec.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let status = spec.get("status").and_then(|v| v.as_str()).unwrap_or("draft").to_string();
        let workflow_id = spec.get("workflow").and_then(|v| v.as_str()).map(|s| s.to_string());
        let workflow_phase = spec.get("workflow_phase").and_then(|v| v.as_str()).map(|s| s.to_string());
        let created_at = spec.get("created_at").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let updated_at = spec.get("updated_at").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let fields_json = spec.get("fields")
            .map(|v| serde_json::to_string(v).unwrap_or_default());
        let file_path = file_path.to_string();

        db.with_connection(|conn| {
            conn.execute(
                r#"
                INSERT OR REPLACE INTO specs (id, schema_id, title, status, workflow_id, workflow_phase, file_path, fields_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![id, schema_id, title, status, workflow_id, workflow_phase, file_path, fields_json, created_at, updated_at],
            ).map_err(|e| format!("Failed to upsert spec in database: {}", e))?;
            Ok(())
        })
    }

    /// Load schema definitions from .specforge/schemas/*.schema.yaml
    fn load_schemas_from_dir(project_dir: &str) -> Result<Vec<serde_json::Value>, String> {
        let schemas_dir = PathBuf::from(project_dir).join(".specforge").join("schemas");
        if !schemas_dir.exists() {
            return Ok(Vec::new());
        }

        let mut schemas = Vec::new();
        let entries = std::fs::read_dir(&schemas_dir)
            .map_err(|e| format!("Failed to read schemas directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if !file_name.ends_with(".schema.yaml") {
                continue;
            }

            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read schema file {}: {}", path.display(), e))?;

            let schema: serde_json::Value = serde_yaml::from_str(&content)
                .map_err(|e| format!("Failed to parse schema {}: {}", file_name, e))?;

            schemas.push(schema);
        }

        Ok(schemas)
    }

    /// Build default field values from schema definition
    fn build_default_fields(schema: &serde_json::Value) -> serde_json::Value {
        let mut fields = serde_json::Map::new();

        if let Some(field_defs) = schema.get("fields").and_then(|f| f.as_object()) {
            for (name, field_type) in field_defs {
                if name == "title" || name == "status" {
                    continue;
                }
                match field_type {
                    serde_json::Value::String(type_name) => match type_name.as_str() {
                        "string" | "date" => {
                            fields.insert(name.clone(), serde_json::Value::String(String::new()));
                        }
                        "number" => {
                            fields.insert(name.clone(), serde_json::json!(0));
                        }
                        "list" => {
                            fields.insert(name.clone(), serde_json::Value::Array(Vec::new()));
                        }
                        _ => {}
                    },
                    serde_json::Value::Array(values) => {
                        // Enum type - pick first value as default
                        if let Some(first) = values.first() {
                            fields.insert(name.clone(), first.clone());
                        }
                    }
                    _ => {}
                }
            }
        }

        serde_json::Value::Object(fields)
    }

    /// Build body with ## section headings from schema
    fn build_body_from_schema(schema: &serde_json::Value) -> String {
        let mut body = String::new();

        if let Some(sections) = schema.get("sections").and_then(|s| s.as_array()) {
            for section in sections {
                let name = section.get("name").and_then(|n| n.as_str()).unwrap_or("section");
                let display_name: String = name
                    .split('-')
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            Some(c) => {
                                let upper: String = c.to_uppercase().collect();
                                format!("{}{}", upper, chars.collect::<String>())
                            }
                            None => String::new(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" ");

                if !body.is_empty() {
                    body.push('\n');
                }
                body.push_str(&format!("## {}\n\n", display_name));
            }
        }
        body
    }
}

// Implement tools using the tool_router macro
#[tool_router]
impl SpecForgeMcp {
    // ========================================================================
    // Spec Operations
    // ========================================================================

    /// Create a new spec from a schema
    #[tool(description = "Create a new spec from a schema. Writes a markdown file with YAML frontmatter to .specforge/specs/ and indexes it in SQLite. Returns the created spec as JSON.")]
    async fn create_spec(
        &self,
        Parameters(params): Parameters<CreateSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_dir = &params.project_dir;
        let schema_name = &params.schema;
        let title = &params.title;

        // Validate .specforge exists
        let specforge_dir = PathBuf::from(project_dir).join(".specforge");
        if !specforge_dir.exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("No .specforge/ directory found in {}. Run init_project first.", project_dir)
            )]));
        }

        // Load schemas from disk
        let schemas = Self::load_schemas_from_dir(project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        let schema = schemas.iter()
            .find(|s| s.get("name").and_then(|n| n.as_str()) == Some(schema_name))
            .ok_or_else(|| McpError::internal_error(
                format!("Schema not found: {}. Available: {:?}",
                    schema_name,
                    schemas.iter().filter_map(|s| s.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>()
                ), None
            ))?;

        let id = Self::generate_spec_id(title);
        let now = Utc::now().to_rfc3339();
        let fields = Self::build_default_fields(schema);
        let body = Self::build_body_from_schema(schema);

        let spec = serde_json::json!({
            "id": id,
            "schema": schema_name,
            "title": title,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
            "fields": fields,
        });

        // Write to disk
        let file_path = Self::write_spec_file(project_dir, &spec, &body)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Insert into SQLite index
        let conn = Self::open_project_db(project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;
        Self::upsert_spec_in_db(&conn, &spec, &file_path)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Return spec with body
        let mut result = spec;
        if let Some(obj) = result.as_object_mut() {
            obj.insert("body".to_string(), serde_json::Value::String(body));
            obj.insert("file_path".to_string(), serde_json::Value::String(file_path));
        }

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// List specs from the SQLite index
    #[tool(description = "List all specs in the project. Supports optional filters by status and workflow_phase. Returns an array of spec summaries (without body).")]
    async fn list_specs(
        &self,
        Parameters(params): Parameters<ListSpecsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        let status_clone = params.status.clone();
        let wp_clone = params.workflow_phase.clone();

        let specs: Vec<serde_json::Value> = db.with_connection(|conn| {
            let mut sql = String::from(
                "SELECT id, schema_id, title, status, workflow_id, workflow_phase, file_path, fields_json, created_at, updated_at FROM specs"
            );
            let mut conditions: Vec<String> = Vec::new();
            let mut bind_values: Vec<String> = Vec::new();

            if let Some(ref status) = status_clone {
                conditions.push(format!("status = ?{}", bind_values.len() + 1));
                bind_values.push(status.clone());
            }
            if let Some(ref wp) = wp_clone {
                conditions.push(format!("workflow_phase = ?{}", bind_values.len() + 1));
                bind_values.push(wp.clone());
            }

            if !conditions.is_empty() {
                sql.push_str(" WHERE ");
                sql.push_str(&conditions.join(" AND "));
            }
            sql.push_str(" ORDER BY updated_at DESC");

            let mut stmt = conn.prepare(&sql)
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let params_refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter()
                .map(|v| v as &dyn rusqlite::types::ToSql)
                .collect();

            let rows = stmt.query_map(params_refs.as_slice(), |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "schema": row.get::<_, String>(1)?,
                    "title": row.get::<_, String>(2)?,
                    "status": row.get::<_, String>(3)?,
                    "workflow": row.get::<_, Option<String>>(4)?,
                    "workflow_phase": row.get::<_, Option<String>>(5)?,
                    "file_path": row.get::<_, String>(6)?,
                    "fields_json": row.get::<_, Option<String>>(7)?,
                    "created_at": row.get::<_, String>(8)?,
                    "updated_at": row.get::<_, String>(9)?,
                }))
            }).map_err(|e| format!("Failed to query specs: {}", e))?;

            let mut result = Vec::new();
            for row in rows {
                if let Ok(spec) = row {
                    result.push(spec);
                }
            }
            Ok(result)
        }).map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "specs": specs,
            "total": specs.len()
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get a single spec with full body content
    #[tool(description = "Get a spec by ID including its full markdown body. Reads directly from the file on disk (source of truth).")]
    async fn get_spec(
        &self,
        Parameters(params): Parameters<GetSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        let spec = Self::read_spec_file(&params.project_dir, &params.id)
            .map_err(|e| McpError::internal_error(e, None))?;

        let json = serde_json::to_string_pretty(&spec)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Update a spec's fields and/or body
    #[tool(description = "Update a spec's fields and/or body. Reads the current file, applies changes, writes back to disk, and updates the SQLite index.")]
    async fn update_spec(
        &self,
        Parameters(params): Parameters<UpdateSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        // Read current spec from file
        let mut spec = Self::read_spec_file(&params.project_dir, &params.id)
            .map_err(|e| McpError::internal_error(e, None))?;

        let current_body = spec.get("body")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        // Apply field updates
        if let Some(ref fields_val) = params.fields {
            if let Some(updates) = fields_val.as_object() {
                if let Some(spec_obj) = spec.as_object_mut() {
                    for (key, value) in updates {
                        match key.as_str() {
                            "title" | "status" | "workflow" | "workflow_phase" => {
                                spec_obj.insert(key.clone(), value.clone());
                            }
                            _ => {
                                // Add to fields sub-object
                                let fields = spec_obj
                                    .entry("fields")
                                    .or_insert_with(|| serde_json::json!({}));
                                if let Some(f) = fields.as_object_mut() {
                                    f.insert(key.clone(), value.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Update timestamp
        if let Some(obj) = spec.as_object_mut() {
            obj.insert("updated_at".to_string(),
                serde_json::Value::String(Utc::now().to_rfc3339()));
        }

        // Determine body to write
        let body = params.body.as_deref().unwrap_or(&current_body);

        // Write back to disk
        let file_path = Self::write_spec_file(&params.project_dir, &spec, body)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Update SQLite index
        let conn = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;
        Self::upsert_spec_in_db(&conn, &spec, &file_path)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Return updated spec
        if let Some(obj) = spec.as_object_mut() {
            obj.insert("body".to_string(), serde_json::Value::String(body.to_string()));
            obj.insert("file_path".to_string(), serde_json::Value::String(file_path));
        }

        let json = serde_json::to_string_pretty(&spec)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Delete a spec file and its SQLite index entry
    #[tool(description = "Delete a spec by ID. Removes the file from disk and its entry from the SQLite index.")]
    async fn delete_spec(
        &self,
        Parameters(params): Parameters<DeleteSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        let file_path = PathBuf::from(&params.project_dir)
            .join(".specforge")
            .join("specs")
            .join(format!("{}.md", params.id));

        // Remove file
        if file_path.exists() {
            std::fs::remove_file(&file_path)
                .map_err(|e| McpError::internal_error(format!("Failed to delete spec file: {}", e), None))?;
        }

        // Remove from SQLite
        let db = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;
        let spec_id = params.id.clone();
        db.with_connection(|conn| {
            conn.execute("DELETE FROM specs WHERE id = ?1", params![spec_id])
                .map_err(|e| format!("Failed to delete spec from database: {}", e))?;
            Ok(())
        }).map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "deleted": true,
            "id": params.id
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Workflow Operations
    // ========================================================================

    /// Advance a spec to the next workflow phase
    #[tool(description = "Advance a spec to the next workflow phase. Updates the spec's workflow_phase field, writes to disk and SQLite. If to_phase is omitted, returns available transitions.")]
    async fn advance_spec(
        &self,
        Parameters(params): Parameters<AdvanceSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        // Read current spec
        let mut spec = Self::read_spec_file(&params.project_dir, &params.spec_id)
            .map_err(|e| McpError::internal_error(e, None))?;

        let current_phase = spec.get("workflow_phase")
            .and_then(|v| v.as_str())
            .unwrap_or("draft")
            .to_string();

        // Try to load workflow definition
        let workflow_path = PathBuf::from(&params.project_dir)
            .join(".specforge")
            .join("workflows")
            .join("default.workflow.yaml");

        let workflow: Option<serde_json::Value> = if workflow_path.exists() {
            let content = std::fs::read_to_string(&workflow_path)
                .map_err(|e| McpError::internal_error(format!("Failed to read workflow: {}", e), None))?;
            Some(serde_yaml::from_str(&content)
                .map_err(|e| McpError::internal_error(format!("Failed to parse workflow: {}", e), None))?)
        } else {
            None
        };

        // Find available transitions from current phase
        let transitions: Vec<serde_json::Value> = workflow.as_ref()
            .and_then(|w| w.get("transitions"))
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|t| t.get("from").and_then(|f| f.as_str()) == Some(&current_phase))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();

        if let Some(ref to_phase) = params.to_phase {
            // Validate transition exists
            let valid = transitions.iter().any(|t|
                t.get("to").and_then(|v| v.as_str()) == Some(to_phase)
            );

            if !valid {
                let available: Vec<&str> = transitions.iter()
                    .filter_map(|t| t.get("to").and_then(|v| v.as_str()))
                    .collect();
                return Ok(CallToolResult::error(vec![Content::text(
                    format!("Cannot transition from '{}' to '{}'. Available transitions: {:?}",
                        current_phase, to_phase, available)
                )]));
            }

            // Apply transition
            if let Some(obj) = spec.as_object_mut() {
                obj.insert("workflow_phase".to_string(),
                    serde_json::Value::String(to_phase.clone()));
                obj.insert("updated_at".to_string(),
                    serde_json::Value::String(Utc::now().to_rfc3339()));
            }

            let body = spec.get("body").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let file_path = Self::write_spec_file(&params.project_dir, &spec, &body)
                .map_err(|e| McpError::internal_error(e, None))?;

            let db = Self::open_project_db(&params.project_dir)
                .map_err(|e| McpError::internal_error(e, None))?;
            Self::upsert_spec_in_db(&db, &spec, &file_path)
                .map_err(|e| McpError::internal_error(e, None))?;

            // Record in phase_history
            let spec_id = params.spec_id.clone();
            let cp = current_phase.clone();
            let tp = to_phase.clone();
            let _ = db.with_connection(|conn| {
                conn.execute(
                    "INSERT INTO phase_history (instance_id, from_phase, to_phase, transitioned_at) VALUES (?1, ?2, ?3, ?4)",
                    params![spec_id, cp, tp, Utc::now().to_rfc3339()],
                ).map_err(|e| format!("{}", e))?;
                Ok(())
            });

            let response = serde_json::json!({
                "success": true,
                "spec_id": params.spec_id,
                "from_phase": current_phase,
                "to_phase": to_phase,
            });

            let json = serde_json::to_string_pretty(&response)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            Ok(CallToolResult::success(vec![Content::text(json)]))
        } else {
            // Return available transitions
            let available: Vec<serde_json::Value> = transitions.iter().map(|t| {
                serde_json::json!({
                    "to": t.get("to"),
                    "gate": t.get("gate"),
                })
            }).collect();

            let response = serde_json::json!({
                "spec_id": params.spec_id,
                "current_phase": current_phase,
                "available_transitions": available,
            });

            let json = serde_json::to_string_pretty(&response)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            Ok(CallToolResult::success(vec![Content::text(json)]))
        }
    }

    /// Submit a review for a spec
    #[tool(description = "Submit a review (approve/reject) for a spec. Records the review in the spec_reviews table.")]
    async fn review_spec(
        &self,
        Parameters(params): Parameters<ReviewSpecParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Get current phase from spec
        let spec = Self::read_spec_file(&params.project_dir, &params.spec_id)
            .map_err(|e| McpError::internal_error(e, None))?;
        let phase = spec.get("workflow_phase")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let now = Utc::now().to_rfc3339();
        let spec_id = params.spec_id.clone();
        let approved_int = params.approved as i32;
        let comment = params.comment.clone();
        let phase_clone = phase.clone();

        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO spec_reviews (spec_id, phase, reviewer, approved, comment, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![spec_id, phase_clone, "mcp-reviewer", approved_int, comment, now],
            ).map_err(|e| format!("Failed to insert review: {}", e))?;
            Ok(())
        }).map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "success": true,
            "spec_id": params.spec_id,
            "phase": phase,
            "approved": params.approved,
            "comment": params.comment,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get workflow status for a spec
    #[tool(description = "Get the current workflow phase, available transitions, and gate info for a spec.")]
    async fn get_workflow_status(
        &self,
        Parameters(params): Parameters<GetWorkflowStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let spec = Self::read_spec_file(&params.project_dir, &params.spec_id)
            .map_err(|e| McpError::internal_error(e, None))?;

        let current_phase = spec.get("workflow_phase")
            .and_then(|v| v.as_str())
            .unwrap_or("draft");

        let workflow_id = spec.get("workflow")
            .and_then(|v| v.as_str())
            .unwrap_or("default");

        // Load workflow
        let workflow_path = PathBuf::from(&params.project_dir)
            .join(".specforge")
            .join("workflows")
            .join(format!("{}.workflow.yaml", workflow_id));

        let workflow: Option<serde_json::Value> = if workflow_path.exists() {
            std::fs::read_to_string(&workflow_path).ok()
                .and_then(|content| serde_yaml::from_str(&content).ok())
        } else {
            None
        };

        let transitions: Vec<serde_json::Value> = workflow.as_ref()
            .and_then(|w| w.get("transitions"))
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|t| t.get("from").and_then(|f| f.as_str()) == Some(current_phase))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();

        let phases: Vec<serde_json::Value> = workflow.as_ref()
            .and_then(|w| w.get("phases"))
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        // Get review count
        let db = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        let spec_id = params.spec_id.clone();
        let (review_count, approved_count) = db.with_connection(|conn| {
            let rc: i64 = conn.query_row(
                "SELECT COUNT(*) FROM spec_reviews WHERE spec_id = ?1",
                params![spec_id],
                |row| row.get(0),
            ).unwrap_or(0);
            let ac: i64 = conn.query_row(
                "SELECT COUNT(*) FROM spec_reviews WHERE spec_id = ?1 AND approved = 1",
                params![spec_id],
                |row| row.get(0),
            ).unwrap_or(0);
            Ok((rc, ac))
        }).map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "spec_id": params.spec_id,
            "current_phase": current_phase,
            "workflow_id": workflow_id,
            "phases": phases,
            "available_transitions": transitions,
            "reviews": {
                "total": review_count,
                "approved": approved_count,
            }
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get detailed gate evaluation for a spec
    #[tool(description = "Get detailed gate evaluation results for the current phase's transitions. Shows which gates pass/fail and why.")]
    async fn get_gate_status(
        &self,
        Parameters(params): Parameters<GetGateStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let spec = Self::read_spec_file(&params.project_dir, &params.spec_id)
            .map_err(|e| McpError::internal_error(e, None))?;

        let current_phase = spec.get("workflow_phase")
            .and_then(|v| v.as_str())
            .unwrap_or("draft");

        // Load workflow
        let workflow_path = PathBuf::from(&params.project_dir)
            .join(".specforge")
            .join("workflows")
            .join("default.workflow.yaml");

        let workflow: Option<serde_json::Value> = if workflow_path.exists() {
            std::fs::read_to_string(&workflow_path).ok()
                .and_then(|content| serde_yaml::from_str(&content).ok())
        } else {
            None
        };

        let transitions: Vec<serde_json::Value> = workflow.as_ref()
            .and_then(|w| w.get("transitions"))
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter(|t| t.get("from").and_then(|f| f.as_str()) == Some(current_phase))
                    .map(|t| {
                        let gate = t.get("gate");
                        serde_json::json!({
                            "to": t.get("to"),
                            "gate": gate,
                            "has_gate": gate.is_some(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let response = serde_json::json!({
            "spec_id": params.spec_id,
            "current_phase": current_phase,
            "transitions": transitions,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Schema Operations
    // ========================================================================

    /// List available schemas
    #[tool(description = "List all available schema definitions from the project's .specforge/schemas/ directory.")]
    async fn list_schemas(
        &self,
        Parameters(params): Parameters<ListSchemasParams>,
    ) -> Result<CallToolResult, McpError> {
        let schemas = Self::load_schemas_from_dir(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "schemas": schemas,
            "total": schemas.len()
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get a single schema by name
    #[tool(description = "Get a schema definition by name from .specforge/schemas/{name}.schema.yaml.")]
    async fn get_schema(
        &self,
        Parameters(params): Parameters<GetSchemaParams>,
    ) -> Result<CallToolResult, McpError> {
        let schema_path = PathBuf::from(&params.project_dir)
            .join(".specforge")
            .join("schemas")
            .join(format!("{}.schema.yaml", params.name));

        if !schema_path.exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Schema not found: {}", params.name)
            )]));
        }

        let content = std::fs::read_to_string(&schema_path)
            .map_err(|e| McpError::internal_error(format!("Failed to read schema: {}", e), None))?;

        let schema: serde_json::Value = serde_yaml::from_str(&content)
            .map_err(|e| McpError::internal_error(format!("Failed to parse schema: {}", e), None))?;

        let json = serde_json::to_string_pretty(&schema)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Project Operations
    // ========================================================================

    /// Initialize .specforge/ directory structure
    #[tool(description = "Initialize the .specforge/ directory structure in a project. Use preset 'basic-sdd' for built-in schemas + workflow, or 'blank' for empty structure.")]
    async fn init_project(
        &self,
        Parameters(params): Parameters<InitProjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_dir = &params.project_dir;
        let preset = &params.preset;

        let base = PathBuf::from(project_dir).join(".specforge");

        // Create directory structure
        let subdirs = ["schemas", "templates", "workflows", "specs", "archive"];
        for sub in &subdirs {
            std::fs::create_dir_all(base.join(sub))
                .map_err(|e| McpError::internal_error(
                    format!("Failed to create .specforge/{}: {}", sub, e), None
                ))?;
        }

        if preset == "basic-sdd" {
            // Write built-in schemas
            for (filename, content) in get_builtin_schemas() {
                let path = base.join("schemas").join(filename);
                std::fs::write(&path, content)
                    .map_err(|e| McpError::internal_error(
                        format!("Failed to write {}: {}", filename, e), None
                    ))?;
            }

            // Write default workflow
            let workflow_path = base.join("workflows").join("default.workflow.yaml");
            std::fs::write(&workflow_path, mcp::templates::DEFAULT_WORKFLOW_YAML)
                .map_err(|e| McpError::internal_error(
                    format!("Failed to write default workflow: {}", e), None
                ))?;

            // Sync schemas into SQLite
            let db = Self::open_project_db(project_dir)
                .map_err(|e| McpError::internal_error(e, None))?;

            let schemas = Self::load_schemas_from_dir(project_dir)
                .map_err(|e| McpError::internal_error(e, None))?;

            db.with_connection(|conn| {
                for schema in &schemas {
                    let name = schema.get("name").and_then(|n| n.as_str()).unwrap_or_default();
                    let display_name = schema.get("display_name").and_then(|n| n.as_str());
                    let fields_json = schema.get("fields")
                        .map(|f| serde_json::to_string(f).unwrap_or_default())
                        .unwrap_or_default();
                    let rel_path = format!(".specforge/schemas/{}.schema.yaml", name);
                    let now = Utc::now().to_rfc3339();

                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO schemas (id, name, display_name, file_path, fields_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![name, name, display_name, rel_path, fields_json, now],
                    );
                }
                Ok(())
            }).map_err(|e| McpError::internal_error(e, None))?;
        }

        let response = serde_json::json!({
            "success": true,
            "project_dir": project_dir,
            "preset": preset,
            "directories_created": subdirs,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Agent Operations
    // ========================================================================

    /// Get agent run history
    #[tool(description = "Get agent run history. Optionally filter by spec_id.")]
    async fn get_agent_runs(
        &self,
        Parameters(params): Parameters<GetAgentRunsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = Self::open_project_db(&params.project_dir)
            .map_err(|e| McpError::internal_error(e, None))?;

        let spec_id_filter = params.spec_id.clone();

        let rows: Vec<serde_json::Value> = db.with_connection(|conn| {
            let (sql, bind_val) = if let Some(ref spec_id) = spec_id_filter {
                (
                    "SELECT id, spec_id, phase, prompt, status, pid, started_at, finished_at, error FROM agent_runs WHERE spec_id = ?1 ORDER BY started_at DESC",
                    Some(spec_id.clone()),
                )
            } else {
                (
                    "SELECT id, spec_id, phase, prompt, status, pid, started_at, finished_at, error FROM agent_runs ORDER BY started_at DESC",
                    None,
                )
            };

            let mut stmt = conn.prepare(sql)
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let row_mapper = |row: &rusqlite::Row| -> rusqlite::Result<serde_json::Value> {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "spec_id": row.get::<_, String>(1)?,
                    "phase": row.get::<_, String>(2)?,
                    "prompt": row.get::<_, String>(3)?,
                    "status": row.get::<_, String>(4)?,
                    "pid": row.get::<_, Option<u32>>(5)?,
                    "started_at": row.get::<_, String>(6)?,
                    "finished_at": row.get::<_, Option<String>>(7)?,
                    "error": row.get::<_, Option<String>>(8)?,
                }))
            };

            let result: Vec<serde_json::Value> = if let Some(ref val) = bind_val {
                stmt.query_map(params![val], row_mapper)
            } else {
                stmt.query_map([], row_mapper)
            }
            .map_err(|e| format!("Failed to query agent runs: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
            Ok(result)
        }).map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "agent_runs": rows,
            "total": rows.len()
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Git Operations
    // ========================================================================

    /// Get git status
    #[tool(description = "Get git status including current branch, ahead/behind counts, staged files, modified files, and untracked files.")]
    async fn git_status(
        &self,
        Parameters(params): Parameters<GitStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = &params.project_dir;

        if !PathBuf::from(path).exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Path does not exist: {}", path)
            )]));
        }

        if !Self::is_git_repo(path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", path)
            )]));
        }

        let branch = Self::get_current_branch(path)
            .unwrap_or_else(|| "HEAD".to_string());

        let (ahead, behind) = Self::git_command(path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
            .ok()
            .and_then(|s| {
                let parts: Vec<&str> = s.trim().split_whitespace().collect();
                if parts.len() == 2 {
                    Some((
                        parts[0].parse::<i32>().unwrap_or(0),
                        parts[1].parse::<i32>().unwrap_or(0),
                    ))
                } else {
                    None
                }
            })
            .unwrap_or((0, 0));

        let status_output = Self::git_command(path, &["status", "--porcelain"])
            .unwrap_or_default();

        let mut staged = Vec::new();
        let mut modified = Vec::new();
        let mut untracked = Vec::new();

        for line in status_output.lines() {
            if line.len() < 3 { continue; }
            let index_status = line.chars().next().unwrap_or(' ');
            let worktree_status = line.chars().nth(1).unwrap_or(' ');
            let file_path = line[3..].to_string();

            if index_status != ' ' && index_status != '?' {
                staged.push(file_path.clone());
            }
            if worktree_status == 'M' {
                modified.push(file_path.clone());
            }
            if index_status == '?' {
                untracked.push(file_path);
            }
        }

        let response = serde_json::json!({
            "branch": branch,
            "ahead": ahead,
            "behind": behind,
            "staged": staged,
            "modified": modified,
            "untracked": untracked,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get staged changes diff
    #[tool(description = "Get the staged changes diff. Useful for generating commit messages. Returns the diff content along with statistics.")]
    async fn git_diff(
        &self,
        Parameters(params): Parameters<GitDiffParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = &params.project_dir;

        if !PathBuf::from(path).exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Path does not exist: {}", path)
            )]));
        }

        if !Self::is_git_repo(path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", path)
            )]));
        }

        let diff = Self::git_command(path, &["diff", "--cached"])
            .unwrap_or_default();

        if diff.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "No staged changes. Please stage files first with 'git add'."
            )]));
        }

        let stats = Self::git_command(path, &["diff", "--cached", "--stat"])
            .unwrap_or_default();

        let mut files_changed: usize = 0;
        let mut insertions: usize = 0;
        let mut deletions: usize = 0;

        for line in stats.lines() {
            if line.contains("files changed") || line.contains("file changed") {
                for part in line.split(',') {
                    let part = part.trim();
                    if part.contains("file") {
                        files_changed = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok()).unwrap_or(0);
                    } else if part.contains("insertion") {
                        insertions = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok()).unwrap_or(0);
                    } else if part.contains("deletion") {
                        deletions = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok()).unwrap_or(0);
                    }
                }
            }
        }

        let response = serde_json::json!({
            "diff": diff,
            "files_changed": files_changed,
            "insertions": insertions,
            "deletions": deletions,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Create and checkout a new git branch
    #[tool(description = "Create and checkout a new git branch.")]
    async fn git_create_branch(
        &self,
        Parameters(params): Parameters<GitCreateBranchParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = &params.project_dir;

        if !Self::is_git_repo(path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", path)
            )]));
        }

        Self::git_command(path, &["checkout", "-b", &params.branch_name])
            .map_err(|e| McpError::internal_error(format!("Failed to create branch: {}", e), None))?;

        let response = serde_json::json!({
            "success": true,
            "branch": params.branch_name,
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Commit staged changes
    #[tool(description = "Commit staged changes with a message.")]
    async fn git_commit(
        &self,
        Parameters(params): Parameters<GitCommitParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = &params.project_dir;

        if !Self::is_git_repo(path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", path)
            )]));
        }

        let output = Self::git_command(path, &["commit", "-m", &params.message])
            .map_err(|e| McpError::internal_error(format!("Failed to commit: {}", e), None))?;

        // Extract commit hash
        let commit_hash = Self::git_command(path, &["rev-parse", "HEAD"])
            .ok()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        let response = serde_json::json!({
            "success": true,
            "commit_hash": commit_hash,
            "message": params.message,
            "output": output.trim(),
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
}

// Implement ServerHandler trait for the MCP server
impl ServerHandler for SpecForgeMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::default(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability::default()),
                ..Default::default()
            },
            server_info: Implementation {
                name: "specforge-mcp".to_string(),
                title: Some("SpecForge MCP Server".to_string()),
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                website_url: None,
            },
            instructions: Some("SpecForge MCP Server provides tools for managing specs, schemas, workflows, and git operations in spec-driven development projects.".to_string()),
        }
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<rmcp::RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListToolsResult, McpError>> + Send + '_ {
        async move {
            Ok(ListToolsResult {
                tools: self.tool_router.list_all(),
                next_cursor: None,
            })
        }
    }

    fn call_tool(
        &self,
        request: CallToolRequestParam,
        context: RequestContext<rmcp::RoleServer>,
    ) -> impl std::future::Future<Output = Result<CallToolResult, McpError>> + Send + '_ {
        async move {
            let start_time = Instant::now();
            let tool_name = request.name.clone();
            let arguments_map = request.arguments.clone().unwrap_or_default();
            let arguments = serde_json::Value::Object(arguments_map.clone());

            // Read MCP config from store
            let config = match read_store_data() {
                Ok(data) => data.mcp_config,
                Err(_) => MCPServerConfig::default(),
            };

            // Check if MCP server is enabled
            if !config.is_enabled {
                let error_msg = "MCP Server is disabled. Enable it in SpecForge settings.";
                if config.log_requests {
                    log_request(&tool_name, &arguments, "permission_denied", 0, Some(error_msg));
                }
                return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
            }

            // Check global rate limit
            if let Err(rate_error) = RATE_LIMITER.check_and_increment() {
                if config.log_requests {
                    log_request(&tool_name, &arguments, "rate_limited", 0, Some(&rate_error));
                }
                return Ok(CallToolResult::error(vec![Content::text(rate_error)]));
            }

            // Check tool-level rate limit
            let tool_category = get_tool_category(&tool_name);
            if let Err(_) = TOOL_RATE_LIMITERS.check(tool_category) {
                let limit_desc = TOOL_RATE_LIMITERS.get_limit_description(tool_category);
                let error_msg = format!(
                    "Tool rate limit exceeded for '{}'. Limit: {}.",
                    tool_name, limit_desc
                );
                if config.log_requests {
                    log_request(&tool_name, &arguments, "tool_rate_limited", 0, Some(&error_msg));
                }
                return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
            }

            // Check permission
            if let Err(permission_error) = is_tool_allowed(&tool_name, &config) {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                if config.log_requests {
                    log_request(&tool_name, &arguments, "permission_denied", duration_ms, Some(&permission_error));
                }
                return Ok(CallToolResult::error(vec![Content::text(permission_error)]));
            }

            // Validate project_dir / projectDir path parameter
            let project_dir_value = arguments.get("project_dir")
                .or_else(|| arguments.get("projectDir"))
                .and_then(|v| v.as_str());
            if let Some(path) = project_dir_value {
                if let Err(e) = validate_path(path) {
                    let error_msg = format!("Invalid project_dir: {}", e);
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }

            // Execute the tool
            let tool_context = rmcp::handler::server::tool::ToolCallContext::new(self, request, context);
            let result = self.tool_router.call(tool_context).await;
            let duration_ms = start_time.elapsed().as_millis() as u64;

            // Log the request
            let should_log = config.log_requests
                || tool_category == ToolCategory::Write
                || tool_category == ToolCategory::Execute;

            if should_log {
                match &result {
                    Ok(call_result) => {
                        let result_status = if call_result.is_error.unwrap_or(false) {
                            "error"
                        } else {
                            "success"
                        };
                        log_request(&tool_name, &arguments, result_status, duration_ms, None);
                    }
                    Err(e) => {
                        log_request(&tool_name, &arguments, "error", duration_ms, Some(&e.to_string()));
                    }
                }
            }

            result
        }
    }
}

/// Print help information
fn print_help() {
    let version = env!("CARGO_PKG_VERSION");
    println!(r#"SpecForge MCP Server v{}

USAGE:
    specforge-mcp [OPTIONS]

OPTIONS:
    --help, -h      Print this help information
    --version, -v   Print version information
    --list-tools    List all available MCP tools

DESCRIPTION:
    SpecForge MCP Server provides AI assistants (Claude Code, Cursor, etc.)
    with tools for spec-driven development.

MCP TOOLS:

  SPEC OPERATIONS
    create_spec         Create a new spec from a schema
    list_specs          List specs with optional filters
    get_spec            Get full spec with body
    update_spec         Update spec fields/body
    delete_spec         Delete a spec

  WORKFLOW OPERATIONS
    advance_spec        Advance spec to next workflow phase
    review_spec         Submit a review for a spec
    get_workflow_status Get workflow phase + transitions
    get_gate_status     Get gate evaluation details

  SCHEMA OPERATIONS
    list_schemas        List available schemas
    get_schema          Get a schema definition

  PROJECT OPERATIONS
    init_project        Initialize .specforge/ directory

  AGENT OPERATIONS
    get_agent_runs      Get agent run history

  GIT OPERATIONS
    git_status          Get git status
    git_diff            Get staged changes diff
    git_create_branch   Create and checkout a new branch
    git_commit          Commit staged changes

CONFIGURATION:
    Configure in SpecForge: Settings -> MCP Server
"#, version);
}

/// Print version information
fn print_version() {
    println!("specforge-mcp {}", env!("CARGO_PKG_VERSION"));
}

/// List all tools in a simple format
fn list_tools_simple() {
    use mcp::ALL_TOOLS;

    println!("SpecForge MCP Tools:\n");

    let mut current_category = "";
    for tool in ALL_TOOLS.iter() {
        if tool.display_category != current_category {
            if !current_category.is_empty() {
                println!();
            }
            println!("  # {}", tool.display_category);
            current_category = tool.display_category;
        }
        println!("  {:<35} {}", tool.name, tool.description);
    }
    println!();
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Parse command line arguments
    let args: Vec<String> = std::env::args().collect();

    for arg in &args[1..] {
        match arg.as_str() {
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            "--version" | "-v" => {
                print_version();
                return Ok(());
            }
            "--list-tools" => {
                list_tools_simple();
                return Ok(());
            }
            _ => {
                eprintln!("Unknown option: {}", arg);
                eprintln!("Use --help for usage information");
                std::process::exit(1);
            }
        }
    }

    // Initialize smart instance manager
    let mut instance_manager = InstanceManager::new();
    match instance_manager.initialize().await {
        Ok(result) => {
            eprintln!("[MCP Server] Instance manager initialized");
            if result.stale_killed > 0 {
                eprintln!("[MCP Server] Cleaned up {} stale instances", result.stale_killed);
            }
            if result.orphaned_cleaned > 0 {
                eprintln!("[MCP Server] Cleaned up {} orphaned instances", result.orphaned_cleaned);
            }
            if result.active_count > 0 {
                eprintln!("[MCP Server] {} other active instances running", result.active_count);
            }
        }
        Err(e) => {
            eprintln!("[MCP Server] Warning: Instance manager init failed: {}", e);
        }
    }

    eprintln!("[MCP Server] Starting SpecForge MCP Server (PID: {})...", std::process::id());

    // Check database at startup
    match read_store_data() {
        Ok(data) => {
            eprintln!("[MCP Server] Database read successful");
            eprintln!("[MCP Server] Config - is_enabled: {}", data.mcp_config.is_enabled);
            eprintln!("[MCP Server] Config - permission_mode: {:?}", data.mcp_config.permission_mode);
        }
        Err(e) => eprintln!("[MCP Server] Database read failed: {}", e),
    }

    // Create the MCP server
    let server = SpecForgeMcp::new();

    // Run with stdio transport
    let transport = (stdin(), stdout());
    let service = rmcp::serve_server(server, transport).await?;

    // Spawn background process cleanup task
    tokio::spawn(async {
        let mut interval = tokio::time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
        loop {
            interval.tick().await;
            BACKGROUND_PROCESS_MANAGER.cleanup().await;
        }
    });

    // Signal handlers for graceful shutdown
    #[cfg(unix)]
    {
        let mut sigterm = signal(SignalKind::terminate())?;
        let mut sigint = signal(SignalKind::interrupt())?;
        let mut sighup = signal(SignalKind::hangup())?;

        tokio::select! {
            result = service.waiting() => {
                match result {
                    Ok(_) => eprintln!("[MCP Server] Service ended normally"),
                    Err(e) => eprintln!("[MCP Server] Service ended with error: {:?}", e),
                }
            }
            _ = sigterm.recv() => {
                eprintln!("[MCP Server] Received SIGTERM, shutting down gracefully...");
            }
            _ = sigint.recv() => {
                eprintln!("[MCP Server] Received SIGINT, shutting down gracefully...");
            }
            _ = sighup.recv() => {
                eprintln!("[MCP Server] Received SIGHUP (parent process died), shutting down...");
            }
        }
    }

    #[cfg(not(unix))]
    {
        service.waiting().await?;
    }

    // Cleanup
    BACKGROUND_PROCESS_MANAGER.shutdown().await;
    instance_manager.shutdown().await;

    eprintln!("[MCP Server] Shutdown complete");
    Ok(())
}
