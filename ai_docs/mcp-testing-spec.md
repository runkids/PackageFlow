# MCP Server Testing Specification

This document specifies the testing requirements and patterns for PackageFlow MCP Server.

## Overview

The MCP Server tests ensure:
1. All 39 tools are correctly categorized
2. Permission system enforces access control properly
3. Rate limiting protects against abuse
4. Background process buffer operates correctly

## Test Location

```
src-tauri/src/bin/mcp/mcp_tests.rs
```

## Running Tests

### Using npm scripts (Recommended)

```bash
# Run MCP tests
pnpm test:mcp
```

### Automatic Triggers

| Trigger | When | Script |
|---------|------|--------|
| `pnpm build:tauri` | Before Tauri build | `prebuild:tauri` runs `test:mcp` first |

### Using cargo directly

```bash
# Run all MCP tests
cd src-tauri && cargo test --bin packageflow-mcp mcp_tests

# Run specific test group
cargo test --bin packageflow-mcp mcp_tests::tests::tool_category
cargo test --bin packageflow-mcp mcp_tests::tests::permission_matrix

# Run with output
cargo test --bin packageflow-mcp mcp_tests -- --nocapture
```

## Test Categories

### 1. Tool Category Tests

Tests for `get_tool_category()` function in `security.rs`.

| Test | Description |
|------|-------------|
| `test_readonly_tools_return_readonly_category` | All 26 ReadOnly tools return correct category |
| `test_write_tools_return_write_category` | All 6 Write tools return correct category |
| `test_execute_tools_return_execute_category` | All 7 Execute tools return correct category |
| `test_unknown_tool_defaults_to_execute` | Unknown tools default to Execute (most restrictive) |
| `test_empty_tool_name_defaults_to_execute` | Empty string defaults to Execute |
| `test_tool_count_matches_expected` | Verify expected tool counts |

### 2. Permission Mode Tests

Tests for `is_tool_allowed()` function with different permission modes.

| permission_mode | ReadOnly tools | Write tools | Execute tools |
|-----------------|---------------|-------------|---------------|
| ReadOnly | Allowed | Blocked | Blocked |
| ExecuteWithConfirm | Allowed | Allowed | Allowed |
| FullAccess | Allowed | Allowed | Allowed |

### 3. Whitelist Tests

Tests for `allowed_tools` whitelist behavior.

| Test | Description |
|------|-------------|
| `test_empty_whitelist_allows_all_based_on_mode` | Empty whitelist = no filtering |
| `test_whitelist_blocks_unlisted_tools` | Non-empty whitelist blocks unlisted |
| `test_whitelist_allows_multiple_listed_tools` | Listed tools are allowed |
| `test_whitelist_checked_before_permission_mode` | Whitelist priority over mode |
| `test_whitelist_error_contains_tool_name` | Error messages are informative |
| `test_whitelist_with_readonly_mode_still_enforces_mode` | Both whitelist and mode enforced |

### 4. Permission Matrix Tests

Full coverage of all permission combinations (18 cases).

```
permission_mode (3) × tool_category (3) × whitelist (2) = 18 combinations
```

| # | permission_mode | tool_category | whitelist | Expected |
|---|-----------------|---------------|-----------|----------|
| 1 | ReadOnly | ReadOnly | empty | Ok |
| 2 | ReadOnly | ReadOnly | contains | Ok |
| 3 | ReadOnly | ReadOnly | not_contains | Err(whitelist) |
| 4 | ReadOnly | Write | empty | Err(mode) |
| 5 | ReadOnly | Write | contains | Err(mode) |
| 6 | ReadOnly | Write | not_contains | Err(whitelist) |
| 7 | ReadOnly | Execute | empty | Err(mode) |
| 8 | ReadOnly | Execute | contains | Err(mode) |
| 9 | ReadOnly | Execute | not_contains | Err(whitelist) |
| 10 | ExecuteWithConfirm | ReadOnly | empty | Ok |
| 11 | ExecuteWithConfirm | Write | empty | Ok |
| 12 | ExecuteWithConfirm | Execute | empty | Ok |
| 13 | ExecuteWithConfirm | * | not_contains | Err(whitelist) |
| 14 | FullAccess | ReadOnly | empty | Ok |
| 15 | FullAccess | Write | empty | Ok |
| 16 | FullAccess | Execute | empty | Ok |
| 17 | FullAccess | * | not_contains | Err(whitelist) |

### 5. Edge Case Tests

