// MCP (Model Context Protocol) Server Integration Commands
// Updated to use SQLite database for storage

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::repositories::SettingsRepository;
use crate::DatabaseState;

#[derive(Debug, Clone, Serialize)]
pub struct McpServerInfo {
    /// Path to the MCP server binary
    pub binary_path: String,
    /// Server name
    pub name: String,
    /// Server version
    pub version: String,
    /// Whether the binary exists
    pub is_available: bool,
    /// JSON config for Claude Code / VS Code MCP settings
    pub config_json: String,
    /// TOML config for Codex CLI
    pub config_toml: String,
    /// Environment type: "production", "development (release)", "development (debug)", "not found"
    pub env_type: String,
}

/// Get MCP server information including binary path and config
///
/// Path resolution priority:
/// 1. Production: bundled in Resources/bin/ (inside .app bundle)
/// 2. Development Release: target/release/packageflow-mcp
/// 3. Development Debug: target/debug/packageflow-mcp
#[tauri::command]
pub fn get_mcp_server_info(app: AppHandle) -> Result<McpServerInfo, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    // Production path: Resources/bin/packageflow-mcp
    // On macOS: /Applications/PackageFlow.app/Contents/Resources/bin/packageflow-mcp
    let bundled_path = resource_path.join("bin").join("packageflow-mcp");

    // Development paths - try to find src-tauri directory
    // In dev mode, resource_path is typically: src-tauri/target/debug/
    let src_tauri_dir = resource_path
        .ancestors()
        .find(|p| p.join("Cargo.toml").exists() && p.join("src").join("main.rs").exists());

    let dev_release_path = src_tauri_dir
        .map(|p| p.join("target").join("release").join("packageflow-mcp"));

    let dev_debug_path = src_tauri_dir
        .map(|p| p.join("target").join("debug").join("packageflow-mcp"));

    // Find the first available binary (production first, then dev)
    let (binary_path, is_available, env_type) = if bundled_path.exists() {
        (bundled_path.clone(), true, "production")
    } else if let Some(ref path) = dev_release_path {
        if path.exists() {
            (path.clone(), true, "development (release)")
        } else if let Some(ref debug_path) = dev_debug_path {
            if debug_path.exists() {
                (debug_path.clone(), true, "development (debug)")
            } else {
                (bundled_path.clone(), false, "not found")
            }
        } else {
            (bundled_path.clone(), false, "not found")
        }
    } else {
        (bundled_path.clone(), false, "not found")
    };

    let binary_path_str = binary_path.to_string_lossy().to_string();

    // Generate config JSON for Claude Code / VS Code
    let config_json = serde_json::json!({
        "mcpServers": {
            "packageflow": {
                "command": binary_path_str
            }
        }
    });

    // Generate config TOML for Codex CLI
    let config_toml = format!(
        r#"[mcp_servers.packageflow]
command = "{}""#,
        binary_path_str
    );

    Ok(McpServerInfo {
        binary_path: binary_path_str.clone(),
        name: "packageflow-mcp".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        is_available,
        config_json: serde_json::to_string_pretty(&config_json).unwrap_or_default(),
        config_toml,
        env_type: env_type.to_string(),
    })
}

