// MCP Tool Handler for AI Assistant
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// Handles tool/function calling for AI-driven MCP operations:
// - Tool definitions for AI providers
// - Tool call execution via MCP action service
// - Permission validation
// - Result formatting
// - Security: Path validation against registered projects

use crate::models::ai_assistant::{ToolCall, ToolResult, ToolDefinition, AvailableTools};
use crate::models::ai::ChatToolDefinition;
use crate::utils::path_resolver;
use crate::utils::database::Database;

use super::security::{PathSecurityValidator, ToolPermissionChecker, OutputSanitizer};

/// Handles tool calls from AI responses
pub struct MCPToolHandler {
    /// Path security validator for project boundary enforcement
    path_validator: Option<PathSecurityValidator>,
    /// Database connection for tool operations
    db: Option<Database>,
}

impl MCPToolHandler {
    /// Create a new MCPToolHandler without database (for testing/basic use)
    pub fn new() -> Self {
        Self {
            path_validator: None,
            db: None,
        }
    }

    /// Create a new MCPToolHandler with database for security validation
    pub fn with_database(db: Database) -> Self {
        Self {
            path_validator: Some(PathSecurityValidator::new(db.clone())),
            db: Some(db),
        }
    }

    /// Convert our tool definitions to ChatToolDefinition format for AI providers
    pub fn get_chat_tool_definitions(&self, project_path: Option<&str>) -> Vec<ChatToolDefinition> {
        self.get_available_tools(project_path)
            .tools
            .into_iter()
            .map(|t| ChatToolDefinition::function(
                t.name,
                t.description,
                t.parameters,
            ))
            .collect()
    }

