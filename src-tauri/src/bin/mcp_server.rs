// PackageFlow MCP Server
// Provides MCP (Model Context Protocol) tools for AI assistants like Claude Code
//
// Run with: cargo run --bin packageflow-mcp
// Or install: cargo install --path . --bin packageflow-mcp
//
// This server uses SQLite database for data storage with WAL mode for concurrent access.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tokio::time::timeout as tokio_timeout;

use chrono::Utc;
use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    handler::server::tool::{ToolCallContext, ToolRouter},
    handler::server::wrapper::Parameters,
    model::*,
    service::RequestContext,
    tool, tool_router,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::io::{stdin, stdout};
#[cfg(unix)]
use tokio::signal::unix::{signal, SignalKind};
use uuid::Uuid;

// Import SQLite database and repositories
use packageflow_lib::utils::database::Database;
use packageflow_lib::repositories::{
    ProjectRepository, WorkflowRepository, SettingsRepository,
    TemplateRepository, MCPRepository, McpLogEntry,
};

// Import shared store utilities (for validation, rate limiting, etc.)
use packageflow_lib::utils::shared_store::{
    // Path utilities
    get_app_data_dir,
    // Error handling
    sanitize_error,
    // Input validation
    validate_path, validate_command, validate_string_length, validate_timeout,
    MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH,
    // Output sanitization
    sanitize_output,
    // Rate limiting
    RateLimiter,
};

// Import MCP types from models
use packageflow_lib::models::mcp::{MCPPermissionMode, MCPServerConfig};

// Import path_resolver for proper command execution on macOS GUI apps
use packageflow_lib::utils::path_resolver;

// Global rate limiters for the MCP server
// Different limits based on tool category to prevent abuse of dangerous operations
use once_cell::sync::Lazy;

/// Global rate limiter (100 requests/minute) - applies to all requests
static RATE_LIMITER: Lazy<RateLimiter> = Lazy::new(|| RateLimiter::default());

/// Tool-level rate limiters with category-specific limits
struct ToolRateLimiters {
    /// Read-only tools: 200 requests/minute (generous)
    read_only: RateLimiter,
    /// Write tools: 30 requests/minute (moderate)
    write: RateLimiter,
    /// Execute tools: 10 requests/minute (strict)
    execute: RateLimiter,
}

impl Default for ToolRateLimiters {
    fn default() -> Self {
        Self {
            read_only: RateLimiter::new(200, 60),   // 200/min
            write: RateLimiter::new(30, 60),        // 30/min
            execute: RateLimiter::new(10, 60),      // 10/min
        }
    }
}

impl ToolRateLimiters {
    /// Check rate limit based on tool category
    fn check(&self, category: ToolCategory) -> Result<(), String> {
        match category {
            ToolCategory::ReadOnly => self.read_only.check_and_increment(),
            ToolCategory::Write => self.write.check_and_increment(),
            ToolCategory::Execute => self.execute.check_and_increment(),
        }
    }

    /// Get the limit description for error messages
    fn get_limit_description(&self, category: ToolCategory) -> &'static str {
        match category {
            ToolCategory::ReadOnly => "200 requests/minute for read-only tools",
            ToolCategory::Write => "30 requests/minute for write tools",
            ToolCategory::Execute => "10 requests/minute for execute tools",
        }
    }
}

static TOOL_RATE_LIMITERS: Lazy<ToolRateLimiters> = Lazy::new(ToolRateLimiters::default);

// Note: MCP permission types are now imported from packageflow_lib::models::mcp

/// Tool permission category
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ToolCategory {
    /// Read-only operations (always allowed)
    ReadOnly,
    /// Write operations (create, update, delete)
    Write,
    /// Execute operations (run commands, workflows)
    Execute,
}

/// Get the permission category for a tool
fn get_tool_category(tool_name: &str) -> ToolCategory {
    match tool_name {
        // Read-only tools
        "get_project" | "list_worktrees" | "get_worktree_status" | "get_git_diff" |
        "list_workflows" | "get_workflow" | "list_step_templates" => ToolCategory::ReadOnly,
        // Write tools
        "create_workflow" | "add_workflow_step" | "create_step_template" => ToolCategory::Write,
        // Execute tools
        "run_workflow" => ToolCategory::Execute,
        // Unknown tools default to Execute (most restrictive)
        _ => ToolCategory::Execute,
    }
}

/// Check if a tool is allowed based on permission mode and allowed_tools list
fn is_tool_allowed(tool_name: &str, config: &MCPServerConfig) -> Result<(), String> {
    // Check allowed_tools whitelist first (if non-empty)
    if !config.allowed_tools.is_empty() && !config.allowed_tools.contains(&tool_name.to_string()) {
        return Err(format!(
            "Tool '{}' is not in the allowed tools list. Allowed: {:?}",
            tool_name, config.allowed_tools
        ));
    }

    // Check permission mode
    let category = get_tool_category(tool_name);

    match config.permission_mode {
        MCPPermissionMode::ReadOnly => {
            if category != ToolCategory::ReadOnly {
                return Err(format!(
                    "Tool '{}' requires write/execute permission, but MCP server is in read-only mode. \
                    Change permission mode in PackageFlow settings to enable this tool.",
                    tool_name
                ));
            }
        }
        MCPPermissionMode::ExecuteWithConfirm | MCPPermissionMode::FullAccess => {
            // Allow all tools
        }
    }

    Ok(())
}

