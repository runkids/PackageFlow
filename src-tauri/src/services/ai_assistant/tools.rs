// MCP Tool Handler for AI Assistant
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// Handles tool/function calling for AI-driven MCP operations:
// - Tool definitions for AI providers
// - Tool call execution via MCP action service
// - Permission validation
// - Result formatting

use std::path::Path;
use crate::models::ai_assistant::{ToolCall, ToolResult, ToolDefinition, AvailableTools};
use crate::models::ai::ChatToolDefinition;
use crate::utils::path_resolver;

/// Handles tool calls from AI responses
pub struct MCPToolHandler {
    // Tool handler will be extended in US2
}

impl MCPToolHandler {
    /// Create a new MCPToolHandler
    pub fn new() -> Self {
        Self {}
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
                description: "Run an npm/pnpm/yarn script from the project's package.json".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "script_name": {
                            "type": "string",
                            "description": "Name of the script to run (e.g., 'build', 'test', 'dev')"
                        },
                        "project_path": {
                            "type": "string",
                            "description": "Path to the project directory"
                        }
                    },
                    "required": ["script_name", "project_path"]
                }),
                requires_confirmation: true,
                category: "script".to_string(),
            },
            ToolDefinition {
                name: "run_workflow".to_string(),
                description: "Execute a PackageFlow workflow by name or ID".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "workflow_id": {
                            "type": "string",
                            "description": "The workflow ID or name to execute"
                        }
                    },
                    "required": ["workflow_id"]
                }),
                requires_confirmation: true,
                category: "workflow".to_string(),
            },
            ToolDefinition {
                name: "trigger_webhook".to_string(),
                description: "Trigger a configured webhook action".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "webhook_id": {
                            "type": "string",
                            "description": "The webhook action ID to trigger"
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
        ];

        AvailableTools { tools }
    }

    /// Execute a tool call
    /// Returns a ToolResult with the execution outcome
    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> ToolResult {
        match tool_call.name.as_str() {
            "get_git_status" => self.execute_get_git_status(tool_call).await,
            "get_staged_diff" => self.execute_get_staged_diff(tool_call).await,
            "list_project_scripts" => self.execute_list_project_scripts(tool_call).await,
            "list_workflows" => self.execute_list_workflows(tool_call).await,
            // Tools requiring confirmation - not auto-executed
            "run_script" | "run_workflow" | "trigger_webhook" => {
                ToolResult::failure(
                    tool_call.id.clone(),
                    "This action requires user confirmation before execution.".to_string(),
                )
            }
            _ => ToolResult::failure(
                tool_call.id.clone(),
                format!("Unknown tool: {}", tool_call.name),
            ),
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

        let output = path_resolver::create_command("git")
            .args(["status", "--porcelain", "-b"])
            .current_dir(project_path)
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

        let output = path_resolver::create_command("git")
            .args(["diff", "--staged", "--stat"])
            .current_dir(project_path)
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let diff_stat = String::from_utf8_lossy(&out.stdout);

                // Also get the actual diff (limited)
                let diff_output = path_resolver::create_command("git")
                    .args(["diff", "--staged"])
                    .current_dir(project_path)
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

        let package_json_path = Path::new(project_path).join("package.json");

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
        // For now, return a placeholder. Real implementation would query the database.
        let output_json = serde_json::json!({
            "message": "Use PackageFlow MCP server to list workflows",
            "hint": "Workflows can be viewed in the PackageFlow UI under the Workflows section"
        });
        ToolResult::success(
            tool_call.id.clone(),
            serde_json::to_string(&output_json).unwrap_or_default(),
            None,
        )
    }

    /// Check if a tool requires user confirmation
    pub fn requires_confirmation(&self, tool_name: &str) -> bool {
        match tool_name {
            "run_script" | "run_workflow" | "trigger_webhook" => true,
            "get_git_status" | "get_staged_diff" | "list_project_scripts" => false,
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
