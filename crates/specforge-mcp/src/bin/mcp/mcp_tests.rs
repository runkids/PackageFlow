//! Comprehensive tests for MCP Server
//!
//! This module contains tests for:
//! - Tool categorization (security.rs)
//! - Permission checking (security.rs)
//! - Permission matrix (all mode/category/whitelist combinations)
//! - Rate limiting (state.rs)

use super::security::{get_tool_category, is_tool_allowed, ToolCategory};
use super::state::ToolRateLimiters;
use specforge_lib::models::mcp::{DevServerMode, MCPEncryptedSecrets, MCPPermissionMode, MCPServerConfig};

// ============================================================================
// Tool Name Constants
// ============================================================================

/// All ReadOnly tools
const READONLY_TOOLS: &[&str] = &[
    "list_specs",
    "get_spec",
    "get_workflow_status",
    "get_gate_status",
    "list_schemas",
    "get_schema",
    "get_agent_runs",
    "git_status",
    "git_diff",
];

/// All Write tools
const WRITE_TOOLS: &[&str] = &[
    "create_spec",
    "update_spec",
    "delete_spec",
    "advance_spec",
    "review_spec",
    "init_project",
    "git_create_branch",
    "git_commit",
];

/// All Execute tools (none currently)
const EXECUTE_TOOLS: &[&str] = &[];

// ============================================================================
// Test Helpers
// ============================================================================

fn create_test_config(mode: MCPPermissionMode, allowed_tools: Vec<String>) -> MCPServerConfig {
    MCPServerConfig {
        is_enabled: true,
        permission_mode: mode,
        dev_server_mode: DevServerMode::McpManaged,
        allowed_tools,
        log_requests: false,
        encrypted_secrets: MCPEncryptedSecrets::default(),
    }
}

fn sample_readonly_tool() -> &'static str {
    "list_specs"
}

fn sample_write_tool() -> &'static str {
    "create_spec"
}

// ============================================================================
// Tool Category Tests
// ============================================================================

#[cfg(test)]
mod tool_category_tests {
    use super::*;

    #[test]
    fn test_readonly_tools_return_readonly_category() {
        for tool in READONLY_TOOLS {
            assert_eq!(
                get_tool_category(tool),
                ToolCategory::ReadOnly,
                "Tool '{}' should be categorized as ReadOnly",
                tool
            );
        }
    }

    #[test]
    fn test_write_tools_return_write_category() {
        for tool in WRITE_TOOLS {
            assert_eq!(
                get_tool_category(tool),
                ToolCategory::Write,
                "Tool '{}' should be categorized as Write",
                tool
            );
        }
    }

    #[test]
    fn test_unknown_tool_defaults_to_execute() {
        assert_eq!(get_tool_category("unknown_tool"), ToolCategory::Execute);
        assert_eq!(get_tool_category("malicious_command"), ToolCategory::Execute);
    }

    #[test]
    fn test_empty_tool_name_defaults_to_execute() {
        assert_eq!(get_tool_category(""), ToolCategory::Execute);
    }

    #[test]
    fn test_tool_count_matches_expected() {
        assert_eq!(READONLY_TOOLS.len(), 9, "Expected 9 ReadOnly tools");
        assert_eq!(WRITE_TOOLS.len(), 8, "Expected 8 Write tools");
        assert_eq!(EXECUTE_TOOLS.len(), 0, "Expected 0 Execute tools");
    }
}

// ============================================================================
// Permission Mode Tests
// ============================================================================

#[cfg(test)]
mod permission_mode_tests {
    use super::*;

    #[test]
    fn test_readonly_mode_allows_readonly_tools() {
        let config = create_test_config(MCPPermissionMode::ReadOnly, vec![]);
        for tool in READONLY_TOOLS {
            assert!(
                is_tool_allowed(tool, &config).is_ok(),
                "ReadOnly mode should allow ReadOnly tool '{}'",
                tool
            );
        }
    }

    #[test]
    fn test_readonly_mode_blocks_write_tools() {
        let config = create_test_config(MCPPermissionMode::ReadOnly, vec![]);
        for tool in WRITE_TOOLS {
            let result = is_tool_allowed(tool, &config);
            assert!(
                result.is_err(),
                "ReadOnly mode should block Write tool '{}'",
                tool
            );
            let err = result.unwrap_err();
            assert!(
                err.contains("read-only mode"),
                "Error should mention 'read-only mode': {}",
                err
            );
        }
    }