/// Log an MCP request to SQLite database (enhanced audit logging)
///
/// Records:
/// - Timestamp (UTC)
/// - Tool name and arguments
/// - Result status and duration
/// - Sanitized error messages (no path leakage)
/// - Source identifier (mcp_server)
///
/// Uses SQLite with WAL mode for concurrent access from both MCP server and main app.
fn log_request(
    tool_name: &str,
    arguments: &serde_json::Value,
    result: &str,
    duration_ms: u64,
    error: Option<&str>,
) {
    // Open database connection
    let db = match open_database() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("[MCP Log] Failed to open database for logging: {}", e);
            return; // Silently fail if we can't open database
        }
    };

    let repo = MCPRepository::new(db);

    // Sanitize error message to prevent information leakage
    let sanitized_error = error.map(|e| sanitize_error(e));

    // Sanitize arguments that might contain sensitive paths
    let sanitized_args = sanitize_arguments(arguments);

    let log_entry = McpLogEntry {
        id: None, // Auto-generated by database
        timestamp: Utc::now(),
        tool: tool_name.to_string(),
        arguments: sanitized_args,
        result: result.to_string(),
        duration_ms,
        error: sanitized_error,
        source: Some("mcp_server".to_string()),
    };

    if let Err(e) = repo.insert_log(&log_entry) {
        eprintln!("[MCP Log] Failed to insert log entry: {}", e);
    }
}

/// Sanitize arguments to remove or obscure sensitive paths
fn sanitize_arguments(args: &serde_json::Value) -> serde_json::Value {
    match args {
        serde_json::Value::Object(map) => {
            let mut sanitized = serde_json::Map::new();
            for (key, value) in map {
                let sanitized_value = if key == "path" || key == "cwd" || key == "project_path" {
                    // Sanitize path values
                    match value {
                        serde_json::Value::String(s) => {
                            serde_json::Value::String(sanitize_error(s))
                        }
                        _ => sanitize_arguments(value),
                    }
                } else {
                    sanitize_arguments(value)
                };
                sanitized.insert(key.clone(), sanitized_value);
            }
            serde_json::Value::Object(sanitized)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(sanitize_arguments).collect())
        }
        other => other.clone(),
    }
}

/// Get the SQLite database path
fn get_database_path() -> Result<PathBuf, String> {
    let app_dir = get_app_data_dir()?;
    Ok(app_dir.join("packageflow.db"))
}

/// Open the SQLite database
fn open_database() -> Result<Database, String> {
    let db_path = get_database_path()?;
    eprintln!("[MCP Debug] Opening database at: {:?}", db_path);
    Database::new(db_path)
}

// SQLite settings key for MCP config
const MCP_CONFIG_KEY: &str = "mcp_server_config";

/// Read store data from SQLite database
fn read_store_data() -> Result<StoreData, String> {
    let db_path = get_database_path()?;
    eprintln!("[MCP Debug] Reading from SQLite: {:?}", db_path);
    eprintln!("[MCP Debug] Database exists: {}", db_path.exists());

    let db = open_database()?;

    // Read from repositories
    let project_repo = ProjectRepository::new(db.clone());
    let workflow_repo = WorkflowRepository::new(db.clone());
    let settings_repo = SettingsRepository::new(db.clone());
    let template_repo = TemplateRepository::new(db.clone());

    // Get MCP config
    let mcp_config: MCPServerConfig = settings_repo
        .get(MCP_CONFIG_KEY)?
        .unwrap_or_default();
    eprintln!("[MCP Debug] mcp_config: {:?}", mcp_config);

    // Get projects (map library Project to local simplified Project)
    let projects: Vec<Project> = project_repo
        .list()?
        .into_iter()
        .map(|p| Project {
            id: p.id,
            name: p.name,
            path: p.path,
            description: p.description,
        })
        .collect();

    // Get workflows (map library Workflow to local Workflow)
    // Note: Library WorkflowNode uses `name` and `config` (JSON),
    //       position is Option<NodePosition> which needs conversion
    let workflows: Vec<Workflow> = workflow_repo
        .list()?
        .into_iter()
        .map(|w| Workflow {
            id: w.id,
            name: w.name,
            description: w.description,
            project_id: w.project_id,
            nodes: w.nodes.into_iter().map(|n| {
                // Convert library NodePosition to local NodePosition
                let position = n.position.map(|p| NodePosition { x: p.x, y: p.y });
                WorkflowNode {
                    id: n.id,
                    node_type: n.node_type,
                    name: n.name,
                    config: n.config,
                    order: n.order,
                    position,
                }
            }).collect(),
            created_at: w.created_at,
            updated_at: w.updated_at,
            last_executed_at: w.last_executed_at,
            webhook: w.webhook.map(|wh| serde_json::to_value(wh).unwrap_or_default()),
            incoming_webhook: w.incoming_webhook.map(|iwh| serde_json::to_value(iwh).unwrap_or_default()),
        })
        .collect();

    // Get custom step templates
    let custom_step_templates: Vec<CustomStepTemplate> = template_repo
        .list()?
        .into_iter()
        .map(|t| CustomStepTemplate {
            id: t.id,
            name: t.name,
            command: t.command,
            category: format!("{:?}", t.category).to_lowercase().replace("_", "-"),
            description: t.description,
            is_custom: t.is_custom,
            created_at: t.created_at,
        })
        .collect();

    Ok(StoreData {
        version: "1.0".to_string(),
        projects,
        workflows,
        running_executions: HashMap::new(), // Running executions are in memory
        settings: serde_json::Value::Null,
        security_scans: HashMap::new(),
        custom_step_templates,
        mcp_config,
    })
}

