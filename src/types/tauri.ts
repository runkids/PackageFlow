// TypeScript types matching Rust models
// These types are used for Tauri IPC communication

import type { WorktreeSession } from './worktree-sessions';

// ============================================================================
// Package Manager
// ============================================================================

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'unknown';

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  path: string;
  name: string;
  version: string;
  description?: string;
  isMonorepo: boolean;
  packageManager: PackageManager;
  scripts: Record<string, string>;
  worktreeSessions?: WorktreeSession[];
  createdAt: string;
  lastOpenedAt: string;
}

export interface WorkspacePackage {
  name: string;
  relativePath: string;
  absolutePath: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: string[];
}

// ============================================================================
// Workflow Types
// ============================================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
  nodes: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  config: ScriptNodeConfig;
  order: number;
  position?: NodePosition;
}

export interface ScriptNodeConfig {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

// ============================================================================
// Execution Types
// ============================================================================

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  nodeResults: NodeResult[];
}

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output: string;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
}

// ============================================================================
// Worktree Types
// ============================================================================

export interface Worktree {
  path: string;
  branch?: string;
  head: string;
  isMain: boolean;
  isBare?: boolean;
  isDetached?: boolean;
}

// ============================================================================
// IPA Types
// ============================================================================

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

// ============================================================================
// Settings Types
// ============================================================================

export type ProjectSortMode = 'name' | 'lastOpened' | 'created' | 'custom';
export type WorkflowSortMode = 'name' | 'updated' | 'created' | 'custom';
/** Path display format: "short" shows ~/..., "full" shows complete path */
export type PathDisplayFormat = 'short' | 'full';

export interface AppSettings {
  defaultTimeout: number;
  sidebarWidth: number;
  terminalHeight: number;
  theme: string;
  lastWorkflowId?: string;
  lastProjectId?: string;
  projectSortMode?: ProjectSortMode;
  projectOrder?: string[];
  /** Whether to show desktop notifications for webhook events (default: true) */
  webhookNotificationsEnabled?: boolean;
  workflowSortMode?: WorkflowSortMode;
  workflowOrder?: string[];
  /** Custom store path for packageflow.json (undefined = use default app data directory) */
  customStorePath?: string;
  /** Keyboard shortcuts settings (for export/import) */
  keyboardShortcuts?: import('./shortcuts').KeyboardShortcutsSettings;
  /** Path display format: "short" (default, shows ~/) or "full" (complete path) */
  pathDisplayFormat?: PathDisplayFormat;
}

export interface StoreData {
  version: string;
  projects: Project[];
  workflows: Workflow[];
  runningExecutions: Record<string, Execution>;
  settings: AppSettings;
}

// ============================================================================
// Event Payload Types
// ============================================================================

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

export interface NodeStartedPayload {
  executionId: string;
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
  nodeId: string;
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface NodeCompletedPayload {
  executionId: string;
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped' | 'cancelled';
  exitCode: number | null;
  errorMessage: string | null;
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
  reason: 'user_requested' | 'node_failed';
}

export interface IpaScanProgressPayload {
  current: number;
  total: number;
  fileName: string;
}

// ============================================================================
// Store Path Types
// ============================================================================

export interface StorePathInfo {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
}
