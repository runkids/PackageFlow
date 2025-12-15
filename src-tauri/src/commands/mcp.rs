// MCP (Model Context Protocol) Server Integration Commands
// Updated to use SQLite database for storage

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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
    db: tauri::State<'_, DatabaseState>,
    is_enabled: Option<bool>,
    permission_mode: Option<McpPermissionMode>,
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
    if let Some(tools) = allowed_tools {
        config.allowed_tools = tools;
    }
    if let Some(log) = log_requests {
        config.log_requests = log;
    }

    repo.set(MCP_CONFIG_KEY, &config)?;
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
