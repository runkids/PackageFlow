// MCP Server TypeScript types
// Feature: AI CLI Integration (020-ai-cli-integration)

/** MCP Server permission modes */
export type MCPPermissionMode = 'read_only' | 'execute_with_confirm' | 'full_access';

/** MCP request result */
export type MCPRequestResult = 'success' | 'permission_denied' | 'user_cancelled' | 'error';

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

/** List of permission modes with display info */
export const PERMISSION_MODES: PermissionModeInfo[] = [
  {
    id: 'read_only',
    name: '唯讀模式',
    description: '僅允許查詢操作，執行操作會被拒絕',
    badge: 'safe',
  },
  {
    id: 'execute_with_confirm',
    name: '確認執行模式',
    description: '執行操作需要在 UI 中確認',
    badge: 'caution',
  },
  {
    id: 'full_access',
    name: '完全存取模式',
    description: '允許所有操作，無需確認（危險）',
    badge: 'danger',
  },
];

/** Get permission mode info by ID */
export function getPermissionModeInfo(modeId: MCPPermissionMode): PermissionModeInfo | undefined {
  return PERMISSION_MODES.find((m) => m.id === modeId);
}

/** Check if a tool is a read-only tool */
export function isReadOnlyTool(toolName: string): boolean {
  return (DEFAULT_READ_ONLY_TOOLS as readonly string[]).includes(toolName);
}

/** Check if a tool requires execute permission */
export function requiresExecutePermission(toolName: string): boolean {
  return (EXECUTE_TOOLS as readonly string[]).includes(toolName);
}
