/**
 * PackageFlow Type Definitions
 */
export type {
  Workflow,
  WorkflowNode,
  ScriptNodeConfig,
  NodePosition,
  Execution,
  ExecutionStatus,
  NodeResult,
  NodeStatus,
  WorkflowStore,
  UserSettings,
  NodeStartedEvent,
  OutputEvent,
  NodeCompletedEvent,
  ExecutionCompletedEvent,
  ExecutionPausedEvent,
  LoadAllResponse,
  SaveResponse,
  DeleteResponse,
  ExecuteResponse,
  CancelResponse,
  ContinueResponse,
  RunningExecution,
  GetRunningResponse,
  RestoreRunningResponse,
  KillProcessResponse,
  WorkflowAPI,
} from './workflow';

export type {
  Project,
  PackageManager,
  WorkspacePackage,
  ScriptCategory,
  CategorizedScript,
  Worktree,
  ScanProjectResponse,
  LoadProjectsResponse,
  SaveProjectResponse,
  RemoveProjectResponse,
  RefreshProjectResponse,
  ExecuteScriptParams,
  ExecuteScriptResponse,
  ExecuteCommandParams,
  ExecuteCommandResponse,
  ScriptOutputEvent,
  ScriptCompletedEvent,
  CancelScriptResponse,
  ListWorktreesResponse,
  AddWorktreeParams,
  AddWorktreeResponse,
  RemoveWorktreeParams,
  RemoveWorktreeResponse,
  IsGitRepoResponse,
  ListBranchesResponse,
  OpenTerminalWindowResponse,
} from './project';

export type {
  WorktreeSession,
  WorktreeSessionStatus,
  SessionChecklistItem,
  ResumeAction,
  ResumeActionType,
  ResumeActionResult,
  ResumeActionResultStatus,
  ResumeSessionResult,
  ResumeSessionStatus,
} from './worktree-sessions';

export type {
  AppSettings,
  StoreData,
  ScriptOutputPayload,
  ScriptCompletedPayload,
  NodeStartedPayload,
  ExecutionOutputPayload,
  NodeCompletedPayload,
  ExecutionCompletedPayload,
  ExecutionPausedPayload,
  IpaScanProgressPayload,
} from './tauri';

export type {
  VulnScanResult,
  VulnSummary,
  VulnItem,
  VulnFixInfo,
  VulnSeverity,
  ScanStatus,
  ScanError,
  ScanErrorCode,
  PackageManagerType,
  SeverityFilterState,
  ProjectSecurityState,
  SecurityScanData,
  DependencyCount,
  CvssInfo,
} from './security';

export interface IpaResult {
  fileName: string;
  filePath: string;
  bundleId: string;
  version: string;
  build: string;
  displayName: string;
  deviceCapabilities: string;
  error: string | null;
  fullPlist: Record<string, unknown> | null;
  createdAt: string;
}

export interface ColumnConfig {
  key: keyof IpaResult | 'error';
  label: string;
  fullKey?: string;
  isReadOnly?: boolean;
  isStatus?: boolean;
}

export interface SigningIdentity {
  hash: string;
  name: string;
}

export interface ModalData {
  rowIndex: number;
  colIndex: number;
  column: ColumnConfig;
  result: IpaResult;
  value: string;
  isReadOnly: boolean;
  plistKey?: string;
}

export interface CheckHasIpaFilesResponse {
  success: boolean;
  hasIpaFiles: boolean;
  count: number;
}

export interface ScanProjectIpaResponse {
  success: boolean;
  results: IpaResult[];
  error?: string;
}

export interface KillAllNodeProcessesResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export type {
  MonorepoToolType,
  MonorepoToolInfo,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  NxTarget,
  NxConfig,
  TurboPipeline,
  TurboConfig,
  TurboPipelineConfig,
  TurboCacheStatus,
  BatchExecutionParams,
  BatchExecutionResult,
  DetectMonorepoToolsParams,
  DetectMonorepoToolsResponse,
  GetDependencyGraphParams,
  GetDependencyGraphResponse,
  GetNxTargetsParams,
  GetNxTargetsResponse,
  GetTurboPipelinesParams,
  GetTurboPipelinesResponse,
  RunNxCommandParams,
  RunNxCommandResponse,
  RunTurboCommandParams,
  RunTurboCommandResponse,
  GetTurboCacheStatusParams,
  GetTurboCacheStatusResponse,
  ClearTurboCacheParams,
  ClearTurboCacheResponse,
  RunBatchScriptsParams,
  RunBatchScriptsResponse,
  BatchProgressPayload,
  BatchCompletedPayload,
} from './monorepo';

export { MonorepoErrorMessages } from './monorepo';

export type {
  LockfileType,
  SnapshotStatus,
  DependencyChangeType,
  InsightType,
  InsightSeverity,
  SnapshotDependency,
  ExecutionSnapshot,
  SnapshotListItem,
  SnapshotWithDependencies,
  PostinstallEntry,
  TyposquattingAlert,
  IntegrityIssue,
  SecurityContext,
  SecurityInsight,
  InsightSummary,
  DependencyChange,
  PostinstallChange,
  DiffSummary,
  SnapshotDiff,
  CreateSnapshotRequest,
  SnapshotFilter,
  SnapshotStorageStats,
  FrequentUpdater,
  HealthFactor,
  DependencyHealth,
  SnapshotCapturedEvent,
} from './snapshot';
