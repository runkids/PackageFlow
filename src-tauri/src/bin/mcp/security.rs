//! Security and permission handling for MCP tools
//!
//! Contains tool categorization and permission checking logic.

use packageflow_lib::models::mcp::{MCPPermissionMode, MCPServerConfig};

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
pub fn get_tool_category(tool_name: &str) -> ToolCategory {
    match tool_name {
        // Read-only tools
        "list_projects" | "get_project" | "list_worktrees" | "get_worktree_status" | "get_git_diff" |
        "list_workflows" | "get_workflow" | "list_step_templates" |
        // MCP Action read-only tools
        "list_actions" | "get_action" | "list_action_executions" | "get_execution_status" |
        "get_action_permissions" |
        // Background process read-only tools
        "get_background_process_output" | "list_background_processes" |
        // Enhanced MCP tools - Read-only
        "get_environment_info" | "list_ai_providers" | "check_file_exists" |
        "list_conversations" | "get_notifications" |
        "get_security_scan_results" | "list_deployments" |
        "get_project_dependencies" | "get_workflow_execution_details" |
        "search_project_files" | "read_project_file" => ToolCategory::ReadOnly,
        // Write tools
        "create_workflow" | "add_workflow_step" | "create_step_template" |
        // Enhanced MCP tools - Write
        "update_workflow" | "delete_workflow_step" | "mark_notifications_read" => ToolCategory::Write,
        // Execute tools (including MCP action execution and background process control)
        "run_workflow" | "run_script" | "trigger_webhook" | "run_mcp_workflow" | "run_npm_script" |
        "run_package_manager_command" | "stop_background_process" |
        // Enhanced MCP tools - Execute
        "run_security_scan" => ToolCategory::Execute,
        // Unknown tools default to Execute (most restrictive)
        _ => ToolCategory::Execute,
    }
}

/// Check if a tool is allowed based on permission mode and allowed_tools list
pub fn is_tool_allowed(tool_name: &str, config: &MCPServerConfig) -> Result<(), String> {
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