    #[test]
    fn test_full_access_allows_all_tools() {
        let config = create_test_config(MCPPermissionMode::FullAccess, vec![]);

        for tool in READONLY_TOOLS.iter().chain(WRITE_TOOLS) {
            assert!(
                is_tool_allowed(tool, &config).is_ok(),
                "FullAccess mode should allow tool '{}'",
                tool
            );
        }
    }

    #[test]
    fn test_execute_with_confirm_allows_all_tools() {
        let config = create_test_config(MCPPermissionMode::ExecuteWithConfirm, vec![]);

        for tool in READONLY_TOOLS.iter().chain(WRITE_TOOLS) {
            assert!(
                is_tool_allowed(tool, &config).is_ok(),
                "ExecuteWithConfirm mode should allow tool '{}'",
                tool
            );
        }
    }
}

// ============================================================================
// Whitelist Tests
// ============================================================================

#[cfg(test)]
mod whitelist_tests {
    use super::*;

    #[test]
    fn test_empty_whitelist_allows_all_based_on_mode() {
        let config = create_test_config(MCPPermissionMode::FullAccess, vec![]);
        assert!(is_tool_allowed("list_specs", &config).is_ok());
        assert!(is_tool_allowed("create_spec", &config).is_ok());
    }

    #[test]
    fn test_whitelist_blocks_unlisted_tools() {
        let config = create_test_config(
            MCPPermissionMode::FullAccess,
            vec!["list_specs".to_string()],
        );

        assert!(is_tool_allowed("list_specs", &config).is_ok());

        let result = is_tool_allowed("get_spec", &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not in the allowed tools list"));
    }

    #[test]
    fn test_whitelist_with_readonly_mode_still_enforces_mode() {
        let config = create_test_config(
            MCPPermissionMode::ReadOnly,
            vec!["create_spec".to_string()],
        );

        let result = is_tool_allowed("create_spec", &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("read-only mode"));
    }
}

// ============================================================================
// Edge Case Tests
// ============================================================================

#[cfg(test)]
mod edge_case_tests {
    use super::*;

    #[test]
    fn test_case_sensitivity() {
        assert_eq!(get_tool_category("LIST_SPECS"), ToolCategory::Execute);
        assert_eq!(get_tool_category("listSpecs"), ToolCategory::Execute);
    }

    #[test]
    fn test_error_message_mentions_settings() {
        let config = create_test_config(MCPPermissionMode::ReadOnly, vec![]);
        let result = is_tool_allowed("create_spec", &config);
        let err = result.unwrap_err();
        assert!(
            err.contains("SpecForge settings"),
            "Error should guide user to change settings: {}",
            err
        );
    }

    #[test]
    fn test_config_default_permission_mode() {
        let config = MCPServerConfig::default();
        assert_eq!(config.permission_mode, MCPPermissionMode::ReadOnly);
    }

    #[test]
    fn test_config_default_is_disabled() {
        let config = MCPServerConfig::default();
        assert!(!config.is_enabled);
    }
}

// ============================================================================
// Rate Limiter Tests
// ============================================================================

#[cfg(test)]
mod rate_limiter_tests {
    use super::*;

    #[test]
    fn test_rate_limiter_default_creation() {
        let _limiter = ToolRateLimiters::default();
        assert!(true, "ToolRateLimiters should be created successfully");
    }

    #[test]
    fn test_limit_description_readonly() {
        let limiter = ToolRateLimiters::default();
        let desc = limiter.get_limit_description(ToolCategory::ReadOnly);
        assert!(desc.contains("200"));
        assert!(desc.contains("read-only"));
    }

    #[test]
    fn test_limit_description_write() {
        let limiter = ToolRateLimiters::default();
        let desc = limiter.get_limit_description(ToolCategory::Write);
        assert!(desc.contains("30"));
        assert!(desc.contains("write"));
    }

    #[test]
    fn test_rate_limiter_initial_check_succeeds() {
        let limiter = ToolRateLimiters::default();
        assert!(limiter.check(ToolCategory::ReadOnly).is_ok());
        assert!(limiter.check(ToolCategory::Write).is_ok());
        assert!(limiter.check(ToolCategory::Execute).is_ok());
    }
}