/// Get available MCP tools (for display in UI)
#[tauri::command]
pub fn get_mcp_tools() -> Vec<McpToolInfo> {
    vec![
        // Project Tools (Read-only)
        McpToolInfo {
            name: "list_projects".to_string(),
            description: "List all registered projects in PackageFlow".to_string(),
            category: "Project".to_string(),
        },
        // Git Tools (Read-only)
        McpToolInfo {
            name: "get_project".to_string(),
            description: "Get project info (name, remote URL, current branch)".to_string(),
            category: "Git".to_string(),
        },
        McpToolInfo {
            name: "list_worktrees".to_string(),
            description: "List all Git worktrees".to_string(),
            category: "Git".to_string(),
        },
        McpToolInfo {
            name: "get_worktree_status".to_string(),
            description: "Get Git status (branch, ahead/behind, file status)".to_string(),
            category: "Git".to_string(),
        },
        McpToolInfo {
            name: "get_git_diff".to_string(),
            description: "Get staged changes diff (for commit message generation)".to_string(),
            category: "Git".to_string(),
        },
        // Workflow Tools
        McpToolInfo {
            name: "list_workflows".to_string(),
            description: "List all workflows, optionally filtered by project".to_string(),
            category: "Workflow".to_string(),
        },
        McpToolInfo {
            name: "get_workflow".to_string(),
            description: "Get detailed workflow info including all steps".to_string(),
            category: "Workflow".to_string(),
        },
        McpToolInfo {
            name: "create_workflow".to_string(),
            description: "Create a new workflow".to_string(),
            category: "Workflow".to_string(),
        },
        McpToolInfo {
            name: "add_workflow_step".to_string(),
            description: "Add a step (script node) to a workflow".to_string(),
            category: "Workflow".to_string(),
        },
        McpToolInfo {
            name: "run_workflow".to_string(),
            description: "Execute a workflow and return results".to_string(),
            category: "Workflow".to_string(),
        },
        // Template Tools
        McpToolInfo {
            name: "list_step_templates".to_string(),
            description: "List available step templates (built-in + custom)".to_string(),
            category: "Template".to_string(),
        },
        McpToolInfo {
            name: "create_step_template".to_string(),
            description: "Create a custom step template".to_string(),
            category: "Template".to_string(),
        },
    ]
}

#[derive(Debug, Clone, Serialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    pub category: String,
}

// ============================================================================
// MCP Server Configuration
// ============================================================================

/// MCP permission mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum McpPermissionMode {
    ReadOnly,
    ExecuteWithConfirm,
    FullAccess,
}

impl Default for McpPermissionMode {
    fn default() -> Self {
        McpPermissionMode::ReadOnly
    }
}

/// Dev server mode for MCP
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DevServerMode {
    /// MCP manages background processes independently (default)
    McpManaged,
    /// Processes are tracked in PackageFlow UI via events
    UiIntegrated,
    /// Reject dev server commands with a hint to use PackageFlow UI
    RejectWithHint,
}

impl Default for DevServerMode {
    fn default() -> Self {
        DevServerMode::McpManaged
    }
}

/// MCP Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    /// Whether MCP Server is enabled
    #[serde(default = "default_true")]
    pub is_enabled: bool,
    /// Default permission mode
    #[serde(default)]
    pub permission_mode: McpPermissionMode,
    /// Dev server mode - controls how dev server commands are handled
    #[serde(default)]
    pub dev_server_mode: DevServerMode,
    /// List of explicitly allowed tools (empty = use permissionMode defaults)
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    /// Whether to log all requests
    #[serde(default)]
    pub log_requests: bool,
}

fn default_true() -> bool {
    true
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            is_enabled: true,
            permission_mode: McpPermissionMode::ReadOnly,
            dev_server_mode: DevServerMode::default(),
            allowed_tools: vec![],
            log_requests: false,
        }
    }
}

const MCP_CONFIG_KEY: &str = "mcp_server_config";

/// Get MCP server configuration from SQLite
#[tauri::command]
pub fn get_mcp_config(db: tauri::State<'_, DatabaseState>) -> Result<McpServerConfig, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let config: Option<McpServerConfig> = repo.get(MCP_CONFIG_KEY)?;
    Ok(config.unwrap_or_default())
}

/// Save MCP server configuration to SQLite
///
/// Note: This function uses SQLite for persistence.
/// The MCP Server binary also accesses the same SQLite database
/// with WAL mode for safe concurrent access.
#[tauri::command]
pub fn save_mcp_config(
    db: tauri::State<'_, DatabaseState>,
    config: McpServerConfig,
) -> Result<(), String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.set(MCP_CONFIG_KEY, &config)
}

