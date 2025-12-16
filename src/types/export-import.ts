/**
 * Export/Import functionality type definitions
 * @see specs/002-export-import-save/data-model.md
 */

import type { Project, Workflow, AppSettings } from './index';
import type { WorktreeTemplate, CustomStepTemplate, McpServerConfig, DeploymentConfig } from '../lib/tauri-api';
import type { AIProviderConfig, PromptTemplate } from './ai';

export type DataType =
  | 'projects'
  | 'workflows'
  | 'templates'
  | 'stepTemplates'
  | 'settings'
  | 'aiProviders'
  | 'aiTemplates'
  | 'mcpConfig'
  | 'deployAccounts'
  | 'deployPreferences'
  | 'deploymentConfigs';

/** Deploy account data for export (without sensitive tokens) */
export interface ExportDeployAccount {
  id: string;
  platform: string;
  platformUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  connectedAt: string;
  expiresAt?: string;
}

/** Deploy preferences for export */
export interface ExportDeployPreferences {
  defaultGithubPagesAccountId?: string;
  defaultNetlifyAccountId?: string;
  defaultCloudflareAccountId?: string;
}

/** Project AI settings for export */
export interface ExportProjectAISettings {
  projectPath: string;
  preferredProviderId?: string;
  preferredTemplateId?: string;
}

export interface ExportMetadata {
  version: string;
  appVersion: string;
  exportedAt: string;
  exportType: 'full' | 'partial';
  includedTypes?: DataType[];
}

export interface ExportData {
  metadata: ExportMetadata;
  data: {
    // Core data
    projects?: Project[];
    workflows?: Workflow[];
    worktreeTemplates?: WorktreeTemplate[];
    customStepTemplates?: CustomStepTemplate[];
    settings?: AppSettings;
    // AI Integration (020-ai-cli-integration)
    aiProviders?: AIProviderConfig[];
    aiTemplates?: PromptTemplate[];
    projectAiSettings?: ExportProjectAISettings[];
    // MCP Configuration
    mcpConfig?: McpServerConfig;
    // Deploy Integration (without tokens)
    deployAccounts?: ExportDeployAccount[];
    deployPreferences?: ExportDeployPreferences;
    deploymentConfigs?: DeploymentConfig[];
  };
}

export interface ExportOptions {
  includeProjects: boolean;
  includeWorkflows: boolean;
  includeTemplates: boolean;
  includeSettings: boolean;
}

export interface ExportCounts {
  projects: number;
  workflows: number;
  templates: number;
  stepTemplates: number;
  hasSettings: boolean;
  // AI Integration
  aiProviders: number;
  aiTemplates: number;
  projectAiSettings: number;
  // MCP
  hasMcpConfig: boolean;
  // Deploy
  deployAccounts: number;
  hasDeployPreferences: boolean;
  deploymentConfigs: number;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
  counts?: ExportCounts;
}

export interface ImportPreview {
  metadata: ExportMetadata;
  counts: ExportCounts;
  conflicts: ConflictItem[];
  versionWarning?: string;
}

export interface ConflictItem {
  type: DataType;
  id: string;
  name: string;
  existingUpdatedAt: string;
  importingUpdatedAt: string;
}

export interface ConflictResolutionItem {
  id: string;
  type: DataType;
  action: 'skip' | 'overwrite' | 'keepBoth';
}

/**
 * Import mode determines how existing data is handled
 * - 'merge': Add new items, handle conflicts per strategy (default)
 * - 'replace': Completely replace all existing data with imported data
 */
export type ImportMode = 'merge' | 'replace';

export interface ConflictResolutionStrategy {
  /** Import mode: 'merge' preserves existing + adds new, 'replace' overwrites everything */
  mode?: ImportMode;
  defaultAction: 'skip' | 'overwrite' | 'keepBoth';
  itemOverrides?: ConflictResolutionItem[];
}

export interface ImportFileResult {
  success: boolean;
  error?: string;
  filePath?: string;
  preview?: ImportPreview;
}

export interface ImportSummaryItem {
  projects: number;
  workflows: number;
  templates: number;
  stepTemplates: number;
  aiProviders: number;
  aiTemplates: number;
  deployAccounts: number;
  deploymentConfigs: number;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  summary: {
    imported: ImportSummaryItem & {
      settings: boolean;
      mcpConfig: boolean;
      deployPreferences: boolean;
      projectAiSettings: number;
    };
    skipped: ImportSummaryItem;
    overwritten: ImportSummaryItem;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Version 2.0.0: Added AI services, AI templates, MCP config, deploy accounts/configs
export const EXPORT_FORMAT_VERSION = '2.0.0';
export const MIN_SUPPORTED_VERSION = '1.0.0';
export const EXPORT_FILE_EXTENSION = 'packageflow';
export const DEFAULT_EXPORT_FILENAME = `packageflow-backup.${EXPORT_FILE_EXTENSION}`;

export interface WorkflowExportData {
  version: string;
  exportedAt: string;
  type: 'workflow';
  workflow: Workflow;
}

export interface NodeExportData {
  version: string;
  exportedAt: string;
  type: 'node';
  node: import('./workflow').WorkflowNode;
}

export const WORKFLOW_FILE_EXTENSION = 'workflow.json';
export const STEP_FILE_EXTENSION = 'step.json';
