// Tauri API Wrapper
// Provides a unified interface for frontend to communicate with Rust backend

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppSettings, StoreData, StorePathInfo } from '../types/tauri';
import type { Project, Workflow, WorkspacePackage } from '../types';
import type { ScanProjectResponse, RefreshProjectResponse } from '../types/project';

// Re-export plugin APIs
export { open, save, message, confirm } from '@tauri-apps/plugin-dialog';
export { openUrl } from '@tauri-apps/plugin-opener';
export { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

// Re-export for use in other modules
export { invoke, listen };
export type { UnlistenFn };

// ============================================================================
// Project Commands (Phase 5 - US2)
// ============================================================================

// Response type for trash_node_modules command
export interface TrashNodeModulesResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Re-export types for convenience
export type { ScanProjectResponse as ProjectScanResult };
export type { RefreshProjectResponse as ProjectRefreshResult };

export const projectAPI = {
  scanProject: (path: string): Promise<ScanProjectResponse> =>
    invoke<ScanProjectResponse>('scan_project', { path }),

  saveProject: (project: Project): Promise<void> =>
    invoke('save_project', { project }),

  removeProject: (id: string): Promise<void> =>
    invoke('remove_project', { id }),

  refreshProject: (id: string): Promise<RefreshProjectResponse> =>
    invoke<RefreshProjectResponse>('refresh_project', { id }),

  getWorkspacePackages: (projectPath: string): Promise<WorkspacePackage[]> =>
    invoke<WorkspacePackage[]>('get_workspace_packages', { projectPath }),

  trashNodeModules: (projectPath: string): Promise<TrashNodeModulesResponse> =>
    invoke<TrashNodeModulesResponse>('trash_node_modules', { projectPath }),
};

// ============================================================================
// Script Commands (Phase 6 - US3)
// ============================================================================

// Script execution types
export interface ExecuteScriptParams {
  projectPath: string;
  scriptName: string;
  packageManager: string;
  cwd?: string;
}

export interface ExecuteCommandParams {
  command: string;
  args: string[];
  cwd: string;
}

export interface ExecuteScriptResponse {
  success: boolean;
  executionId?: string;
  error?: string;
}

export interface CancelScriptResponse {
  success: boolean;
  error?: string;
}

export interface ScriptOutputPayload {
  executionId: string;
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface ScriptCompletedPayload {
  executionId: string;
  exitCode: number;
  success: boolean;
  durationMs: number;
}

// Feature 007: Extended RunningScriptInfo with reconnection support
export type ScriptExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

// Feature 008: Write to script stdin response
export interface WriteToScriptResponse {
  success: boolean;
  error?: string;
}

export interface RunningScriptInfo {
  // Original fields
  executionId: string;
  scriptName: string;
  startedAtMs: number;  // elapsed time for backward compatibility
  // Feature 007: New fields for reconnection support
  projectPath: string;
  projectName?: string;
  startedAt: string;  // ISO 8601 absolute timestamp
  status: ScriptExecutionStatus;
  exitCode?: number;
  completedAt?: string;
}

// Feature 007: Output line for detailed rendering
export interface OutputLine {
  content: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;  // ISO 8601
}

// Feature 007: Response for get_script_output command
export interface GetScriptOutputResponse {
  success: boolean;
  executionId: string;
  output?: string;
  lines?: OutputLine[];
  truncated: boolean;
  bufferSize: number;
  error?: string;
}

export const scriptAPI = {
  executeScript: (params: ExecuteScriptParams): Promise<ExecuteScriptResponse> =>
    invoke<ExecuteScriptResponse>('execute_script', { ...params }),

  executeCommand: (params: ExecuteCommandParams): Promise<ExecuteScriptResponse> =>
    invoke<ExecuteScriptResponse>('execute_command', { ...params }),

  cancelScript: (executionId: string): Promise<CancelScriptResponse> =>
    invoke<CancelScriptResponse>('cancel_script', { executionId }),

  killAllNodeProcesses: (): Promise<CancelScriptResponse> =>
    invoke<CancelScriptResponse>('kill_all_node_processes'),

  killPorts: (ports: number[]): Promise<CancelScriptResponse> =>
    invoke<CancelScriptResponse>('kill_ports', { ports }),

  checkPorts: (ports: number[]): Promise<number[]> =>
    invoke<number[]>('check_ports', { ports }),

  getRunningScripts: (): Promise<RunningScriptInfo[]> =>
    invoke<RunningScriptInfo[]>('get_running_scripts'),

  // Feature 007: Get script output buffer for reconnection
  getScriptOutput: (executionId: string): Promise<GetScriptOutputResponse> =>
    invoke<GetScriptOutputResponse>('get_script_output', { executionId }),

  // Feature 008: Write to script stdin
  writeToScript: (executionId: string, input: string): Promise<WriteToScriptResponse> =>
    invoke<WriteToScriptResponse>('write_to_script', { executionId, input }),

  // Feature 008: Get PTY environment variables (for proper PATH, VOLTA_HOME, etc.)
  getPtyEnv: (): Promise<Record<string, string>> =>
    invoke<Record<string, string>>('get_pty_env'),
};

// ============================================================================
// Workflow Commands (Phase 7 - US4)
// ============================================================================

// Workflow execution event types
export interface NodeStartedPayload {
  executionId: string;
  /** Workflow ID for direct matching (fixes output mixing between workflows) */
  workflowId: string;
  nodeId: string;
  nodeName: string;
  /** Feature 013: Node type for differentiated UI messages */
  nodeType: 'script' | 'trigger-workflow';
  /** Feature 013: Target workflow name for trigger-workflow nodes */
  targetWorkflowName?: string;
  startedAt: string;
}

export interface ExecutionOutputPayload {
  executionId: string;
  /** Workflow ID for direct matching (fixes output mixing between workflows) */
  workflowId: string;
  nodeId: string;
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface NodeCompletedPayload {
  executionId: string;
  /** Workflow ID for direct matching (fixes output mixing between workflows) */
  workflowId: string;
  nodeId: string;
  status: 'completed' | 'failed' | 'cancelled';
  exitCode?: number;
  errorMessage?: string;
  finishedAt: string;
}

export interface ExecutionCompletedPayload {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  finishedAt: string;
  totalDurationMs: number;
}

export interface ExecutionPausedPayload {
  executionId: string;
  workflowId: string;
  pausedAtNodeId: string;
  reason: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  nodeResults: Record<string, {
    nodeId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    finishedAt?: string;
    output?: string;
    exitCode?: number;
    errorMessage?: string;
  }>;
}

// Available workflow info for trigger selection (Feature 013)
export interface AvailableWorkflowInfo {
  id: string;
  name: string;
  description?: string;
  stepCount: number;
  projectId?: string;
  projectName?: string;
  lastExecutedAt?: string;
}

// Feature 013: Cycle detection result
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath?: string[];
  cycleDescription?: string;
}

// Feature 013 T050: Child execution info
export interface ChildExecutionInfo {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  depth: number;
}

// Workflow output line from backend buffer
export interface WorkflowOutputLine {
  nodeId: string;
  nodeName: string;
  content: string;
  stream: 'stdout' | 'stderr' | 'system';
  timestamp: string;
}

// Response from get_workflow_output command
export interface WorkflowOutputResponse {
  found: boolean;
  workflowId?: string;
  executionId?: string;
  lines: WorkflowOutputLine[];
  truncated: boolean;
  bufferSize: number;
}

// Execution history item
export interface ExecutionHistoryItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  nodeCount: number;
  completedNodeCount: number;
  errorMessage?: string;
  output: WorkflowOutputLine[];
  triggeredBy: string;
}

// Execution history settings
export interface ExecutionHistorySettings {
  maxHistoryPerWorkflow: number;
  retentionDays: number;
  maxOutputLines: number;
}

// Execution history store data
export interface ExecutionHistoryStoreData {
  version: string;
  histories: Record<string, ExecutionHistoryItem[]>;
  settings?: ExecutionHistorySettings;
}

export const workflowAPI = {
  // Note: loadWorkflows is in settingsAPI.loadWorkflows

  saveWorkflow: (workflow: Workflow): Promise<void> =>
    invoke('save_workflow', { workflow }),

  deleteWorkflow: (workflowId: string): Promise<void> =>
    invoke('delete_workflow', { workflowId }),

  executeWorkflow: (workflowId: string): Promise<string> =>
    invoke<string>('execute_workflow', { workflowId }),

  cancelExecution: (executionId: string): Promise<void> =>
    invoke('cancel_execution', { executionId }),

  continueExecution: (executionId: string): Promise<void> =>
    invoke('continue_execution', { executionId }),

  getRunningExecutions: (): Promise<Record<string, Execution>> =>
    invoke<Record<string, Execution>>('get_running_executions'),

  restoreRunningExecutions: (): Promise<void> =>
    invoke('restore_running_executions'),

  killProcess: (executionId: string): Promise<void> =>
    invoke('kill_process', { executionId }),

  // Feature 013: Workflow Trigger Workflow
  getAvailableWorkflows: (excludeWorkflowId: string): Promise<AvailableWorkflowInfo[]> =>
    invoke<AvailableWorkflowInfo[]>('get_available_workflows', { excludeWorkflowId }),

  // Feature 013: Detect workflow cycle (T039)
  detectWorkflowCycle: (
    sourceWorkflowId: string,
    targetWorkflowId: string
  ): Promise<CycleDetectionResult> =>
    invoke<CycleDetectionResult>('detect_workflow_cycle', { sourceWorkflowId, targetWorkflowId }),

  // Feature 013 T050: Get child executions
  getChildExecutions: (parentExecutionId: string): Promise<ChildExecutionInfo[]> =>
    invoke<ChildExecutionInfo[]>('get_child_executions', { parentExecutionId }),

  // Get buffered output for a workflow execution
  getWorkflowOutput: (workflowId: string): Promise<WorkflowOutputResponse> =>
    invoke<WorkflowOutputResponse>('get_workflow_output', { workflowId }),

  // Execution history commands
  loadExecutionHistory: (workflowId: string): Promise<ExecutionHistoryItem[]> =>
    invoke<ExecutionHistoryItem[]>('load_execution_history', { workflowId }),

  loadAllExecutionHistory: (): Promise<ExecutionHistoryStoreData> =>
    invoke<ExecutionHistoryStoreData>('load_all_execution_history'),

  saveExecutionHistory: (item: ExecutionHistoryItem): Promise<void> =>
    invoke('save_execution_history', { item }),

  deleteExecutionHistory: (workflowId: string, historyId: string): Promise<void> =>
    invoke('delete_execution_history', { workflowId, historyId }),

  clearWorkflowExecutionHistory: (workflowId: string): Promise<void> =>
    invoke('clear_workflow_execution_history', { workflowId }),

  updateExecutionHistorySettings: (settings: ExecutionHistorySettings): Promise<void> =>
    invoke('update_execution_history_settings', { settings }),
};

// ============================================================================
// Webhook API (Feature 012 - Workflow Webhook Support)
// ============================================================================

import type { WebhookDeliveryEvent, WebhookTestResult } from '../types/webhook';

// Store unlisten functions for webhook events
const webhookUnlisteners: UnlistenFn[] = [];

export const webhookAPI = {
  /**
   * Listen for webhook delivery events
   * Emitted after each webhook delivery attempt (success or failure)
   */
  onWebhookDelivery: (callback: (event: WebhookDeliveryEvent) => void): void => {
    listen<WebhookDeliveryEvent>('webhook_delivery', (event) => {
      callback(event.payload);
    }).then((unlisten) => {
      webhookUnlisteners.push(unlisten);
    });
  },

  /**
   * Remove all webhook event listeners
   */
  removeWebhookListeners: (): void => {
    webhookUnlisteners.forEach((unlisten) => unlisten());
    webhookUnlisteners.length = 0;
  },

  /**
   * Test webhook configuration (Phase 5 - US3)
   * Sends a test request to the webhook URL
   */
  testWebhook: (
    url: string,
    headers?: Record<string, string>,
    payloadTemplate?: string
  ): Promise<WebhookTestResult> =>
    invoke<WebhookTestResult>('test_webhook', { url, headers, payloadTemplate }),
};

// ============================================================================
// Worktree Commands (Phase 8 - US5)
// ============================================================================

// Worktree types
export interface Worktree {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  isBare?: boolean;
  isDetached?: boolean;
}

// T003: WorktreeStatus interface for enhanced worktree management
export interface WorktreeStatus {
  uncommittedCount: number;
  ahead: number;
  behind: number;
  hasTrackingBranch: boolean;
  lastCommitTime: string | null;
  lastCommitMessage: string | null;
  hasRunningProcess: boolean;
}

// T004: EditorDefinition interface for IDE integration
export interface EditorDefinition {
  id: string;
  name: string;
  command: string;
  args: string[];
  isAvailable: boolean;
}

// T005: Response types for enhanced worktree commands
export interface GetWorktreeStatusResponse {
  success: boolean;
  status?: WorktreeStatus;
  error?: string;
}

export interface GetAllWorktreeStatusesResponse {
  success: boolean;
  statuses?: Record<string, WorktreeStatus>;
  error?: string;
}

export interface OpenInEditorResponse {
  success: boolean;
  editor?: string;
  error?: string;
}

export interface GetAvailableEditorsResponse {
  success: boolean;
  editors?: EditorDefinition[];
  defaultEditor?: string;
  error?: string;
}

export interface ExecuteScriptInWorktreeResponse {
  success: boolean;
  executionId?: string;
  error?: string;
}

export interface ListWorktreesResponse {
  success: boolean;
  worktrees?: Worktree[];
  error?: string;
}

export interface ListBranchesResponse {
  success: boolean;
  branches?: string[];
  error?: string;
}

export interface AddWorktreeResponse {
  success: boolean;
  worktree?: Worktree;
  error?: string;
}

export interface RemoveWorktreeResponse {
  success: boolean;
  error?: string;
}

export interface GetMergedWorktreesResponse {
  success: boolean;
  mergedWorktrees?: Worktree[];
  baseBranch?: string;
  error?: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GetBehindCommitsResponse {
  success: boolean;
  behindCount: number;
  commits?: CommitInfo[];
  baseBranch?: string;
  error?: string;
}

export interface SyncWorktreeResponse {
  success: boolean;
  method?: string;
  hasConflicts: boolean;
  error?: string;
}

export interface AddWorktreeParams {
  projectPath: string;
  worktreePath: string;
  branch: string;
  createBranch: boolean;
}

export interface RemoveWorktreeParams {
  projectPath: string;
  worktreePath: string;
  force?: boolean;
  deleteBranch?: boolean;
}

export const worktreeAPI = {
  isGitRepo: (projectPath: string): Promise<boolean> =>
    invoke<boolean>('is_git_repo', { projectPath }),

  listBranches: (projectPath: string): Promise<ListBranchesResponse> =>
    invoke<ListBranchesResponse>('list_branches', { projectPath }),

  listWorktrees: (projectPath: string): Promise<ListWorktreesResponse> =>
    invoke<ListWorktreesResponse>('list_worktrees', { projectPath }),

  addWorktree: (params: AddWorktreeParams): Promise<AddWorktreeResponse> =>
    invoke<AddWorktreeResponse>('add_worktree', { ...params }),

  removeWorktree: (params: RemoveWorktreeParams): Promise<RemoveWorktreeResponse> =>
    invoke<RemoveWorktreeResponse>('remove_worktree', {
      projectPath: params.projectPath,
      worktreePath: params.worktreePath,
      force: params.force ?? false,
      deleteBranch: params.deleteBranch ?? false,
    }),

  getMergedWorktrees: (projectPath: string, baseBranch?: string): Promise<GetMergedWorktreesResponse> =>
    invoke<GetMergedWorktreesResponse>('get_merged_worktrees', { projectPath, baseBranch }),

  getBehindCommits: (worktreePath: string, baseBranch?: string, limit?: number): Promise<GetBehindCommitsResponse> =>
    invoke<GetBehindCommitsResponse>('get_behind_commits', { worktreePath, baseBranch, limit }),

  syncWorktree: (worktreePath: string, baseBranch: string, method: 'rebase' | 'merge'): Promise<SyncWorktreeResponse> =>
    invoke<SyncWorktreeResponse>('sync_worktree', { worktreePath, baseBranch, method }),

  // T012: Enhanced worktree status API
  getWorktreeStatus: (worktreePath: string): Promise<GetWorktreeStatusResponse> =>
    invoke<GetWorktreeStatusResponse>('get_worktree_status', { worktreePath }),

  // T013: Get all worktree statuses
  getAllWorktreeStatuses: (projectPath: string): Promise<GetAllWorktreeStatusesResponse> =>
    invoke<GetAllWorktreeStatusesResponse>('get_all_worktree_statuses', { projectPath }),

  // T016: Execute script in worktree
  executeScriptInWorktree: (params: {
    worktreePath: string;
    scriptName: string;
    packageManager: string;
  }): Promise<ExecuteScriptInWorktreeResponse> =>
    invoke<ExecuteScriptInWorktreeResponse>('execute_script_in_worktree', { ...params }),

  // T035: Open worktree in editor
  openInEditor: (worktreePath: string, editorId?: string): Promise<OpenInEditorResponse> =>
    invoke<OpenInEditorResponse>('open_in_editor', { worktreePath, editorId }),

  // T036: Get available editors
  getAvailableEditors: (): Promise<GetAvailableEditorsResponse> =>
    invoke<GetAvailableEditorsResponse>('get_available_editors'),

  // Gitignore management
  checkGitignoreHasWorktrees: (projectPath: string): Promise<CheckGitignoreResponse> =>
    invoke<CheckGitignoreResponse>('check_gitignore_has_worktrees', { projectPath }),

  addWorktreesToGitignore: (projectPath: string): Promise<AddToGitignoreResponse> =>
    invoke<AddToGitignoreResponse>('add_worktrees_to_gitignore', { projectPath }),
};

// ============================================================================
// Terminal Types & API
// ============================================================================

export interface TerminalDefinition {
  id: string;
  name: string;
  command?: string;
  bundleId?: string;
  args: string[];
  isAvailable: boolean;
  isBuiltin: boolean;
}

export interface GetAvailableTerminalsResponse {
  success: boolean;
  terminals?: TerminalDefinition[];
  defaultTerminal?: string;
  error?: string;
}

export interface OpenInTerminalResponse {
  success: boolean;
  terminal?: string;
  error?: string;
}

export const terminalAPI = {
  getAvailableTerminals: (): Promise<GetAvailableTerminalsResponse> =>
    invoke<GetAvailableTerminalsResponse>('get_available_terminals'),

  setPreferredTerminal: (terminalId: string): Promise<boolean> =>
    invoke<boolean>('set_preferred_terminal', { terminalId }),

  openInTerminal: (path: string, terminalId?: string): Promise<OpenInTerminalResponse> =>
    invoke<OpenInTerminalResponse>('open_in_terminal', { path, terminalId }),
};

// ============================================================================
// Gitignore Management Types
// ============================================================================

export interface CheckGitignoreResponse {
  success: boolean;
  hasWorktreesEntry: boolean;
  gitignoreExists: boolean;
  error?: string;
}

export interface AddToGitignoreResponse {
  success: boolean;
  createdFile: boolean;
  error?: string;
}

// ============================================================================
// Worktree Template Types & API (Phase 7 - US5)
// ============================================================================

// T048: WorktreeTemplate interface for template/preset feature
export interface WorktreeTemplate {
  id: string;
  name: string;
  description?: string;
  /** Branch naming pattern with placeholders: {name}, {date}, {user}, {repo}, {num} */
  branchPattern: string;
  /** Path pattern for worktree location with placeholders */
  pathPattern: string;
  /** Scripts to run after worktree creation */
  postCreateScripts: string[];
  /** Whether to open in editor after creation */
  openInEditor: boolean;
  /** Preferred editor ID to use */
  preferredEditor?: string;
  /** Base branch to create from (e.g., "main", "develop") */
  baseBranch?: string;
  /** Whether this is a default template */
  isDefault: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  updatedAt?: string;
}

export interface CreateWorktreeFromTemplateParams {
  projectPath: string;
  templateId: string;
  name: string;
  customBaseBranch?: string;
}

export interface SaveTemplateResponse {
  success: boolean;
  template?: WorktreeTemplate;
  error?: string;
}

export interface DeleteTemplateResponse {
  success: boolean;
  error?: string;
}

export interface ListTemplatesResponse {
  success: boolean;
  templates?: WorktreeTemplate[];
  error?: string;
}

export interface GetNextFeatureNumberResponse {
  success: boolean;
  featureNumber?: string;
  error?: string;
}

export interface CreateWorktreeFromTemplateResponse {
  success: boolean;
  worktree?: Worktree;
  executedScripts?: string[];
  specFilePath?: string;
  error?: string;
}

export const worktreeTemplateAPI = {
  // T049: Template storage operations
  saveTemplate: (template: WorktreeTemplate): Promise<SaveTemplateResponse> =>
    invoke<SaveTemplateResponse>('save_worktree_template', { template }),

  deleteTemplate: (templateId: string): Promise<DeleteTemplateResponse> =>
    invoke<DeleteTemplateResponse>('delete_worktree_template', { templateId }),

  listTemplates: (): Promise<ListTemplatesResponse> =>
    invoke<ListTemplatesResponse>('list_worktree_templates'),

  getDefaultTemplates: (): Promise<ListTemplatesResponse> =>
    invoke<ListTemplatesResponse>('get_default_worktree_templates'),

  getNextFeatureNumber: (projectPath: string): Promise<GetNextFeatureNumberResponse> =>
    invoke<GetNextFeatureNumberResponse>('get_next_feature_number', { projectPath }),

  // T050: Create worktree from template
  createWorktreeFromTemplate: (
    params: CreateWorktreeFromTemplateParams
  ): Promise<CreateWorktreeFromTemplateResponse> =>
    invoke<CreateWorktreeFromTemplateResponse>('create_worktree_from_template', { ...params }),
};

// ============================================================================
// IPA Commands (Phase 9 - US6)
// ============================================================================

// IPA types
export interface IpaMetadata {
  fileName: string;
  filePath: string;
  bundleId: string;
  version: string;
  build: string;
  displayName: string;
  deviceCapabilities: string;
  error?: string;
  fullPlist?: Record<string, unknown>;
  createdAt: string;
}

export interface CheckHasIpaFilesResponse {
  success: boolean;
  hasIpaFiles: boolean;
  count: number;
  error?: string;
}

export interface ScanProjectIpaResponse {
  success: boolean;
  results: IpaMetadata[];
  error?: string;
}

export const ipaAPI = {
  checkHasIpaFiles: (dirPath: string): Promise<CheckHasIpaFilesResponse> =>
    invoke<CheckHasIpaFilesResponse>('check_has_ipa_files', { dirPath }),

  scanProjectIpa: (dirPath: string): Promise<ScanProjectIpaResponse> =>
    invoke<ScanProjectIpaResponse>('scan_project_ipa', { dirPath }),
};

// ============================================================================
// APK Commands
// ============================================================================

// APK types
export interface ApkMetadata {
  fileName: string;
  filePath: string;
  packageName: string;
  versionName: string;
  versionCode: string;
  appName: string;
  minSdk: string;
  targetSdk: string;
  error?: string;
  createdAt: string;
  fileSize: number;
}

export interface CheckHasApkFilesResponse {
  success: boolean;
  hasApkFiles: boolean;
  count: number;
  error?: string;
}

export interface ScanProjectApkResponse {
  success: boolean;
  results: ApkMetadata[];
  error?: string;
}

export const apkAPI = {
  checkHasApkFiles: (dirPath: string): Promise<CheckHasApkFilesResponse> =>
    invoke<CheckHasApkFilesResponse>('check_has_apk_files', { dirPath }),

  scanProjectApk: (dirPath: string): Promise<ScanProjectApkResponse> =>
    invoke<ScanProjectApkResponse>('scan_project_apk', { dirPath }),
};

// ============================================================================
// Security Audit Commands (005-package-security-audit)
// ============================================================================

import type {
  VulnScanResult,
  VulnSeverity,
  ScanStatus,
  ScanError,
  VulnSummary,
  SecurityScanData,
} from '../types/security';

// Security API types
export type { VulnScanResult, VulnSeverity, ScanStatus, ScanError, VulnSummary, SecurityScanData };

export type PackageManagerType = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export interface DetectPackageManagerResponse {
  success: boolean;
  packageManager?: PackageManagerType;
  lockFile?: string;
  error?: string;
}

export interface CheckCliInstalledResponse {
  success: boolean;
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface RunSecurityAuditResponse {
  success: boolean;
  result?: VulnScanResult;
  error?: ScanError;
}

export interface GetSecurityScanResponse {
  success: boolean;
  data?: SecurityScanData;
  error?: string;
}

export interface SecurityScanSummary {
  projectId: string;
  projectName: string;
  projectPath: string;
  packageManager: PackageManagerType;
  lastScannedAt: string | null;
  summary: VulnSummary | null;
  status: ScanStatus;
}

export interface GetAllSecurityScansResponse {
  success: boolean;
  scans?: SecurityScanSummary[];
  error?: string;
}

export interface SaveSecurityScanResponse {
  success: boolean;
  error?: string;
}

// Security event payloads
export interface SecurityScanStartedPayload {
  projectId: string;
  packageManager: PackageManagerType;
}

export interface SecurityScanProgressPayload {
  projectId: string;
  stage: 'detecting' | 'auditing' | 'parsing';
  message: string;
}

export interface SecurityScanCompletedPayload {
  projectId: string;
  success: boolean;
  result?: VulnScanResult;
  error?: ScanError;
}

export const securityAPI = {
  detectPackageManager: (projectPath: string): Promise<DetectPackageManagerResponse> =>
    invoke<DetectPackageManagerResponse>('detect_package_manager', { projectPath }),

  checkCliInstalled: (packageManager: PackageManagerType): Promise<CheckCliInstalledResponse> =>
    invoke<CheckCliInstalledResponse>('check_cli_installed', { packageManager }),

  runSecurityAudit: (
    projectId: string,
    projectPath: string,
    packageManager?: PackageManagerType
  ): Promise<RunSecurityAuditResponse> =>
    invoke<RunSecurityAuditResponse>('run_security_audit', {
      projectId,
      projectPath,
      packageManager,
    }),

  getSecurityScan: (projectId: string): Promise<GetSecurityScanResponse> =>
    invoke<GetSecurityScanResponse>('get_security_scan', { projectId }),

  getAllSecurityScans: (): Promise<GetAllSecurityScansResponse> =>
    invoke<GetAllSecurityScansResponse>('get_all_security_scans'),

  saveSecurityScan: (
    projectId: string,
    result: VulnScanResult
  ): Promise<SaveSecurityScanResponse> =>
    invoke<SaveSecurityScanResponse>('save_security_scan', { projectId, result }),

  /** Snooze scan reminder for X hours (default: 24) */
  snoozeScanReminder: (
    projectId: string,
    snoozeDurationHours: number = 24
  ): Promise<SaveSecurityScanResponse> =>
    invoke<SaveSecurityScanResponse>('snooze_scan_reminder', {
      projectId,
      snoozeDurationHours,
    }),

  /** Dismiss scan reminder (clears snooze) */
  dismissScanReminder: (projectId: string): Promise<SaveSecurityScanResponse> =>
    invoke<SaveSecurityScanResponse>('dismiss_scan_reminder', { projectId }),
};

export const securityEvents = {
  onScanStarted: (
    callback: (data: SecurityScanStartedPayload) => void
  ): Promise<UnlistenFn> =>
    listen<SecurityScanStartedPayload>('security_scan_started', (event) =>
      callback(event.payload)
    ),

  onScanProgress: (
    callback: (data: SecurityScanProgressPayload) => void
  ): Promise<UnlistenFn> =>
    listen<SecurityScanProgressPayload>('security_scan_progress', (event) =>
      callback(event.payload)
    ),

  onScanCompleted: (
    callback: (data: SecurityScanCompletedPayload) => void
  ): Promise<UnlistenFn> =>
    listen<SecurityScanCompletedPayload>('security_scan_completed', (event) =>
      callback(event.payload)
    ),
};

// ============================================================================
// Version Management Commands (006-node-package-manager)
// ============================================================================

import type {
  VersionRequirement,
  SystemEnvironment,
  VersionCompatibility,
  VersionRequirementResponse,
  SystemEnvironmentResponse,
  VersionCompatibilityResponse,
} from '../types/version';

export type {
  VersionRequirement,
  SystemEnvironment,
  VersionCompatibility,
  VersionRequirementResponse,
  SystemEnvironmentResponse,
  VersionCompatibilityResponse,
};

export interface CommandWrapperResponse {
  success: boolean;
  command?: string;
  args?: string[];
  usingVersionManager: boolean;
  versionManager?: string;
  error?: string;
}

export const versionAPI = {
  /** Get version requirements from project's package.json */
  getVersionRequirement: (projectPath: string): Promise<VersionRequirementResponse> =>
    invoke<VersionRequirementResponse>('get_version_requirement', { projectPath }),

  /** Get system environment (installed Node.js, npm, yarn, pnpm, Volta, Corepack) */
  getSystemEnvironment: (): Promise<SystemEnvironmentResponse> =>
    invoke<SystemEnvironmentResponse>('get_system_environment'),

  /** Check version compatibility between project requirements and system environment */
  checkVersionCompatibility: (projectPath: string): Promise<VersionCompatibilityResponse> =>
    invoke<VersionCompatibilityResponse>('check_version_compatibility', { projectPath }),

  /** Get wrapped command for execution with proper version management (uses Volta if available) */
  getWrappedCommand: (
    projectPath: string,
    command: string,
    args: string[]
  ): Promise<CommandWrapperResponse> =>
    invoke<CommandWrapperResponse>('get_wrapped_command', { projectPath, command, args }),
};

// ============================================================================
// Settings Commands (Phase 4 - US7)
// ============================================================================

export const settingsAPI = {
  loadSettings: (): Promise<AppSettings> =>
    invoke<AppSettings>('load_settings'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    invoke('save_settings', { settings }),

  loadProjects: (): Promise<Project[]> =>
    invoke<Project[]>('load_projects'),

  saveProjects: (projects: Project[]): Promise<void> =>
    invoke('save_projects', { projects }),

  loadWorkflows: (): Promise<Workflow[]> =>
    invoke<Workflow[]>('load_workflows'),

  saveWorkflows: (workflows: Workflow[]): Promise<void> =>
    invoke('save_workflows', { workflows }),

  loadStoreData: (): Promise<StoreData> =>
    invoke<StoreData>('load_store_data'),

  // Store path management
  getStorePath: (): Promise<StorePathInfo> =>
    invoke<StorePathInfo>('get_store_path'),

  setStorePath: (newPath: string): Promise<StorePathInfo> =>
    invoke<StorePathInfo>('set_store_path', { newPath }),

  resetStorePath: (): Promise<StorePathInfo> =>
    invoke<StorePathInfo>('reset_store_path'),

  openStoreLocation: (): Promise<void> =>
    invoke('open_store_location'),
};

// ============================================================================
// Event Listeners
// ============================================================================

// Feature 013: Child execution event payloads
export interface ChildExecutionStartedPayload {
  parentExecutionId: string;
  parentNodeId: string;
  childExecutionId: string;
  childWorkflowId: string;
  childWorkflowName: string;
  startedAt: string;
}

export interface ChildExecutionProgressPayload {
  parentExecutionId: string;
  parentNodeId: string;
  childExecutionId: string;
  currentStep: number;
  totalSteps: number;
  currentNodeId: string;
  currentNodeName: string;
  timestamp: string;
}

export interface ChildExecutionCompletedPayload {
  parentExecutionId: string;
  parentNodeId: string;
  childExecutionId: string;
  childWorkflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  errorMessage?: string;
  finishedAt: string;
}

export const tauriEvents = {
  // Script events (Phase 6 - US3)
  onScriptOutput: (callback: (data: ScriptOutputPayload) => void): Promise<UnlistenFn> =>
    listen<ScriptOutputPayload>('script_output', (event) => callback(event.payload)),

  onScriptCompleted: (callback: (data: ScriptCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<ScriptCompletedPayload>('script_completed', (event) => callback(event.payload)),

  // Workflow events (Phase 7)
  onWorkflowNodeStarted: (callback: (data: NodeStartedPayload) => void): Promise<UnlistenFn> =>
    listen<NodeStartedPayload>('execution_node_started', (event) => callback(event.payload)),

  onWorkflowOutput: (callback: (data: ExecutionOutputPayload) => void): Promise<UnlistenFn> =>
    listen<ExecutionOutputPayload>('execution_output', (event) => callback(event.payload)),

  onWorkflowNodeCompleted: (callback: (data: NodeCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<NodeCompletedPayload>('execution_node_completed', (event) => callback(event.payload)),

  onWorkflowCompleted: (callback: (data: ExecutionCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<ExecutionCompletedPayload>('execution_completed', (event) => callback(event.payload)),

  onWorkflowPaused: (callback: (data: ExecutionPausedPayload) => void): Promise<UnlistenFn> =>
    listen<ExecutionPausedPayload>('execution_paused', (event) => callback(event.payload)),

  // Feature 013: Child execution events (T028-T030)
  onChildExecutionStarted: (callback: (data: ChildExecutionStartedPayload) => void): Promise<UnlistenFn> =>
    listen<ChildExecutionStartedPayload>('child_execution_started', (event) => callback(event.payload)),

  onChildExecutionProgress: (callback: (data: ChildExecutionProgressPayload) => void): Promise<UnlistenFn> =>
    listen<ChildExecutionProgressPayload>('child_execution_progress', (event) => callback(event.payload)),

  onChildExecutionCompleted: (callback: (data: ChildExecutionCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<ChildExecutionCompletedPayload>('child_execution_completed', (event) => callback(event.payload)),

  // File watcher events (package.json monitoring)
  onPackageJsonChanged: (callback: (data: PackageJsonChangedPayload) => void): Promise<UnlistenFn> =>
    listen<PackageJsonChangedPayload>('package-json-changed', (event) => callback(event.payload)),
};

// ============================================================================
// File Watcher Types and API (package.json monitoring)
// ============================================================================

export interface PackageJsonChangedPayload {
  project_path: string;
  file_path: string;
}

export interface FileWatcherResponse {
  success: boolean;
  error?: string;
}

export const fileWatcherAPI = {
  /** Start watching a project's package.json file for changes */
  watchProject: (projectPath: string): Promise<FileWatcherResponse> =>
    invoke<FileWatcherResponse>('watch_project', { projectPath }),

  /** Stop watching a project's package.json file */
  unwatchProject: (projectPath: string): Promise<FileWatcherResponse> =>
    invoke<FileWatcherResponse>('unwatch_project', { projectPath }),

  /** Stop watching all projects */
  unwatchAllProjects: (): Promise<FileWatcherResponse> =>
    invoke<FileWatcherResponse>('unwatch_all_projects'),

  /** Get list of currently watched project paths */
  getWatchedProjects: (): Promise<string[]> =>
    invoke<string[]>('get_watched_projects'),
};

// ============================================================================
// Unified API Export (for compatibility with existing hooks)
// ============================================================================

// ============================================================================
// Monorepo Commands (008-monorepo-support)
// ============================================================================

import type {
  MonorepoToolType,
  MonorepoToolInfo,
  DetectMonorepoToolsResponse,
  GetDependencyGraphParams,
  GetDependencyGraphResponse,
  GetNxTargetsResponse,
  GetTurboPipelinesResponse,
  RunNxCommandParams,
  RunNxCommandResponse,
  RunTurboCommandParams,
  RunTurboCommandResponse,
  GetTurboCacheStatusResponse,
  ClearTurboCacheResponse,
  GetNxCacheStatusResponse,
  ClearNxCacheResponse,
  RunBatchScriptsParams,
  RunBatchScriptsResponse,
  BatchProgressPayload,
  BatchCompletedPayload,
  NxTarget,
  TurboPipeline,
  TurboCacheStatus,
  NxCacheStatus,
  DependencyGraph,
} from '../types/monorepo';

export type {
  MonorepoToolType,
  MonorepoToolInfo,
  DetectMonorepoToolsResponse,
  GetDependencyGraphParams,
  GetDependencyGraphResponse,
  GetNxTargetsResponse,
  GetTurboPipelinesResponse,
  RunNxCommandParams,
  RunNxCommandResponse,
  RunTurboCommandParams,
  RunTurboCommandResponse,
  GetTurboCacheStatusResponse,
  ClearTurboCacheResponse,
  GetNxCacheStatusResponse,
  ClearNxCacheResponse,
  RunBatchScriptsParams,
  RunBatchScriptsResponse,
  BatchProgressPayload,
  BatchCompletedPayload,
  NxTarget,
  TurboPipeline,
  TurboCacheStatus,
  NxCacheStatus,
  DependencyGraph,
};

export const monorepoAPI = {
  /** Detect monorepo tools in the project (fast - no version checks) */
  detectTools: (projectPath: string): Promise<DetectMonorepoToolsResponse> =>
    invoke<DetectMonorepoToolsResponse>('detect_monorepo_tools', { projectPath }),

  /** Get tool version lazily (call when you need to display version) */
  getToolVersion: (projectPath: string, toolType: string): Promise<string | null> =>
    invoke<string | null>('get_tool_version', { projectPath, toolType }),

  /** Get dependency graph for the project */
  getDependencyGraph: (params: GetDependencyGraphParams): Promise<GetDependencyGraphResponse> =>
    invoke<GetDependencyGraphResponse>('get_dependency_graph', {
      projectPath: params.projectPath,
      tool: params.tool,
      includeAffected: params.includeAffected,
      base: params.base,
    }),

  /** Get Nx targets */
  getNxTargets: (projectPath: string): Promise<GetNxTargetsResponse> =>
    invoke<GetNxTargetsResponse>('get_nx_targets', { projectPath }),

  /** Get Turborepo pipelines */
  getTurboPipelines: (projectPath: string): Promise<GetTurboPipelinesResponse> =>
    invoke<GetTurboPipelinesResponse>('get_turbo_pipelines', { projectPath }),

  /** Run Nx command */
  runNxCommand: (params: RunNxCommandParams): Promise<RunNxCommandResponse> =>
    invoke<RunNxCommandResponse>('run_nx_command', {
      projectPath: params.projectPath,
      command: params.command,
      target: params.target,
      project: params.project,
      projects: params.projects,
      base: params.base,
      parallel: params.parallel,
    }),

  /** Run Turborepo command */
  runTurboCommand: (params: RunTurboCommandParams): Promise<RunTurboCommandResponse> =>
    invoke<RunTurboCommandResponse>('run_turbo_command', {
      projectPath: params.projectPath,
      task: params.task,
      filter: params.filter,
      force: params.force,
      dryRun: params.dryRun,
      concurrency: params.concurrency,
    }),

  /** Get Turborepo cache status */
  getTurboCacheStatus: (projectPath: string): Promise<GetTurboCacheStatusResponse> =>
    invoke<GetTurboCacheStatusResponse>('get_turbo_cache_status', { projectPath }),

  /** Clear Turborepo cache */
  clearTurboCache: (projectPath: string): Promise<ClearTurboCacheResponse> =>
    invoke<ClearTurboCacheResponse>('clear_turbo_cache', { projectPath }),

  /** Get Nx cache status */
  getNxCacheStatus: (projectPath: string): Promise<GetNxCacheStatusResponse> =>
    invoke<GetNxCacheStatusResponse>('get_nx_cache_status', { projectPath }),

  /** Clear Nx cache */
  clearNxCache: (projectPath: string): Promise<ClearNxCacheResponse> =>
    invoke<ClearNxCacheResponse>('clear_nx_cache', { projectPath }),

  /** Run scripts in batch across multiple packages */
  runBatchScripts: (params: RunBatchScriptsParams): Promise<RunBatchScriptsResponse> =>
    invoke<RunBatchScriptsResponse>('run_batch_scripts', {
      projectPath: params.projectPath,
      packages: params.packages,
      script: params.script,
      tool: params.tool,
      parallel: params.parallel,
      stopOnError: params.stopOnError,
    }),
};

export const monorepoEvents = {
  /** Listen for batch execution progress */
  onBatchProgress: (
    callback: (data: BatchProgressPayload) => void
  ): Promise<UnlistenFn> =>
    listen<BatchProgressPayload>('batch_progress', (event) =>
      callback(event.payload)
    ),

  /** Listen for batch execution completion */
  onBatchCompleted: (
    callback: (data: BatchCompletedPayload) => void
  ): Promise<UnlistenFn> =>
    listen<BatchCompletedPayload>('batch_completed', (event) =>
      callback(event.payload)
    ),
};

// ============================================================================
// Unified API Export (for compatibility with existing hooks)
// ============================================================================

// ============================================================================
// Git Commands (009-git-integration)
// ============================================================================

import type {
  GitStatus,
  GitFile,
  Branch,
  Commit,
  Stash,
  GetGitStatusResponse,
  StageFilesResponse,
  UnstageFilesResponse,
  CreateCommitResponse,
  GetBranchesResponse,
  CreateBranchResponse,
  SwitchBranchResponse,
  DeleteBranchResponse,
  GetCommitHistoryResponse,
  GitPushResponse,
  GitPullResponse,
  ListStashesResponse,
  CreateStashResponse,
  ApplyStashResponse,
  DropStashResponse,
  GitRemote,
  GetRemotesResponse,
  AddRemoteResponse,
  RemoveRemoteResponse,
  DiscardChangesResponse,
  GitFetchResponse,
  GitRebaseResponse,
  GitAuthStatus,
  GetGitAuthStatusResponse,
  TestRemoteConnectionResponse,
  // Diff types (010-git-diff-viewer)
  FileDiff,
  DiffHunk,
  DiffLine,
  GetFileDiffResponse,
} from '../types/git';

export type {
  GitStatus,
  GitFile,
  Branch,
  Commit,
  Stash,
  GetGitStatusResponse,
  StageFilesResponse,
  UnstageFilesResponse,
  CreateCommitResponse,
  GetBranchesResponse,
  CreateBranchResponse,
  SwitchBranchResponse,
  DeleteBranchResponse,
  GetCommitHistoryResponse,
  GitPushResponse,
  GitPullResponse,
  ListStashesResponse,
  CreateStashResponse,
  ApplyStashResponse,
  DropStashResponse,
  GitRemote,
  GetRemotesResponse,
  AddRemoteResponse,
  RemoveRemoteResponse,
  DiscardChangesResponse,
  GitFetchResponse,
  GitRebaseResponse,
  GitAuthStatus,
  GetGitAuthStatusResponse,
  TestRemoteConnectionResponse,
  // Diff types (010-git-diff-viewer)
  FileDiff,
  DiffHunk,
  DiffLine,
  GetFileDiffResponse,
};

export const gitAPI = {
  // US1: View Git Status
  getStatus: (projectPath: string): Promise<GetGitStatusResponse> =>
    invoke<GetGitStatusResponse>('get_git_status', { projectPath }),

  // US2: Stage and Commit
  stageFiles: (projectPath: string, files: string[]): Promise<StageFilesResponse> =>
    invoke<StageFilesResponse>('stage_files', { projectPath, files }),

  unstageFiles: (projectPath: string, files: string[]): Promise<UnstageFilesResponse> =>
    invoke<UnstageFilesResponse>('unstage_files', { projectPath, files }),

  createCommit: (
    projectPath: string,
    message: string,
    amendLast?: boolean
  ): Promise<CreateCommitResponse> =>
    invoke<CreateCommitResponse>('create_commit', { projectPath, message, amendLast }),

  // US3: Branch Management
  getBranches: (
    projectPath: string,
    includeRemote?: boolean
  ): Promise<GetBranchesResponse> =>
    invoke<GetBranchesResponse>('get_branches', { projectPath, includeRemote }),

  createBranch: (
    projectPath: string,
    branchName: string,
    checkout?: boolean
  ): Promise<CreateBranchResponse> =>
    invoke<CreateBranchResponse>('create_branch', { projectPath, branchName, checkout }),

  switchBranch: (
    projectPath: string,
    branchName: string,
    force?: boolean
  ): Promise<SwitchBranchResponse> =>
    invoke<SwitchBranchResponse>('switch_branch', { projectPath, branchName, force }),

  deleteBranch: (
    projectPath: string,
    branchName: string,
    force?: boolean
  ): Promise<DeleteBranchResponse> =>
    invoke<DeleteBranchResponse>('delete_branch', { projectPath, branchName, force }),

  // US4: Commit History
  getCommitHistory: (
    projectPath: string,
    skip?: number,
    limit?: number,
    branch?: string
  ): Promise<GetCommitHistoryResponse> =>
    invoke<GetCommitHistoryResponse>('get_commit_history', {
      projectPath,
      skip,
      limit,
      branch,
    }),

  // US5: Push and Pull
  push: (
    projectPath: string,
    options?: {
      remote?: string;
      branch?: string;
      setUpstream?: boolean;
      force?: boolean;
    }
  ): Promise<GitPushResponse> =>
    invoke<GitPushResponse>('git_push', {
      projectPath,
      remote: options?.remote,
      branch: options?.branch,
      setUpstream: options?.setUpstream,
      force: options?.force,
    }),

  pull: (
    projectPath: string,
    options?: {
      remote?: string;
      branch?: string;
      rebase?: boolean;
    }
  ): Promise<GitPullResponse> =>
    invoke<GitPullResponse>('git_pull', {
      projectPath,
      remote: options?.remote,
      branch: options?.branch,
      rebase: options?.rebase,
    }),

  // US6: Stash Management
  listStashes: (projectPath: string): Promise<ListStashesResponse> =>
    invoke<ListStashesResponse>('list_stashes', { projectPath }),

  createStash: (
    projectPath: string,
    message?: string,
    includeUntracked?: boolean
  ): Promise<CreateStashResponse> =>
    invoke<CreateStashResponse>('create_stash', { projectPath, message, includeUntracked }),

  applyStash: (
    projectPath: string,
    index?: number,
    pop?: boolean
  ): Promise<ApplyStashResponse> =>
    invoke<ApplyStashResponse>('apply_stash', { projectPath, index, pop }),

  dropStash: (projectPath: string, index?: number): Promise<DropStashResponse> =>
    invoke<DropStashResponse>('drop_stash', { projectPath, index }),

  // Remote Management
  getRemotes: (projectPath: string): Promise<GetRemotesResponse> =>
    invoke<GetRemotesResponse>('get_remotes', { projectPath }),

  addRemote: (projectPath: string, name: string, url: string): Promise<AddRemoteResponse> =>
    invoke<AddRemoteResponse>('add_remote', { projectPath, name, url }),

  removeRemote: (projectPath: string, name: string): Promise<RemoveRemoteResponse> =>
    invoke<RemoveRemoteResponse>('remove_remote', { projectPath, name }),

  // Discard Changes
  discardChanges: (projectPath: string, files: string[]): Promise<DiscardChangesResponse> =>
    invoke<DiscardChangesResponse>('discard_changes', { projectPath, files }),

  cleanUntracked: (
    projectPath: string,
    files: string[],
    includeDirectories?: boolean
  ): Promise<DiscardChangesResponse> =>
    invoke<DiscardChangesResponse>('clean_untracked', {
      projectPath,
      files,
      includeDirectories,
    }),

  // Fetch
  fetch: (
    projectPath: string,
    options?: {
      remote?: string;
      allRemotes?: boolean;
      prune?: boolean;
    }
  ): Promise<GitFetchResponse> =>
    invoke<GitFetchResponse>('git_fetch', {
      projectPath,
      remote: options?.remote,
      allRemotes: options?.allRemotes,
      prune: options?.prune,
    }),

  // Rebase
  rebase: (projectPath: string, onto: string): Promise<GitRebaseResponse> =>
    invoke<GitRebaseResponse>('git_rebase', { projectPath, onto }),

  rebaseAbort: (projectPath: string): Promise<GitRebaseResponse> =>
    invoke<GitRebaseResponse>('git_rebase_abort', { projectPath }),

  rebaseContinue: (projectPath: string): Promise<GitRebaseResponse> =>
    invoke<GitRebaseResponse>('git_rebase_continue', { projectPath }),

  // Authentication
  getAuthStatus: (projectPath: string): Promise<GetGitAuthStatusResponse> =>
    invoke<GetGitAuthStatusResponse>('get_git_auth_status', { projectPath }),

  testRemoteConnection: (
    projectPath: string,
    remoteName: string
  ): Promise<TestRemoteConnectionResponse> =>
    invoke<TestRemoteConnectionResponse>('test_remote_connection', { projectPath, remoteName }),

  // Diff Viewer (010-git-diff-viewer)
  getFileDiff: (
    projectPath: string,
    filePath: string,
    staged: boolean
  ): Promise<GetFileDiffResponse> =>
    invoke<GetFileDiffResponse>('get_file_diff', { projectPath, filePath, staged }),
};

// ============================================================================
// Custom Step Template Commands (011-workflow-step-templates)
// ============================================================================

/** Template category identifiers */
export type StepTemplateCategory =
  | 'package-manager'
  | 'git'
  | 'docker'
  | 'shell'
  | 'testing'
  | 'code-quality'
  | 'custom';

/** Custom step template saved by user */
export interface CustomStepTemplate {
  id: string;
  name: string;
  command: string;
  category: StepTemplateCategory;
  description?: string;
  isCustom: boolean;
  createdAt: string;
}

export interface ListCustomTemplatesResponse {
  success: boolean;
  templates?: CustomStepTemplate[];
  error?: string;
}

export interface CustomTemplateResponse {
  success: boolean;
  template?: CustomStepTemplate;
  error?: string;
}

export const stepTemplateAPI = {
  /** Load all custom step templates */
  loadCustomTemplates: (): Promise<ListCustomTemplatesResponse> =>
    invoke<ListCustomTemplatesResponse>('load_custom_step_templates'),

  /** Save a custom step template */
  saveCustomTemplate: (template: CustomStepTemplate): Promise<CustomTemplateResponse> =>
    invoke<CustomTemplateResponse>('save_custom_step_template', { template }),

  /** Delete a custom step template */
  deleteCustomTemplate: (templateId: string): Promise<CustomTemplateResponse> =>
    invoke<CustomTemplateResponse>('delete_custom_step_template', { templateId }),
};

// ============================================================================
// Incoming Webhook API
// ============================================================================

import type {
  IncomingWebhookConfig,
  IncomingWebhookServerSettings,
  IncomingWebhookServerStatus,
} from '../types/incoming-webhook';

export const incomingWebhookAPI = {
  /** Generate a new API token */
  generateToken: (): Promise<string> =>
    invoke<string>('generate_incoming_webhook_token'),

  /** Get incoming webhook server status */
  getServerStatus: (): Promise<IncomingWebhookServerStatus> =>
    invoke<IncomingWebhookServerStatus>('get_incoming_webhook_status'),

  /** Get incoming webhook server settings */
  getServerSettings: (): Promise<IncomingWebhookServerSettings> =>
    invoke<IncomingWebhookServerSettings>('get_incoming_webhook_settings'),

  /** Save incoming webhook server settings */
  saveServerSettings: (settings: IncomingWebhookServerSettings): Promise<void> =>
    invoke('save_incoming_webhook_settings', { settings }),

  /** Create a new incoming webhook config with fresh token */
  createConfig: (): Promise<IncomingWebhookConfig> =>
    invoke<IncomingWebhookConfig>('create_incoming_webhook_config'),

  /** Regenerate token for an existing config */
  regenerateToken: (config: IncomingWebhookConfig): Promise<IncomingWebhookConfig> =>
    invoke<IncomingWebhookConfig>('regenerate_incoming_webhook_token', { config }),

  /** Check if a port is available */
  checkPortAvailable: (port: number): Promise<'Available' | 'InUseByWebhook' | 'InUseByOther'> =>
    invoke<'Available' | 'InUseByWebhook' | 'InUseByOther'>('check_port_available', { port }),
};

// ============================================================================
// Deploy API (015-one-click-deploy)
// ============================================================================

import type {
  PlatformType,
  DeploymentEnvironment,
  DeploymentStatus,
  EnvVariable,
  ConnectedPlatform,
  DeploymentConfig,
  Deployment,
  OAuthFlowResult,
  DeploymentStatusEvent,
  // 016-multi-deploy-accounts
  DeployAccount,
  DeployPreferences,
  RemoveAccountResult,
} from '../types/deploy';

export type {
  PlatformType,
  DeploymentEnvironment,
  DeploymentStatus,
  EnvVariable,
  ConnectedPlatform,
  DeploymentConfig,
  Deployment,
  OAuthFlowResult,
  DeploymentStatusEvent,
  // 016-multi-deploy-accounts
  DeployAccount,
  DeployPreferences,
  RemoveAccountResult,
};

export const deployAPI = {
  // OAuth (Legacy)
  startOAuthFlow: (platform: PlatformType): Promise<OAuthFlowResult> =>
    invoke<OAuthFlowResult>('start_oauth_flow', { platform }),

  getConnectedPlatforms: (): Promise<ConnectedPlatform[]> =>
    invoke<ConnectedPlatform[]>('get_connected_platforms'),

  disconnectPlatform: (platform: PlatformType): Promise<void> =>
    invoke('disconnect_platform', { platform }),

  // Deployment
  startDeployment: (projectId: string, projectPath: string, config: DeploymentConfig): Promise<Deployment> =>
    invoke<Deployment>('start_deployment', { projectId, projectPath, config }),

  getDeploymentHistory: (projectId: string): Promise<Deployment[]> =>
    invoke<Deployment[]>('get_deployment_history', { projectId }),

  getDeploymentConfig: (projectId: string): Promise<DeploymentConfig | null> =>
    invoke<DeploymentConfig | null>('get_deployment_config', { projectId }),

  saveDeploymentConfig: (config: DeploymentConfig): Promise<void> =>
    invoke('save_deployment_config', { config }),

  detectFramework: (projectPath: string): Promise<string | null> =>
    invoke<string | null>('detect_framework', { projectPath }),

  redeploy: (projectId: string, projectPath: string): Promise<Deployment> =>
    invoke<Deployment>('redeploy', { projectId, projectPath }),

  // ============================================================================
  // T012-T014: Multi Deploy Accounts API (016-multi-deploy-accounts)
  // ============================================================================

  // T012: Account Management
  /** Get all deploy accounts (sanitized - no tokens) */
  getDeployAccounts: (): Promise<DeployAccount[]> =>
    invoke<DeployAccount[]>('get_deploy_accounts'),

  /** Get accounts filtered by platform */
  getAccountsByPlatform: (platform: PlatformType): Promise<DeployAccount[]> =>
    invoke<DeployAccount[]>('get_accounts_by_platform', { platform }),

  /** Add a new deploy account via OAuth */
  addDeployAccount: (platform: PlatformType): Promise<OAuthFlowResult> =>
    invoke<OAuthFlowResult>('add_deploy_account', { platform }),

  /** Remove a deploy account */
  removeDeployAccount: (accountId: string, force?: boolean): Promise<RemoveAccountResult> =>
    invoke<RemoveAccountResult>('remove_deploy_account', { accountId, force }),

  /** Update deploy account (display name) */
  updateDeployAccount: (accountId: string, displayName?: string): Promise<DeployAccount> =>
    invoke<DeployAccount>('update_deploy_account', { accountId, displayName }),

  // T013: Project Binding
  /** Bind a project to a specific deploy account */
  bindProjectAccount: (projectId: string, accountId: string): Promise<DeploymentConfig> =>
    invoke<DeploymentConfig>('bind_project_account', { projectId, accountId }),

  /** Unbind a project from its deploy account */
  unbindProjectAccount: (projectId: string): Promise<DeploymentConfig> =>
    invoke<DeploymentConfig>('unbind_project_account', { projectId }),

  /** Get the account bound to a project */
  getProjectBinding: (projectId: string): Promise<DeployAccount | null> =>
    invoke<DeployAccount | null>('get_project_binding', { projectId }),

  // T014: Preferences
  /** Get deploy preferences (default accounts) */
  getDeployPreferences: (): Promise<DeployPreferences> =>
    invoke<DeployPreferences>('get_deploy_preferences'),

  /** Set default account for a platform */
  setDefaultAccount: (platform: PlatformType, accountId?: string): Promise<DeployPreferences> =>
    invoke<DeployPreferences>('set_default_account', { platform, accountId }),
};

export const deployEvents = {
  onDeploymentStatus: (
    callback: (event: DeploymentStatusEvent) => void
  ): Promise<UnlistenFn> =>
    listen<DeploymentStatusEvent>('deployment:status', (e) =>
      callback(e.payload)
    ),
};

// ============================================================================
// Keyboard Shortcuts API
// ============================================================================

import type { KeyboardShortcutsSettings } from '../types/shortcuts';

export const shortcutsAPI = {
  /** Load keyboard shortcuts settings */
  loadSettings: (): Promise<KeyboardShortcutsSettings> =>
    invoke<KeyboardShortcutsSettings>('load_keyboard_shortcuts'),

  /** Save keyboard shortcuts settings */
  saveSettings: (settings: KeyboardShortcutsSettings): Promise<void> =>
    invoke('save_keyboard_shortcuts', { settings }),

  /** Register global shortcut for toggling window visibility */
  registerGlobalToggle: (shortcutKey: string): Promise<void> =>
    invoke('register_global_toggle_shortcut', { shortcutKey }),

  /** Unregister all global shortcuts */
  unregisterGlobal: (): Promise<void> =>
    invoke('unregister_global_shortcuts'),

  /** Toggle window visibility */
  toggleWindowVisibility: (): Promise<boolean> =>
    invoke<boolean>('toggle_window_visibility'),

  /** Get all registered global shortcuts */
  getRegisteredShortcuts: (): Promise<string[]> =>
    invoke<string[]>('get_registered_shortcuts'),

  /** Check if a shortcut is registered */
  isShortcutRegistered: (shortcutKey: string): Promise<boolean> =>
    invoke<boolean>('is_shortcut_registered', { shortcutKey }),
};

export const shortcutsEvents = {
  /** Listen for global shortcut triggered events */
  onGlobalShortcutTriggered: (callback: (action: string) => void): Promise<UnlistenFn> =>
    listen<string>('global-shortcut-triggered', (event) => callback(event.payload)),
};

export const tauriAPI = {
  ...projectAPI,
  ...scriptAPI,
  ...workflowAPI,
  ...worktreeAPI,
  ...ipaAPI,
  ...securityAPI,
  ...versionAPI,
  ...settingsAPI,
  ...monorepoAPI,
  ...gitAPI,
  ...stepTemplateAPI,
  ...shortcutsAPI,
  ...deployAPI,
};