/// Update specific MCP configuration fields
#[tauri::command]
pub fn update_mcp_config(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    is_enabled: Option<bool>,
    permission_mode: Option<McpPermissionMode>,
    dev_server_mode: Option<DevServerMode>,
    allowed_tools: Option<Vec<String>>,
    log_requests: Option<bool>,
) -> Result<McpServerConfig, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let mut config: McpServerConfig = repo.get(MCP_CONFIG_KEY)?.unwrap_or_default();

    if let Some(enabled) = is_enabled {
        config.is_enabled = enabled;
    }
    if let Some(mode) = permission_mode {
        config.permission_mode = mode;
    }
    if let Some(mode) = dev_server_mode {
        config.dev_server_mode = mode;
    }
    if let Some(tools) = allowed_tools {
        config.allowed_tools = tools;
    }
    if let Some(log) = log_requests {
        config.log_requests = log;
    }

    repo.set(MCP_CONFIG_KEY, &config)?;

    // Emit event to notify frontend of config change
    let _ = app.emit("mcp:config-changed", &config);

    Ok(config)
}

/// Tool category for permission grouping
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ToolCategory {
    Read,
    Write,
    Execute,
}

/// MCP tool with permission category
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolWithCategory {
    pub name: String,
    pub description: String,
    pub category: ToolCategory,
    pub is_allowed: bool,
}

/// Get all MCP tools with their permission status based on current config
#[tauri::command]
pub fn get_mcp_tools_with_permissions(
    db: tauri::State<'_, DatabaseState>,
) -> Result<Vec<McpToolWithCategory>, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    let config: McpServerConfig = repo.get(MCP_CONFIG_KEY)?.unwrap_or_default();

    let tools = vec![
        // Read-only tools
        ("list_projects", "List all registered projects in PackageFlow", ToolCategory::Read),
        ("get_project", "Get project info (name, remote URL, current branch)", ToolCategory::Read),
        ("list_worktrees", "List all Git worktrees", ToolCategory::Read),
        ("get_worktree_status", "Get Git status (branch, ahead/behind, file status)", ToolCategory::Read),
        ("get_git_diff", "Get staged changes diff (for commit message generation)", ToolCategory::Read),
        ("list_workflows", "List all workflows, optionally filtered by project", ToolCategory::Read),
        ("get_workflow", "Get detailed workflow info including all steps", ToolCategory::Read),
        ("list_step_templates", "List available step templates (built-in + custom)", ToolCategory::Read),

        // Write tools
        ("create_workflow", "Create a new workflow", ToolCategory::Write),
        ("add_workflow_step", "Add a step (script node) to a workflow", ToolCategory::Write),
        ("create_step_template", "Create a custom step template", ToolCategory::Write),

        // Execute tools
        ("run_workflow", "Execute a workflow and return results", ToolCategory::Execute),
    ];

    Ok(tools
        .into_iter()
        .map(|(name, desc, category)| {
            let is_allowed = is_tool_allowed(&name, &category, &config);
            McpToolWithCategory {
                name: name.to_string(),
                description: desc.to_string(),
                category,
                is_allowed,
            }
        })
        .collect())
}

/// Check if a tool is allowed based on config
fn is_tool_allowed(tool_name: &str, category: &ToolCategory, config: &McpServerConfig) -> bool {
    if !config.is_enabled {
        return false;
    }

    // If explicitly in allowedTools, it's allowed
    if !config.allowed_tools.is_empty() {
        return config.allowed_tools.contains(&tool_name.to_string());
    }

    // Use permission mode defaults
    match config.permission_mode {
        McpPermissionMode::ReadOnly => *category == ToolCategory::Read,
        McpPermissionMode::ExecuteWithConfirm => {
            *category == ToolCategory::Read || *category == ToolCategory::Execute
        }
        McpPermissionMode::FullAccess => true,
    }
}

// ============================================================================
// MCP Request Logs (SQLite-based)
// ============================================================================

// Re-export McpLogEntry from repository
pub use crate::repositories::McpLogEntry;

/// MCP logs response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpLogsResponse {
    pub entries: Vec<McpLogEntry>,
    pub total_count: usize,
}

/// Get MCP request logs from SQLite database
#[tauri::command]
pub fn get_mcp_logs(
    db: tauri::State<'_, DatabaseState>,
    limit: Option<usize>,
) -> Result<McpLogsResponse, String> {
    use crate::repositories::MCPRepository;

    let repo = MCPRepository::new(db.0.as_ref().clone());
    let entries = repo.get_logs(limit)?;
    let total_count = repo.get_log_count()?;

    Ok(McpLogsResponse {
        entries,
        total_count,
    })
}

