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
  volta_priority: "Volta 優先",
  corepack_priority: "Corepack 優先",
  hybrid: "混合模式",
  system_default: "系統預設",
};

export const STRATEGY_DESCRIPTIONS: Record<ToolchainStrategy, string> = {
  volta_priority: "使用 Volta 管理 Node.js 和 Package Manager 版本",
  corepack_priority: "使用 Corepack 管理 Package Manager 版本",
  hybrid: "Volta 管理 Node.js，Corepack 管理 Package Manager",
  system_default: "不做特殊處理，使用系統預設版本",
};

export const CONFLICT_TYPE_LABELS: Record<ToolchainConflictType["type"], string> = {
  none: "無衝突",
  dual_config: "雙重配置衝突",
  shim_overwrite: "Shim 覆蓋衝突",
  volta_missing: "Volta 未安裝",
  corepack_disabled: "Corepack 未啟用",
};
