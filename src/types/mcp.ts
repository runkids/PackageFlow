// MCP Server TypeScript types
// Feature: AI CLI Integration (020-ai-cli-integration)

/** MCP Server permission modes */
export type MCPPermissionMode = 'read_only' | 'execute_with_confirm' | 'full_access';

/** Dev server mode for MCP - controls how dev server commands are handled */
export type DevServerMode = 'mcp_managed' | 'ui_integrated' | 'reject_with_hint';

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
  /** Dev server mode - controls how dev server commands are handled */
  devServerMode: DevServerMode;
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
  devServerMode?: DevServerMode;
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
  { name: 'get_project_dependencies', description: 'Get dependencies from package.json', category: 'read' },
  { name: 'list_worktrees', description: 'List all Git worktrees', category: 'read' },
  { name: 'get_worktree_status', description: 'Get Git status (branch, ahead/behind, file status)', category: 'read' },
  { name: 'get_git_diff', description: 'Get staged changes diff (for commit message generation)', category: 'read' },
  { name: 'list_workflows', description: 'List all workflows, optionally filtered by project', category: 'read' },
  { name: 'get_workflow', description: 'Get detailed workflow info including all steps', category: 'read' },
  { name: 'get_workflow_execution_details', description: 'Get execution logs', category: 'read' },
  { name: 'list_step_templates', description: 'List available step templates (built-in + custom)', category: 'read' },
  // Background process read tools
  { name: 'get_background_process_output', description: 'Get output from a background process', category: 'read' },
  { name: 'list_background_processes', description: 'List all background processes', category: 'read' },
  // AI Assistant read tools
  { name: 'list_ai_providers', description: 'List configured AI providers', category: 'read' },
  { name: 'list_conversations', description: 'List past AI conversations', category: 'read' },
  // Notification read tools
  { name: 'get_notifications', description: 'Get recent notifications', category: 'read' },
  // Security read tools
  { name: 'get_security_scan_results', description: 'Get vulnerability scan results', category: 'read' },
  // Deployment read tools
  { name: 'list_deployments', description: 'List deployment history', category: 'read' },
  // File read tools
  { name: 'check_file_exists', description: 'Check if files exist in project', category: 'read' },
  { name: 'search_project_files', description: 'Search files by pattern', category: 'read' },
  { name: 'read_project_file', description: 'Read file content (security-limited)', category: 'read' },
  // System tools
  { name: 'get_environment_info', description: 'Get system environment info', category: 'read' },

  // Write tools
  { name: 'create_workflow', description: 'Create a new workflow', category: 'write' },
  { name: 'add_workflow_step', description: 'Add a step (script node) to a workflow', category: 'write' },
  { name: 'update_workflow', description: 'Update workflow name/description', category: 'write' },
  { name: 'delete_workflow_step', description: 'Remove a step from workflow', category: 'write' },
  { name: 'create_step_template', description: 'Create a custom step template', category: 'write' },
  { name: 'mark_notifications_read', description: 'Mark notifications as read', category: 'write' },

  // Execute tools
  { name: 'run_workflow', description: 'Execute a workflow and return results', category: 'execute' },
  { name: 'run_npm_script', description: 'Execute npm/yarn/pnpm script (supports background mode)', category: 'execute' },
  { name: 'run_package_manager_command', description: 'Run package manager commands (install, update, add, remove)', category: 'execute' },
  { name: 'stop_background_process', description: 'Stop/terminate a background process', category: 'execute' },
  { name: 'run_security_scan', description: 'Run npm/yarn/pnpm audit', category: 'execute' },
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

// ============================================================================
// Per-Tool Permission Types (New UI Design)
// ============================================================================

/** Permission types that can be assigned to each tool */
export type PermissionType = 'read' | 'execute' | 'write';

/** Permission flags for a single tool */
export interface ToolPermissionFlags {
  /** Whether AI can discover/query this tool */
  read: boolean;
  /** Whether AI can invoke/execute this tool */
  execute: boolean;
  /** Whether this tool can modify data */
  write: boolean;
}

/** Tool permission entry with metadata */
export interface ToolPermissionEntry {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Current permission flags */
  permissions: ToolPermissionFlags;
  /** Which permissions are applicable for this tool (others should be disabled) */
  applicablePermissions: PermissionType[];
  /** Tool's primary category */
  category: ToolCategory;
}

/** Quick mode presets for permission configuration */
export type PermissionQuickMode = 'read_only' | 'standard' | 'full_access' | 'custom';

/** Tool permission matrix - maps tool names to permission flags */
export type ToolPermissionMatrix = Record<string, ToolPermissionFlags>;

