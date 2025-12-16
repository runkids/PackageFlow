# MCP Tools Synchronization Specification

This document specifies how MCP (Model Context Protocol) tools are synchronized between the MCP Server, AI Assistant, and Frontend UI.

## Overview

PackageFlow exposes tools through two interfaces:

1. **MCP Server** - External AI CLI tools (Claude Code, Codex CLI, Gemini CLI)
2. **AI Assistant** - Built-in AI chat interface

Both interfaces share the same tool definitions to ensure consistency.

## Architecture

```
+------------------+     +------------------+     +------------------+
|   AI CLI Tools   |     |   AI Assistant   |     |   Frontend UI    |
| (Claude, Codex)  |     |   (Built-in)     |     |                  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
+--------+---------+     +--------+---------+     +--------+---------+
|   MCP Server     |     | MCPToolHandler   |     | Tool Confirmation|
| (packageflow-mcp)|     | (services/ai)    |     | Dialog           |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------+-----------+------------------------+
                      |
                      v
              +-------+-------+
              |   Tauri       |
              |   Commands    |
              +-------+-------+
                      |
                      v
              +-------+-------+
              |   Database    |
              |   (SQLite)    |
              +---------------+
```

## Tool Categories

### 1. Read-Only Tools (No Confirmation Required)

These tools only query information and do not modify state.

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `list_projects` | List all registered projects | `query?` |
| `get_project` | Get project details | `path` |
| `list_workflows` | List all workflows | `project_id?` |
| `get_workflow` | Get workflow details with nodes | `workflow_id` |
| `list_worktrees` | List git worktrees | `project_path` |
| `get_git_status` | Get git status | `project_path` |
| `get_staged_diff` | Get staged changes diff | `project_path` |
| `get_worktree_status` | Get detailed git status (branch, ahead/behind, staged/modified/untracked) | `worktree_path` |
| `get_git_diff` | Get staged changes diff with statistics | `worktree_path` |
| `list_project_scripts` | List package.json scripts | `project_path` |
| `list_actions` | List MCP actions | `actionType?`, `projectId?`, `enabledOnly?` |
| `get_action` | Get action details | `actionId` |
| `list_action_executions` | List execution history | `actionId?`, `actionType?`, `status?`, `limit?` |
| `get_execution_status` | Get execution status | `executionId` |
| `get_action_permissions` | Get permission configuration for actions | `actionId?` |
| `list_step_templates` | List workflow step templates | `category?`, `query?`, `include_builtin?` |
| `list_background_processes` | List running/completed background processes | - |
| `get_background_process_output` | Get output from a background process | `processId`, `tailLines?` |

### 2. Write Tools (Confirmation Required)

These tools modify state and require user confirmation.

| Tool Name | Description | Parameters | Risk Level |
|-----------|-------------|------------|------------|
| `run_script` | Run npm/pnpm/yarn script | `script_name`, `project_path` | Medium |
| `run_npm_script` | Run npm script (alternative) | `projectPath`, `scriptName`, `args?`, `timeoutMs?`, `runInBackground?` | Medium |
| `run_workflow` | Execute a workflow | `workflow_id` | Medium |
| `trigger_webhook` | Trigger a webhook | `webhook_id`, `payload?` | Medium |
| `create_workflow` | Create new workflow | `name`, `description?`, `project_id?` | Low |
| `add_workflow_step` | Add step to workflow | `workflow_id`, `name`, `command`, `cwd?`, `order?` | Low |
| `create_step_template` | Create custom step template | `name`, `command`, `category?`, `description?` | Low |
| `stop_background_process` | Stop a running background process | `processId`, `force?` | Medium |

## Frontend Synchronization Requirements

### Tool Confirmation Dialog

When an AI requests execution of a write tool, the frontend must:

1. **Display Tool Information**
   - Tool name and description
   - All parameters with values
   - Risk level indicator

2. **Show Contextual Warning**
   - For `run_script`: Show the actual command from package.json
   - For `run_workflow`: Show workflow steps
   - For `trigger_webhook`: Show webhook URL and payload

3. **User Actions**
   - **Approve**: Execute the tool
   - **Deny**: Cancel and notify AI
   - **Always Allow**: Remember permission for session

### Settings Synchronization

Frontend settings that affect tool behavior:

```typescript
interface MCPToolSettings {
  // Global permission level
  permissionLevel: 'read_only' | 'execute_with_confirm' | 'full_access';

  // Per-tool permissions (overrides global)
  toolPermissions: {
    [toolName: string]: 'allowed' | 'confirm' | 'blocked';
  };

  // Auto-approve settings
  autoApprove: {
    enabled: boolean;
    tools: string[];  // Tools that can be auto-approved
  };
}
```

### Tool Execution State

Frontend must track and display:

```typescript
interface ToolExecutionState {
  callId: string;
  toolName: string;
  status: 'pending_confirmation' | 'executing' | 'completed' | 'failed' | 'denied';
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    output: string;
    error?: string;
    durationMs?: number;
  };
  timestamp: string;
}
```

## AI Assistant Integration

### Tool Handler (MCPToolHandler)

Location: `src-tauri/src/services/ai_assistant/tools.rs`

The `MCPToolHandler` provides tools to the AI Assistant:

