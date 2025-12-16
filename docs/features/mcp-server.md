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
| `list_projects` | none | Array of projects |
| `get_project_details` | `project_id` | Project details |
| `scan_project` | `path` | New project |

### Workflow Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_workflows` | none | Array of workflows |
| `execute_workflow` | `workflow_id` | Execution result |
| `get_workflow_status` | `execution_id` | Status |

### Script Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_scripts` | `project_id` | Array of scripts |
| `run_script` | `project_id`, `script_name` | Execution result |
| `stop_script` | `execution_id` | Success status |

### Deploy Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `list_deploy_accounts` | none | Array of accounts |
| `deploy` | `project_id`, `account_id` | Deploy result |
| `get_deploy_status` | `deploy_id` | Status |

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