/// Clear MCP request logs from SQLite database
#[tauri::command]
pub fn clear_mcp_logs(db: tauri::State<'_, DatabaseState>) -> Result<(), String> {
    use crate::repositories::MCPRepository;

    let repo = MCPRepository::new(db.0.as_ref().clone());
    repo.clear_logs()
}

// ============================================================================
// MCP Action Commands (T039-T042)
// ============================================================================

use crate::models::mcp_action::{
    ActionFilter, ExecutionFilter, ExecutionStatus, MCPAction, MCPActionExecution,
    MCPActionPermission, MCPActionType, PermissionLevel,
};
use crate::repositories::MCPActionRepository;

/// Response for pending action requests
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingActionRequest {
    pub execution_id: String,
    pub action_id: Option<String>,
    pub action_type: String,
    pub action_name: String,
    pub description: String,
    pub parameters: Option<serde_json::Value>,
    pub source_client: Option<String>,
    pub started_at: String,
}

/// Get pending action requests that require user confirmation (T039)
#[tauri::command]
pub fn get_pending_action_requests(
    db: tauri::State<'_, DatabaseState>,
) -> Result<Vec<PendingActionRequest>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    let pending = repo.get_pending_confirmations()?;

    Ok(pending
        .into_iter()
        .map(|exec| {
            let description = format!(
                "Execute {} action: {}",
                exec.action_type.to_string().to_lowercase(),
                exec.action_name
            );
            PendingActionRequest {
                execution_id: exec.id,
                action_id: exec.action_id,
                action_type: exec.action_type.to_string(),
                action_name: exec.action_name,
                description,
                parameters: exec.parameters,
                source_client: exec.source_client,
                started_at: exec.started_at,
            }
        })
        .collect())
}

/// Response for action request approval/denial
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequestResponse {
    pub execution_id: String,
    pub approved: bool,
    pub status: String,
}

/// Approve or deny a pending action request (T040)
#[tauri::command]
pub fn respond_to_action_request(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    execution_id: String,
    approved: bool,
    reason: Option<String>,
) -> Result<ActionRequestResponse, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    // Get the execution to verify it exists and is pending
    let execution = repo
        .get_execution(&execution_id)?
        .ok_or_else(|| format!("Execution {} not found", execution_id))?;

    if execution.status != ExecutionStatus::PendingConfirm {
        return Err(format!(
            "Execution {} is not pending confirmation (status: {})",
            execution_id,
            execution.status.to_string()
        ));
    }

    let new_status = if approved {
        ExecutionStatus::Running
    } else {
        ExecutionStatus::Denied
    };

    let error_message = if approved { None } else { reason };

    repo.update_execution_status(&execution_id, new_status.clone(), None, error_message)?;

    // Emit event to notify MCP server and other listeners
    let _ = app.emit("mcp:action-response", serde_json::json!({
        "executionId": execution_id,
        "approved": approved,
        "status": new_status.to_string(),
    }));

    Ok(ActionRequestResponse {
        execution_id,
        approved,
        status: new_status.to_string(),
    })
}

/// List MCP actions with optional filtering
#[tauri::command]
pub fn list_mcp_actions(
    db: tauri::State<'_, DatabaseState>,
    project_id: Option<String>,
    action_type: Option<String>,
    is_enabled: Option<bool>,
) -> Result<Vec<MCPAction>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    let action_type_parsed = action_type
        .map(|t| t.parse::<MCPActionType>())
        .transpose()
        .map_err(|e| format!("Invalid action type: {}", e))?;

    let filter = ActionFilter {
        project_id,
        action_type: action_type_parsed,
        is_enabled,
    };

    repo.list_actions(&filter)
}

/// Get a single MCP action by ID
#[tauri::command]
pub fn get_mcp_action(
    db: tauri::State<'_, DatabaseState>,
    action_id: String,
) -> Result<Option<MCPAction>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.get_action(&action_id)
}

