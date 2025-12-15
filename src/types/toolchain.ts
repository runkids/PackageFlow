/**
 * Toolchain Types for Node.js toolchain conflict detection
 * Feature: 017-toolchain-conflict-detection
 *
 * TypeScript type definitions matching Rust models
 */

// ============================================================================
// Enums
// ============================================================================

export type ToolchainStrategy =
  | "volta_priority"
  | "corepack_priority"
  | "hybrid"
  | "system_default";

export type ToolchainConflictType =
  | { type: "none" }
  | {
      type: "dual_config";
      volta_node?: string;
      volta_pm?: string;
      package_manager: string;
    }
  | {
      type: "shim_overwrite";
      affected_tools: string[];
      fix_command: string;
    }
  | { type: "volta_missing" }
  | { type: "corepack_disabled" };

export type ToolchainErrorCode =
  | "VERSION_NOT_FOUND"
  | "NETWORK_ERROR"
  | "COREPACK_DISABLED"
  | "PM_NOT_INSTALLED"
  | "UNKNOWN";

// ============================================================================
// Data Types
// ============================================================================

export interface ParsedPackageManager {
  name: string;
  version: string;
  hash?: string;
}

export interface VoltaConfig {
  node?: string;
  npm?: string;
  yarn?: string;
  pnpm?: string;
}

export interface ToolchainConfig {
  volta: VoltaConfig | null;
  package_manager: string | null;
  parsed_package_manager: ParsedPackageManager | null;
}

export interface ToolchainConflictResult {
  has_conflict: boolean;
  conflict_type: ToolchainConflictType;
  description?: string;
  suggested_strategies: ToolchainStrategy[];
  recommended_strategy: ToolchainStrategy;
}

export interface ProjectPreference {
  project_path: string;
  strategy: ToolchainStrategy;
  remember: boolean;
  updated_at: string;
}

export interface ToolchainError {
  code: ToolchainErrorCode;
  message: string;
  suggestion?: string;
  command?: string;
}

export interface BuildCommandResult {
  command: string;
  args: string[];
  strategy_used: ToolchainStrategy;
  using_volta: boolean;
  using_corepack: boolean;
}

// ============================================================================
// Environment Diagnostics
// ============================================================================

export interface VoltaInfo {
  available: boolean;
  version?: string;
  path?: string;
  shim_path?: string;
}

export interface CorepackInfo {
  available: boolean;
  enabled: boolean;
  version?: string;
  path?: string;
}

/** Detailed corepack status from backend */
export interface CorepackStatus {
  /** Whether corepack binary is available */
  available: boolean;
  /** Whether corepack shims are installed (enabled) */
  enabled: boolean;
  /** Corepack version */
  version?: string;
  /** Path to corepack binary */
  path?: string;
  /** List of tools with corepack shims installed */
  enabledTools: string[];
}

/** PNPM HOME path conflict detection result */
export interface PnpmHomeConflict {
  /** Whether a conflict is detected */
  hasConflict: boolean;
  /** Description of the conflict */
  description?: string;
  /** The problematic path */
  problematicPath?: string;
  /** Suggested fix command */
  fixCommand?: string;
}

/** Response for corepack operations */
export interface CorepackOperationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface SystemNodeInfo {
  version?: string;
  path?: string;
}

export interface ToolVersionInfo {
  version: string;
  path: string;
}

export interface PackageManagersInfo {
  npm?: ToolVersionInfo;
  pnpm?: ToolVersionInfo;
  yarn?: ToolVersionInfo;
}

export interface PathAnalysis {
  volta_first: boolean;
  corepack_first: boolean;
  order: string[];
}

export interface EnvironmentDiagnostics {
  volta: VoltaInfo;
  corepack: CorepackInfo;
  system_node: SystemNodeInfo;
  package_managers: PackageManagersInfo;
  path_analysis: PathAnalysis;
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseToolchainStrategyState {
  conflict: ToolchainConflictResult | null;
  preference: ProjectPreference | null;
  diagnostics: EnvironmentDiagnostics | null;
  isLoading: boolean;
  isDetecting: boolean;
  isSaving: boolean;
  error: string | null;
}

export interface UseToolchainStrategyActions {
  detectConflict: (projectPath: string) => Promise<void>;
  setPreference: (
    projectPath: string,
    strategy: ToolchainStrategy,
    remember: boolean
  ) => Promise<void>;
  clearPreference: (projectPath: string) => Promise<void>;
  getDiagnostics: (projectPath?: string) => Promise<void>;
  buildCommand: (
    projectPath: string,
    command: string,
    args: string[]
  ) => Promise<BuildCommandResult | undefined>;
}

// ============================================================================
// Component Props
// ============================================================================

export interface ToolchainConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  conflict: ToolchainConflictResult;
  onStrategySelect: (strategy: ToolchainStrategy, remember: boolean) => void;
}

export interface ToolchainDiagnosticsProps {
  projectPath?: string;
  onClose?: () => void;
}

// ============================================================================
// Strategy Display Helpers
// ============================================================================

export const STRATEGY_LABELS: Record<ToolchainStrategy, string> = {
  volta_priority: "Volta Priority",
  corepack_priority: "Corepack Priority",
  hybrid: "Hybrid Mode",
  system_default: "System Default",
};

export const STRATEGY_DESCRIPTIONS: Record<ToolchainStrategy, string> = {
  volta_priority: "Use Volta to manage Node.js and Package Manager versions",
  corepack_priority: "Use Corepack to manage Package Manager versions",
  hybrid: "Volta manages Node.js, Corepack manages Package Manager",
  system_default: "No special handling, use system default versions",
};

export const CONFLICT_TYPE_LABELS: Record<ToolchainConflictType["type"], string> = {
  none: "No Conflict",
  dual_config: "Dual Config Conflict",
  shim_overwrite: "Shim Overwrite Conflict",
  volta_missing: "Volta Not Installed",
  corepack_disabled: "Corepack Disabled",
};
