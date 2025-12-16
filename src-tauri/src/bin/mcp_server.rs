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
    TemplateRepository, MCPRepository, McpLogEntry, MCPActionRepository,
};

// Import MCP action models and services
use packageflow_lib::models::mcp_action::{
    MCPActionType, PermissionLevel, ExecutionStatus, ActionFilter, ExecutionFilter,
};
use packageflow_lib::services::mcp_action::create_executor;
use rusqlite::params;

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

/// Concurrency limiter for action execution
/// Limits concurrent action executions to prevent resource exhaustion
use tokio::sync::Semaphore;

/// Maximum concurrent action executions (scripts, webhooks, workflows)
const MAX_CONCURRENT_ACTIONS: usize = 10;

/// Global semaphore for action concurrency control
static ACTION_SEMAPHORE: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(MAX_CONCURRENT_ACTIONS));

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
        "list_projects" | "get_project" | "list_worktrees" | "get_worktree_status" | "get_git_diff" |
        "list_workflows" | "get_workflow" | "list_step_templates" |
        // MCP Action read-only tools
        "list_actions" | "get_action" | "list_action_executions" | "get_execution_status" |
        "get_action_permissions" => ToolCategory::ReadOnly,
        // Write tools
        "create_workflow" | "add_workflow_step" | "create_step_template" => ToolCategory::Write,
        // Execute tools (including MCP action execution)
        "run_workflow" | "run_script" | "trigger_webhook" | "run_mcp_workflow" | "run_npm_script" => ToolCategory::Execute,
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
pub struct GetProjectsParams {
    /// Optional search query to filter projects by name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunNpmScriptParams {
    /// Project path (required - the directory containing package.json)
    pub project_path: String,
    /// Script name from package.json scripts (e.g., "build", "dev", "test")
    pub script_name: String,
    /// Optional arguments to pass to the script
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// Timeout in milliseconds (default: 5 minutes, max: 1 hour)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}

// ============================================================================
// MCP Action Tool Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListActionsParams {
    /// Filter by action type (script, webhook, workflow)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_type: Option<String>,
    /// Filter by project ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Only return enabled actions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetActionParams {
    /// Action ID to retrieve
    pub action_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunScriptParams {
    /// Action ID of the script to execute
    pub action_id: String,
    /// Additional arguments to pass to the script
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// Environment variable overrides
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    /// Working directory override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TriggerWebhookParams {
    /// Action ID of the webhook to trigger
    pub action_id: String,
    /// Variables for URL/payload template substitution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<HashMap<String, String>>,
    /// Payload override (replaces template)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunMcpWorkflowParams {
    /// Action ID of the workflow action to execute
    pub action_id: String,
    /// Parameter overrides for the workflow
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<HashMap<String, serde_json::Value>>,
    /// Whether to wait for workflow completion
    #[serde(default)]
    pub wait_for_completion: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetExecutionStatusParams {
    /// Execution ID to check
    pub execution_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListActionExecutionsParams {
    /// Filter by action ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    /// Filter by action type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_type: Option<String>,
    /// Filter by status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// Maximum number of results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetActionPermissionsParams {
    /// Optional action ID to get specific permission
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
}

// ============================================================================
// Response Types for Tools
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Project ID (if registered in PackageFlow, null if not registered)
    pub id: Option<String>,
    /// Project path
    pub path: String,
    /// Project name
    pub name: String,
    /// Project description
    pub description: Option<String>,
    /// Git remote URL
    pub git_remote: Option<String>,
    /// Current git branch
    pub current_branch: Option<String>,
    /// Package manager detected (npm, yarn, pnpm, bun)
    pub package_manager: Option<String>,
    /// Available scripts from package.json
    pub scripts: Option<HashMap<String, String>>,
    /// Project type (node, rust, python, etc.)
    pub project_type: Option<String>,
    /// Node.js version from .nvmrc, .node-version, or package.json engines
    pub node_version: Option<String>,
    /// Associated workflows in PackageFlow
    pub workflows: Option<Vec<WorkflowRef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRef {
    pub id: String,
    pub name: String,
}

/// Project summary for list_projects response
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListItem {
    /// Project ID
    pub id: String,
    /// Project name
    pub name: String,
    /// Project path
    pub path: String,
    /// Project description
    pub description: Option<String>,
    /// Project type (node, rust, python, tauri, nextjs, etc.)
    pub project_type: Option<String>,
    /// Package manager (npm, yarn, pnpm, bun)
    pub package_manager: Option<String>,
    /// Current git branch
    pub current_branch: Option<String>,
    /// Number of workflows associated with this project
    pub workflow_count: usize,
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

    /// List all registered projects in PackageFlow
    #[tool(description = "List all registered projects in PackageFlow with detailed info including project type, package manager, and workflow count.")]
    async fn list_projects(
        &self,
        Parameters(params): Parameters<GetProjectsParams>,
    ) -> Result<CallToolResult, McpError> {
        let store_data = read_store_data()
            .map_err(|e| McpError::internal_error(e, None))?;

        let mut projects: Vec<&Project> = store_data.projects.iter().collect();

        // Filter by query if specified
        if let Some(ref query) = params.query {
            let query_lower = query.to_lowercase();
            projects.retain(|p| {
                p.name.to_lowercase().contains(&query_lower) ||
                p.path.to_lowercase().contains(&query_lower) ||
                p.description.as_ref().map(|d| d.to_lowercase().contains(&query_lower)).unwrap_or(false)
            });
        }

        // Sort by name
        projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        // Build detailed project list
        let detailed_projects: Vec<ProjectListItem> = projects.iter().map(|p| {
            let path_buf = PathBuf::from(&p.path);
            let (package_manager, _, _) = Self::read_package_json(&path_buf);
            let project_type = Self::detect_project_type(&path_buf);
            let current_branch = Self::get_current_branch(&p.path);
            let workflow_count = store_data.workflows.iter()
                .filter(|w| w.project_id.as_ref() == Some(&p.id))
                .count();

            ProjectListItem {
                id: p.id.clone(),
                name: p.name.clone(),
                path: p.path.clone(),
                description: p.description.clone(),
                project_type,
                package_manager,
                current_branch,
                workflow_count,
            }
        }).collect();

        let response = serde_json::json!({
            "projects": detailed_projects,
            "total": detailed_projects.len()
        });
        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get information about a project at the specified path
    #[tool(description = "Get detailed information about a project including ID, scripts, package manager, workflows, and git info")]
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

        // Try to find project in store to get ID and description
        let store_data = read_store_data().ok();
        let registered_project = store_data.as_ref().and_then(|data| {
            data.projects.iter().find(|p| p.path == path)
        });

        // Get associated workflows for this project
        let workflows = registered_project.and_then(|p| {
            store_data.as_ref().map(|data| {
                data.workflows.iter()
                    .filter(|w| w.project_id.as_ref() == Some(&p.id))
                    .map(|w| WorkflowRef {
                        id: w.id.clone(),
                        name: w.name.clone(),
                    })
                    .collect::<Vec<_>>()
            })
        }).filter(|v: &Vec<WorkflowRef>| !v.is_empty());

        // Detect package manager and read package.json
        let (package_manager, scripts, node_version_from_pkg) = Self::read_package_json(&path_buf);

        // Detect project type
        let project_type = Self::detect_project_type(&path_buf);

        // Get node version from various sources
        let node_version = Self::get_node_version(&path_buf).or(node_version_from_pkg);

        let project = ProjectInfo {
            id: registered_project.map(|p| p.id.clone()),
            path: path.clone(),
            name: registered_project
                .map(|p| p.name.clone())
                .unwrap_or_else(|| {
                    path_buf
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                }),
            description: registered_project.and_then(|p| p.description.clone()),
            git_remote: Self::get_remote_url(&path),
            current_branch: Self::get_current_branch(&path),
            package_manager,
            scripts,
            project_type,
            node_version,
            workflows,
        };

        let json = serde_json::to_string_pretty(&project)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Read package.json and extract scripts, detect package manager
    fn read_package_json(path: &PathBuf) -> (Option<String>, Option<HashMap<String, String>>, Option<String>) {
        let package_json_path = path.join("package.json");

        // Detect package manager from lockfile
        let package_manager = if path.join("pnpm-lock.yaml").exists() {
            Some("pnpm".to_string())
        } else if path.join("yarn.lock").exists() {
            Some("yarn".to_string())
        } else if path.join("bun.lockb").exists() || path.join("bun.lock").exists() {
            Some("bun".to_string())
        } else if path.join("package-lock.json").exists() {
            Some("npm".to_string())
        } else if package_json_path.exists() {
            Some("npm".to_string()) // Default to npm if package.json exists
        } else {
            None
        };

        if !package_json_path.exists() {
            return (package_manager, None, None);
        }

        // Read and parse package.json
        let content = match std::fs::read_to_string(&package_json_path) {
            Ok(c) => c,
            Err(_) => return (package_manager, None, None),
        };

        let pkg: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => return (package_manager, None, None),
        };

        // Extract scripts
        let scripts = pkg.get("scripts").and_then(|s| {
            s.as_object().map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|val| (k.clone(), val.to_string())))
                    .collect::<HashMap<String, String>>()
            })
        }).filter(|s| !s.is_empty());