/// Create a new MCP action
#[tauri::command]
pub fn create_mcp_action(
    db: tauri::State<'_, DatabaseState>,
    action_type: String,
    name: String,
    description: Option<String>,
    config: serde_json::Value,
    project_id: Option<String>,
) -> Result<MCPAction, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    let action_type_parsed = action_type
        .parse::<MCPActionType>()
        .map_err(|e| format!("Invalid action type: {}", e))?;

    repo.create_action(action_type_parsed, name, description, config, project_id)
}

/// Update an existing MCP action
#[tauri::command]
pub fn update_mcp_action(
    db: tauri::State<'_, DatabaseState>,
    action_id: String,
    name: Option<String>,
    description: Option<String>,
    config: Option<serde_json::Value>,
    is_enabled: Option<bool>,
) -> Result<MCPAction, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    let mut action = repo
        .get_action(&action_id)?
        .ok_or_else(|| format!("Action {} not found", action_id))?;

    if let Some(n) = name {
        action.name = n;
    }
    if let Some(d) = description {
        action.description = Some(d);
    }
    if let Some(c) = config {
        action.config = c;
    }
    if let Some(e) = is_enabled {
        action.is_enabled = e;
    }

    action.updated_at = chrono::Utc::now().to_rfc3339();
    repo.save_action(&action)?;

    Ok(action)
}

/// Delete an MCP action
#[tauri::command]
pub fn delete_mcp_action(
    db: tauri::State<'_, DatabaseState>,
    action_id: String,
) -> Result<bool, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.delete_action(&action_id)
}

/// Get MCP action execution history
#[tauri::command]
pub fn get_mcp_action_executions(
    db: tauri::State<'_, DatabaseState>,
    action_id: Option<String>,
    action_type: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<MCPActionExecution>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    let action_type_parsed = action_type
        .map(|t| t.parse::<MCPActionType>())
        .transpose()
        .map_err(|e| format!("Invalid action type: {}", e))?;

    let status_parsed = status
        .map(|s| s.parse::<ExecutionStatus>())
        .transpose()
        .map_err(|e| format!("Invalid status: {}", e))?;

    let filter = ExecutionFilter {
        action_id,
        action_type: action_type_parsed,
        status: status_parsed,
        limit: limit.map(|l| l as usize).unwrap_or(50),
    };

    repo.list_executions(&filter)
}

/// Get a single execution by ID
#[tauri::command]
pub fn get_mcp_action_execution(
    db: tauri::State<'_, DatabaseState>,
    execution_id: String,
) -> Result<Option<MCPActionExecution>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.get_execution(&execution_id)
}

/// List all MCP action permissions
#[tauri::command]
pub fn list_mcp_action_permissions(
    db: tauri::State<'_, DatabaseState>,
) -> Result<Vec<MCPActionPermission>, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.list_permissions()
}

/// Update MCP action permission
#[tauri::command]
pub fn update_mcp_action_permission(
    db: tauri::State<'_, DatabaseState>,
    action_id: Option<String>,
    action_type: Option<String>,
    permission_level: String,
) -> Result<MCPActionPermission, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());

    let action_type_parsed = action_type
        .map(|t| t.parse::<MCPActionType>())
        .transpose()
        .map_err(|e| format!("Invalid action type: {}", e))?;

    let level = permission_level
        .parse::<PermissionLevel>()
        .map_err(|e| format!("Invalid permission level: {}", e))?;

    let permission = MCPActionPermission {
        id: uuid::Uuid::new_v4().to_string(),
        action_id,
        action_type: action_type_parsed,
        permission_level: level,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    repo.save_permission(&permission)?;
    Ok(permission)
}

/// Delete MCP action permission
#[tauri::command]
pub fn delete_mcp_action_permission(
    db: tauri::State<'_, DatabaseState>,
    permission_id: String,
) -> Result<bool, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.delete_permission(&permission_id)
}

/// Cleanup old execution history
#[tauri::command]
pub fn cleanup_mcp_action_executions(
    db: tauri::State<'_, DatabaseState>,
    keep_count: Option<usize>,
    max_age_days: Option<i64>,
) -> Result<usize, String> {
    let repo = MCPActionRepository::new(db.0.as_ref().clone());
    repo.cleanup_old_executions(keep_count.unwrap_or(1000), max_age_days.unwrap_or(30))
}