/// Write store data to SQLite database
///
/// Uses SQLite with WAL mode for:
/// - Concurrent read/write access
/// - Atomic transactions
/// - Data integrity
fn write_store_data(data: &StoreData) -> Result<(), String> {
    eprintln!("[MCP Debug] write_store_data called");
    eprintln!("[MCP Debug] - workflows count: {}", data.workflows.len());
    eprintln!("[MCP Debug] - projects count: {}", data.projects.len());

    let db = open_database()?;
    let workflow_repo = WorkflowRepository::new(db.clone());
    let template_repo = TemplateRepository::new(db.clone());
    let settings_repo = SettingsRepository::new(db.clone());

    // Save workflows
    for workflow in &data.workflows {
        let w = packageflow_lib::models::Workflow {
            id: workflow.id.clone(),
            name: workflow.name.clone(),
            description: workflow.description.clone(),
            project_id: workflow.project_id.clone(),
            nodes: workflow.nodes.iter().map(|n| {
                // Convert local NodePosition to library NodePosition
                let position = n.position.as_ref().map(|p| {
                    packageflow_lib::models::workflow::NodePosition { x: p.x, y: p.y }
                });
                packageflow_lib::models::WorkflowNode {
                    id: n.id.clone(),
                    node_type: n.node_type.clone(),
                    name: n.name.clone(),
                    config: n.config.clone(),
                    order: n.order,
                    position,
                }
            }).collect(),
            webhook: None,
            incoming_webhook: None,
            created_at: workflow.created_at.clone(),
            updated_at: workflow.updated_at.clone(),
            last_executed_at: workflow.last_executed_at.clone(),
        };
        workflow_repo.save(&w)?;
    }

    // Save custom step templates
    for template in &data.custom_step_templates {
        let t = packageflow_lib::models::step_template::CustomStepTemplate {
            id: template.id.clone(),
            name: template.name.clone(),
            command: template.command.clone(),
            category: packageflow_lib::models::step_template::TemplateCategory::Custom,
            description: template.description.clone(),
            is_custom: template.is_custom,
            created_at: template.created_at.clone(),
        };
        template_repo.save(&t)?;
    }

    // Save MCP config
    settings_repo.set(MCP_CONFIG_KEY, &data.mcp_config)?;

    eprintln!("[MCP Debug] write_store_data SUCCESS");
    Ok(())
}

