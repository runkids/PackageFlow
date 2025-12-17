# MCP Server

Let AI tools control PackageFlow through the Model Context Protocol (MCP).

## What is MCP?

The Model Context Protocol (MCP) is a standard for AI tools to interact with applications. PackageFlow can act as an MCP server, allowing AI assistants like:

- Claude Code
- Codex CLI
- Gemini CLI

to query and control PackageFlow programmatically.

## Overview

When enabled, PackageFlow exposes tools that AI assistants can call:

- List projects
- Run scripts
- Execute workflows
- Trigger deployments
- And more

<!-- TODO: Add diagram of MCP architecture -->

## Enabling MCP Server

1. Go to **Settings** → **MCP**
2. Toggle **Enable MCP Server**
3. Configure the server settings
4. Click **Start Server**

<!-- TODO: Add screenshot of MCP settings panel -->

## Server Configuration

### Port

Default: `7234`

Change if the port is already in use.

### Host

Default: `localhost`

For security, only local connections are allowed by default.

## Permission Levels

Control what AI tools can do:

### Read Only

AI can only query information:
- List projects
- View workflows
- Check status

Cannot make changes or execute commands.

### Execute with Confirm

AI can request actions, but you must approve:
- A confirmation dialog appears
- You can approve or deny
- Safe for everyday use

### Full Access

AI can execute anything without confirmation:
- Use only with trusted AI tools
- Recommended only for personal automation

<!-- TODO: Add screenshot of permission level selector -->

## Tool Permissions

Fine-grained control over individual tools:

| Tool | Description | Risk Level |
|------|-------------|------------|
| `list_projects` | List all projects | Low |
| `get_project_details` | Get project info | Low |
| `list_workflows` | List workflows | Low |
| `execute_workflow` | Run a workflow | Medium |
| `run_script` | Run npm script | Medium |
| `execute_command` | Run shell command | High |
| `trigger_webhook` | Trigger webhook | Medium |

### Customizing Tool Access

1. Go to **Settings** → **MCP** → **Tool Permissions**
2. For each tool, set:
   - **Allowed**: Can be used
   - **Confirm**: Requires approval
   - **Blocked**: Cannot be used

<!-- TODO: Add screenshot of tool permission matrix -->

## AI CLI Integration

### Supported AI CLIs

PackageFlow detects and integrates with:

| CLI | Detection |
|-----|-----------|
| Claude Code | `claude` command |
| Codex CLI | `codex` command |
| Gemini CLI | `gemini` command |

### Running AI Commands

1. Go to **Settings** → **AI CLI**
2. Select an installed CLI
3. Enter a prompt
4. Click **Run**

Output is displayed in the panel.

<!-- TODO: Add screenshot of AI CLI panel -->

### Examples

**With Claude Code:**
```
"Deploy my project to Netlify staging"
```

**With Codex:**
```
"Run tests and fix any failures"
```

## MCP Tools Reference

### Project Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_projects` | `query?` | Array of projects |
| `get_project` | `path` | Project details |
| `get_project_dependencies` | `projectPath`, `includeDev?`, `includePeer?` | Dependencies |

### Git & Worktree Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_worktrees` | `projectPath` | Array of worktrees |
| `get_worktree_status` | `worktreePath` | Git status |
| `get_git_diff` | `worktreePath` | Staged changes diff |

### Workflow Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_workflows` | `projectId?` | Array of workflows |
| `get_workflow` | `workflowId` | Workflow details |
| `create_workflow` | `name`, `projectId?`, `description?` | New workflow |
| `add_workflow_step` | `workflowId`, `name`, `command`, `cwd?`, `timeout?` | Step added |
| `update_workflow` | `workflowId`, `name?`, `description?` | Updated workflow |
| `delete_workflow_step` | `workflowId`, `stepId` | Step removed |
| `run_workflow` | `workflowId`, `projectPath?` | Execution result |
| `get_workflow_execution_details` | `executionId`, `includeOutput?` | Execution logs |

### Script & NPM Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `run_npm_script` | `projectPath`, `scriptName`, `args?`, `timeoutMs?` | Execution result |
| `list_step_templates` | `category?`, `query?` | Array of templates |
| `create_step_template` | `name`, `command`, `category?`, `description?` | New template |

### Background Process Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `get_background_process_output` | `processId`, `tailLines?` | Process output |
| `stop_background_process` | `processId`, `force?` | Stop result |
| `list_background_processes` | none | Array of processes |

### MCP Action Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_actions` | `actionType?`, `projectId?`, `enabledOnly?` | Array of actions |
| `get_action` | `actionId` | Action details |
| `run_script` | `actionId`, `args?`, `cwd?`, `env?` | Script result |
| `trigger_webhook` | `actionId`, `payload?`, `variables?` | Webhook result |
| `get_execution_status` | `executionId` | Execution status |
| `list_action_executions` | `actionId?`, `status?`, `actionType?`, `limit?` | Execution history |
| `get_action_permissions` | `actionId?` | Permission config |

### AI Assistant Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_ai_providers` | `enabledOnly?` | Array of providers |
| `list_conversations` | `projectPath?`, `limit?`, `searchQuery?` | Conversation list |

### Notification Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `get_notifications` | `category?`, `unreadOnly?`, `limit?` | Notifications |
| `mark_notifications_read` | `notificationIds?`, `markAll?` | Mark result |

### Security Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `get_security_scan_results` | `projectPath` | Scan results |
| `run_security_scan` | `projectPath`, `fix?` | Audit output |

### Deployment Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_deployments` | `projectPath?`, `platform?`, `status?`, `limit?` | Deployment history |

### File Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `check_file_exists` | `projectPath`, `paths` | File existence map |
| `search_project_files` | `projectPath`, `pattern`, `maxResults?`, `includeDirectories?` | Matching files |
| `read_project_file` | `projectPath`, `filePath`, `maxLines?`, `startLine?` | File content |

### System Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `get_environment_info` | `includePaths?`, `projectPath?` | Environment info |

## Logs and Monitoring

### Request Logs

View all MCP requests:

1. Go to **Settings** → **MCP** → **Logs**
2. See:
   - Timestamp
   - Tool called
   - Parameters
   - Result
   - Duration

<!-- TODO: Add screenshot of MCP logs -->

### Session Tracking

Each AI session is tracked:
- Session ID
- Connected AI tool
- Request count
- Duration

## Security Best Practices

1. **Start with Read Only**: Only escalate when needed
2. **Use confirmation mode**: For sensitive operations
3. **Review logs regularly**: Check what AI tools are doing
4. **Limit tool access**: Disable tools you don't need
5. **Local only**: Don't expose to network unless necessary

## Use Cases

### Automated Workflows

Let AI tools automate repetitive tasks:

```
"Every morning, pull latest changes and run tests for all projects"
```

### Voice-Controlled Development

Pair with voice AI for hands-free coding:

```
"Run the dev server for my blog project"
```

### CI/CD Integration

Use AI tools to manage deployments:

```
"Deploy the latest build to staging after tests pass"
```

## Troubleshooting

### Server Won't Start

- Check if the port is in use
- Try a different port
- Ensure PackageFlow has network permissions

### AI Can't Connect

- Verify the server is running
- Check the port number
- Ensure firewall allows local connections

### Commands Failing

- Check tool permissions
- Review the error in logs
- Verify the requested resource exists