        // Extract node version from engines
        let node_version = pkg.get("engines")
            .and_then(|e| e.get("node"))
            .and_then(|n| n.as_str())
            .map(|s| s.to_string());

        (package_manager, scripts, node_version)
    }

    /// Detect project type based on files present
    fn detect_project_type(path: &PathBuf) -> Option<String> {
        // Check for various project indicators
        if path.join("Cargo.toml").exists() {
            return Some("rust".to_string());
        }
        if path.join("go.mod").exists() {
            return Some("go".to_string());
        }
        if path.join("requirements.txt").exists() || path.join("pyproject.toml").exists() || path.join("setup.py").exists() {
            return Some("python".to_string());
        }
        if path.join("Gemfile").exists() {
            return Some("ruby".to_string());
        }
        if path.join("pom.xml").exists() || path.join("build.gradle").exists() || path.join("build.gradle.kts").exists() {
            return Some("java".to_string());
        }
        if path.join("Package.swift").exists() {
            return Some("swift".to_string());
        }
        if path.join("pubspec.yaml").exists() {
            return Some("dart".to_string());
        }

        // Check for Node.js project types
        if path.join("package.json").exists() {
            // Check for specific frameworks
            if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
                if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                    let deps = pkg.get("dependencies").and_then(|d| d.as_object());
                    let dev_deps = pkg.get("devDependencies").and_then(|d| d.as_object());

                    // Check dependencies for framework detection
                    let has_dep = |name: &str| {
                        deps.map(|d| d.contains_key(name)).unwrap_or(false) ||
                        dev_deps.map(|d| d.contains_key(name)).unwrap_or(false)
                    };

                    if has_dep("next") {
                        return Some("nextjs".to_string());
                    }
                    if has_dep("nuxt") {
                        return Some("nuxt".to_string());
                    }
                    if has_dep("@tauri-apps/api") || path.join("src-tauri").exists() {
                        return Some("tauri".to_string());
                    }
                    if has_dep("electron") {
                        return Some("electron".to_string());
                    }
                    if has_dep("react-native") || has_dep("expo") {
                        return Some("react-native".to_string());
                    }
                    if has_dep("vue") {
                        return Some("vue".to_string());
                    }
                    if has_dep("react") {
                        return Some("react".to_string());
                    }
                    if has_dep("svelte") {
                        return Some("svelte".to_string());
                    }
                    if has_dep("@angular/core") {
                        return Some("angular".to_string());
                    }
                    if has_dep("express") || has_dep("fastify") || has_dep("koa") || has_dep("hono") {
                        return Some("node-server".to_string());
                    }
                }
            }
            return Some("node".to_string());
        }

        None
    }

    /// Get Node.js version from .nvmrc, .node-version, or volta config
    fn get_node_version(path: &PathBuf) -> Option<String> {
        // Check .nvmrc
        if let Ok(version) = std::fs::read_to_string(path.join(".nvmrc")) {
            let v = version.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }

        // Check .node-version
        if let Ok(version) = std::fs::read_to_string(path.join(".node-version")) {
            let v = version.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }

        // Check volta in package.json
        if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(version) = pkg.get("volta")
                    .and_then(|v| v.get("node"))
                    .and_then(|n| n.as_str())
                {
                    return Some(version.to_string());
                }
            }
        }

        None
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

        // Record execution start time
        let execution_id = format!("exec-{}", Uuid::new_v4());
        let started_at = Utc::now();

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

        // Record execution end time and duration
        let finished_at = Utc::now();
        let duration_ms = (finished_at - started_at).num_milliseconds() as u64;

        // Save execution history to database
        if let Err(e) = Self::save_execution_history(
            &execution_id,
            &workflow.id,
            &workflow.name,
            status,
            &started_at.to_rfc3339(),
            &finished_at.to_rfc3339(),
            duration_ms,
            total_steps,
            steps_executed,
            failed_step.as_ref().map(|f| f.error_message.clone()),
            &output_lines,
        ) {
            eprintln!("[MCP Server] Failed to save execution history: {}", e);
        }

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

    // ========================================================================
    // NPM Script Execution Tool
    // ========================================================================

    /// Execute an npm script from a project's package.json
    /// Supports volta and corepack for proper toolchain management
    #[tool(description = "Execute an npm/yarn/pnpm script from a project's package.json. Automatically detects and uses volta/corepack if configured. First use get_project to discover available scripts, then use this tool to run them.")]
    async fn run_npm_script(
        &self,
        Parameters(params): Parameters<RunNpmScriptParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_path = PathBuf::from(&params.project_path);
        let package_json_path = project_path.join("package.json");

        // Check if package.json exists
        if !package_json_path.exists() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("No package.json found at: {}", params.project_path)
            )]));
        }

        // Read and parse package.json to verify script exists and get toolchain config
        let package_json_content = std::fs::read_to_string(&package_json_path)
            .map_err(|e| McpError::internal_error(format!("Failed to read package.json: {}", e), None))?;

        let package_json: serde_json::Value = serde_json::from_str(&package_json_content)
            .map_err(|e| McpError::internal_error(format!("Failed to parse package.json: {}", e), None))?;

        // Check if the script exists
        let scripts = package_json.get("scripts")
            .and_then(|s| s.as_object());

        if let Some(scripts_obj) = scripts {
            if !scripts_obj.contains_key(&params.script_name) {
                let available_scripts: Vec<&String> = scripts_obj.keys().collect();
                return Ok(CallToolResult::error(vec![Content::text(
                    format!(
                        "Script '{}' not found in package.json. Available scripts: {}",
                        params.script_name,
                        available_scripts.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
                    )
                )]));
            }
        } else {
            return Ok(CallToolResult::error(vec![Content::text(
                "No scripts defined in package.json"
            )]));
        }

        // Parse toolchain configuration from package.json
        let volta_config = package_json.get("volta");
        let package_manager_field = package_json.get("packageManager")
            .and_then(|v| v.as_str())
            .map(String::from);

        // Detect package manager from lock files or packageManager field
        let (package_manager, pm_version) = if let Some(ref pm_field) = package_manager_field {
            // Parse packageManager field (e.g., "pnpm@9.15.0+sha512.xxx")
            let parts: Vec<&str> = pm_field.split('@').collect();
            let pm_name = parts.first().unwrap_or(&"npm");
            let version = parts.get(1).map(|v| {
                // Remove hash if present (e.g., "9.15.0+sha512.xxx" -> "9.15.0")
                v.split('+').next().unwrap_or(v).to_string()
            });
            (pm_name.to_string(), version)
        } else if project_path.join("pnpm-lock.yaml").exists() {
            ("pnpm".to_string(), None)
        } else if project_path.join("yarn.lock").exists() {
            ("yarn".to_string(), None)
        } else if project_path.join("bun.lockb").exists() {
            ("bun".to_string(), None)
        } else {
            ("npm".to_string(), None)
        };

        // Check volta availability
        let home = path_resolver::get_home_dir();
        let volta_available = home.as_ref()
            .map(|h| std::path::Path::new(&format!("{}/.volta/bin/volta", h)).exists())
            .unwrap_or(false);

        // Determine toolchain strategy
        let use_volta = volta_available && volta_config.is_some();
        let use_corepack = package_manager_field.is_some();

        // Build the command based on toolchain strategy
        let (command, strategy_used) = if use_volta {
            // Use volta run for proper Node.js version management
            let volta_path = home.as_ref()
                .map(|h| format!("{}/.volta/bin/volta", h))
                .unwrap_or_else(|| "volta".to_string());

            let mut cmd_parts = vec![volta_path, "run".to_string()];

            // Add node version if specified in volta config
            if let Some(volta) = volta_config {
                if let Some(node_ver) = volta.get("node").and_then(|v| v.as_str()) {
                    cmd_parts.push("--node".to_string());
                    cmd_parts.push(node_ver.to_string());
                }

                // Add package manager version from volta config (unless using corepack)
                if !use_corepack {
                    if let Some(pnpm_ver) = volta.get("pnpm").and_then(|v| v.as_str()) {
                        cmd_parts.push("--pnpm".to_string());
                        cmd_parts.push(pnpm_ver.to_string());
                    } else if let Some(yarn_ver) = volta.get("yarn").and_then(|v| v.as_str()) {
                        cmd_parts.push("--yarn".to_string());
                        cmd_parts.push(yarn_ver.to_string());
                    } else if let Some(npm_ver) = volta.get("npm").and_then(|v| v.as_str()) {
                        cmd_parts.push("--npm".to_string());
                        cmd_parts.push(npm_ver.to_string());
                    }
                }
            }

            // Add the package manager run command
            cmd_parts.push(package_manager.clone());
            cmd_parts.push("run".to_string());
            cmd_parts.push(params.script_name.clone());

            // Add script arguments
            if let Some(ref args) = params.args {
                cmd_parts.push("--".to_string());
                cmd_parts.extend(args.iter().cloned());
            }

            let strategy = if use_corepack { "volta+corepack" } else { "volta" };
            (cmd_parts.join(" "), strategy.to_string())
        } else {
            // Direct execution - let PATH (with volta shims if available) handle it
            // Corepack will intercept if packageManager is set and corepack is enabled
            let mut cmd = format!("{} run {}", package_manager, params.script_name);

            if let Some(ref args) = params.args {
                cmd.push_str(&format!(" -- {}", args.join(" ")));
            }

            let strategy = if use_corepack { "corepack" } else { "system" };
            (cmd, strategy.to_string())
        };

        // Validate and apply timeout (default 5 min, max 1 hour)
        let timeout_ms = params.timeout_ms.map(|t| t.min(3_600_000)).unwrap_or(300_000);

        // Execute the command
        match Self::shell_command_async(&params.project_path, &command, Some(timeout_ms)).await {
            Ok((exit_code, stdout, stderr)) => {
                // Sanitize outputs
                let sanitized_stdout = sanitize_output(&stdout);
                let sanitized_stderr = sanitize_output(&stderr);

                let response = serde_json::json!({
                    "success": exit_code == 0,
                    "script_name": params.script_name,
                    "package_manager": package_manager,
                    "package_manager_version": pm_version,
                    "toolchain_strategy": strategy_used,
                    "volta_available": volta_available,
                    "volta_config": volta_config.is_some(),
                    "corepack_config": package_manager_field.is_some(),
                    "command": command,
                    "exit_code": exit_code,
                    "stdout": sanitized_stdout,
                    "stderr": sanitized_stderr,
                });

                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;

                if exit_code == 0 {
                    Ok(CallToolResult::success(vec![Content::text(json)]))
                } else {
                    Ok(CallToolResult::error(vec![Content::text(json)]))
                }
            }
            Err(e) => {
                let sanitized_error = sanitize_error(&e);
                Ok(CallToolResult::error(vec![Content::text(
                    format!("Failed to execute script '{}': {}", params.script_name, sanitized_error)
                )]))
            }
        }
    }

    /// Save execution history to database
    fn save_execution_history(
        execution_id: &str,
        workflow_id: &str,
        workflow_name: &str,
        status: &str,
        started_at: &str,
        finished_at: &str,
        duration_ms: u64,
        node_count: usize,
        completed_node_count: usize,
        error_message: Option<String>,
        output_lines: &[String],
    ) -> Result<(), String> {
        let db_path = get_database_path()?;
        let db = Database::new(db_path)?;

        // Convert output lines to JSON format matching WorkflowOutputLine interface
        // Frontend expects: { nodeId, nodeName, content, stream, timestamp }
        let output_json: Vec<serde_json::Value> = output_lines
            .iter()
            .map(|line| {
                serde_json::json!({
                    "nodeId": "mcp",
                    "nodeName": "MCP Execution",
                    "content": line,
                    "stream": "stdout",
                    "timestamp": chrono::Utc::now().to_rfc3339()
                })
            })
            .collect();

        let output_str = serde_json::to_string(&output_json)
            .map_err(|e| format!("Failed to serialize output: {}", e))?;

        db.with_connection(|conn| {
            conn.execute(
                r#"
                INSERT OR REPLACE INTO execution_history
                (id, workflow_id, workflow_name, status, started_at, finished_at,
                 duration_ms, node_count, completed_node_count, error_message,
                 output, triggered_by)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
                params![
                    execution_id,
                    workflow_id,
                    workflow_name,
                    status,
                    started_at,
                    finished_at,
                    duration_ms as i64,
                    node_count as i32,
                    completed_node_count as i32,
                    error_message,
                    output_str,
                    "mcp", // triggered_by
                ],
            )
            .map_err(|e| format!("Failed to save execution history: {}", e))?;

            Ok(())
        })
    }

    // ========================================================================
    // MCP Action Tools
    // ========================================================================

    /// List available MCP actions (scripts, webhooks, workflows)
    #[tool(description = "List all available MCP actions that can be executed. Filter by type (script, webhook, workflow) or project.")]
    async fn list_actions(
        &self,
        Parameters(params): Parameters<ListActionsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db);

        // Build filter
        let filter = ActionFilter {
            action_type: params.action_type.as_ref().and_then(|t| {
                match t.as_str() {
                    "script" => Some(MCPActionType::Script),
                    "webhook" => Some(MCPActionType::Webhook),
                    "workflow" => Some(MCPActionType::Workflow),
                    _ => None,
                }
            }),
            project_id: params.project_id,
            is_enabled: params.enabled_only,
        };

        let actions = repo.list_actions(&filter)
            .map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "actions": actions,
            "total": actions.len()
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get details of a specific MCP action
    #[tool(description = "Get detailed information about a specific MCP action by ID.")]
    async fn get_action(
        &self,
        Parameters(params): Parameters<GetActionParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db);

        let action = repo.get_action(&params.action_id)
            .map_err(|e| McpError::internal_error(e, None))?;

        match action {
            Some(action) => {
                let json = serde_json::to_string_pretty(&action)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            None => {
                Ok(CallToolResult::error(vec![Content::text(
                    format!("Action not found: {}", params.action_id)
                )]))
            }
        }
    }

    /// Execute a script action via MCP
    #[tool(description = "Execute a predefined script action. Requires user confirmation unless auto-approve is configured.")]
    async fn run_script(
        &self,
        Parameters(params): Parameters<RunScriptParams>,
    ) -> Result<CallToolResult, McpError> {
        let start = std::time::Instant::now();

        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db.clone());

        // Get the action
        let action = repo.get_action(&params.action_id)
            .map_err(|e| McpError::internal_error(e, None))?
            .ok_or_else(|| McpError::invalid_params(
                format!("Script action not found: {}", params.action_id),
                None
            ))?;

        // Verify it's a script action
        if action.action_type != MCPActionType::Script {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Action {} is not a script action", params.action_id)
            )]));
        }

        // Check if action is enabled
        if !action.is_enabled {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Script action {} is disabled", action.name)
            )]));
        }

        // Check permission
        let permission = repo.get_permission(Some(&params.action_id), &action.action_type)
            .map_err(|e| McpError::internal_error(e, None))?;

        if permission == PermissionLevel::Deny {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Permission denied for action: {}", action.name)
            )]));
        }

        // Create execution record
        let execution_id = Uuid::new_v4().to_string();
        let started_at = Utc::now().to_rfc3339();

        let mut execution = packageflow_lib::models::mcp_action::MCPActionExecution {
            id: execution_id.clone(),
            action_id: Some(params.action_id.clone()),
            action_type: action.action_type.clone(),
            action_name: action.name.clone(),
            source_client: Some("mcp".to_string()),
            parameters: Some(serde_json::to_value(&params).unwrap_or_default()),
            status: ExecutionStatus::Running,
            result: None,
            error_message: None,
            started_at: started_at.clone(),
            completed_at: None,
            duration_ms: None,
        };

        repo.save_execution(&execution)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Acquire semaphore permit for concurrency control
        let _permit = ACTION_SEMAPHORE.acquire().await
            .map_err(|e| McpError::internal_error(format!("Failed to acquire execution permit: {}", e), None))?;

        // Build execution parameters
        let mut exec_params = serde_json::json!({
            "config": action.config
        });

        // Apply overrides
        if let Some(cwd) = &params.cwd {
            exec_params["cwd"] = serde_json::Value::String(cwd.clone());
        }

        // Execute the script
        let executor = create_executor(MCPActionType::Script);
        let result = executor.execute(exec_params).await;

        let duration_ms = start.elapsed().as_millis() as i64;
        let completed_at = Utc::now().to_rfc3339();

        // Update execution record
        match result {
            Ok(result_value) => {
                execution.status = ExecutionStatus::Completed;
                execution.result = Some(result_value.clone());
                execution.completed_at = Some(completed_at);
                execution.duration_ms = Some(duration_ms);

                repo.save_execution(&execution)
                    .map_err(|e| McpError::internal_error(e, None))?;

                let response = serde_json::json!({
                    "success": true,
                    "executionId": execution_id,
                    "actionName": action.name,
                    "result": result_value
                });

                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;

                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            Err(error) => {
                let sanitized_error = sanitize_error(&error);
                execution.status = ExecutionStatus::Failed;
                execution.error_message = Some(sanitized_error.clone());
                execution.completed_at = Some(completed_at);
                execution.duration_ms = Some(duration_ms);

                repo.save_execution(&execution)
                    .map_err(|e| McpError::internal_error(e, None))?;

                Ok(CallToolResult::error(vec![Content::text(
                    format!("Script execution failed: {}", sanitized_error)
                )]))
            }
        }
    }

    /// Trigger a webhook action via MCP
    #[tool(description = "Trigger a configured webhook action with optional variable substitution.")]
    async fn trigger_webhook(
        &self,
        Parameters(params): Parameters<TriggerWebhookParams>,
    ) -> Result<CallToolResult, McpError> {
        let start = std::time::Instant::now();

        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db.clone());

        // Get the action
        let action = repo.get_action(&params.action_id)
            .map_err(|e| McpError::internal_error(e, None))?
            .ok_or_else(|| McpError::invalid_params(
                format!("Webhook action not found: {}", params.action_id),
                None
            ))?;

        // Verify it's a webhook action
        if action.action_type != MCPActionType::Webhook {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Action {} is not a webhook action", params.action_id)
            )]));
        }

        // Check if action is enabled
        if !action.is_enabled {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Webhook action {} is disabled", action.name)
            )]));
        }

        // Check permission
        let permission = repo.get_permission(Some(&params.action_id), &action.action_type)
            .map_err(|e| McpError::internal_error(e, None))?;

        if permission == PermissionLevel::Deny {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Permission denied for action: {}", action.name)
            )]));
        }

        // Create execution record
        let execution_id = Uuid::new_v4().to_string();
        let started_at = Utc::now().to_rfc3339();

        let mut execution = packageflow_lib::models::mcp_action::MCPActionExecution {
            id: execution_id.clone(),
            action_id: Some(params.action_id.clone()),
            action_type: action.action_type.clone(),
            action_name: action.name.clone(),
            source_client: Some("mcp".to_string()),
            parameters: Some(serde_json::to_value(&params).unwrap_or_default()),
            status: ExecutionStatus::Running,
            result: None,
            error_message: None,
            started_at: started_at.clone(),
            completed_at: None,
            duration_ms: None,
        };

        repo.save_execution(&execution)
            .map_err(|e| McpError::internal_error(e, None))?;

        // Acquire semaphore permit
        let _permit = ACTION_SEMAPHORE.acquire().await
            .map_err(|e| McpError::internal_error(format!("Failed to acquire execution permit: {}", e), None))?;

        // Build execution parameters
        let mut exec_params = serde_json::json!({
            "config": action.config
        });

        if let Some(vars) = &params.variables {
            exec_params["variables"] = serde_json::to_value(vars).unwrap_or_default();
        }
        if let Some(payload) = &params.payload {
            exec_params["payload"] = payload.clone();
        }

        // Execute the webhook
        let executor = create_executor(MCPActionType::Webhook);
        let result = executor.execute(exec_params).await;

        let duration_ms = start.elapsed().as_millis() as i64;
        let completed_at = Utc::now().to_rfc3339();

        // Update execution record
        match result {
            Ok(result_value) => {
                execution.status = ExecutionStatus::Completed;
                execution.result = Some(result_value.clone());
                execution.completed_at = Some(completed_at);
                execution.duration_ms = Some(duration_ms);

                repo.save_execution(&execution)
                    .map_err(|e| McpError::internal_error(e, None))?;

                let response = serde_json::json!({
                    "success": true,
                    "executionId": execution_id,
                    "actionName": action.name,
                    "result": result_value
                });

                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;

                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            Err(error) => {
                let sanitized_error = sanitize_error(&error);
                execution.status = ExecutionStatus::Failed;
                execution.error_message = Some(sanitized_error.clone());
                execution.completed_at = Some(completed_at);
                execution.duration_ms = Some(duration_ms);

                repo.save_execution(&execution)
                    .map_err(|e| McpError::internal_error(e, None))?;

                Ok(CallToolResult::error(vec![Content::text(
                    format!("Webhook execution failed: {}", sanitized_error)
                )]))
            }
        }
    }

    /// Get the status of an action execution
    #[tool(description = "Get the current status and result of a running or completed action execution.")]
    async fn get_execution_status(
        &self,
        Parameters(params): Parameters<GetExecutionStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db);

        let execution = repo.get_execution(&params.execution_id)
            .map_err(|e| McpError::internal_error(e, None))?;

        match execution {
            Some(exec) => {
                let json = serde_json::to_string_pretty(&exec)
                    .map_err(|e| McpError::internal_error(e.to_string(), None))?;
                Ok(CallToolResult::success(vec![Content::text(json)]))
            }
            None => {
                Ok(CallToolResult::error(vec![Content::text(
                    format!("Execution not found: {}", params.execution_id)
                )]))
            }
        }
    }

    /// List action execution history
    #[tool(description = "List recent action executions with optional filtering by action, type, or status.")]
    async fn list_action_executions(
        &self,
        Parameters(params): Parameters<ListActionExecutionsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db);

        let filter = ExecutionFilter {
            action_id: params.action_id,
            action_type: params.action_type.as_ref().and_then(|t| {
                match t.as_str() {
                    "script" => Some(MCPActionType::Script),
                    "webhook" => Some(MCPActionType::Webhook),
                    "workflow" => Some(MCPActionType::Workflow),
                    _ => None,
                }
            }),
            status: params.status.as_ref().and_then(|s| {
                match s.as_str() {
                    "pending_confirm" => Some(ExecutionStatus::PendingConfirm),
                    "queued" => Some(ExecutionStatus::Queued),
                    "running" => Some(ExecutionStatus::Running),
                    "completed" => Some(ExecutionStatus::Completed),
                    "failed" => Some(ExecutionStatus::Failed),
                    "cancelled" => Some(ExecutionStatus::Cancelled),
                    "timed_out" => Some(ExecutionStatus::TimedOut),
                    _ => None,
                }
            }),
            limit: params.limit.map(|l| l as usize).unwrap_or(20),
        };

        let executions = repo.list_executions(&filter)
            .map_err(|e| McpError::internal_error(e, None))?;

        let response = serde_json::json!({
            "executions": executions,
            "total": executions.len()
        });

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Get action permissions
    #[tool(description = "Get permission configuration for actions. Shows whether actions require confirmation, auto-approve, or are denied.")]
    async fn get_action_permissions(
        &self,
        Parameters(params): Parameters<GetActionPermissionsParams>,
    ) -> Result<CallToolResult, McpError> {
        let db = open_database()
            .map_err(|e| McpError::internal_error(e, None))?;
        let repo = MCPActionRepository::new(db);

        if let Some(action_id) = params.action_id {
            // Get the action to get its type
            let action = repo.get_action(&action_id)
                .map_err(|e| McpError::internal_error(e, None))?
                .ok_or_else(|| McpError::invalid_params(
                    format!("Action not found: {}", action_id),
                    None
                ))?;

            // Get permission for specific action
            let permission = repo.get_permission(Some(&action_id), &action.action_type)
                .map_err(|e| McpError::internal_error(e, None))?;

            let response = serde_json::json!({
                "actionId": action_id,
                "permissionLevel": permission.to_string()
            });

            let json = serde_json::to_string_pretty(&response)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            Ok(CallToolResult::success(vec![Content::text(json)]))
        } else {
            // List all permissions
            let permissions = repo.list_permissions()
                .map_err(|e| McpError::internal_error(e, None))?;

            let response = serde_json::json!({
                "permissions": permissions,
                "defaultLevel": "require_confirm"
            });

            let json = serde_json::to_string_pretty(&response)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            Ok(CallToolResult::success(vec![Content::text(json)]))
        }
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
            // Note: Write and Execute operations are ALWAYS logged (for MCP trigger detection),
            // regardless of log_requests setting. This enables DatabaseWatcher to distinguish
            // MCP-triggered operations from manual UI operations for desktop notifications.
            let tool_category = get_tool_category(&tool_name);
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

/// Print help information about available MCP tools
fn print_help() {
    let version = env!("CARGO_PKG_VERSION");
    println!(r#"PackageFlow MCP Server v{}

USAGE:
    packageflow-mcp [OPTIONS]

OPTIONS:
    --help, -h      Print this help information
    --version, -v   Print version information
    --list-tools    List all available MCP tools

DESCRIPTION:
    PackageFlow MCP Server provides AI assistants (Claude Code, Cursor, etc.)
    with tools to manage Git projects, worktrees, workflows, and automation.

MCP TOOLS:

  📁 PROJECT MANAGEMENT
    list_projects       List all registered projects with detailed info
    get_project         Get project details (scripts, workflows, git info)

  🌳 GIT WORKTREE
    list_worktrees      List all git worktrees for a project
    get_worktree_status Get git status (branch, staged, modified, untracked)
    get_git_diff        Get staged changes diff for commit messages

  ⚡ WORKFLOWS
    list_workflows      List all workflows, filter by project
    get_workflow        Get detailed workflow info with all steps
    create_workflow     Create a new workflow
    add_workflow_step   Add a script step to a workflow
    run_workflow        Execute a workflow synchronously

  📝 TEMPLATES
    list_step_templates List available step templates
    create_step_template Create a reusable step template

  🔧 NPM/PACKAGE SCRIPTS
    run_npm_script      Run npm/yarn/pnpm scripts (volta/corepack support)

  🎯 MCP ACTIONS
    list_actions        List all available MCP actions
    get_action          Get action details by ID
    run_script          Execute a predefined script action
    trigger_webhook     Trigger a configured webhook action
    get_execution_status Get action execution status
    list_action_executions List recent action executions
    get_action_permissions Get permission configuration

PERMISSION MODES:
    read_only           Only read operations allowed (default)
    read_write          Read and write operations allowed
    full_access         All operations including execute allowed

CONFIGURATION:
    Configure in PackageFlow: Settings → MCP Server

EXAMPLES:
    # Start the MCP server (for AI integration)
    packageflow-mcp

    # Get help
    packageflow-mcp --help

    # List available tools
    packageflow-mcp --list-tools
"#, version);
}

/// Print version information
fn print_version() {
    println!("packageflow-mcp {}", env!("CARGO_PKG_VERSION"));
}

/// List all tools in a simple format
fn list_tools_simple() {
    println!("PackageFlow MCP Tools:\n");
    let tools = [
        ("list_projects", "List all registered projects with detailed info"),
        ("get_project", "Get project details (scripts, workflows, git info)"),
        ("list_worktrees", "List all git worktrees for a project"),
        ("get_worktree_status", "Get git status (branch, staged, modified, untracked)"),
        ("get_git_diff", "Get staged changes diff for commit messages"),
        ("list_workflows", "List all workflows, filter by project"),
        ("get_workflow", "Get detailed workflow info with all steps"),
        ("create_workflow", "Create a new workflow"),
        ("add_workflow_step", "Add a script step to a workflow"),
        ("run_workflow", "Execute a workflow synchronously"),
        ("list_step_templates", "List available step templates"),
        ("create_step_template", "Create a reusable step template"),
        ("run_npm_script", "Run npm/yarn/pnpm scripts (volta/corepack support)"),
        ("list_actions", "List all MCP actions"),
        ("get_action", "Get action details by ID"),
        ("run_script", "Execute a script action"),
        ("trigger_webhook", "Trigger a webhook action"),
        ("get_execution_status", "Get action execution status"),
        ("list_action_executions", "List recent executions"),
        ("get_action_permissions", "Get permission configuration"),
    ];

    for (name, desc) in tools {
        println!("  {:<25} {}", name, desc);
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
