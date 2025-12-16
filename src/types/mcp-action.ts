// MCP Action Types
// Types for MCP action execution system
// @see specs/021-mcp-actions/data-model.md

// ============================================================================
// Enums
// ============================================================================

export type MCPActionType = 'script' | 'webhook' | 'workflow';

export type PermissionLevel = 'require_confirm' | 'auto_approve' | 'deny';

export type ExecutionStatus =
  | 'pending_confirm'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'denied';

// ============================================================================
// Core Entities
// ============================================================================

export interface MCPAction {
  id: string;
  actionType: MCPActionType;
  name: string;
  description?: string;
  config: ScriptConfig | MCPWebhookConfig | WorkflowActionConfig;
  projectId?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MCPActionPermission {
  id: string;
  actionId?: string;
  actionType?: MCPActionType;
  permissionLevel: PermissionLevel;
  createdAt: string;
}

export interface MCPActionExecution {
  id: string;
  actionId?: string;
  actionType: MCPActionType;
  actionName: string;
  sourceClient?: string;
  parameters?: Record<string, unknown>;
  status: ExecutionStatus;
  result?: ScriptExecutionResult | WebhookExecutionResult | WorkflowExecutionResult;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ScriptConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  useVolta?: boolean;
}

export interface MCPWebhookConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  payloadTemplate?: string;
  timeoutMs?: number;
  retryCount?: number;
  verifySsl?: boolean;
}

export interface WorkflowActionConfig {
  workflowId: string;
  parameters?: Record<string, unknown>;
  reportProgress?: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

export interface ScriptExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
}

export interface WebhookExecutionResult {
  statusCode: number;
  responseBody?: string;
  responseHeaders: Record<string, string>;
  durationMs: number;
  retryAttempts: number;
}

export interface WorkflowExecutionResult {
  executionId: string;
  status: string;
  stepsCompleted: number;
  stepsTotal: number;
  stepResults: StepResult[];
  durationMs: number;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: string;
  output?: string;
  error?: string;
  durationMs: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ActionFilter {
  actionType?: MCPActionType;
  projectId?: string;
  isEnabled?: boolean;
}

export interface ExecutionFilter {
  actionId?: string;
  actionType?: MCPActionType;
  status?: ExecutionStatus;
  sourceClient?: string;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
}

export interface RunScriptParams {
  actionId: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface TriggerWebhookParams {
  actionId: string;
  variables?: Record<string, string>;
  payload?: Record<string, unknown>;
}

export interface RunWorkflowParams {
  actionId: string;
  parameters?: Record<string, unknown>;
  waitForCompletion?: boolean;
}

// ============================================================================
// Pending Request Types (for user confirmation flow)
// ============================================================================

export interface PendingActionRequest {
  executionId: string;
  actionId: string;
  actionType: MCPActionType;
  actionName: string;
  description?: string;
  parameters?: Record<string, unknown>;
  sourceClient?: string;
  requestedAt: string;
}

export interface ActionRequestResponse {
  executionId: string;
  approved: boolean;
  respondedAt: string;
}

// ============================================================================
// List Response Types
// ============================================================================

export interface ActionListResponse {
  actions: MCPAction[];
  total: number;
}

export interface ExecutionListResponse {
  executions: MCPActionExecution[];
  total: number;
  hasMore: boolean;
}

export interface PermissionListResponse {
  permissions: MCPActionPermission[];
  defaultLevel: PermissionLevel;
}
