//! Database access and store data types for MCP server
//!
//! Contains SQLite database functions and local data types for MCP processing.

use std::collections::HashMap;
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use packageflow_lib::models::mcp::MCPServerConfig;
use packageflow_lib::repositories::{
    MCPRepository, McpLogEntry, ProjectRepository, SettingsRepository,
    TemplateRepository, WorkflowRepository,
};
use packageflow_lib::utils::database::Database;
use packageflow_lib::utils::shared_store::{get_app_data_dir, sanitize_error};

// ============================================================================
// Constants
// ============================================================================

/// SQLite settings key for MCP config
pub const MCP_CONFIG_KEY: &str = "mcp_server_config";

// ============================================================================
// Database Access Functions
// ============================================================================

/// Get the SQLite database path
pub fn get_database_path() -> Result<PathBuf, String> {
    let app_dir = get_app_data_dir()?;
    Ok(app_dir.join("packageflow.db"))
}

/// Open the SQLite database
pub fn open_database() -> Result<Database, String> {
    let db_path = get_database_path()?;
    eprintln!("[MCP Debug] Opening database at: {:?}", db_path);
    Database::new(db_path)
}

/// Read store data from SQLite database
pub fn read_store_data() -> Result<StoreData, String> {
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
pub fn write_store_data(data: &StoreData) -> Result<(), String> {
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
// Logging Functions
// ============================================================================

/// Log a request to the MCP log table
///
/// Uses SQLite with WAL mode for concurrent access from both MCP server and main app.
pub fn log_request(
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
pub fn sanitize_arguments(args: &serde_json::Value) -> serde_json::Value {
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
