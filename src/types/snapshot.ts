// Time Machine - Snapshot Types
// TypeScript interfaces matching Rust models

// =========================================================================
// Enums
// =========================================================================

export type LockfileType = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type SnapshotStatus = 'capturing' | 'completed' | 'failed';

export type DependencyChangeType = 'added' | 'removed' | 'updated' | 'unchanged';

export type InsightType =
  | 'new_dependency'
  | 'removed_dependency'
  | 'version_change'
  | 'postinstall_added'
  | 'postinstall_removed'
  | 'postinstall_changed'
  | 'integrity_mismatch'
  | 'typosquatting_suspect'
  | 'frequent_updater'
  | 'suspicious_script';

export type InsightSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// =========================================================================
// Core Snapshot Types
// =========================================================================

export interface SnapshotDependency {
  id?: number;
  snapshotId: string;
  name: string;
  version: string;
  isDirect: boolean;
  isDev: boolean;
  hasPostinstall: boolean;
  postinstallScript?: string;
  integrityHash?: string;
  resolvedUrl?: string;
}

export interface ExecutionSnapshot {
  id: string;
  workflowId: string;
  executionId: string;
  projectPath: string;
  status: SnapshotStatus;
  lockfileType?: LockfileType;
  lockfileHash?: string;
  dependencyTreeHash?: string;
  packageJsonHash?: string;
  totalDependencies: number;
  directDependencies: number;
  devDependencies: number;
  securityScore?: number;
  postinstallCount: number;
  storagePath?: string;
  compressedSize?: number;
  executionDurationMs?: number;
  errorMessage?: string;
  createdAt: string;
}

export interface SnapshotListItem {
  id: string;
  workflowId: string;
  executionId: string;
  status: SnapshotStatus;
  lockfileType?: LockfileType;
  totalDependencies: number;
  securityScore?: number;
  postinstallCount: number;
  createdAt: string;
}

export interface SnapshotWithDependencies {
  snapshot: ExecutionSnapshot;
  dependencies: SnapshotDependency[];
}

// =========================================================================
// Security Types
// =========================================================================

export interface PostinstallEntry {
  packageName: string;
  version: string;
  script: string;
  scriptHash: string;
}

export interface TyposquattingAlert {
  packageName: string;
  similarTo: string;
  distance: number;
  confidence: number;
}

export interface IntegrityIssue {
  packageName: string;
  version: string;
  expectedHash?: string;
  actualHash?: string;
  issueType: string;
}

export interface SecurityContext {
  postinstallScripts: PostinstallEntry[];
  typosquattingSuspects: TyposquattingAlert[];
  integrityIssues: IntegrityIssue[];
}

export interface SecurityInsight {
  id: string;
  snapshotId: string;
  insightType: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  packageName?: string;
  previousValue?: string;
  currentValue?: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
  isDismissed: boolean;
  createdAt: string;
}

export interface InsightSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  dismissed: number;
}

// =========================================================================
// Diff Types
// =========================================================================

export interface DependencyChange {
  name: string;
  changeType: DependencyChangeType;
  oldVersion?: string;
  newVersion?: string;
  isDirect: boolean;
  isDev: boolean;
  postinstallChanged: boolean;
  oldPostinstall?: string;
  newPostinstall?: string;
}

export interface PostinstallChange {
  packageName: string;
  changeType: DependencyChangeType;
  oldScript?: string;
  newScript?: string;
}

export interface DiffSummary {
  addedCount: number;
  removedCount: number;
  updatedCount: number;
  unchangedCount: number;
  postinstallAdded: number;
  postinstallRemoved: number;
  postinstallChanged: number;
  securityScoreChange?: number;
}

export interface TimingDiff {
  oldDurationMs?: number;
  newDurationMs?: number;
  diffMs?: number;
  diffPercentage?: number;
}

export interface SnapshotDiff {
  snapshotAId: string;
  snapshotBId: string;
  summary: DiffSummary;
  timing: TimingDiff;
  dependencyChanges: DependencyChange[];
  postinstallChanges: PostinstallChange[];
  lockfileTypeChanged: boolean;
  oldLockfileType?: LockfileType;
  newLockfileType?: LockfileType;
}

// =========================================================================
// Request/Response Types
// =========================================================================

export interface CreateSnapshotRequest {
  workflowId: string;
  executionId: string;
  projectPath: string;
}

export interface SnapshotFilter {
  workflowId?: string;
  projectPath?: string;
  status?: SnapshotStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface SnapshotStorageStats {
  totalSnapshots: number;
  totalSizeBytes: number;
  totalSizeHuman: string;
}

// =========================================================================
// Health Types
// =========================================================================

export interface FrequentUpdater {
  packageName: string;
  updateCount: number;
  timeSpanDays: number;
  versions: string[];
}

export interface HealthFactor {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface DependencyHealth {
  packageName: string;
  version: string;
  healthScore: number;
  factors: HealthFactor[];
}

// =========================================================================
// Event Types
// =========================================================================

export interface SnapshotCapturedEvent {
  workflowId: string;
  executionId: string;
  snapshotId: string;
  status: 'completed' | 'failed';
  totalDependencies: number;
  securityScore: number | null;
  capturedAt: string;
  errorMessage: string | null;
}

// =========================================================================
// AI Analysis Types
// =========================================================================

export interface AIAnalysisRequest {
  baseSnapshotId: string;
  compareSnapshotId: string;
  providerId?: string;
  focusOnSecurity?: boolean;
}

export interface AIAnalysisResult {
  analysis: string;
  tokensUsed?: number;
  isTruncated: boolean;
  cached: boolean;
}

export interface AIAnalysisResponse {
  success: boolean;
  data?: AIAnalysisResult;
  error?: string;
}
