/**
 * Background Process Types
 * Feature: AI Assistant Background Process Management
 *
 * Types for managing long-running background processes started by AI Assistant
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Status of a background process
 */
export type BackgroundProcessStatus =
  | 'starting'  // Process is being spawned
  | 'running'   // Process is actively running
  | 'stopped'   // Process was manually stopped
  | 'failed'    // Process exited with error
  | 'completed'; // Process completed successfully

/**
 * Output stream type
 */
export type OutputStreamType = 'stdout' | 'stderr';

/**
 * Single line of output from process
 */
export interface ProcessOutputLine {
  /** Unique ID for virtualized list */
  id: string;
  /** Output content */
  content: string;
  /** Stream type (stdout/stderr) */
  stream: OutputStreamType;
  /** Timestamp when received */
  timestamp: number;
}

/**
 * Background process entity
 */
export interface BackgroundProcess {
  /** Unique process identifier */
  id: string;
  /** Display name (e.g., script name) */
  name: string;
  /** Full command being executed */
  command: string;
  /** Working directory */
  cwd: string;
  /** Project path (for context) */
  projectPath: string;
  /** Project name for display */
  projectName?: string;
  /** Current status */
  status: BackgroundProcessStatus;
  /** Process ID (from OS) */
  pid?: number;
  /** Exit code (when stopped/failed/completed) */
  exitCode?: number;
  /** Start timestamp (Unix ms) */
  startedAt: number;
  /** End timestamp (Unix ms) */
  endedAt?: number;
  /** Detected port (if applicable) */
  port?: number;
  /** Output lines (limited buffer) */
  outputLines: ProcessOutputLine[];
  /** Total output line count (may exceed buffer) */
  totalLineCount: number;
  /** Whether output is being auto-scrolled */
  autoScroll: boolean;
  /** Associated conversation ID (if started from AI chat) */
  conversationId?: string;
  /** Associated message ID (if started from AI chat) */
  messageId?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Process output event payload
 */
export interface ProcessOutputPayload {
  processId: string;
  content: string;
  stream: OutputStreamType;
  timestamp: number;
}

/**
 * Process status change event payload
 */
export interface ProcessStatusPayload {
  processId: string;
  status: BackgroundProcessStatus;
  exitCode?: number;
  timestamp: number;
}

/**
 * Process spawn request
 */
export interface SpawnProcessRequest {
  /** Display name for the process */
  name: string;
  /** Command to execute */
  command: string;
  /** Command arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Project path for context */
  projectPath: string;
  /** Project name for display */
  projectName?: string;
  /** Associated conversation ID */
  conversationId?: string;
  /** Associated message ID */
  messageId?: string;
  /** Environment variables to add */
  env?: Record<string, string>;
}

/**
 * Process spawn response
 */
export interface SpawnProcessResponse {
  success: boolean;
  processId?: string;
  error?: string;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Panel expansion state
 */
export type PanelState = 'collapsed' | 'expanded' | 'maximized';

/**
 * Output dialog state
 */
export interface OutputDialogState {
  isOpen: boolean;
  processId: string | null;
}

/**
 * Background process panel state
 */
export interface BackgroundProcessPanelState {
  /** Panel expansion state */
  panelState: PanelState;
  /** Currently selected process ID */
  selectedProcessId: string | null;
  /** Output dialog state */
  outputDialog: OutputDialogState;
}

// ============================================================================
// Hook Return Type
// ============================================================================

/**
 * Return type for useBackgroundProcesses hook
 */
export interface UseBackgroundProcessesReturn {
  // State
  processes: Map<string, BackgroundProcess>;
  selectedProcessId: string | null;
  panelState: PanelState;

  // Actions
  spawnProcess: (request: SpawnProcessRequest) => Promise<string | null>;
  stopProcess: (processId: string) => Promise<boolean>;
  stopAllProcesses: () => Promise<void>;
  selectProcess: (processId: string | null) => void;
  removeProcess: (processId: string) => void;
  clearCompletedProcesses: () => void;
  toggleAutoScroll: (processId: string) => void;

  // Panel state
  setPanelState: (state: PanelState) => void;
  expandPanel: () => void;
  collapsePanel: () => void;

  // Computed
  runningCount: number;
  hasRunningProcesses: boolean;
  getProcessById: (id: string) => BackgroundProcess | undefined;
  getProcessByMessageId: (messageId: string) => BackgroundProcess | undefined;
}
