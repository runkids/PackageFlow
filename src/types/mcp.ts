// MCP Server TypeScript types
// Feature: AI CLI Integration (020-ai-cli-integration)

/** MCP Server permission modes */
export type MCPPermissionMode = 'read_only' | 'execute_with_confirm' | 'full_access';

/** MCP request result */
export type MCPRequestResult = 'success' | 'permission_denied' | 'user_cancelled' | 'error';

/** Encrypted secrets storage for MCP configuration */
export interface MCPEncryptedSecrets {
  /** Encrypted nonce (base64) */
  nonce?: string;
  /** Encrypted ciphertext (base64) */
  ciphertext?: string;
}

/** MCP Server configuration */
export interface MCPServerConfig {
  /** Whether MCP Server is enabled */
  isEnabled: boolean;
  /** Default permission mode */
  permissionMode: MCPPermissionMode;
  /** List of allowed tools */
  allowedTools: string[];
  /** Whether to log all requests */
  logRequests: boolean;
  /** Encrypted secrets (API keys, tokens, etc.) - managed via backend API */
  encryptedSecrets?: MCPEncryptedSecrets;
}

/** MCP session information (runtime state) */
export interface MCPSession {
  /** Session ID */
  id: string;
  /** Connected client name */
  clientName: string;
  /** Client version (if provided) */
  clientVersion?: string;
  /** When this session was connected (ISO 8601) */
  connectedAt: string;
  /** Last activity time (ISO 8601) */
  lastActivity: string;
  /** Request count */
  requestCount: number;
}

/** Simplified session info for status display */
export interface MCPSessionInfo {
  id: string;
  clientName: string;
  connectedAt: string;
  requestCount: number;
}

/** MCP request log entry */
export interface MCPRequestLog {
  /** Log entry ID */
  id: string;
  /** Associated session ID */
  sessionId: string;
  /** Tool name that was called */
  toolName: string;
  /** Arguments passed to the tool */
  arguments: unknown;
  /** Execution result */
  result: MCPRequestResult;
  /** Error message if failed */
  errorMessage?: string;
  /** When this request was executed (ISO 8601) */
  executedAt: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/** MCP Server status */
export interface MCPStatus {
  /** Whether the server is running */
  isRunning: boolean;
  /** Current permission mode */
  permissionMode: MCPPermissionMode;
  /** Number of connected clients */
  connectedClients: number;
  /** Active sessions */
  sessions: MCPSessionInfo[];
}

/** Request to update MCP configuration */
export interface UpdateMCPConfigRequest {
  permissionMode?: MCPPermissionMode;
  allowedTools?: string[];
  logRequests?: boolean;
}

/** Request to get MCP logs */
export interface GetLogsRequest {
  /** Maximum number of logs to return */
  limit?: number;
  /** Filter by session ID */
  sessionId?: string;
}

/** Pending MCP request (waiting for user confirmation) */
export interface PendingMCPRequest {
  /** Request ID */
  requestId: string;
  /** Session ID */
  sessionId: string;
  /** Tool name */
  toolName: string;
  /** Arguments */
  arguments: unknown;
  /** When this request was received (ISO 8601) */
  receivedAt: string;
}

// ============================================================================
// MCP Tool Response Types
// ============================================================================

/** Project info for MCP tools */
export interface MCPProjectInfo {
  path: string;
  name: string;
  isActive: boolean;
}

/** Detailed project info */
export interface MCPProjectDetails {
  path: string;
  name: string;
  gitRemote?: string;
  currentBranch?: string;
  worktreeCount: number;
  workflowCount: number;
}

/** Worktree info for MCP tools */
export interface MCPWorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isBare: boolean;
}

/** Worktree status for MCP tools */
export interface MCPWorktreeStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

/** Workflow info for MCP tools */
export interface MCPWorkflowInfo {
  id: string;
  name: string;
  stepCount: number;
}

/** Workflow details for MCP tools */
export interface MCPWorkflowDetails {
  id: string;
  name: string;
  steps: MCPWorkflowStep[];
}

/** Workflow step for MCP tools */
export interface MCPWorkflowStep {
  id: string;
  name: string;
  type: string;
  command?: string;
}

