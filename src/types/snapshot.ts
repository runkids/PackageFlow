// Time Machine - Snapshot Types
// TypeScript interfaces matching Rust models

// =========================================================================
// Enums
// =========================================================================

export type LockfileType = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type SnapshotStatus = 'capturing' | 'completed' | 'failed';

/** Trigger source for snapshots - Feature 025 redesign */
export type TriggerSource = 'lockfile_change' | 'manual';

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
  | 'suspicious_script'
  // Lockfile validation types (v7)
  | 'insecure_protocol'
  | 'unexpected_registry'
  | 'manifest_mismatch'
  | 'blocked_package'
  | 'missing_integrity'
  | 'scope_confusion'
  | 'homoglyph_suspect';

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
  projectPath: string;
  status: SnapshotStatus;
  /** Trigger source: lockfile_change (auto) or manual - Feature 025 */
  triggerSource: TriggerSource;
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
  errorMessage?: string;
  createdAt: string;
}

export interface SnapshotListItem {
  id: string;
  projectPath: string;
  status: SnapshotStatus;
  /** Trigger source: lockfile_change (auto) or manual - Feature 025 */
  triggerSource: TriggerSource;
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

export interface SnapshotDiff {
  snapshotAId: string;
  snapshotBId: string;
  summary: DiffSummary;
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
  projectPath: string;
  triggerSource?: TriggerSource;
}

export interface SnapshotFilter {
  projectPath?: string;
  triggerSource?: TriggerSource;
  status?: SnapshotStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// =========================================================================
// Time Machine Settings Types - Feature 025
// =========================================================================

/** Lockfile watcher state for a project */
export interface LockfileState {
  projectPath: string;
  lockfileType?: LockfileType;
  lockfileHash: string;
  lastSnapshotId?: string;
  updatedAt: string;
}

/** Time Machine global settings */
export interface TimeMachineSettings {
  autoWatchEnabled: boolean;
  debounceMs: number;
  updatedAt: string;
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
  snapshotId: string;
  projectPath: string;
  triggerSource: TriggerSource;
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

// =========================================================================
// Pattern-based Analysis Types (Offline Mode)
// =========================================================================

export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type PatternAlertType =
  | 'typosquatting'
  | 'suspicious_version'
  | 'major_version_jump'
  | 'new_postinstall'
  | 'postinstall_changed'
  | 'unexpected_downgrade'
  | 'suspicious_package_name'
  | 'deprecated_package';

export interface PatternAlert {
  alertType: PatternAlertType;
  severity: AlertSeverity;
  packageName: string;
  title: string;
  description: string;
  recommendation?: string;
}

export interface PatternAnalysisSummary {
  totalAlerts: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  riskScore: number; // 0-100
}

export interface PatternAnalysisResult {
  alerts: PatternAlert[];
  summary: PatternAnalysisSummary;
}

// =========================================================================
// Dependency Integrity Types (US3)
// =========================================================================

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type PostinstallChangeType = 'added' | 'removed' | 'changed' | 'unchanged';

export interface PostinstallAlert {
  packageName: string;
  version: string;
  changeType: PostinstallChangeType;
  oldScript?: string;
  newScript?: string;
  scriptHash?: string;
}

export interface IntegrityCheckSummary {
  totalChanges: number;
  addedCount: number;
  removedCount: number;
  updatedCount: number;
  postinstallChanges: number;
  typosquattingSuspects: number;
  riskLevel: RiskLevel;
}

export interface IntegrityCheckResult {
  hasDrift: boolean;
  referenceSnapshotId?: string;
  referenceSnapshotDate?: string;
  currentLockfileHash?: string;
  referenceLockfileHash?: string;
  lockfileMatches: boolean;
  dependencyChanges: DependencyChange[];
  postinstallAlerts: PostinstallAlert[];
  typosquattingAlerts: PatternAlert[];
  summary: IntegrityCheckSummary;
}

export interface TyposquattingCheckResult {
  isSuspicious: boolean;
  packageName: string;
  similarTo?: string;
  distance?: number;
  confidence?: number;
}

// =========================================================================
// Execution Replay Types (US4)
// =========================================================================

export type ReplayOption = 'abort' | 'view_diff' | 'restore_lockfile' | 'proceed_with_current';

export interface PackageVersionChange {
  name: string;
  snapshotVersion: string;
  currentVersion: string;
}

export interface ReplayMismatch {
  lockfileChanged: boolean;
  currentLockfileHash?: string;
  snapshotLockfileHash?: string;
  dependencyTreeChanged: boolean;
  currentTreeHash?: string;
  snapshotTreeHash?: string;
  addedPackages: string[];
  removedPackages: string[];
  changedPackages: PackageVersionChange[];
}

export interface ReplayPreparation {
  snapshotId: string;
  projectPath: string;
  readyToReplay: boolean;
  hasMismatch: boolean;
  mismatchDetails?: ReplayMismatch;
  availableOptions: ReplayOption[];
}

export interface ReplayResult {
  success: boolean;
  executionId?: string;
  isVerifiedReplay: boolean;
  lockfileRestored: boolean;
  error?: string;
}

export interface ExecuteReplayRequest {
  snapshotId: string;
  option: ReplayOption;
  force: boolean;
}

// =========================================================================
// Security Insights Dashboard Types (US5)
// =========================================================================

export type OverallRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TyposquattingAlertInfo {
  packageName: string;
  similarTo: string;
  firstSeen: string;
  snapshotId: string;
}

export interface ProjectSecurityOverview {
  projectPath: string;
  riskScore: number; // 0-100
  riskLevel: OverallRiskLevel;
  totalSnapshots: number;
  latestSnapshotId?: string;
  latestSnapshotDate?: string;
  insightSummary: InsightSummary;
  typosquattingAlerts: TyposquattingAlertInfo[];
  frequentUpdaters: FrequentUpdater[];
  dependencyHealth: DependencyHealth[];
}

// =========================================================================
// Searchable Execution History Types (US6)
// =========================================================================

export interface SnapshotSearchCriteria {
  packageName?: string;
  packageVersion?: string;
  projectPath?: string;
  triggerSource?: TriggerSource;
  fromDate?: string;
  toDate?: string;
  hasPostinstall?: boolean;
  minSecurityScore?: number;
  maxSecurityScore?: number;
  limit?: number;
  offset?: number;
}

export interface SnapshotSearchResult {
  snapshot: ExecutionSnapshot;
  matchedDependencies: SnapshotDependency[];
  matchCount: number;
}

export interface DateRange {
  earliest: string;
  latest: string;
}

export interface SearchResultsSummary {
  totalSnapshots: number;
  totalMatches: number;
  dateRange?: DateRange;
  projectsInvolved: string[];
}

export interface SearchResponse {
  results: SnapshotSearchResult[];
  summary: SearchResultsSummary;
}

export interface TimelineEntry {
  snapshotId: string;
  projectPath: string;
  triggerSource: TriggerSource;
  createdAt: string;
  status: SnapshotStatus;
  totalDependencies: number;
  securityScore?: number;
  postinstallCount: number;
  hasSecurityIssues: boolean;
}

export type ExportFormat = 'json' | 'markdown' | 'html';

export interface RiskSummary {
  overallRisk: string;
  avgSecurityScore?: number;
  totalPostinstallScripts: number;
  totalSecurityIssues: number;
}

export interface DependencyAnalysis {
  packageName: string;
  versionsSeen: string[];
  firstSeen: string;
  lastSeen: string;
  hasPostinstall: boolean;
  securityConcerns: string[];
}

export interface SecurityEvent {
  timestamp: string;
  snapshotId: string;
  eventType: string;
  description: string;
  severity: string;
}

export interface SecurityAuditReport {
  generatedAt: string;
  projectPath: string;
  totalSnapshots: number;
  dateRange?: DateRange;
  riskSummary: RiskSummary;
  dependencyAnalysis: DependencyAnalysis[];
  securityEvents: SecurityEvent[];
}

// =========================================================================
// Lockfile Validation Types (Lockfile Security Enhancement)
// =========================================================================

export type ValidationStrictness = 'relaxed' | 'standard' | 'strict';

export interface ValidationRuleSet {
  requireIntegrity: boolean;
  requireHttpsResolved: boolean;
  checkAllowedRegistries: boolean;
  checkBlockedPackages: boolean;
  checkManifestConsistency: boolean;
  enhancedTyposquatting: boolean;
}

export interface BlockedPackageEntry {
  name: string;
  reason: string;
  addedAt: string;
}

export interface LockfileValidationConfig {
  enabled: boolean;
  strictness: ValidationStrictness;
  rules: ValidationRuleSet;
  allowedRegistries: string[];
  blockedPackages: BlockedPackageEntry[];
}

export interface ValidationFailure {
  ruleId: string;
  packageName: string;
  severity: InsightSeverity;
  message: string;
  remediation?: string;
}

export interface ValidationWarning {
  ruleId: string;
  packageName: string;
  message: string;
}

export interface ValidationSummary {
  totalChecked: number;
  failureCount: number;
  warningCount: number;
  passedCount: number;
  ruleResults: Record<string, { passed: number; failed: number }>;
}

export interface ValidationResult {
  snapshotId: string;
  passed: boolean;
  strictness: ValidationStrictness;
  failures: ValidationFailure[];
  warnings: ValidationWarning[];
  summary: ValidationSummary;
}