// ============================================================================
// Store Data Types (local types for MCP Server processing)
// Note: Uses MCPServerConfig from packageflow_lib::models::mcp
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreData {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub workflows: Vec<Workflow>,
    #[serde(default)]
    pub running_executions: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub settings: serde_json::Value,
    #[serde(default)]
    pub security_scans: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub custom_step_templates: Vec<CustomStepTemplate>,
    /// MCP Server configuration (imported from packageflow_lib)
    #[serde(default)]
    pub mcp_config: MCPServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub nodes: Vec<WorkflowNode>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_executed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming_webhook: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub name: String,
    pub config: serde_json::Value,
    pub order: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<NodePosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomStepTemplate {
    pub id: String,
    pub name: String,
    pub command: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub is_custom: bool,
    pub created_at: String,
}

fn default_true() -> bool {
    true
}

// ============================================================================
// Built-in Step Templates (subset of most commonly used)
// ============================================================================

fn get_builtin_templates() -> Vec<StepTemplateInfo> {
    vec![
        // Package Manager
        StepTemplateInfo {
            id: "pm-install".to_string(),
            name: "Install Dependencies".to_string(),
            command: "{pm} install".to_string(),
            category: "package-manager".to_string(),
            description: Some("Install project dependencies".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "pm-build".to_string(),
            name: "Build Project".to_string(),
            command: "{pm} run build".to_string(),
            category: "package-manager".to_string(),
            description: Some("Run the build script".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "pm-test".to_string(),
            name: "Run Tests".to_string(),
            command: "{pm} test".to_string(),
            category: "package-manager".to_string(),
            description: Some("Run test suite".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "pm-dev".to_string(),
            name: "Start Dev Server".to_string(),
            command: "{pm} run dev".to_string(),
            category: "package-manager".to_string(),
            description: Some("Start development server".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "pm-clean-install".to_string(),
            name: "Clean Install".to_string(),
            command: "rm -rf node_modules && {pm} install".to_string(),
            category: "package-manager".to_string(),
            description: Some("Remove node_modules and reinstall".to_string()),
            is_custom: false,
        },
        // Git
        StepTemplateInfo {
            id: "git-status".to_string(),
            name: "Git Status".to_string(),
            command: "git status".to_string(),
            category: "git".to_string(),
            description: Some("Show working tree status".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "git-add-all".to_string(),
            name: "Git Add All".to_string(),
            command: "git add .".to_string(),
            category: "git".to_string(),
            description: Some("Stage all changes".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "git-commit".to_string(),
            name: "Git Commit".to_string(),
            command: "git commit -m \"Update\"".to_string(),
            category: "git".to_string(),
            description: Some("Commit staged changes".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "git-push".to_string(),
            name: "Git Push".to_string(),
            command: "git push".to_string(),
            category: "git".to_string(),
            description: Some("Push to remote".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "git-pull".to_string(),
            name: "Git Pull".to_string(),
            command: "git pull".to_string(),
            category: "git".to_string(),
            description: Some("Pull from remote".to_string()),
            is_custom: false,
        },
        // Docker
        StepTemplateInfo {
            id: "docker-build".to_string(),
            name: "Docker Build".to_string(),
            command: "docker build -t myapp .".to_string(),
            category: "docker".to_string(),
            description: Some("Build Docker image".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "docker-compose-up".to_string(),
            name: "Docker Compose Up".to_string(),
            command: "docker-compose up -d".to_string(),
            category: "docker".to_string(),
            description: Some("Start services in detached mode".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "docker-compose-down".to_string(),
            name: "Docker Compose Down".to_string(),
            command: "docker-compose down".to_string(),
            category: "docker".to_string(),
            description: Some("Stop and remove containers".to_string()),
            is_custom: false,
        },
        // Testing
        StepTemplateInfo {
            id: "test-coverage".to_string(),
            name: "Test with Coverage".to_string(),
            command: "{pm} run test:coverage".to_string(),
            category: "testing".to_string(),
            description: Some("Run tests with coverage report".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "test-watch".to_string(),
            name: "Test Watch Mode".to_string(),
            command: "{pm} run test:watch".to_string(),
            category: "testing".to_string(),
            description: Some("Run tests in watch mode".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "vitest".to_string(),
            name: "Vitest".to_string(),
            command: "vitest".to_string(),
            category: "testing".to_string(),
            description: Some("Run Vitest test runner".to_string()),
            is_custom: false,
        },
        // Code Quality
        StepTemplateInfo {
            id: "lint".to_string(),
            name: "Lint".to_string(),
            command: "{pm} run lint".to_string(),
            category: "code-quality".to_string(),
            description: Some("Run linter".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "lint-fix".to_string(),
            name: "Lint Fix".to_string(),
            command: "{pm} run lint -- --fix".to_string(),
            category: "code-quality".to_string(),
            description: Some("Run linter with auto-fix".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "format".to_string(),
            name: "Format".to_string(),
            command: "{pm} run format".to_string(),
            category: "code-quality".to_string(),
            description: Some("Format code".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "typecheck".to_string(),
            name: "Type Check".to_string(),
            command: "tsc --noEmit".to_string(),
            category: "code-quality".to_string(),
            description: Some("Run TypeScript type checking".to_string()),
            is_custom: false,
        },
        // Shell
        StepTemplateInfo {
            id: "shell-echo".to_string(),
            name: "Echo".to_string(),
            command: "echo \"Hello World\"".to_string(),
            category: "shell".to_string(),
            description: Some("Print message to stdout".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "shell-sleep".to_string(),
            name: "Sleep".to_string(),
            command: "sleep 5".to_string(),
            category: "shell".to_string(),
            description: Some("Wait for 5 seconds".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "shell-env".to_string(),
            name: "Print Environment".to_string(),
            command: "env".to_string(),
            category: "shell".to_string(),
            description: Some("Print environment variables".to_string()),
            is_custom: false,
        },
        // Rust/Cargo
        StepTemplateInfo {
            id: "cargo-build".to_string(),
            name: "Cargo Build".to_string(),
            command: "cargo build".to_string(),
            category: "rust".to_string(),
            description: Some("Build Rust project".to_string()),
            is_custom: false,
        },
        StepTemplateInfo {
            id: "cargo-test".to_string(),
            name: "Cargo Test".to_string(),
            command: "cargo test".to_string(),
            category: "rust".to_string(),
            description: Some("Run Rust tests".to_string()),
            is_custom: false,
        },
    ]
}

// ============================================================================
// Parameter Types for Tools (must derive JsonSchema)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetProjectParams {
    /// The absolute path to the project directory
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWorktreesParams {
    /// The absolute path to the project directory
    pub project_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorktreeStatusParams {
    /// The absolute path to the worktree or project directory
    pub worktree_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetGitDiffParams {
    /// The absolute path to the worktree or project directory
    pub worktree_path: String,
}

// New: Workflow tools parameters
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListWorkflowsParams {
    /// Optional project ID to filter workflows
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetWorkflowParams {
    /// The workflow ID
    pub workflow_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateWorkflowParams {
    /// Workflow name
    pub name: String,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Optional project ID to associate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AddWorkflowStepParams {
    /// Target workflow ID
    pub workflow_id: String,
    /// Step name
    pub name: String,
    /// Shell command to execute
    pub command: String,
    /// Optional working directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Optional timeout in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    /// Optional position (defaults to end)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ListStepTemplatesParams {
    /// Filter by category (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Search query (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    /// Include built-in templates (default: true)
    #[serde(default = "default_include_builtin")]
    pub include_builtin: bool,
}

fn default_include_builtin() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateStepTemplateParams {
    /// Template name
    pub name: String,
    /// Shell command
    pub command: String,
    /// Category (default: "custom")
    #[serde(default = "default_category")]
    pub category: String,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_category() -> String {
    "custom".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RunWorkflowParams {
    /// Workflow ID to execute
    pub workflow_id: String,
    /// Optional project path override (for working directory)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
}

// ============================================================================
// Response Types for Tools
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_remote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
    pub is_bare: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GitStatusInfo {
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
    pub staged: Vec<String>,
    pub modified: Vec<String>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DiffInfo {
    pub diff: String,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

// New: Workflow response types
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSummary {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub step_count: usize,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_executed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowResponse {
    pub workflow_id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddStepResponse {
    pub node_id: String,
    pub workflow_id: String,
    pub name: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StepTemplateInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateResponse {
    pub template_id: String,
    pub name: String,
    pub category: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunWorkflowResponse {
    pub success: bool,
    pub workflow_id: String,
    pub workflow_name: String,
    pub steps_executed: usize,
    pub total_steps: usize,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_step: Option<FailedStepInfo>,
    pub output_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FailedStepInfo {
    pub node_id: String,
    pub node_name: String,
    pub exit_code: i32,
    pub error_message: String,
}

// ============================================================================
// MCP Server Implementation
// ============================================================================

#[derive(Clone)]
pub struct PackageFlowMcp {
    /// Tool router for handling tool calls
    tool_router: ToolRouter<Self>,
}

impl PackageFlowMcp {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    /// Execute a git command and return the output
    ///
    /// Uses path_resolver for proper environment setup on macOS GUI apps:
    /// - Sets correct PATH to find git
    /// - Sets SSH_AUTH_SOCK for SSH key authentication
    fn git_command(cwd: &str, args: &[&str]) -> Result<String, String> {
        // Use path_resolver::create_command for proper PATH and SSH_AUTH_SOCK setup
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

    /// Get the remote URL
    fn get_remote_url(path: &str) -> Option<String> {
        Self::git_command(path, &["remote", "get-url", "origin"])
            .ok()
            .map(|s| s.trim().to_string())
    }

    /// Execute a shell command with timeout enforcement
    ///
    /// Uses path_resolver for proper environment setup on macOS GUI apps:
    /// - Sets correct PATH including Volta, Homebrew, Cargo paths
    /// - Sets HOME, SSH_AUTH_SOCK, VOLTA_HOME environment variables
    /// - Sets terminal/encoding environment (TERM, LANG, FORCE_COLOR)
    ///
    /// Security features:
    /// - Default timeout: 5 minutes (300,000 ms)
    /// - Maximum timeout: 1 hour (from validation)
    /// - Returns error if command exceeds timeout
    async fn shell_command_async(cwd: &str, command: &str, timeout_ms: Option<u64>) -> Result<(i32, String, String), String> {
        // Default timeout: 5 minutes, max is enforced by validate_timeout (1 hour)
        let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(300_000));

        // Use path_resolver::create_async_command for proper environment setup
        // This ensures the command has access to Volta, Homebrew, and other tools
        let mut cmd = path_resolver::create_async_command("sh");
        cmd.arg("-c")
            .arg(command)
            .current_dir(cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // Spawn the child process
        let child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        // Wait for output with timeout
        let result = tokio_timeout(timeout_duration, child.wait_with_output()).await;

        match result {
            Ok(output_result) => {
                let output = output_result
                    .map_err(|e| format!("Failed to execute command: {}", e))?;

                let exit_code = output.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                Ok((exit_code, stdout, stderr))
            }
            Err(_) => {
                // Timeout occurred
                Err(format!(
                    "Command execution timed out after {} seconds. The process has been terminated.",
                    timeout_duration.as_secs()
                ))
            }
        }
    }

}

// Implement tools using the tool_router macro
#[tool_router]
impl PackageFlowMcp {
    // ========================================================================
    // Existing Git Tools
    // ========================================================================

    /// Get information about a project at the specified path
    #[tool(description = "Get detailed information about a git project including name, remote URL, and current branch")]
    async fn get_project(
        &self,
        Parameters(params): Parameters<GetProjectParams>,
    ) -> Result<CallToolResult, McpError> {
        let path = params.path;

        let path_buf = PathBuf::from(&path);
        if !path_buf.exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Project path does not exist: {}", path)
            )]));
        }

        if !Self::is_git_repo(&path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", path)
            )]));
        }

        let project = ProjectInfo {
            path: path.clone(),
            name: path_buf
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string()),
            git_remote: Self::get_remote_url(&path),
            current_branch: Self::get_current_branch(&path),
        };

        let json = serde_json::to_string_pretty(&project)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// List all git worktrees for a project
    #[tool(description = "List all git worktrees for a project, showing path, branch, and whether it's the main worktree")]
    async fn list_worktrees(
        &self,
        Parameters(params): Parameters<ListWorktreesParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_path = params.project_path;

        if !PathBuf::from(&project_path).exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Project path does not exist: {}", project_path)
            )]));
        }

        if !Self::is_git_repo(&project_path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", project_path)
            )]));
        }

        let output = Self::git_command(&project_path, &["worktree", "list", "--porcelain"])
            .map_err(|e| McpError::internal_error(e, None))?;

        let mut worktrees = Vec::new();
        let mut current_worktree: Option<WorktreeInfo> = None;

        for line in output.lines() {
            if line.starts_with("worktree ") {
                if let Some(wt) = current_worktree.take() {
                    worktrees.push(wt);
                }
                let path = line.strip_prefix("worktree ").unwrap_or("").to_string();
                current_worktree = Some(WorktreeInfo {
                    path,
                    branch: String::new(),
                    is_main: false,
                    is_bare: false,
                });
            } else if line.starts_with("branch ") {
                if let Some(ref mut wt) = current_worktree {
                    wt.branch = line
                        .strip_prefix("branch refs/heads/")
                        .unwrap_or(line.strip_prefix("branch ").unwrap_or(""))
                        .to_string();
                }
            } else if line == "bare" {
                if let Some(ref mut wt) = current_worktree {
                    wt.is_bare = true;
                }
            }
        }

        if let Some(wt) = current_worktree {
            worktrees.push(wt);
        }

        if let Some(first) = worktrees.iter_mut().find(|w| !w.is_bare) {
            first.is_main = true;
        }

        let response = serde_json::json!({ "worktrees": worktrees });
        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get git status for a specific worktree or project
    #[tool(description = "Get git status including current branch, ahead/behind counts, staged files, modified files, and untracked files")]
    async fn get_worktree_status(
        &self,
        Parameters(params): Parameters<GetWorktreeStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let worktree_path = params.worktree_path;

        if !PathBuf::from(&worktree_path).exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Path does not exist: {}", worktree_path)
            )]));
        }

        if !Self::is_git_repo(&worktree_path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", worktree_path)
            )]));
        }

        let branch = Self::get_current_branch(&worktree_path)
            .unwrap_or_else(|| "HEAD".to_string());

        let (ahead, behind) = Self::git_command(&worktree_path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
            .ok()
            .and_then(|s| {
                let parts: Vec<&str> = s.trim().split_whitespace().collect();
                if parts.len() == 2 {
                    Some((
                        parts[0].parse().unwrap_or(0),
                        parts[1].parse().unwrap_or(0),
                    ))
                } else {
                    None
                }
            })
            .unwrap_or((0, 0));

        let status_output = Self::git_command(&worktree_path, &["status", "--porcelain"])
            .unwrap_or_default();

        let mut staged = Vec::new();
        let mut modified = Vec::new();
        let mut untracked = Vec::new();

        for line in status_output.lines() {
            if line.len() < 3 {
                continue;
            }
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

        let status = GitStatusInfo {
            branch,
            ahead,
            behind,
            staged,
            modified,
            untracked,
        };

        let json = serde_json::to_string_pretty(&status)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get the staged changes diff for commit message generation
    #[tool(description = "Get the staged changes diff. Useful for generating commit messages. Returns the diff content along with statistics.")]
    async fn get_git_diff(
        &self,
        Parameters(params): Parameters<GetGitDiffParams>,
    ) -> Result<CallToolResult, McpError> {
        let worktree_path = params.worktree_path;

        if !PathBuf::from(&worktree_path).exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Path does not exist: {}", worktree_path)
            )]));
        }

        if !Self::is_git_repo(&worktree_path) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Not a git repository: {}", worktree_path)
            )]));
        }

        let diff = Self::git_command(&worktree_path, &["diff", "--cached"])
            .unwrap_or_default();

        if diff.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "No staged changes. Please stage files first with 'git add'."
            )]));
        }

        let stats = Self::git_command(&worktree_path, &["diff", "--cached", "--stat"])
            .unwrap_or_default();

        let mut files_changed = 0;
        let mut insertions = 0;
        let mut deletions = 0;

        for line in stats.lines() {
            if line.contains("files changed") || line.contains("file changed") {
                for part in line.split(',') {
                    let part = part.trim();
                    if part.contains("file") {
                        files_changed = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok())
                            .unwrap_or(0);
                    } else if part.contains("insertion") {
                        insertions = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok())
                            .unwrap_or(0);
                    } else if part.contains("deletion") {
                        deletions = part.split_whitespace().next()
                            .and_then(|n| n.parse().ok())
                            .unwrap_or(0);
                    }
                }
            }
        }

        let diff_info = DiffInfo {
            diff,
            files_changed,
            insertions,
            deletions,
        };

        let json = serde_json::to_string_pretty(&diff_info)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // New Workflow Tools
    // ========================================================================

    /// List all workflows, optionally filtered by project
    #[tool(description = "List all workflows in PackageFlow. Optionally filter by project_id. Returns workflow summaries including step count.")]
    async fn list_workflows(
        &self,
        Parameters(params): Parameters<ListWorkflowsParams>,
    ) -> Result<CallToolResult, McpError> {
        let store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let mut workflows: Vec<WorkflowSummary> = store_data.workflows.iter()
            .filter(|w| {
                if let Some(ref project_id) = params.project_id {
                    w.project_id.as_ref() == Some(project_id)
                } else {
                    true
                }
            })
            .map(|w| WorkflowSummary {
                id: w.id.clone(),
                name: w.name.clone(),
                description: w.description.clone(),
                project_id: w.project_id.clone(),
                step_count: w.nodes.len(),
                created_at: w.created_at.clone(),
                updated_at: w.updated_at.clone(),
                last_executed_at: w.last_executed_at.clone(),
            })
            .collect();

        workflows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        let response = serde_json::json!({ "workflows": workflows });
        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get detailed information about a specific workflow
    #[tool(description = "Get detailed information about a workflow including all its steps/nodes. Returns the full workflow structure.")]
    async fn get_workflow(
        &self,
        Parameters(params): Parameters<GetWorkflowParams>,
    ) -> Result<CallToolResult, McpError> {
        let store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let workflow = store_data.workflows.iter()
            .find(|w| w.id == params.workflow_id);

        match workflow {
            Some(w) => {
                let json = serde_json::to_string_pretty(w)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            None => {
                Ok(CallToolResult::error(vec![Content::text(
                    format!("Workflow not found: {}", params.workflow_id)
                )]))
            }
        }
    }

    /// Create a new workflow
    #[tool(description = "Create a new workflow with the specified name. Optionally associate it with a project and add a description.")]
    async fn create_workflow(
        &self,
        Parameters(params): Parameters<CreateWorkflowParams>,
    ) -> Result<CallToolResult, McpError> {
        let mut store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let now = chrono::Utc::now().to_rfc3339();
        let workflow_id = format!("wf-{}", Uuid::new_v4());

        let workflow = Workflow {
            id: workflow_id.clone(),
            name: params.name.clone(),
            description: params.description,
            project_id: params.project_id,
            nodes: Vec::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
            last_executed_at: None,
            webhook: None,
            incoming_webhook: None,
        };

        store_data.workflows.push(workflow);

        write_store_data(&store_data)
            .map_err(|e| McpError::internal_error(e, None))?;

        let response = CreateWorkflowResponse {
            workflow_id,
            name: params.name,
            created_at: now,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Add a step to an existing workflow
    #[tool(description = "Add a new step (script node) to an existing workflow. Specify the command to execute, optional working directory, and timeout.")]
    async fn add_workflow_step(
        &self,
        Parameters(params): Parameters<AddWorkflowStepParams>,
    ) -> Result<CallToolResult, McpError> {
        let mut store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let workflow = store_data.workflows.iter_mut()
            .find(|w| w.id == params.workflow_id);

        match workflow {
            Some(w) => {
                let now = chrono::Utc::now().to_rfc3339();
                let node_id = format!("node-{}", Uuid::new_v4());

                // Calculate order: use provided order or max + 1
                let order = params.order.unwrap_or_else(|| {
                    w.nodes.iter().map(|n| n.order).max().unwrap_or(-1) + 1
                });

                // Build config
                let mut config = serde_json::json!({
                    "command": params.command,
                });
                if let Some(cwd) = &params.cwd {
                    config["cwd"] = serde_json::json!(cwd);
                }
                if let Some(timeout) = params.timeout {
                    config["timeout"] = serde_json::json!(timeout);
                }

                let node = WorkflowNode {
                    id: node_id.clone(),
                    node_type: "script".to_string(),
                    name: params.name.clone(),
                    config,
                    order,
                    position: None,
                };

                w.nodes.push(node);
                w.updated_at = now.clone();

                eprintln!("[MCP Debug] add_workflow_step - Writing to store...");
                eprintln!("[MCP Debug] add_workflow_step - Workflow {} now has {} nodes", params.workflow_id, w.nodes.len());

                write_store_data(&store_data)
                    .map_err(|e| {
                        eprintln!("[MCP Debug] add_workflow_step - Write FAILED: {}", e);
                        McpError::internal_error(e, None)
                    })?;

                eprintln!("[MCP Debug] add_workflow_step - Write SUCCESS");

                let response = AddStepResponse {
                    node_id,
                    workflow_id: params.workflow_id,
                    name: params.name,
                    order,
                };

                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;

                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            None => {
                Ok(CallToolResult::error(vec![Content::text(
                    format!("Workflow not found: {}", params.workflow_id)
                )]))
            }
        }
    }

    // ========================================================================
    // Step Template Tools
    // ========================================================================

    /// List available step templates
    #[tool(description = "List available step templates for workflow steps. Includes built-in templates and custom templates. Filter by category or search query.")]
    async fn list_step_templates(
        &self,
        Parameters(params): Parameters<ListStepTemplatesParams>,
    ) -> Result<CallToolResult, McpError> {
        let mut templates: Vec<StepTemplateInfo> = Vec::new();

        // Add built-in templates if requested
        if params.include_builtin {
            templates.extend(get_builtin_templates());
        }

        // Add custom templates from store
        let store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        for custom in store_data.custom_step_templates {
            templates.push(StepTemplateInfo {
                id: custom.id,
                name: custom.name,
                command: custom.command,
                category: custom.category,
                description: custom.description,
                is_custom: true,
            });
        }

        // Filter by category if specified
        if let Some(ref category) = params.category {
            templates.retain(|t| t.category.to_lowercase() == category.to_lowercase());
        }

        // Filter by query if specified
        if let Some(ref query) = params.query {
            let query_lower = query.to_lowercase();
            templates.retain(|t| {
                t.name.to_lowercase().contains(&query_lower) ||
                t.command.to_lowercase().contains(&query_lower) ||
                t.description.as_ref().map(|d| d.to_lowercase().contains(&query_lower)).unwrap_or(false)
            });
        }

        let response = serde_json::json!({ "templates": templates });
        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Create a custom step template
    #[tool(description = "Create a custom step template that can be reused across workflows. Templates are saved in PackageFlow.")]
    async fn create_step_template(
        &self,
        Parameters(params): Parameters<CreateStepTemplateParams>,
    ) -> Result<CallToolResult, McpError> {
        let mut store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let now = chrono::Utc::now().to_rfc3339();
        let template_id = format!("custom-{}", Uuid::new_v4());

        let template = CustomStepTemplate {
            id: template_id.clone(),
            name: params.name.clone(),
            command: params.command,
            category: params.category.clone(),
            description: params.description,
            is_custom: true,
            created_at: now.clone(),
        };

        store_data.custom_step_templates.push(template);

        write_store_data(&store_data)
            .map_err(|e| McpError::internal_error(e, None))?;

        let response = CreateTemplateResponse {
            template_id,
            name: params.name,
            category: params.category,
            created_at: now,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    // ========================================================================
    // Workflow Execution Tool
    // ========================================================================

    /// Execute a workflow synchronously
    #[tool(description = "Execute a workflow synchronously and return the execution result. Runs all steps in order and stops on first failure.")]
    async fn run_workflow(
        &self,
        Parameters(params): Parameters<RunWorkflowParams>,
    ) -> Result<CallToolResult, McpError> {
        let store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        // Find workflow
        let workflow = store_data.workflows.iter()
            .find(|w| w.id == params.workflow_id);

        let workflow = match workflow {
            Some(w) => w.clone(),
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    format!("Workflow not found: {}", params.workflow_id)
                )]));
            }
        };

        // Determine working directory
        let cwd = if let Some(ref path) = params.project_path {
            path.clone()
        } else if let Some(ref project_id) = workflow.project_id {
            // Find project path
            store_data.projects.iter()
                .find(|p| p.id == *project_id)
                .map(|p| p.path.clone())
                .unwrap_or_else(|| std::env::current_dir().unwrap().to_string_lossy().to_string())
        } else {
            std::env::current_dir().unwrap().to_string_lossy().to_string()
        };

        // Sort nodes by order
        let mut nodes = workflow.nodes.clone();
        nodes.sort_by_key(|n| n.order);

        let total_steps = nodes.len();
        let mut steps_executed = 0;
        let mut failed_step: Option<FailedStepInfo> = None;
        let mut output_lines: Vec<String> = Vec::new();

        for node in &nodes {
            // Only execute script nodes
            if node.node_type != "script" {
                output_lines.push(format!("[SKIP] {}: Not a script node", node.name));
                continue;
            }

            // Get command from config
            let command = node.config.get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if command.is_empty() {
                output_lines.push(format!("[SKIP] {}: Empty command", node.name));
                continue;
            }

            // Get node-specific cwd or use workflow cwd
            let node_cwd = node.config.get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| cwd.clone());

            let timeout = node.config.get("timeout")
                .and_then(|v| v.as_u64());

            output_lines.push(format!("[RUN] {}: {} (timeout: {}s)", node.name, command, timeout.unwrap_or(300_000) / 1000));

            // Use async shell command with timeout enforcement
            match Self::shell_command_async(&node_cwd, command, timeout).await {
                Ok((exit_code, stdout, stderr)) => {
                    steps_executed += 1;

                    // Sanitize output to redact sensitive content (API keys, tokens, etc.)
                    let sanitized_stdout = sanitize_output(&stdout);
                    let sanitized_stderr = sanitize_output(&stderr);

                    if exit_code == 0 {
                        output_lines.push(format!("[OK] {} completed successfully", node.name));
                        if !sanitized_stdout.trim().is_empty() {
                            // Add last 10 lines of stdout
                            let last_lines: Vec<&str> = sanitized_stdout.lines().rev().take(10).collect();
                            for line in last_lines.iter().rev() {
                                output_lines.push(format!("  > {}", line));
                            }
                        }
                    } else {
                        output_lines.push(format!("[FAIL] {} failed with exit code {}", node.name, exit_code));
                        if !sanitized_stderr.trim().is_empty() {
                            output_lines.push(format!("  Error: {}", sanitized_stderr.trim()));
                        }
                        failed_step = Some(FailedStepInfo {
                            node_id: node.id.clone(),
                            node_name: node.name.clone(),
                            exit_code,
                            error_message: sanitized_stderr.trim().to_string(),
                        });
                        break;
                    }
                }
                Err(e) => {
                    // Sanitize error message
                    let sanitized_error = sanitize_error(&e);
                    output_lines.push(format!("[ERROR] {}: {}", node.name, sanitized_error));
                    failed_step = Some(FailedStepInfo {
                        node_id: node.id.clone(),
                        node_name: node.name.clone(),
                        exit_code: -1,
                        error_message: sanitized_error,
                    });
                    break;
                }
            }
        }

        // Build output summary (last 50 lines)
        let output_summary = output_lines.iter()
            .rev()
            .take(50)
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        let status = if failed_step.is_some() {
            if steps_executed > 0 { "partial" } else { "failed" }
        } else {
            "completed"
        };

        let response = RunWorkflowResponse {
            success: failed_step.is_none(),
            workflow_id: workflow.id,
            workflow_name: workflow.name,
            steps_executed,
            total_steps,
            status: status.to_string(),
            failed_step,
            output_summary,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
}

// Implement ServerHandler trait for the MCP server
impl ServerHandler for PackageFlowMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::default(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability::default()),
                ..Default::default()
            },
            server_info: Implementation {
                name: "packageflow-mcp".to_string(),
                title: Some("PackageFlow MCP Server".to_string()),
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                website_url: None,
            },
            instructions: Some("PackageFlow MCP Server provides tools for managing Git projects, worktrees, workflows, and step templates.".to_string()),
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
            // Convert Map<String, Value> to Value for logging
            let arguments = serde_json::Value::Object(arguments_map.clone());

            // Read MCP config from store
            let config = match read_store_data() {
                Ok(data) => {
                    eprintln!("[MCP Debug] call_tool - Store read success");
                    eprintln!("[MCP Debug] call_tool - permission_mode: {:?}", data.mcp_config.permission_mode);
                    eprintln!("[MCP Debug] call_tool - is_enabled: {}", data.mcp_config.is_enabled);
                    eprintln!("[MCP Debug] call_tool - allowed_tools: {:?}", data.mcp_config.allowed_tools);
                    data.mcp_config
                }
                Err(e) => {
                    eprintln!("[MCP Debug] call_tool - Store read FAILED: {}", e);
                    eprintln!("[MCP Debug] call_tool - Using default config (ReadOnly)");
                    MCPServerConfig::default()
                }
            };

            // Check if MCP server is enabled
            if !config.is_enabled {
                let error_msg = "MCP Server is disabled. Enable it in PackageFlow settings.";
                if config.log_requests {
                    log_request(&tool_name, &arguments, "permission_denied", 0, Some(error_msg));
                }
                return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
            }

            // Check global rate limit (100 requests per minute)
            if let Err(rate_error) = RATE_LIMITER.check_and_increment() {
                if config.log_requests {
                    log_request(&tool_name, &arguments, "rate_limited", 0, Some(&rate_error));
                }
                return Ok(CallToolResult::error(vec![Content::text(rate_error)]));
            }

            // Check tool-level rate limit (category-specific limits)
            let tool_category = get_tool_category(&tool_name);
            if let Err(_) = TOOL_RATE_LIMITERS.check(tool_category) {
                let limit_desc = TOOL_RATE_LIMITERS.get_limit_description(tool_category);
                let error_msg = format!(
                    "Tool rate limit exceeded for '{}'. Limit: {}. Please wait before making more requests.",
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

            // Validate path parameters in arguments
            if let Some(path) = arguments.get("path").and_then(|v| v.as_str()) {
                if let Err(e) = validate_path(path) {
                    let error_msg = format!("Invalid path: {}", e);
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }
            if let Some(path) = arguments.get("project_path").and_then(|v| v.as_str()) {
                if let Err(e) = validate_path(path) {
                    let error_msg = format!("Invalid project_path: {}", e);
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }
            if let Some(path) = arguments.get("worktree_path").and_then(|v| v.as_str()) {
                if let Err(e) = validate_path(path) {
                    let error_msg = format!("Invalid worktree_path: {}", e);
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }

            // Validate command parameter (for add_workflow_step)
            if let Some(command) = arguments.get("command").and_then(|v| v.as_str()) {
                if let Err(e) = validate_command(command) {
                    let error_msg = format!("Invalid command: {}", e);
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }

            // Validate name length parameters
            if let Some(name) = arguments.get("name").and_then(|v| v.as_str()) {
                if let Err(e) = validate_string_length(name, "name", MAX_NAME_LENGTH) {
                    let error_msg = e;
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }
            if let Some(desc) = arguments.get("description").and_then(|v| v.as_str()) {
                if let Err(e) = validate_string_length(desc, "description", MAX_DESCRIPTION_LENGTH) {
                    let error_msg = e;
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }

            // Validate timeout parameter
            if let Some(timeout) = arguments.get("timeout").and_then(|v| v.as_u64()) {
                if let Err(e) = validate_timeout(timeout) {
                    let error_msg = e;
                    if config.log_requests {
                        log_request(&tool_name, &arguments, "validation_error", 0, Some(&error_msg));
                    }
                    return Ok(CallToolResult::error(vec![Content::text(error_msg)]));
                }
            }

            // Execute the tool
            let tool_context = ToolCallContext::new(self, request, context);
            let result = self.tool_router.call(tool_context).await;
            let duration_ms = start_time.elapsed().as_millis() as u64;

            // Log the request
            if config.log_requests {
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

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Debug: Log startup info
    eprintln!("[MCP Server] Starting PackageFlow MCP Server (PID: {})...", std::process::id());

    // Debug: Check database at startup
    match read_store_data() {
        Ok(data) => {
            eprintln!("[MCP Server] Database read successful");
            eprintln!("[MCP Server] Config - is_enabled: {}", data.mcp_config.is_enabled);
            eprintln!("[MCP Server] Config - permission_mode: {:?}", data.mcp_config.permission_mode);
        }
        Err(e) => eprintln!("[MCP Server] Database read failed: {}", e),
    }

    // Create the MCP server
    let server = PackageFlowMcp::new();

    // Run with stdio transport (for Claude Code integration)
    let transport = (stdin(), stdout());

    // Start the server using serve_server
    let service = rmcp::serve_server(server, transport).await?;

    // Set up signal handlers for graceful shutdown (Unix only)
    #[cfg(unix)]
    {
        let mut sigterm = signal(SignalKind::terminate())?;
        let mut sigint = signal(SignalKind::interrupt())?;
        let mut sighup = signal(SignalKind::hangup())?;

        // Wait for either service completion or signal
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

    // Non-Unix platforms: just wait for service
    #[cfg(not(unix))]
    {
        service.waiting().await?;
    }

    eprintln!("[MCP Server] Shutdown complete");
    Ok(())
}