/** Quick mode configuration */
export interface QuickModeConfig {
  id: PermissionQuickMode;
  name: string;
  description: string;
  icon: 'eye' | 'play' | 'shield' | 'settings';
  colorScheme: 'blue' | 'yellow' | 'red' | 'gray';
}

/** Quick mode display configurations */
export const QUICK_MODE_CONFIGS: QuickModeConfig[] = [
  {
    id: 'read_only',
    name: 'Read Only',
    description: 'AI can only view information',
    icon: 'eye',
    colorScheme: 'blue',
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Read + execute workflows',
    icon: 'play',
    colorScheme: 'yellow',
  },
  {
    id: 'full_access',
    name: 'Full Access',
    description: 'Complete control',
    icon: 'shield',
    colorScheme: 'red',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Per-tool settings',
    icon: 'settings',
    colorScheme: 'gray',
  },
];

/** Tool definitions with applicable permissions */
export interface ToolDefinitionWithPermissions {
  name: string;
  description: string;
  category: ToolCategory;
  /** Which permission types are applicable for this tool */
  applicablePermissions: PermissionType[];
}

/** Complete tool definitions with applicable permissions */
export const TOOL_DEFINITIONS_WITH_PERMISSIONS: ToolDefinitionWithPermissions[] = [
  // Read-only tools - only 'read' permission is applicable
  { name: 'list_projects', description: 'List all registered projects', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_project', description: 'Get project details', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_worktrees', description: 'List all Git worktrees', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_worktree_status', description: 'Get Git status', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_git_diff', description: 'Get staged changes diff', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_workflows', description: 'List all workflows', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_workflow', description: 'Get workflow details', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_step_templates', description: 'List step templates', category: 'read', applicablePermissions: ['read'] },

  // MCP Actions - Read tools (021-mcp-actions)
  { name: 'list_actions', description: 'List available MCP actions', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_action', description: 'Get MCP action details', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_action_executions', description: 'List action execution history', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_execution_status', description: 'Get action execution status', category: 'read', applicablePermissions: ['read'] },
  { name: 'get_action_permissions', description: 'Get action permission settings', category: 'read', applicablePermissions: ['read'] },

  // Execute tools - 'read' and 'execute' permissions are applicable
  { name: 'run_workflow', description: 'Execute a workflow', category: 'execute', applicablePermissions: ['read', 'execute'] },

  // MCP Actions - Execute tools (021-mcp-actions)
  { name: 'run_script', description: 'Execute a script action', category: 'execute', applicablePermissions: ['read', 'execute'] },
  { name: 'trigger_webhook', description: 'Trigger a webhook action', category: 'execute', applicablePermissions: ['read', 'execute'] },
  { name: 'run_npm_script', description: 'Execute npm/yarn/pnpm script (supports background mode)', category: 'execute', applicablePermissions: ['read', 'execute'] },
  { name: 'run_package_manager_command', description: 'Run package manager commands (install, update, add, remove)', category: 'execute', applicablePermissions: ['read', 'execute'] },

  // Background Process tools
  { name: 'get_background_process_output', description: 'Get output from a background process', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_background_processes', description: 'List all background processes', category: 'read', applicablePermissions: ['read'] },
  { name: 'stop_background_process', description: 'Stop/terminate a background process', category: 'execute', applicablePermissions: ['read', 'execute'] },

  // Write tools - 'read' and 'write' permissions are applicable
  { name: 'create_workflow', description: 'Create a new workflow', category: 'write', applicablePermissions: ['read', 'write'] },
  { name: 'add_workflow_step', description: 'Add step to workflow', category: 'write', applicablePermissions: ['read', 'write'] },
  { name: 'create_step_template', description: 'Create step template', category: 'write', applicablePermissions: ['read', 'write'] },

  // ============================================================================
  // Enhanced MCP Tools (023-enhanced-ai-chat)
  // ============================================================================

  // System tools - Read only
  { name: 'get_environment_info', description: 'Get system environment info (Node, npm versions, paths)', category: 'read', applicablePermissions: ['read'] },

  // AI Assistant tools - Read only
  { name: 'list_ai_providers', description: 'List configured AI providers', category: 'read', applicablePermissions: ['read'] },
  { name: 'list_conversations', description: 'List past AI conversations', category: 'read', applicablePermissions: ['read'] },

  // Notification tools - Read and Write
  { name: 'get_notifications', description: 'Get recent notifications', category: 'read', applicablePermissions: ['read'] },
  { name: 'mark_notifications_read', description: 'Mark notifications as read', category: 'write', applicablePermissions: ['read', 'write'] },

  // Security tools - Read and Execute
  { name: 'get_security_scan_results', description: 'Get vulnerability scan results', category: 'read', applicablePermissions: ['read'] },
  { name: 'run_security_scan', description: 'Run npm/yarn/pnpm audit', category: 'execute', applicablePermissions: ['read', 'execute'] },

  // Deployment tools - Read only
  { name: 'list_deployments', description: 'List deployment history', category: 'read', applicablePermissions: ['read'] },

  // Project tools - Read only
  { name: 'get_project_dependencies', description: 'Get dependencies from package.json', category: 'read', applicablePermissions: ['read'] },

  // Workflow tools - Read, Write, and mixed
  { name: 'update_workflow', description: 'Update workflow name/description', category: 'write', applicablePermissions: ['read', 'write'] },
  { name: 'delete_workflow_step', description: 'Remove a step from workflow', category: 'write', applicablePermissions: ['read', 'write'] },
  { name: 'get_workflow_execution_details', description: 'Get execution logs', category: 'read', applicablePermissions: ['read'] },

  // File tools - Read only
  { name: 'check_file_exists', description: 'Check if files exist in project', category: 'read', applicablePermissions: ['read'] },
  { name: 'search_project_files', description: 'Search files by pattern', category: 'read', applicablePermissions: ['read'] },
  { name: 'read_project_file', description: 'Read file content (security-limited)', category: 'read', applicablePermissions: ['read'] },
];

/** Default permission flags (all disabled) */
export const DEFAULT_PERMISSION_FLAGS: ToolPermissionFlags = {
  read: false,
  execute: false,
  write: false,
};

/** Get default permission matrix for a quick mode */
export function getDefaultPermissionMatrix(mode: PermissionQuickMode): ToolPermissionMatrix {
  const matrix: ToolPermissionMatrix = {};

  for (const tool of TOOL_DEFINITIONS_WITH_PERMISSIONS) {
    const flags: ToolPermissionFlags = { read: false, execute: false, write: false };

    switch (mode) {
      case 'read_only':
        // Only enable read for all tools
        if (tool.applicablePermissions.includes('read')) {
          flags.read = true;
        }
        break;

      case 'standard':
        // Enable read for all, execute for execute tools
        if (tool.applicablePermissions.includes('read')) {
          flags.read = true;
        }
        if (tool.applicablePermissions.includes('execute')) {
          flags.execute = true;
        }
        break;

      case 'full_access':
        // Enable all applicable permissions
        if (tool.applicablePermissions.includes('read')) {
          flags.read = true;
        }
        if (tool.applicablePermissions.includes('execute')) {
          flags.execute = true;
        }
        if (tool.applicablePermissions.includes('write')) {
          flags.write = true;
        }
        break;

      case 'custom':
        // Custom mode starts with read_only as base
        if (tool.applicablePermissions.includes('read')) {
          flags.read = true;
        }
        break;
    }

    matrix[tool.name] = flags;
  }

  return matrix;
}

/** Convert permission matrix to allowed tools array (for backward compatibility) */
export function matrixToAllowedTools(matrix: ToolPermissionMatrix): string[] {
  return Object.entries(matrix)
    .filter(([, flags]) => flags.read || flags.execute || flags.write)
    .map(([name]) => name);
}

/** Detect current quick mode from permission matrix */
export function detectQuickMode(matrix: ToolPermissionMatrix): PermissionQuickMode {
  const readOnlyMatrix = getDefaultPermissionMatrix('read_only');
  const standardMatrix = getDefaultPermissionMatrix('standard');
  const fullAccessMatrix = getDefaultPermissionMatrix('full_access');

  const isEqual = (a: ToolPermissionMatrix, b: ToolPermissionMatrix): boolean => {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      a[key].read === b[key].read &&
      a[key].execute === b[key].execute &&
      a[key].write === b[key].write
    );
  };

  if (isEqual(matrix, readOnlyMatrix)) return 'read_only';
  if (isEqual(matrix, standardMatrix)) return 'standard';
  if (isEqual(matrix, fullAccessMatrix)) return 'full_access';
  return 'custom';
}

/** Build tool permission entries from matrix */
export function buildToolPermissionEntries(matrix: ToolPermissionMatrix): ToolPermissionEntry[] {
  return TOOL_DEFINITIONS_WITH_PERMISSIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    permissions: matrix[tool.name] || { ...DEFAULT_PERMISSION_FLAGS },
    applicablePermissions: tool.applicablePermissions,
    category: tool.category,
  }));
}