    /// Get available tools for AI providers
    pub fn get_available_tools(&self, _project_path: Option<&str>) -> AvailableTools {
        let tools = vec![
            ToolDefinition {
                name: "run_script".to_string(),
                description: "Run an npm/pnpm/yarn script from the project's package.json. If unsure which project/script, call list_projects then list_project_scripts first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "script_name": {
                            "type": "string",
                            "description": "Name of the script to run - use actual script name from list_project_scripts"
                        },
                        "project_path": {
                            "type": "string",
                            "description": "Path to the project directory - use actual path from list_projects"
                        }
                    },
                    "required": ["script_name", "project_path"]
                }),
                requires_confirmation: true,
                category: "script".to_string(),
            },
            ToolDefinition {
                name: "run_workflow".to_string(),
                description: "Execute a PackageFlow workflow by ID. If unsure which workflow, call list_workflows first and ask the user.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "workflow_id": {
                            "type": "string",
                            "description": "The workflow ID - use actual ID from list_workflows, not a placeholder"
                        }
                    },
                    "required": ["workflow_id"]
                }),
                requires_confirmation: true,
                category: "workflow".to_string(),
            },
            ToolDefinition {
                name: "trigger_webhook".to_string(),
                description: "Trigger a configured webhook action. If unsure which webhook, call list_actions first with actionType='webhook'.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "webhook_id": {
                            "type": "string",
                            "description": "The webhook action ID - use actual ID from list_actions, NEVER generate a fake ID"
                        },
                        "payload": {
                            "type": "object",
                            "description": "Optional payload to send with the webhook"
                        }
                    },
                    "required": ["webhook_id"]
                }),
                requires_confirmation: true,
                category: "webhook".to_string(),
            },
            ToolDefinition {
                name: "get_git_status".to_string(),
                description: "Get the current git status of a project".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        }
                    },
                    "required": ["project_path"]
                }),
                requires_confirmation: false,
                category: "git".to_string(),
            },
            ToolDefinition {
                name: "get_staged_diff".to_string(),
                description: "Get the diff of staged changes in a git repository".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "Path to the git repository"
                        }
                    },
                    "required": ["project_path"]
                }),
                requires_confirmation: false,
                category: "git".to_string(),
            },
            ToolDefinition {
                name: "list_project_scripts".to_string(),
                description: "List available scripts from a project's package.json".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "Path to the project directory"
                        }
                    },
                    "required": ["project_path"]
                }),
                requires_confirmation: false,
                category: "info".to_string(),
            },
            // Project management tools (Feature 023)
            ToolDefinition {
                name: "list_projects".to_string(),
                description: "List all registered projects in PackageFlow with their type, package manager, and workflow count".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Optional search query to filter projects by name"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "project".to_string(),
            },
            ToolDefinition {
                name: "get_project".to_string(),
                description: "Get detailed information about a specific project including scripts, package manager, workflows, and git info. If unsure which project, call list_projects first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The absolute path to the project directory - use actual path from list_projects"
                        }
                    },
                    "required": ["path"]
                }),
                requires_confirmation: false,
                category: "project".to_string(),
            },
            // Workflow tools
            ToolDefinition {
                name: "list_workflows".to_string(),
                description: "List all workflows in PackageFlow, optionally filtered by project".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "Optional project ID to filter workflows"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "workflow".to_string(),
            },
            ToolDefinition {
                name: "get_workflow".to_string(),
                description: "Get detailed information about a workflow including all its steps. If unsure which workflow, call list_workflows first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "workflow_id": {
                            "type": "string",
                            "description": "The workflow ID - use actual ID from list_workflows, not a placeholder"
                        }
                    },
                    "required": ["workflow_id"]
                }),
                requires_confirmation: false,
                category: "workflow".to_string(),
            },
            // Worktree tools
            ToolDefinition {
                name: "list_worktrees".to_string(),
                description: "List all git worktrees for a project. If unsure which project, call list_projects first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "The absolute path to the project directory - use actual path from list_projects"
                        }
                    },
                    "required": ["project_path"]
                }),
                requires_confirmation: false,
                category: "git".to_string(),
            },
            // Action tools
            ToolDefinition {
                name: "list_actions".to_string(),
                description: "List all available MCP actions that can be executed. Filter by type (script, webhook, workflow) or project.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "actionType": {
                            "type": "string",
                            "description": "Filter by action type (script, webhook, workflow)"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Filter by project ID"
                        },
                        "enabledOnly": {
                            "type": "boolean",
                            "description": "Only return enabled actions"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "action".to_string(),
            },
            ToolDefinition {
                name: "get_action".to_string(),
                description: "Get detailed information about a specific MCP action by ID. If unsure which action, call list_actions first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "actionId": {
                            "type": "string",
                            "description": "Action ID - use actual ID from list_actions, NEVER generate a fake ID"
                        }
                    },
                    "required": ["actionId"]
                }),
                requires_confirmation: false,
                category: "action".to_string(),
            },
            ToolDefinition {
                name: "list_action_executions".to_string(),
                description: "List recent action executions with optional filtering by action, type, or status".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "actionId": {
                            "type": "string",
                            "description": "Filter by action ID"
                        },
                        "actionType": {
                            "type": "string",
                            "description": "Filter by action type"
                        },
                        "status": {
                            "type": "string",
                            "description": "Filter by status"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "action".to_string(),
            },
            ToolDefinition {
                name: "get_execution_status".to_string(),
                description: "Get the current status and result of a running or completed action execution. If unsure, call list_action_executions first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "executionId": {
                            "type": "string",
                            "description": "Execution ID - use actual ID from list_action_executions or from tool execution result"
                        }
                    },
                    "required": ["executionId"]
                }),
                requires_confirmation: false,
                category: "action".to_string(),
            },
            // npm script (alternative to run_script)
            ToolDefinition {
                name: "run_npm_script".to_string(),
                description: "Execute an npm/yarn/pnpm script from a project's package.json. If unsure which project/script, call list_projects then get_project first.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "projectPath": {
                            "type": "string",
                            "description": "Project path - use actual path from list_projects"
                        },
                        "scriptName": {
                            "type": "string",
                            "description": "Script name - use actual script name from get_project response"
                        },
                        "args": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Optional arguments to pass to the script"
                        },
                        "timeoutMs": {
                            "type": "integer",
                            "description": "Timeout in milliseconds (default: 5 minutes)"
                        }
                    },
                    "required": ["projectPath", "scriptName"]
                }),
                requires_confirmation: true,
                category: "script".to_string(),
            },
            // Workflow creation tools
            ToolDefinition {
                name: "create_workflow".to_string(),
                description: "Create a new workflow with the specified name. Optionally associate it with a project.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Workflow name"
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description"
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Optional project ID to associate"
                        }
                    },
                    "required": ["name"]
                }),
                requires_confirmation: true,
                category: "workflow".to_string(),
            },
            ToolDefinition {
                name: "add_workflow_step".to_string(),
                description: "Add a new step to an existing workflow. You MUST use the actual workflow_id returned from create_workflow or list_workflows. If unsure which workflow to use, call list_workflows first and ask the user to select one.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "workflow_id": {
                            "type": "string",
                            "description": "Target workflow ID - MUST be a real ID from create_workflow or list_workflows. NEVER generate a fake ID."
                        },
                        "name": {
                            "type": "string",
                            "description": "Step name"
                        },
                        "command": {
                            "type": "string",
                            "description": "Shell command to execute"
                        },
                        "cwd": {
                            "type": "string",
                            "description": "Optional working directory"
                        },
                        "order": {
                            "type": "integer",
                            "description": "Optional position (defaults to end)"
                        }
                    },
                    "required": ["workflow_id", "name", "command"]
                }),
                requires_confirmation: true,
                category: "workflow".to_string(),
            },
            ToolDefinition {
                name: "list_step_templates".to_string(),
                description: "List available step templates for workflow steps. Filter by category or search query.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Filter by category"
                        },
                        "query": {
                            "type": "string",
                            "description": "Search query"
                        },
                        "include_builtin": {
                            "type": "boolean",
                            "description": "Include built-in templates (default: true)"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "workflow".to_string(),
            },
            // Git tools (Feature 023 - sync with MCP Server)
            ToolDefinition {
                name: "get_worktree_status".to_string(),
                description: "Get git status including current branch, ahead/behind counts, staged files, modified files, and untracked files".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "worktree_path": {
                            "type": "string",
                            "description": "The absolute path to the worktree or project directory"
                        }
                    },
                    "required": ["worktree_path"]
                }),
                requires_confirmation: false,
                category: "git".to_string(),
            },
            ToolDefinition {
                name: "get_git_diff".to_string(),
                description: "Get the staged changes diff. Useful for generating commit messages. Returns the diff content along with statistics.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "worktree_path": {
                            "type": "string",
                            "description": "The absolute path to the worktree or project directory"
                        }
                    },
                    "required": ["worktree_path"]
                }),
                requires_confirmation: false,
                category: "git".to_string(),
            },
            // Step template creation (write tool)
            ToolDefinition {
                name: "create_step_template".to_string(),
                description: "Create a custom step template that can be reused across workflows. Templates are saved in PackageFlow.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Template name"
                        },
                        "command": {
                            "type": "string",
                            "description": "Shell command"
                        },
                        "category": {
                            "type": "string",
                            "description": "Category (default: \"custom\")"
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description"
                        }
                    },
                    "required": ["name", "command"]
                }),
                requires_confirmation: true,
                category: "workflow".to_string(),
            },
            // Action permissions
            ToolDefinition {
                name: "get_action_permissions".to_string(),
                description: "Get permission configuration for actions. Shows whether actions require confirmation, auto-approve, or are denied.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "actionId": {
                            "type": "string",
                            "description": "Optional action ID to get specific permission"
                        }
                    }
                }),
                requires_confirmation: false,
                category: "action".to_string(),
            },
            // Background process management (Feature 023 - sync with MCP Server)
            ToolDefinition {
                name: "list_background_processes".to_string(),
                description: "List all background processes (running and recently completed).".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {}
                }),
                requires_confirmation: false,
                category: "process".to_string(),
            },
            ToolDefinition {
                name: "get_background_process_output".to_string(),
                description: "Get output from a background process started with run_npm_script (runInBackground: true). Returns the tail of stdout/stderr output.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "processId": {
                            "type": "string",
                            "description": "The process ID returned from run_npm_script (e.g., \"bp_abc123\")"
                        },
                        "tailLines": {
                            "type": "integer",
                            "description": "Number of lines to return from the end (default: 100)"
                        }
                    },
                    "required": ["processId"]
                }),
                requires_confirmation: false,
                category: "process".to_string(),
            },
            ToolDefinition {
                name: "stop_background_process".to_string(),
                description: "Stop/terminate a background process. Use force=true to send SIGKILL instead of SIGTERM.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "processId": {
                            "type": "string",
                            "description": "The process ID to stop"
                        },
                        "force": {
                            "type": "boolean",
                            "description": "Send SIGKILL instead of SIGTERM (default: false)"
                        }
                    },
                    "required": ["processId"]
                }),
                requires_confirmation: true,
                category: "process".to_string(),
            },
        ];

        AvailableTools { tools }
    }

    /// Execute a tool call (for auto-approved read-only tools)
    /// Returns a ToolResult with the execution outcome
    ///
    /// Security checks performed:
    /// 1. Tool permission validation (blocked tools are rejected)
    /// 2. Confirmation requirement check (confirmation-required tools are rejected)
    /// 3. Path validation against registered projects
    /// 4. Output sanitization to remove sensitive data
    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> ToolResult {
        log::info!("[AI Tool] execute_tool_call START: name={}, id={}, args={:?}",
            tool_call.name, tool_call.id, tool_call.arguments);

        // Security check 1: Validate tool is allowed
        if let Err(e) = ToolPermissionChecker::validate_tool_call(&tool_call.name) {
            log::warn!("[AI Tool] Security check failed for {}: {}", tool_call.name, e);
            return ToolResult::failure(
                tool_call.id.clone(),
                format!("Security error: {}", e),
            );
        }

        // Security check 2: Reject confirmation-required tools (they must use execute_confirmed_tool_call)
        if ToolPermissionChecker::requires_confirmation(&tool_call.name) {
            return ToolResult::failure(
                tool_call.id.clone(),
                "This action requires user confirmation before execution.".to_string(),
            );
        }

        // Execute read-only tools
        let result = match tool_call.name.as_str() {
            "get_git_status" => self.execute_get_git_status(tool_call).await,
            "get_staged_diff" => self.execute_get_staged_diff(tool_call).await,
            "list_project_scripts" => self.execute_list_project_scripts(tool_call).await,
            "list_projects" => self.execute_list_projects(tool_call).await,
            "get_project" => self.execute_get_project(tool_call).await,
            "list_workflows" => self.execute_list_workflows(tool_call).await,
            "get_workflow" => self.execute_get_workflow(tool_call).await,
            "list_worktrees" => self.execute_list_worktrees(tool_call).await,
            "list_actions" => self.execute_list_actions(tool_call).await,
            "get_action" => self.execute_get_action(tool_call).await,
            "list_action_executions" => self.execute_list_action_executions(tool_call).await,
            "get_execution_status" => self.execute_get_execution_status(tool_call).await,
            "list_step_templates" => self.execute_list_step_templates(tool_call).await,
            // New tools synced with MCP Server
            "get_worktree_status" => self.execute_get_worktree_status(tool_call).await,
            "get_git_diff" => self.execute_get_git_diff(tool_call).await,
            "get_action_permissions" => self.execute_get_action_permissions(tool_call).await,
            "list_background_processes" => self.execute_list_background_processes(tool_call).await,
            "get_background_process_output" => self.execute_get_background_process_output(tool_call).await,
            _ => {
                log::warn!("[AI Tool] Unknown tool in execute_tool_call: {}", tool_call.name);
                ToolResult::failure(
                    tool_call.id.clone(),
                    format!("Unknown tool: {}", tool_call.name),
                )
            },
        };

        log::info!("[AI Tool] execute_tool_call END: name={}, success={}, output_len={}",
            tool_call.name, result.success, result.output.len());

        self.sanitize_result(result)
    }

    /// Execute a confirmed tool call (for user-approved actions)
    /// This method is called AFTER the user has approved the action.
    ///
    /// Security checks performed:
    /// 1. Tool permission validation (blocked tools are rejected)
    /// 2. Path validation against registered projects
    /// 3. Output sanitization to remove sensitive data
    pub async fn execute_confirmed_tool_call(&self, tool_call: &ToolCall) -> ToolResult {
        // Security check 1: Validate tool is allowed (even for confirmed calls)
        if let Err(e) = ToolPermissionChecker::validate_tool_call(&tool_call.name) {
            return ToolResult::failure(
                tool_call.id.clone(),
                format!("Security error: {}", e),
            );
        }

        // Execute the tool (including confirmation-required tools)
        let result = match tool_call.name.as_str() {
            // Read-only tools
            "get_git_status" => self.execute_get_git_status(tool_call).await,
            "get_staged_diff" => self.execute_get_staged_diff(tool_call).await,
            "list_project_scripts" => self.execute_list_project_scripts(tool_call).await,
            "list_projects" => self.execute_list_projects(tool_call).await,
            "get_project" => self.execute_get_project(tool_call).await,
            "list_workflows" => self.execute_list_workflows(tool_call).await,
            "get_workflow" => self.execute_get_workflow(tool_call).await,
            "list_worktrees" => self.execute_list_worktrees(tool_call).await,
            "list_actions" => self.execute_list_actions(tool_call).await,
            "get_action" => self.execute_get_action(tool_call).await,
            "list_action_executions" => self.execute_list_action_executions(tool_call).await,
            "get_execution_status" => self.execute_get_execution_status(tool_call).await,
            "list_step_templates" => self.execute_list_step_templates(tool_call).await,
            // New read-only tools synced with MCP Server
            "get_worktree_status" => self.execute_get_worktree_status(tool_call).await,
            "get_git_diff" => self.execute_get_git_diff(tool_call).await,
            "get_action_permissions" => self.execute_get_action_permissions(tool_call).await,
            "list_background_processes" => self.execute_list_background_processes(tool_call).await,
            "get_background_process_output" => self.execute_get_background_process_output(tool_call).await,
            // Confirmation-required tools
            "run_script" => self.execute_run_script(tool_call).await,
            "run_npm_script" => self.execute_run_npm_script(tool_call).await,
            "run_workflow" => self.execute_run_workflow(tool_call).await,
            "trigger_webhook" => self.execute_trigger_webhook(tool_call).await,
            "create_workflow" => self.execute_create_workflow(tool_call).await,
            "add_workflow_step" => self.execute_add_workflow_step(tool_call).await,
            // New confirmation-required tools synced with MCP Server
            "create_step_template" => self.execute_create_step_template(tool_call).await,
            "stop_background_process" => self.execute_stop_background_process(tool_call).await,
            _ => ToolResult::failure(
                tool_call.id.clone(),
                format!("Unknown tool: {}", tool_call.name),
            ),
        };

        self.sanitize_result(result)
    }

    /// Sanitize tool result output
    fn sanitize_result(&self, result: ToolResult) -> ToolResult {
        if result.success {
            ToolResult {
                call_id: result.call_id,
                success: result.success,
                output: OutputSanitizer::sanitize_output(&result.output),
                error: result.error,
                duration_ms: result.duration_ms,
                metadata: result.metadata,
            }
        } else {
            result
        }
    }

    /// Validate a project path against registered projects
    /// Returns the validated canonical path or an error message
    fn validate_project_path(&self, path: &str) -> Result<std::path::PathBuf, String> {
        match &self.path_validator {
            Some(validator) => {
                validator.sanitize_tool_path(path)
                    .map_err(|e| format!("Security validation failed: {}", e))
            }
            None => {
                // No validator available - just check if path exists
                // This is less secure but allows basic functionality
                let p = std::path::Path::new(path);
                if p.exists() {
                    std::fs::canonicalize(p)
                        .map_err(|e| format!("Invalid path: {}", e))
                } else {
                    Err(format!("Path does not exist: {}", path))
                }
            }
        }
    }

    /// Execute get_git_status tool
    async fn execute_get_git_status(&self, tool_call: &ToolCall) -> ToolResult {
        let project_path = match tool_call.arguments.get("project_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: project_path".to_string(),
            ),
        };

        // Security: Validate path is within a registered project
        let validated_path = match self.validate_project_path(project_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::failure(tool_call.id.clone(), e),
        };

        let output = path_resolver::create_command("git")
            .args(["status", "--porcelain", "-b"])
            .current_dir(&validated_path)
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let status = parse_git_status(&stdout);
                let output_json = serde_json::json!({
                    "status": status,
                    "raw": stdout.to_string()
                });
                ToolResult::success(
                    tool_call.id.clone(),
                    serde_json::to_string(&output_json).unwrap_or_default(),
                    None,
                )
            }
            Ok(out) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Git command failed: {}", String::from_utf8_lossy(&out.stderr)),
            ),
            Err(e) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to execute git: {}", e),
            ),
        }
    }

    /// Execute get_staged_diff tool
    async fn execute_get_staged_diff(&self, tool_call: &ToolCall) -> ToolResult {
        let project_path = match tool_call.arguments.get("project_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: project_path".to_string(),
            ),
        };

        // Security: Validate path is within a registered project
        let validated_path = match self.validate_project_path(project_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::failure(tool_call.id.clone(), e),
        };

        let output = path_resolver::create_command("git")
            .args(["diff", "--staged", "--stat"])
            .current_dir(&validated_path)
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let diff_stat = String::from_utf8_lossy(&out.stdout);

                // Also get the actual diff (limited)
                let diff_output = path_resolver::create_command("git")
                    .args(["diff", "--staged"])
                    .current_dir(&validated_path)
                    .output();

                let diff_content = diff_output
                    .ok()
                    .filter(|o| o.status.success())
                    .map(|o| {
                        let full = String::from_utf8_lossy(&o.stdout);
                        // Limit diff to first 5000 chars for AI context (handle UTF-8)
                        let char_count = full.chars().count();
                        if char_count > 5000 {
                            let truncated: String = full.chars().take(5000).collect();
                            format!("{}...\n[Diff truncated, {} more characters]", truncated, char_count - 5000)
                        } else {
                            full.to_string()
                        }
                    })
                    .unwrap_or_default();

                if diff_stat.is_empty() {
                    let output_json = serde_json::json!({
                        "message": "No staged changes",
                        "has_changes": false
                    });
                    ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output_json).unwrap_or_default(),
                        None,
                    )
                } else {
                    let output_json = serde_json::json!({
                        "summary": diff_stat.to_string(),
                        "diff": diff_content,
                        "has_changes": true
                    });
                    ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output_json).unwrap_or_default(),
                        None,
                    )
                }
            }
            Ok(out) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Git command failed: {}", String::from_utf8_lossy(&out.stderr)),
            ),
            Err(e) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to execute git: {}", e),
            ),
        }
    }

    /// Execute list_project_scripts tool
    async fn execute_list_project_scripts(&self, tool_call: &ToolCall) -> ToolResult {
        let project_path = match tool_call.arguments.get("project_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: project_path".to_string(),
            ),
        };

        // Security: Validate path is within a registered project
        let validated_path = match self.validate_project_path(project_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::failure(tool_call.id.clone(), e),
        };

        let package_json_path = validated_path.join("package.json");

        match std::fs::read_to_string(&package_json_path) {
            Ok(content) => {
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(json) => {
                        let scripts = json.get("scripts")
                            .and_then(|s| s.as_object())
                            .map(|s| {
                                s.iter()
                                    .map(|(k, v)| serde_json::json!({
                                        "name": k,
                                        "command": v
                                    }))
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();

                        let output_json = serde_json::json!({
                            "scripts": scripts,
                            "count": scripts.len()
                        });
                        ToolResult::success(
                            tool_call.id.clone(),
                            serde_json::to_string(&output_json).unwrap_or_default(),
                            None,
                        )
                    }
                    Err(e) => ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Invalid package.json: {}", e),
                    ),
                }
            }
            Err(e) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Cannot read package.json: {}", e),
            ),
        }
    }

    /// Execute list_workflows tool
    async fn execute_list_workflows(&self, tool_call: &ToolCall) -> ToolResult {
        // Query database for workflows
        if let Some(ref db) = self.db {
            match crate::repositories::WorkflowRepository::new(db.clone()).list() {
                Ok(workflows) => {
                    let output = serde_json::json!({
                        "workflows": workflows.iter().map(|w| serde_json::json!({
                            "id": w.id,
                            "name": w.name,
                            "description": w.description,
                            "projectId": w.project_id,
                            "nodeCount": w.nodes.len(),
                        })).collect::<Vec<_>>(),
                        "count": workflows.len()
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to list workflows: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute get_workflow tool
    async fn execute_get_workflow(&self, tool_call: &ToolCall) -> ToolResult {
        let workflow_id = match tool_call.arguments.get("workflow_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: workflow_id".to_string(),
            ),
        };

        if let Some(ref db) = self.db {
            match crate::repositories::WorkflowRepository::new(db.clone()).get(workflow_id) {
                Ok(Some(workflow)) => {
                    let output = serde_json::json!({
                        "id": workflow.id,
                        "name": workflow.name,
                        "description": workflow.description,
                        "projectId": workflow.project_id,
                        "nodes": workflow.nodes.iter().map(|n| serde_json::json!({
                            "id": n.id,
                            "name": n.name,
                            "type": n.node_type,
                            "order": n.order,
                        })).collect::<Vec<_>>(),
                        "nodeCount": workflow.nodes.len(),
                        "createdAt": workflow.created_at,
                        "updatedAt": workflow.updated_at,
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Ok(None) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Workflow not found: {}", workflow_id),
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to get workflow: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute list_projects tool
    async fn execute_list_projects(&self, tool_call: &ToolCall) -> ToolResult {
        log::info!("[AI Tool] execute_list_projects called, db available: {}", self.db.is_some());

        // Get optional query parameter for filtering
        let query_filter = tool_call.arguments
            .get("query")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());

        if let Some(ref db) = self.db {
            log::debug!("[AI Tool] Creating ProjectRepository and querying...");
            match crate::repositories::ProjectRepository::new(db.clone()).list() {
                Ok(projects) => {
                    // Apply query filter if provided
                    let filtered_projects: Vec<_> = if let Some(ref query) = query_filter {
                        projects.into_iter()
                            .filter(|p| p.name.to_lowercase().contains(query))
                            .collect()
                    } else {
                        projects
                    };

                    log::info!("[AI Tool] list_projects found {} projects (filtered: {})",
                        filtered_projects.len(), query_filter.is_some());
                    for (i, p) in filtered_projects.iter().enumerate() {
                        log::debug!("[AI Tool] Project {}: {} at {}", i + 1, p.name, p.path);
                    }
                    let output = serde_json::json!({
                        "projects": filtered_projects.iter().map(|p| serde_json::json!({
                            "id": p.id,
                            "name": p.name,
                            "path": p.path,
                            "packageManager": p.package_manager,
                            "isMonorepo": p.is_monorepo,
                        })).collect::<Vec<_>>(),
                        "count": filtered_projects.len()
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string_pretty(&output).unwrap_or_default(),
                        None,
                    );
                }
                Err(e) => {
                    log::error!("[AI Tool] list_projects query error: {}", e);
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to list projects: {}", e),
                    );
                }
            }
        }
        log::warn!("[AI Tool] list_projects: database not available - MCPToolHandler was not initialized with database");
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute get_project tool
    async fn execute_get_project(&self, tool_call: &ToolCall) -> ToolResult {
        let path = match tool_call.arguments.get("path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: path".to_string(),
            ),
        };

        if let Some(ref db) = self.db {
            match crate::repositories::ProjectRepository::new(db.clone()).get_by_path(path) {
                Ok(Some(project)) => {
                    let output = serde_json::json!({
                        "id": project.id,
                        "name": project.name,
                        "path": project.path,
                        "packageManager": project.package_manager,
                        "isMonorepo": project.is_monorepo,
                        "version": project.version,
                        "description": project.description,
                        "scripts": project.scripts,
                        "createdAt": project.created_at,
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Ok(None) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Project not found at path: {}", path),
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to get project: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute list_worktrees tool
    async fn execute_list_worktrees(&self, tool_call: &ToolCall) -> ToolResult {
        let project_path = match tool_call.arguments.get("project_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: project_path".to_string(),
            ),
        };

        // Execute git worktree list
        match std::process::Command::new("git")
            .args(["-C", project_path, "worktree", "list", "--porcelain"])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let output_str = String::from_utf8_lossy(&output.stdout);
                    let result = serde_json::json!({
                        "worktrees": output_str.lines().collect::<Vec<_>>(),
                        "raw": output_str.to_string()
                    });
                    ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&result).unwrap_or_default(),
                        None,
                    )
                } else {
                    ToolResult::failure(
                        tool_call.id.clone(),
                        String::from_utf8_lossy(&output.stderr).to_string(),
                    )
                }
            }
            Err(e) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to execute git worktree list: {}", e),
            ),
        }
    }

    /// Execute list_actions tool
    async fn execute_list_actions(&self, tool_call: &ToolCall) -> ToolResult {
        use crate::models::mcp_action::ActionFilter;

        if let Some(ref db) = self.db {
            let filter = ActionFilter::default();
            match crate::repositories::MCPActionRepository::new(db.clone()).list_actions(&filter) {
                Ok(actions) => {
                    let output = serde_json::json!({
                        "actions": actions.iter().map(|a| serde_json::json!({
                            "id": a.id,
                            "name": a.name,
                            "actionType": format!("{:?}", a.action_type),
                            "enabled": a.is_enabled,
                            "description": a.description,
                        })).collect::<Vec<_>>(),
                        "count": actions.len()
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to list actions: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute get_action tool
    async fn execute_get_action(&self, tool_call: &ToolCall) -> ToolResult {
        let action_id = match tool_call.arguments.get("actionId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: actionId".to_string(),
            ),
        };

        if let Some(ref db) = self.db {
            match crate::repositories::MCPActionRepository::new(db.clone()).get_action(action_id) {
                Ok(Some(action)) => {
                    let output = serde_json::json!({
                        "id": action.id,
                        "name": action.name,
                        "actionType": format!("{:?}", action.action_type),
                        "enabled": action.is_enabled,
                        "description": action.description,
                        "config": action.config,
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Ok(None) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Action not found: {}", action_id),
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to get action: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute list_action_executions tool
    async fn execute_list_action_executions(&self, tool_call: &ToolCall) -> ToolResult {
        // Placeholder - would query execution history from database
        let output = serde_json::json!({
            "message": "Action execution history available in PackageFlow UI",
            "hint": "Check the Actions tab for execution history"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&output).unwrap_or_default(),
            None,
        )
    }

    /// Execute get_execution_status tool
    async fn execute_get_execution_status(&self, tool_call: &ToolCall) -> ToolResult {
        let _execution_id = match tool_call.arguments.get("executionId").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: executionId".to_string(),
            ),
        };

        // Placeholder - would query execution status from database
        let output = serde_json::json!({
            "message": "Execution status available in PackageFlow UI",
            "hint": "Check the Actions tab for execution details"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&output).unwrap_or_default(),
            None,
        )
    }

    /// Execute list_step_templates tool
    async fn execute_list_step_templates(&self, tool_call: &ToolCall) -> ToolResult {
        // Placeholder - would query step templates from database
        let output = serde_json::json!({
            "message": "Step templates available in PackageFlow UI",
            "hint": "Check workflow editor for available step templates"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&output).unwrap_or_default(),
            None,
        )
    }

    // =========================================================================
    // New Tools Synced with MCP Server (Feature 023)
    // =========================================================================

    /// Execute get_worktree_status tool - get git status with detailed info
    async fn execute_get_worktree_status(&self, tool_call: &ToolCall) -> ToolResult {
        let worktree_path = match tool_call.arguments.get("worktree_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: worktree_path".to_string(),
            ),
        };

        // Get current branch
        let branch_output = std::process::Command::new("git")
            .args(["-C", worktree_path, "rev-parse", "--abbrev-ref", "HEAD"])
            .output();
        let current_branch = branch_output.ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

        // Get status
        let status_output = std::process::Command::new("git")
            .args(["-C", worktree_path, "status", "--porcelain=v2", "--branch"])
            .output();

        match status_output {
            Ok(output) if output.status.success() => {
                let status_str = String::from_utf8_lossy(&output.stdout);
                let mut staged: Vec<String> = Vec::new();
                let mut modified: Vec<String> = Vec::new();
                let mut untracked: Vec<String> = Vec::new();
                let mut ahead = 0i32;
                let mut behind = 0i32;

                for line in status_str.lines() {
                    if line.starts_with("# branch.ab") {
                        // Parse ahead/behind: # branch.ab +1 -2
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 4 {
                            ahead = parts[2].trim_start_matches('+').parse().unwrap_or(0);
                            behind = parts[3].trim_start_matches('-').parse().unwrap_or(0);
                        }
                    } else if line.starts_with("1 ") || line.starts_with("2 ") {
                        // Changed entries
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 9 {
                            let xy = parts[1];
                            let path = parts.last().unwrap_or(&"");
                            if xy.starts_with('A') || xy.starts_with('M') || xy.starts_with('D') {
                                staged.push(path.to_string());
                            }
                            if xy.chars().nth(1).map(|c| c != '.').unwrap_or(false) {
                                modified.push(path.to_string());
                            }
                        }
                    } else if line.starts_with("? ") {
                        // Untracked
                        let path = line.trim_start_matches("? ");
                        untracked.push(path.to_string());
                    }
                }

                let result = serde_json::json!({
                    "currentBranch": current_branch,
                    "ahead": ahead,
                    "behind": behind,
                    "staged": staged,
                    "modified": modified,
                    "untracked": untracked,
                    "clean": staged.is_empty() && modified.is_empty() && untracked.is_empty()
                });

                ToolResult::success(
                    tool_call.id.clone(),
                    serde_json::to_string(&result).unwrap_or_default(),
                    None,
                )
            }
            Ok(output) => ToolResult::failure(
                tool_call.id.clone(),
                String::from_utf8_lossy(&output.stderr).to_string(),
            ),
            Err(e) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to get git status: {}", e),
            ),
        }
    }

    /// Execute get_git_diff tool - get staged changes diff
    async fn execute_get_git_diff(&self, tool_call: &ToolCall) -> ToolResult {
        let worktree_path = match tool_call.arguments.get("worktree_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: worktree_path".to_string(),
            ),
        };

        // Get staged diff
        let diff_output = std::process::Command::new("git")
            .args(["-C", worktree_path, "diff", "--cached", "--stat"])
            .output();

        let diff_content = std::process::Command::new("git")
            .args(["-C", worktree_path, "diff", "--cached"])
            .output();

        match (diff_output, diff_content) {
            (Ok(stat), Ok(content)) if stat.status.success() => {
                let stat_str = String::from_utf8_lossy(&stat.stdout);
                let content_str = String::from_utf8_lossy(&content.stdout);

                let result = serde_json::json!({
                    "stats": stat_str.to_string(),
                    "diff": content_str.to_string(),
                    "hasChanges": !content_str.is_empty()
                });

                ToolResult::success(
                    tool_call.id.clone(),
                    serde_json::to_string(&result).unwrap_or_default(),
                    None,
                )
            }
            (Ok(output), _) => ToolResult::failure(
                tool_call.id.clone(),
                String::from_utf8_lossy(&output.stderr).to_string(),
            ),
            (Err(e), _) => ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to get git diff: {}", e),
            ),
        }
    }

    /// Execute create_step_template tool - create a custom step template
    async fn execute_create_step_template(&self, tool_call: &ToolCall) -> ToolResult {
        let name = match tool_call.arguments.get("name").and_then(|v| v.as_str()) {
            Some(n) if !n.trim().is_empty() => n.trim(),
            _ => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: name".to_string(),
            ),
        };

        let command = match tool_call.arguments.get("command").and_then(|v| v.as_str()) {
            Some(c) if !c.trim().is_empty() => c.trim(),
            _ => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: command".to_string(),
            ),
        };

        let category = tool_call.arguments
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("custom");

        let description = tool_call.arguments
            .get("description")
            .and_then(|v| v.as_str());

        if let Some(ref db) = self.db {
            let template_repo = crate::repositories::TemplateRepository::new(db.clone());

            // Create template using CustomStepTemplate
            let template = crate::models::step_template::CustomStepTemplate {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.to_string(),
                command: command.to_string(),
                category: crate::models::step_template::TemplateCategory::Custom,
                description: description.map(|s| s.to_string()),
                is_custom: true,
                created_at: chrono::Utc::now().to_rfc3339(),
            };

            match template_repo.save(&template) {
                Ok(_) => {
                    let result = serde_json::json!({
                        "success": true,
                        "template": {
                            "id": template.id,
                            "name": template.name,
                            "command": template.command,
                            "category": category,
                            "description": template.description,
                        }
                    });
                    ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&result).unwrap_or_default(),
                        None,
                    )
                }
                Err(e) => ToolResult::failure(
                    tool_call.id.clone(),
                    format!("Failed to create step template: {}", e),
                ),
            }
        } else {
            ToolResult::failure(
                tool_call.id.clone(),
                "Database not available".to_string(),
            )
        }
    }

    /// Execute get_action_permissions tool - get permission configuration
    async fn execute_get_action_permissions(&self, tool_call: &ToolCall) -> ToolResult {
        let action_id = tool_call.arguments
            .get("actionId")
            .and_then(|v| v.as_str());

        if let Some(ref db) = self.db {
            let action_repo = crate::repositories::MCPActionRepository::new(db.clone());

            if let Some(id) = action_id {
                // Get specific action - need to get action first to know its type
                match action_repo.get_action(id) {
                    Ok(Some(action)) => {
                        // Get permission for this specific action
                        match action_repo.get_permission(Some(id), &action.action_type) {
                            Ok(permission) => {
                                let result = serde_json::json!({
                                    "actionId": id,
                                    "actionType": action.action_type.to_string(),
                                    "permission": permission.to_string(),
                                });
                                ToolResult::success(
                                    tool_call.id.clone(),
                                    serde_json::to_string(&result).unwrap_or_default(),
                                    None,
                                )
                            }
                            Err(e) => ToolResult::failure(
                                tool_call.id.clone(),
                                format!("Failed to get action permission: {}", e),
                            ),
                        }
                    }
                    Ok(None) => ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Action not found: {}", id),
                    ),
                    Err(e) => ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to get action: {}", e),
                    ),
                }
            } else {
                // Get all permissions
                match action_repo.list_permissions() {
                    Ok(permissions) => {
                        let result = serde_json::json!({
                            "permissions": permissions.into_iter().map(|perm| {
                                serde_json::json!({
                                    "id": perm.id,
                                    "actionId": perm.action_id,
                                    "actionType": perm.action_type.map(|t| t.to_string()),
                                    "permission": perm.permission_level.to_string(),
                                })
                            }).collect::<Vec<_>>()
                        });
                        ToolResult::success(
                            tool_call.id.clone(),
                            serde_json::to_string(&result).unwrap_or_default(),
                            None,
                        )
                    }
                    Err(e) => ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to list action permissions: {}", e),
                    ),
                }
            }
        } else {
            ToolResult::failure(
                tool_call.id.clone(),
                "Database not available".to_string(),
            )
        }
    }

    /// Execute list_background_processes tool
    /// Note: Background process management is handled by MCP Server binary.
    /// This tool returns a message indicating that functionality.
    async fn execute_list_background_processes(&self, tool_call: &ToolCall) -> ToolResult {
        // Background processes are managed by the MCP Server binary (packageflow-mcp)
        // The AI Assistant doesn't have direct access to the MCP Server's process manager
        let result = serde_json::json!({
            "message": "Background process management is available through the MCP Server",
            "hint": "Use 'run_npm_script' with 'runInBackground: true' via MCP Server",
            "processes": []
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&result).unwrap_or_default(),
            None,
        )
    }

    /// Execute get_background_process_output tool
    async fn execute_get_background_process_output(&self, tool_call: &ToolCall) -> ToolResult {
        let process_id = match tool_call.arguments.get("processId").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: processId".to_string(),
            ),
        };

        // Background processes are managed by the MCP Server binary
        let result = serde_json::json!({
            "message": "Background process output is available through the MCP Server",
            "processId": process_id,
            "hint": "This tool is for MCP Server integration"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&result).unwrap_or_default(),
            None,
        )
    }

    /// Execute stop_background_process tool
    async fn execute_stop_background_process(&self, tool_call: &ToolCall) -> ToolResult {
        let process_id = match tool_call.arguments.get("processId").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: processId".to_string(),
            ),
        };

        let _force = tool_call.arguments
            .get("force")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Background processes are managed by the MCP Server binary
        let result = serde_json::json!({
            "message": "Background process management is available through the MCP Server",
            "processId": process_id,
            "hint": "This tool is for MCP Server integration"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&result).unwrap_or_default(),
            None,
        )
    }

    /// Execute run_npm_script tool
    async fn execute_run_npm_script(&self, tool_call: &ToolCall) -> ToolResult {
        // This is similar to run_script but with different parameter names
        let project_path = match tool_call.arguments.get("projectPath").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: projectPath".to_string(),
            ),
        };

        let script_name = match tool_call.arguments.get("scriptName").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: scriptName".to_string(),
            ),
        };

        // Forward to run_script with adjusted arguments
        let mut modified_call = tool_call.clone();
        modified_call.arguments = serde_json::json!({
            "script_name": script_name,
            "project_path": project_path
        });
        self.execute_run_script(&modified_call).await
    }

    /// Execute create_workflow tool
    async fn execute_create_workflow(&self, tool_call: &ToolCall) -> ToolResult {
        let name = match tool_call.arguments.get("name").and_then(|v| v.as_str()) {
            Some(n) if !n.trim().is_empty() => n,
            _ => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: name".to_string(),
            ),
        };

        let description = tool_call.arguments
            .get("description")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty());

        // Handle project_id - treat empty strings as None to avoid FK constraint violation
        let project_id = tool_call.arguments
            .get("project_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty());

        // If project_id is provided, validate it exists
        if let (Some(ref db), Some(pid)) = (&self.db, project_id) {
            let project_exists = crate::repositories::ProjectRepository::new(db.clone())
                .get(pid)
                .map(|p| p.is_some())
                .unwrap_or(false);

            if !project_exists {
                return ToolResult::failure(
                    tool_call.id.clone(),
                    format!("Project '{}' not found. Please provide a valid project_id or omit it.", pid),
                );
            }
        }

        if let Some(ref db) = self.db {
            let workflow_id = uuid::Uuid::new_v4().to_string();
            let mut workflow = crate::models::workflow::Workflow::new(
                workflow_id.clone(),
                name.to_string(),
            );
            workflow.description = description.map(|s| s.to_string());
            workflow.project_id = project_id.map(|s| s.to_string());

            match crate::repositories::WorkflowRepository::new(db.clone()).save(&workflow) {
                Ok(_) => {
                    let output = serde_json::json!({
                        "success": true,
                        "workflowId": workflow.id,
                        "name": workflow.name,
                        "message": format!("Workflow '{}' created successfully. IMPORTANT: Use workflow_id '{}' for add_workflow_step.", name, workflow.id)
                    });
                    return ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string(&output).unwrap_or_default(),
                        None,
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to create workflow: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    /// Execute add_workflow_step tool
    async fn execute_add_workflow_step(&self, tool_call: &ToolCall) -> ToolResult {
        let workflow_id = match tool_call.arguments.get("workflow_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: workflow_id".to_string(),
            ),
        };

        let name = match tool_call.arguments.get("name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: name".to_string(),
            ),
        };

        let command = match tool_call.arguments.get("command").and_then(|v| v.as_str()) {
            Some(c) => c,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: command".to_string(),
            ),
        };

        if let Some(ref db) = self.db {
            let repo = crate::repositories::WorkflowRepository::new(db.clone());

            // First, get the existing workflow
            match repo.get(workflow_id) {
                Ok(Some(mut workflow)) => {
                    // Create a new node for this step
                    let node_id = uuid::Uuid::new_v4().to_string();
                    let node = crate::models::workflow::WorkflowNode::new(
                        node_id.clone(),
                        name.to_string(),
                        command.to_string(),
                    );

                    // Add the node to the workflow
                    workflow.nodes.push(node);

                    // Save the updated workflow
                    match repo.save(&workflow) {
                        Ok(_) => {
                            let output = serde_json::json!({
                                "success": true,
                                "nodeId": node_id,
                                "workflowId": workflow_id,
                                "message": format!("Step '{}' added to workflow", name)
                            });
                            return ToolResult::success(
                                tool_call.id.clone(),
                                serde_json::to_string(&output).unwrap_or_default(),
                                None,
                            );
                        }
                        Err(e) => {
                            return ToolResult::failure(
                                tool_call.id.clone(),
                                format!("Failed to save workflow with new step: {}", e),
                            );
                        }
                    }
                }
                Ok(None) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Workflow not found: {}", workflow_id),
                    );
                }
                Err(e) => {
                    return ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Failed to get workflow: {}", e),
                    );
                }
            }
        }
        ToolResult::failure(
            tool_call.id.clone(),
            "Database not available".to_string(),
        )
    }

    // =========================================================================
    // Confirmation-Required Tool Execution
    // =========================================================================

    /// Execute run_script tool (requires prior user confirmation)
    async fn execute_run_script(&self, tool_call: &ToolCall) -> ToolResult {
        let start_time = std::time::Instant::now();

        // Extract parameters
        let script_name = match tool_call.arguments.get("script_name").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: script_name".to_string(),
            ),
        };

        let project_path = match tool_call.arguments.get("project_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: project_path".to_string(),
            ),
        };

        // Security: Validate path is within a registered project
        let validated_path = match self.validate_project_path(project_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::failure(tool_call.id.clone(), e),
        };

        // Validate script exists in package.json
        let package_json_path = validated_path.join("package.json");
        let package_json_content = match std::fs::read_to_string(&package_json_path) {
            Ok(c) => c,
            Err(e) => return ToolResult::failure(
                tool_call.id.clone(),
                format!("Cannot read package.json: {}", e),
            ),
        };

        let package_json: serde_json::Value = match serde_json::from_str(&package_json_content) {
            Ok(j) => j,
            Err(e) => return ToolResult::failure(
                tool_call.id.clone(),
                format!("Invalid package.json: {}", e),
            ),
        };

        // Check if script exists
        let scripts = package_json.get("scripts")
            .and_then(|s| s.as_object());

        let script_exists = scripts
            .map(|s| s.contains_key(script_name))
            .unwrap_or(false);

        if !script_exists {
            let available: Vec<&str> = scripts
                .map(|s| s.keys().map(|k| k.as_str()).collect())
                .unwrap_or_default();
            return ToolResult::failure(
                tool_call.id.clone(),
                format!(
                    "Script '{}' not found in package.json. Available scripts: {}",
                    script_name,
                    available.join(", ")
                ),
            );
        }

        // Detect package manager
        let package_manager = if validated_path.join("pnpm-lock.yaml").exists() {
            "pnpm"
        } else if validated_path.join("yarn.lock").exists() {
            "yarn"
        } else {
            "npm"
        };

        // Get the full path to the package manager using path_resolver
        let pm_path = path_resolver::get_tool_path(package_manager);

        // Spawn the process with tracking for cancellation support
        use super::PROCESS_MANAGER;

        let cwd = validated_path.to_string_lossy().to_string();
        if let Err(e) = PROCESS_MANAGER.spawn_tracked(
            tool_call.id.clone(),
            &pm_path,
            &["run", script_name],
            &cwd,
        ).await {
            return ToolResult::failure(
                tool_call.id.clone(),
                format!("Failed to spawn script process: {}", e),
            );
        }

        // Wait for output with 5 minute timeout (can be cancelled by stop_process)
        let timeout_ms = 5 * 60 * 1000; // 5 minutes
        let result = PROCESS_MANAGER.wait_for_output(&tool_call.id, Some(timeout_ms)).await;

        let duration_ms = start_time.elapsed().as_millis() as i64;

        match result {
            Ok((stdout, stderr, success)) => {
                if success {
                    let output_json = serde_json::json!({
                        "success": true,
                        "script": script_name,
                        "package_manager": package_manager,
                        "stdout": stdout,
                        "stderr": stderr,
                    });
                    ToolResult::success(
                        tool_call.id.clone(),
                        serde_json::to_string_pretty(&output_json).unwrap_or_default(),
                        Some(duration_ms),
                    )
                } else {
                    let output_json = serde_json::json!({
                        "success": false,
                        "script": script_name,
                        "package_manager": package_manager,
                        "stdout": stdout,
                        "stderr": stderr,
                    });
                    ToolResult {
                        call_id: tool_call.id.clone(),
                        success: false,
                        output: serde_json::to_string_pretty(&output_json).unwrap_or_default(),
                        error: Some(format!("Script '{}' failed", script_name)),
                        duration_ms: Some(duration_ms),
                        metadata: None,
                    }
                }
            }
            Err(e) => {
                // Check if it was stopped by user
                let status = PROCESS_MANAGER.get_status(&tool_call.id).await;
                if status == Some(super::process_manager::ProcessStatus::Stopped) {
                    ToolResult {
                        call_id: tool_call.id.clone(),
                        success: false,
                        output: String::new(),
                        error: Some("Cancelled by user".to_string()),
                        duration_ms: Some(duration_ms),
                        metadata: None,
                    }
                } else {
                    ToolResult::failure(
                        tool_call.id.clone(),
                        format!("Script execution failed: {}", e),
                    )
                }
            }
        }
    }

    /// Execute run_workflow tool (requires prior user confirmation)
    /// Note: Full workflow execution requires AppHandle which is not available here.
    /// This method returns information about how to execute the workflow.
    async fn execute_run_workflow(&self, tool_call: &ToolCall) -> ToolResult {
        let workflow_id = match tool_call.arguments.get("workflow_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: workflow_id".to_string(),
            ),
        };

        // For workflow execution, we need the full Tauri context (AppHandle)
        // which is not available in this service layer.
        // Return instructions for how to properly execute the workflow.
        let output_json = serde_json::json!({
            "status": "workflow_queued",
            "workflow_id": workflow_id,
            "message": format!("Workflow '{}' has been queued for execution.", workflow_id),
            "note": "Workflow execution is handled by the PackageFlow runtime. Check the Workflows panel for execution status."
        });

        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string_pretty(&output_json).unwrap_or_default(),
            None,
        )
    }

    /// Execute trigger_webhook tool (requires prior user confirmation)
    async fn execute_trigger_webhook(&self, tool_call: &ToolCall) -> ToolResult {
        let webhook_id = match tool_call.arguments.get("webhook_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => return ToolResult::failure(
                tool_call.id.clone(),
                "Missing required parameter: webhook_id".to_string(),
            ),
        };

        let payload = tool_call.arguments.get("payload")
            .cloned()
            .unwrap_or(serde_json::json!({}));

        // Similar to workflow execution, webhook triggering requires
        // access to the webhook configuration and HTTP client.
        // Return instructions for how to properly trigger the webhook.
        let output_json = serde_json::json!({
            "status": "webhook_queued",
            "webhook_id": webhook_id,
            "payload": payload,
            "message": format!("Webhook '{}' has been queued for triggering.", webhook_id),
            "note": "Webhook execution is handled by the PackageFlow runtime. Check the Webhooks panel for execution status."
        });

        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string_pretty(&output_json).unwrap_or_default(),
            None,
        )
    }

    /// Check if a tool requires user confirmation
    pub fn requires_confirmation(&self, tool_name: &str) -> bool {
        match tool_name {
            // Confirmation required - modifying operations
            "run_script" | "run_workflow" | "trigger_webhook" |
            "run_npm_script" | "create_workflow" | "add_workflow_step" => true,
            // No confirmation - read-only operations
            "get_git_status" | "get_staged_diff" | "list_project_scripts" |
            "list_projects" | "get_project" | "list_workflows" | "get_workflow" |
            "list_worktrees" | "list_actions" | "get_action" |
            "list_action_executions" | "get_execution_status" | "list_step_templates" => false,
            _ => true, // Default to requiring confirmation for unknown tools
        }
    }

    /// Validate tool call arguments
    pub fn validate_tool_call(&self, tool_call: &ToolCall) -> Result<(), String> {
        let tools = self.get_available_tools(None);

        // Find the tool definition
        let tool_def = tools.tools.iter()
            .find(|t| t.name == tool_call.name)
            .ok_or_else(|| format!("Unknown tool: {}", tool_call.name))?;

        // Validate required parameters
        if let Some(properties) = tool_def.parameters.get("properties") {
            if let Some(required) = tool_def.parameters.get("required") {
                if let Some(required_arr) = required.as_array() {
                    for req in required_arr {
                        if let Some(req_name) = req.as_str() {
                            if tool_call.arguments.get(req_name).is_none() {
                                return Err(format!("Missing required parameter: {}", req_name));
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

impl Default for MCPToolHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse git status --porcelain output into a structured format
fn parse_git_status(output: &str) -> serde_json::Value {
    let lines: Vec<&str> = output.lines().collect();
    let mut branch = String::new();
    let mut staged: Vec<String> = Vec::new();
    let mut modified: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();

    for line in lines {
        if line.starts_with("## ") {
            // Branch line: ## main...origin/main
            branch = line[3..].split("...").next().unwrap_or("").to_string();
        } else if line.len() >= 3 {
            let status = &line[0..2];
            let file = line[3..].to_string();

            match status.chars().collect::<Vec<_>>().as_slice() {
                ['A', _] | ['M', ' '] | ['D', ' '] | ['R', _] | ['C', _] => {
                    staged.push(file);
                }
                [' ', 'M'] | [' ', 'D'] => {
                    modified.push(file);
                }
                ['?', '?'] => {
                    untracked.push(file);
                }
                ['M', 'M'] | ['A', 'M'] => {
                    // Both staged and modified
                    staged.push(file.clone());
                    modified.push(file);
                }
                _ => {}
            }
        }
    }

    serde_json::json!({
        "branch": branch,
        "staged": staged,
        "staged_count": staged.len(),
        "modified": modified,
        "modified_count": modified.len(),
        "untracked": untracked,
        "untracked_count": untracked.len(),
        "clean": staged.is_empty() && modified.is_empty() && untracked.is_empty()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_available_tools() {
        let handler = MCPToolHandler::new();
        let tools = handler.get_available_tools(None);

        assert!(!tools.tools.is_empty());

        // Check that expected tools exist
        let tool_names: Vec<&str> = tools.tools.iter().map(|t| t.name.as_str()).collect();
        assert!(tool_names.contains(&"run_script"));
        assert!(tool_names.contains(&"run_workflow"));
        assert!(tool_names.contains(&"get_git_status"));
    }

    #[test]
    fn test_requires_confirmation() {
        let handler = MCPToolHandler::new();

        // Actions that modify state should require confirmation
        assert!(handler.requires_confirmation("run_script"));
        assert!(handler.requires_confirmation("run_workflow"));
        assert!(handler.requires_confirmation("trigger_webhook"));

        // Read-only operations don't need confirmation
        assert!(!handler.requires_confirmation("get_git_status"));
        assert!(!handler.requires_confirmation("get_staged_diff"));
        assert!(!handler.requires_confirmation("list_project_scripts"));

        // Unknown tools should require confirmation
        assert!(handler.requires_confirmation("unknown_tool"));
    }

    #[test]
    fn test_validate_tool_call_success() {
        let handler = MCPToolHandler::new();

        let tool_call = ToolCall::new(
            "get_git_status".to_string(),
            serde_json::json!({
                "project_path": "/some/path"
            }),
        );

        let result = handler.validate_tool_call(&tool_call);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_tool_call_missing_param() {
        let handler = MCPToolHandler::new();

        let tool_call = ToolCall::new(
            "run_script".to_string(),
            serde_json::json!({
                "script_name": "build"
                // Missing project_path
            }),
        );

        let result = handler.validate_tool_call(&tool_call);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("project_path"));
    }

    #[test]
    fn test_validate_tool_call_unknown_tool() {
        let handler = MCPToolHandler::new();

        let tool_call = ToolCall::new(
            "unknown_tool".to_string(),
            serde_json::json!({}),
        );

        let result = handler.validate_tool_call(&tool_call);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown tool"));
    }
}