/** Git diff info for MCP tools */
export interface MCPGitDiff {
  diff: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/** Workflow execution result */
export interface MCPWorkflowExecutionResult {
  executionId: string;
  status: string;
  stepsCompleted: number;
  stepsTotal: number;
  durationMs: number;
}

/** Shell command execution result */
export interface MCPShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** Commit result */
export interface MCPCommitResult {
  commitHash: string;
  message: string;
}

/** MCP Error response */
export interface MCPError {
  code: string;
  message: string;
}

// ============================================================================
// Helper constants
// ============================================================================

/** MCP Error codes */
export const MCP_ERROR_CODES = {
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  WORKTREE_NOT_FOUND: 'WORKTREE_NOT_FOUND',
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  USER_CANCELLED: 'USER_CANCELLED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
} as const;

/** Default read-only tools */
export const DEFAULT_READ_ONLY_TOOLS = [
  'list_projects',
  'get_project',
  'list_worktrees',
  'get_worktree_status',
  'list_workflows',
  'get_workflow',
  'get_git_diff',
  'list_step_templates',
] as const;

/** Execute tools (require permission) */
export const EXECUTE_TOOLS = [
  'execute_workflow',
  'create_worktree',
  'delete_worktree',
  'run_shell_command',
  'stage_files',
  'commit_changes',
] as const;

/** All available MCP tools */
export const ALL_MCP_TOOLS = [...DEFAULT_READ_ONLY_TOOLS, ...EXECUTE_TOOLS] as const;

/** Permission mode display info */
export interface PermissionModeInfo {
  id: MCPPermissionMode;
  name: string;
  description: string;
  badge: 'safe' | 'caution' | 'danger';
}

/** Check if a tool is a read-only tool */
export function isReadOnlyTool(toolName: string): boolean {
  return (DEFAULT_READ_ONLY_TOOLS as readonly string[]).includes(toolName);
}

/** Check if a tool requires execute permission */
export function requiresExecutePermission(toolName: string): boolean {
  return (EXECUTE_TOOLS as readonly string[]).includes(toolName);
}

// ============================================================================
// Settings UI Types
// ============================================================================

/** Tool category for permission grouping */
export type ToolCategory = 'read' | 'write' | 'execute';

/** Individual MCP tool with permission info */
export interface McpToolWithPermission {
  /** Tool name (e.g., "get_project", "run_workflow") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool category for grouping */
  category: ToolCategory;
}

/** Tool definitions with categories */
export const MCP_TOOL_DEFINITIONS: McpToolWithPermission[] = [
  // Read-only tools
  { name: 'list_projects', description: 'List all registered projects in PackageFlow', category: 'read' },
  { name: 'get_project', description: 'Get project info (name, remote URL, current branch)', category: 'read' },
  { name: 'list_worktrees', description: 'List all Git worktrees', category: 'read' },
  { name: 'get_worktree_status', description: 'Get Git status (branch, ahead/behind, file status)', category: 'read' },
  { name: 'get_git_diff', description: 'Get staged changes diff (for commit message generation)', category: 'read' },
  { name: 'list_workflows', description: 'List all workflows, optionally filtered by project', category: 'read' },
  { name: 'get_workflow', description: 'Get detailed workflow info including all steps', category: 'read' },
  { name: 'list_step_templates', description: 'List available step templates (built-in + custom)', category: 'read' },

  // Write tools
  { name: 'create_workflow', description: 'Create a new workflow', category: 'write' },
  { name: 'add_workflow_step', description: 'Add a step (script node) to a workflow', category: 'write' },
  { name: 'create_step_template', description: 'Create a custom step template', category: 'write' },

  // Execute tools
  { name: 'run_workflow', description: 'Execute a workflow and return results', category: 'execute' },
];

/** Get tools by category */
export function getToolsByCategory(category: ToolCategory): McpToolWithPermission[] {
  return MCP_TOOL_DEFINITIONS.filter((t) => t.category === category);
}

/** Category display information */
export const TOOL_CATEGORY_INFO: Record<ToolCategory, { name: string; description: string; badgeClass: string }> = {
  read: {
    name: 'Read',
    description: 'View project information, worktrees, and workflows',
    badgeClass: 'bg-blue-500/10 text-blue-500',
  },
  write: {
    name: 'Write',
    description: 'Create and modify workflows and templates',
    badgeClass: 'bg-yellow-500/10 text-yellow-500',
  },
  execute: {
    name: 'Execute',
    description: 'Run workflows and execute scripts',
    badgeClass: 'bg-red-500/10 text-red-500',
  },
};

/** Permission mode to allowed categories mapping */
export const PERMISSION_MODE_CATEGORIES: Record<MCPPermissionMode, ToolCategory[]> = {
  read_only: ['read'],
  execute_with_confirm: ['read', 'execute'],
  full_access: ['read', 'write', 'execute'],
};

/** Check if a tool is allowed based on permission mode and explicit allow list */
export function isToolAllowedByConfig(
  toolName: string,
  config: MCPServerConfig
): boolean {
  // If explicitly in allowedTools, it's allowed
  if (config.allowedTools.length > 0 && config.allowedTools.includes(toolName)) {
    return true;
  }

  // If allowedTools is empty, use permission mode defaults
  if (config.allowedTools.length === 0) {
    const tool = MCP_TOOL_DEFINITIONS.find((t) => t.name === toolName);
    const allowedCategories = PERMISSION_MODE_CATEGORIES[config.permissionMode];

    if (tool && allowedCategories) {
      return allowedCategories.includes(tool.category);
    }
  }

  return false;
}

/** Get default allowed tools for a permission mode */
export function getDefaultAllowedTools(mode: MCPPermissionMode): string[] {
  const allowedCategories = PERMISSION_MODE_CATEGORIES[mode];
  return MCP_TOOL_DEFINITIONS
    .filter((t) => allowedCategories.includes(t.category))
    .map((t) => t.name);
}
