// MCP (Model Context Protocol) Server Integration Commands
// Updated to use SQLite database for storage

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::models::mcp::MCP_ALL_TOOLS;
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
/// 2. Development Release: target/release/specforge-mcp
/// 3. Development Debug: target/debug/specforge-mcp
#[tauri::command]
pub fn get_mcp_server_info(app: AppHandle) -> Result<McpServerInfo, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    // Production path (preferred): Resources/bin/specforge-mcp
    // On macOS: /Applications/SpecForge.app/Contents/Resources/bin/specforge-mcp
    //
    // Some build configurations may bundle the MCP binary as `mcp`, so we also
    // support a fallback to Resources/bin/mcp.
    let bundled_path_primary = resource_path.join("bin").join("specforge-mcp");
    let bundled_path_fallback = resource_path.join("bin").join("mcp");

    // Development paths - try to find src-tauri directory
    // In dev mode, resource_path is typically: src-tauri/target/debug/
    let src_tauri_dir = resource_path
        .ancestors()
        .find(|p| p.join("Cargo.toml").exists() && p.join("src").join("main.rs").exists());

    // Find the first available binary (production first, then dev debug, then dev release)
    let mut candidates: Vec<(std::path::PathBuf, &'static str)> = vec![
        (bundled_path_primary.clone(), "production"),
        (bundled_path_fallback.clone(), "production (legacy name)"),
    ];

    if let Some(src_tauri_dir) = src_tauri_dir {
        candidates.push((
            src_tauri_dir.join("target").join("debug").join("specforge-mcp"),
            "development (debug)",
        ));
        candidates.push((
            src_tauri_dir.join("target").join("debug").join("mcp"),
            "development (debug, legacy name)",
        ));
        candidates.push((
            src_tauri_dir.join("target").join("release").join("specforge-mcp"),
            "development (release)",
        ));
        candidates.push((
            src_tauri_dir.join("target").join("release").join("mcp"),
            "development (release, legacy name)",
        ));
    }

    let found = candidates.into_iter().find(|(path, _env)| path.exists());

    let (binary_path, is_available, env_type) = match found {
        Some((path, env)) => (path, true, env),
        None => (bundled_path_primary.clone(), false, "not found"),
    };

    let binary_path_str = binary_path.to_string_lossy().to_string();

    // Generate config JSON for Claude Code / VS Code
    let config_json = serde_json::json!({
        "mcpServers": {
            "specforge": {
                "command": binary_path_str
            }
        }
    });

    // Generate config TOML for Codex CLI
    let config_toml = format!(
        r#"[mcp_servers.specforge]
command = "{}""#,
        binary_path_str
    );

    Ok(McpServerInfo {
        binary_path: binary_path_str.clone(),
        name: "specforge-mcp".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        is_available,
        config_json: serde_json::to_string_pretty(&config_json).unwrap_or_default(),
        config_toml,
        env_type: env_type.to_string(),
    })
}

/// Health check result for MCP server
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHealthCheckResult {
    /// Whether the health check passed
    pub is_healthy: bool,
    /// Server version (if available)
    pub version: Option<String>,
    /// Response time in milliseconds
    pub response_time_ms: u64,
    /// Error message (if any)
    pub error: Option<String>,
    /// Binary path that was tested
    pub binary_path: String,
    /// Environment type
    pub env_type: String,
}

/// Test MCP server health by running --version
///
/// This command executes the MCP server binary with --version flag
/// to verify it's working correctly.
#[tauri::command]
pub async fn test_mcp_connection(app: AppHandle) -> Result<McpHealthCheckResult, String> {
    use std::time::Instant;

    // Get server info first
    let server_info = get_mcp_server_info(app)?;

    if !server_info.is_available {
        return Ok(McpHealthCheckResult {
            is_healthy: false,
            version: None,
            response_time_ms: 0,
            error: Some("MCP server binary not found".to_string()),
            binary_path: server_info.binary_path,
            env_type: server_info.env_type,
        });
    }

    // Execute --version and measure time (use path_resolver for consistent environment)
    let start = Instant::now();
    let output = {
        let mut cmd = crate::utils::path_resolver::create_async_command(&server_info.binary_path);
        cmd.arg("--version");
        cmd.output().await
    };
    let elapsed = start.elapsed().as_millis() as u64;

    match output {
        Ok(output) => {
            if output.status.success() {
                let version_output = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Parse version from output (format: "specforge-mcp v0.1.0")
                let version = version_output
                    .split_whitespace()
                    .last()
                    .map(|v| v.trim_start_matches('v').to_string());

                Ok(McpHealthCheckResult {
                    is_healthy: true,
                    version,
                    response_time_ms: elapsed,
                    error: None,
                    binary_path: server_info.binary_path,
                    env_type: server_info.env_type,
                })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                Ok(McpHealthCheckResult {
                    is_healthy: false,
                    version: None,
                    response_time_ms: elapsed,
                    error: Some(if stderr.is_empty() {
                        format!("Process exited with code: {:?}", output.status.code())
                    } else {
                        stderr
                    }),
                    binary_path: server_info.binary_path,
                    env_type: server_info.env_type,
                })
            }
        }
        Err(e) => Ok(McpHealthCheckResult {
            is_healthy: false,
            version: None,
            response_time_ms: elapsed,
            error: Some(format!("Failed to execute: {}", e)),
            binary_path: server_info.binary_path,
            env_type: server_info.env_type,
        }),
    }
}

/// Get available MCP tools (for display in UI)
/// Uses centralized tool definitions from models::mcp
#[tauri::command]
pub fn get_mcp_tools() -> Vec<McpToolInfo> {
    MCP_ALL_TOOLS
        .iter()
        .map(|tool| McpToolInfo {
            name: tool.name.to_string(),
            description: tool.description.to_string(),
            category: tool.display_category.to_string(),
            permission_category: tool.permission_category.as_str().to_string(),
            applicable_permissions: tool.applicable_permissions.iter().map(|s| s.to_string()).collect(),
        })
        .collect()
}

/// MCP tool information for UI display
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    /// Tool name (used in MCP calls)
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// UI display category (e.g., "Project Management", "Git Worktree")
    pub category: String,
    /// Permission category for access control ("read", "execute", "write")
    pub permission_category: String,
    /// Which permission types are applicable for this tool
    pub applicable_permissions: Vec<String>,
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
    /// Processes are tracked in SpecForge UI via events
    UiIntegrated,
    /// Reject dev server commands with a hint to use SpecForge UI
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
            is_enabled: false,
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
        ("list_projects", "List all registered projects in SpecForge", ToolCategory::Read),
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

