# Time Machine & Security Guardian

PackageFlow's Time Machine feature automatically captures execution snapshots during workflow runs, enabling you to track dependency changes, detect security issues, and replay previous states.

## Overview

The Time Machine provides:
- **Execution Snapshots**: Automatic capture of dependency state during npm/pnpm/yarn installs
- **Security Guardian**: Real-time detection of suspicious packages and postinstall scripts
- **Diff Analysis**: Compare snapshots to track what changed between runs
- **Safe Replay**: Restore previous dependency states with confidence

## Features

### 1. Automatic Snapshot Capture

When a workflow executes package installation commands, PackageFlow automatically:
- Parses lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb)
- Extracts dependency tree with versions
- Detects postinstall scripts
- Calculates security score
- Compresses and stores snapshot data

### 2. Snapshot Timeline

View all snapshots for a project in chronological order:
- Filter by workflow or date range
- See security scores at a glance
- Identify executions with postinstall scripts
- Quick access to diff comparison

### 3. Dependency Diff View

Compare any two snapshots to see:
- Added/removed/updated packages
- Version changes with semantic versioning analysis
- New or changed postinstall scripts
- Security score changes
- Execution timing differences

### 4. Security Guardian

Automated security analysis includes:

#### Typosquatting Detection
Identifies packages with names similar to popular packages:
- `lodahs` vs `lodash`
- `reqeust` vs `request`
- Uses Levenshtein distance algorithm

#### Postinstall Script Monitoring
- Tracks all packages with postinstall scripts
- Alerts when new postinstall scripts appear
- Shows script content changes between snapshots

#### Suspicious Pattern Detection
- Major version jumps (e.g., 1.0.0 → 9.0.0)
- Unexpected version downgrades
- Suspicious package naming patterns

### 5. Safe Execution Replay

Restore a previous dependency state:
1. Select a snapshot to replay
2. System checks for drift from current state
3. Choose action:
   - **Abort**: Cancel if state differs
   - **View Diff**: See what would change
   - **Restore Lockfile**: Replace current lockfile with snapshot version
   - **Proceed**: Continue with current state

### 6. Security Insights Dashboard

Project-level security overview:
- Overall risk score (0-100)
- Insight summary by severity
- Frequently updated packages
- Typosquatting alerts history

### 7. Searchable History

Search across all snapshots:
- By package name or version
- Filter by date range
- Filter by postinstall presence
- Filter by minimum security score

## Storage Management

Snapshots are stored in:
```
~/Library/Application Support/com.packageflow.app/time-machine/snapshots/
```

Each snapshot includes:
- Compressed lockfile (.zst)
- Compressed package.json (.zst)
- Dependency tree JSON
- Postinstall manifest

### Retention Settings

Configure snapshot retention in Settings > Storage:
- Set maximum snapshots per workflow
- Manually prune old snapshots
- Cleanup orphaned storage files

## MCP Tools

Time Machine integrates with the MCP server, providing AI assistants access to:

| Tool | Description |
|------|-------------|
| `list_execution_snapshots` | List snapshots for a workflow |
| `get_snapshot_details` | Get full snapshot with dependencies |
| `compare_snapshots` | Diff two snapshots |
| `search_snapshots` | Search across all snapshots |
| `replay_execution` | Replay from a snapshot |
| `check_dependency_integrity` | Check for drift |
| `get_security_insights` | Get project security overview |
| `export_security_report` | Export audit report |

## Best Practices

1. **Regular Review**: Check the timeline after each deployment
2. **Monitor Postinstall**: Pay attention to new postinstall scripts
3. **Investigate Typosquatting**: Always verify suspicious package names
4. **Use Replay Cautiously**: Test restored states in development first
5. **Prune Regularly**: Keep storage usage reasonable with retention settings

## Security Score Calculation

The security score (0-100) considers:
- Number of postinstall scripts (higher = riskier)
- Typosquatting suspects
- Known vulnerability patterns
- Dependency tree depth and complexity

| Score Range | Risk Level |
|-------------|------------|
| 80-100 | Low |
| 60-79 | Medium |
| 40-59 | High |
| 0-39 | Critical |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Time Machine | `Cmd/Ctrl + T` |
| Compare Snapshots | `Cmd/Ctrl + D` |
| Search Snapshots | `Cmd/Ctrl + F` |

## Related Features

- [Security Audit](./security-audit.md)
- [Visual Workflow](./visual-workflow.md)
- [MCP Server](./mcp-server.md)