```rust
pub struct MCPToolHandler {
    path_validator: Option<PathSecurityValidator>,
    db: Option<Database>,
}

impl MCPToolHandler {
    // Get tool definitions for AI provider
    pub fn get_chat_tool_definitions(&self, project_path: Option<&str>) -> Vec<ChatToolDefinition>;

    // Get available tools with metadata
    pub fn get_available_tools(&self, project_path: Option<&str>) -> AvailableTools;

    // Execute read-only tools (auto-approved)
    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> ToolResult;

    // Execute write tools (after user confirmation)
    pub async fn execute_confirmed_tool_call(&self, tool_call: &ToolCall) -> ToolResult;

    // Check if tool needs confirmation
    pub fn requires_confirmation(&self, tool_name: &str) -> bool;
}
```

### Tool Definition Format

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,  // JSON Schema
    pub requires_confirmation: bool,
    pub category: String,
}
```

### Security Checks

All tool executions must pass:

1. **Permission Validation**: Check if tool is allowed
2. **Confirmation Check**: Read-only vs write tools
3. **Path Validation**: Ensure paths are within registered projects
4. **Output Sanitization**: Remove sensitive data from results

## Adding New Tools

### Step 1: Define Tool in MCPToolHandler

Add to `get_available_tools()`:

```rust
ToolDefinition {
    name: "new_tool".to_string(),
    description: "Description for AI".to_string(),
    parameters: serde_json::json!({
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Parameter description"
            }
        },
        "required": ["param1"]
    }),
    requires_confirmation: true,  // or false for read-only
    category: "category_name".to_string(),
}
```

### Step 2: Add Execution Handler

Add match cases in `execute_tool_call()` and `execute_confirmed_tool_call()`:

```rust
"new_tool" => self.execute_new_tool(tool_call).await,
```

### Step 3: Implement Execution Method

```rust
async fn execute_new_tool(&self, tool_call: &ToolCall) -> ToolResult {
    // 1. Extract parameters
    let param1 = match tool_call.arguments.get("param1").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return ToolResult::failure(
            tool_call.id.clone(),
            "Missing required parameter: param1".to_string(),
        ),
    };

    // 2. Validate inputs (especially paths)
    // 3. Execute operation
    // 4. Return result

    ToolResult::success(
        tool_call.id.clone(),
        serde_json::to_string(&output).unwrap_or_default(),
        Some(duration_ms),
    )
}
```

### Step 4: Update requires_confirmation()

Add the tool to the appropriate category:

```rust
pub fn requires_confirmation(&self, tool_name: &str) -> bool {
    match tool_name {
        // Write tools - require confirmation
        "run_script" | "run_workflow" | "new_tool" => true,
        // Read tools - no confirmation
        "list_projects" | "get_project" => false,
        _ => true, // Default to requiring confirmation
    }
}
```

### Step 5: Add to MCP Server (if applicable)

If the tool should be available to external AI CLIs, also add it to:
- `src-tauri/src/mcp/tools.rs` (MCP server tools)

### Step 6: Update Frontend

1. Add tool to type definitions
2. Update confirmation dialog if needed
3. Add any special UI handling

## MCP Server Synchronization

The MCP Server (`packageflow-mcp`) should expose the same tools:

| Location | Purpose |
|----------|---------|
| `src-tauri/src/services/ai_assistant/tools.rs` | AI Assistant tools |
| `src-tauri/src/mcp/tools.rs` | MCP Server tools |

**Important**: Keep these in sync when adding/modifying tools.

## Tool Response Format

### Success Response

```json
{
  "success": true,
  "output": "{ ... json output ... }",
  "error": null,
  "duration_ms": 150
}
```

### Failure Response

```json
{
  "success": false,
  "output": "",
  "error": "Error message for AI",
  "duration_ms": null
}
```

## Event Communication

### Frontend Events (Tauri)

```typescript
// Tool requires confirmation
interface ToolConfirmationEvent {
  conversationId: string;
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  description: string;
}

// Tool execution complete
interface ToolResultEvent {
  conversationId: string;
  callId: string;
  success: boolean;
  output: string;
  error?: string;
}
```

### Backend Events

Emit events through Tauri's event system:

```rust
app_handle.emit("ai-tool-confirmation", payload)?;
app_handle.emit("ai-tool-result", payload)?;
```

## Best Practices

### For Tool Developers

1. **Keep descriptions clear**: AI uses descriptions to decide when to call tools
2. **Use JSON Schema properly**: Define required vs optional parameters
3. **Return structured output**: AI parses JSON better than free text
4. **Handle errors gracefully**: Return meaningful error messages
5. **Validate inputs**: Never trust AI-provided parameters

### For Frontend Developers

1. **Show tool context**: Help users understand what they're approving
2. **Track execution state**: Display progress for long-running tools
3. **Handle failures gracefully**: Show error messages clearly
4. **Respect user preferences**: Honor permission settings

### For Security

1. **Validate all paths**: Ensure paths are within registered projects
2. **Sanitize outputs**: Remove sensitive data (API keys, tokens)
3. **Log tool executions**: Maintain audit trail
4. **Block dangerous tools**: Never allow arbitrary command execution

## Checklist for New Tools

- [ ] Tool definition added to MCPToolHandler
- [ ] Execution handler implemented
- [ ] requires_confirmation() updated
- [ ] MCP Server tool added (if applicable)
- [ ] Frontend type definitions updated
- [ ] Confirmation dialog handling added
- [ ] Documentation updated
- [ ] Tests written