| Test | Description |
|------|-------------|
| `test_case_sensitivity` | Tool names are case-sensitive |
| `test_whitespace_handling` | Whitespace treated as unknown |
| `test_special_characters` | Special chars treated as unknown |
| `test_null_like_strings` | "null", "undefined" treated as unknown |
| `test_very_long_tool_name` | Long string handling |
| `test_error_message_mentions_settings` | Errors guide user to settings |
| `test_config_default_permission_mode` | Default is ReadOnly |
| `test_config_default_is_disabled` | Default is disabled |

### 6. Rate Limiter Tests

Tests for `ToolRateLimiters` in `state.rs`.

| Category | Limit |
|----------|-------|
| ReadOnly | 200 requests/minute |
| Write | 30 requests/minute |
| Execute | 10 requests/minute |

### 7. CircularBuffer Tests

Tests for output buffer in `background/types.rs`.

| Test | Description |
|------|-------------|
| `test_empty_buffer` | Empty buffer behavior |
| `test_push_within_limits` | Push without exceeding limits |
| `test_tail_returns_last_n_lines` | tail(n) returns last n lines |
| `test_tail_with_more_than_available` | Request more than available |
| `test_eviction_by_max_lines` | Evict oldest when max_lines exceeded |
| `test_eviction_by_max_bytes` | Evict oldest when max_bytes exceeded |
| `test_len_reflects_current_count` | len() returns correct count |
| `test_total_bytes_tracking` | total_bytes tracking |

## Tool Reference

### ReadOnly Tools (26)

```
list_projects, get_project, list_worktrees, get_worktree_status, get_git_diff,
list_workflows, get_workflow, list_step_templates,
list_actions, get_action, list_action_executions, get_execution_status, get_action_permissions,
get_background_process_output, list_background_processes,
get_environment_info, list_ai_providers, check_file_exists,
list_conversations, get_notifications, get_security_scan_results, list_deployments,
get_project_dependencies, get_workflow_execution_details, search_project_files, read_project_file
```

### Write Tools (6)

```
create_workflow, add_workflow_step, create_step_template,
update_workflow, delete_workflow_step, mark_notifications_read
```

### Execute Tools (7)

```
run_workflow, run_script, trigger_webhook, run_npm_script,
run_package_manager_command, stop_background_process, run_security_scan
```

## Adding New Tool Tests

When adding a new MCP tool:

1. **Add to tool constant** in `mcp_tests.rs`:
   ```rust
   const READONLY_TOOLS: &[&str] = &[
       // ... existing tools ...
       "new_tool_name",  // Add here
   ];
   ```

2. **Add to security.rs**:
   ```rust
   pub fn get_tool_category(tool_name: &str) -> ToolCategory {
       match tool_name {
           // ... existing matches ...
           "new_tool_name" => ToolCategory::ReadOnly,  // Add appropriate category
           _ => ToolCategory::Execute,
       }
   }
   ```

3. **Update expected count** in test:
   ```rust
   assert_eq!(READONLY_TOOLS.len(), 27, "Expected 27 ReadOnly tools");
   ```

4. **Run tests** to verify:
   ```bash
   cargo test --bin packageflow-mcp mcp_tests
   ```

## Test Helpers

### create_test_config()

```rust
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
```

### Sample Tool Functions

```rust
fn sample_readonly_tool() -> &'static str { "list_projects" }
fn sample_write_tool() -> &'static str { "create_workflow" }
fn sample_execute_tool() -> &'static str { "run_workflow" }
```

## Debugging Test Failures

### Tool Category Mismatch

If a tool returns unexpected category:
1. Check `security.rs:get_tool_category()` match arms
2. Verify tool name spelling (case-sensitive)
3. Unknown tools default to `Execute`

### Permission Denied Unexpectedly

Check order of evaluation:
1. Whitelist checked first (if non-empty)
2. Permission mode checked second
3. Error message indicates which check failed

### Rate Limiter Issues

Rate limiters use atomic counters:
- First request always succeeds
- Limits reset after window_secs (60 seconds)
- Tests use fresh limiter instances

## Files Reference

| File | Purpose |
|------|---------|
| `src-tauri/src/bin/mcp/mcp_tests.rs` | All MCP tests |
| `src-tauri/src/bin/mcp/security.rs` | Permission logic under test |
| `src-tauri/src/bin/mcp/state.rs` | Rate limiter types |
| `src-tauri/src/bin/mcp/background/types.rs` | CircularBuffer |
| `src-tauri/src/models/mcp.rs` | MCPServerConfig, MCPPermissionMode |
