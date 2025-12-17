/**
 * Export/Import Core Service
 * @see specs/002-export-import-save/contracts/export-import-api.md
 */

import { getVersion } from '@tauri-apps/api/app';
import {
  save,
  open,
  readTextFile,
  writeTextFile,
  settingsAPI,
  worktreeTemplateAPI,
  stepTemplateAPI,
  incomingWebhookAPI,
  shortcutsAPI,
  aiAPI,
  aiCLIAPI,
  mcpAPI,
  mcpActionAPI,
  deployAPI,
} from './tauri-api';
import type {
  ExportData,
  ExportMetadata,
  ExportResult,
  ExportCounts,
  ImportPreview,
  ImportFileResult,
  ImportResult,
  ImportSummaryItem,
  ValidationResult,
  ConflictItem,
  ConflictResolutionStrategy,
  DataType,
  WorkflowExportData,
  NodeExportData,
  ExportDeployAccount,
  ExportDeployPreferences,
  ExportProjectAISettings,
} from '../types/export-import';
import {
  EXPORT_FORMAT_VERSION,
  MIN_SUPPORTED_VERSION,
  EXPORT_FILE_EXTENSION,
  DEFAULT_EXPORT_FILENAME,
  WORKFLOW_FILE_EXTENSION,
  STEP_FILE_EXTENSION,
} from '../types/export-import';
import type { Workflow, WorkflowNode } from '../types/workflow';
import type { AIProviderConfig, PromptTemplate, CLIToolConfig } from '../types/ai';
import type { DeploymentConfig } from './tauri-api';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get application version
 * Retrieves version from package.json or tauri.conf.json
 */
export async function getAppVersion(): Promise<string> {
  return await getVersion();
}

/**
 * Compare semantic versions
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate import file format
 */
export function validateExportData(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check basic structure
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid file format: must be a JSON object'] };
  }

  const obj = data as Record<string, unknown>;

  // Check metadata
  if (!obj.metadata || typeof obj.metadata !== 'object') {
    errors.push('Missing metadata field');
  } else {
    const metadata = obj.metadata as Record<string, unknown>;

    // Check version
    if (typeof metadata.version !== 'string') {
      errors.push('metadata.version must be a string');
    } else if (!isValidVersion(metadata.version)) {
      errors.push('metadata.version format invalid, must be x.y.z format');
    } else if (compareVersions(metadata.version, MIN_SUPPORTED_VERSION) < 0) {
      errors.push(`Version ${metadata.version} is not supported, minimum supported version is ${MIN_SUPPORTED_VERSION}`);
    } else if (compareVersions(metadata.version, EXPORT_FORMAT_VERSION) > 0) {
      warnings.push(`File version ${metadata.version} is newer, some features may not be compatible`);
    }

    // Check export time
    if (typeof metadata.exportedAt !== 'string') {
      errors.push('metadata.exportedAt must be a string');
    }

    // Check export type
    if (metadata.exportType !== 'full' && metadata.exportType !== 'partial') {
      errors.push('metadata.exportType must be "full" or "partial"');
    }
  }

  // Check data
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('Missing data field');
  } else {
    const data = obj.data as Record<string, unknown>;

    // Check at least one type of data exists
    const hasProjects = Array.isArray(data.projects) && data.projects.length > 0;
    const hasWorkflows = Array.isArray(data.workflows) && data.workflows.length > 0;
    const hasTemplates = Array.isArray(data.worktreeTemplates) && data.worktreeTemplates.length > 0;
    const hasSettings = data.settings !== undefined && data.settings !== null;

    if (!hasProjects && !hasWorkflows && !hasTemplates && !hasSettings) {
      errors.push('File contains no data');
    }

    // Validate ID exists for each item
    if (Array.isArray(data.projects)) {
      data.projects.forEach((p, i) => {
        if (!p || typeof p !== 'object' || !('id' in p)) {
          errors.push(`projects[${i}] missing id field`);
        }
      });
    }

    if (Array.isArray(data.workflows)) {
      data.workflows.forEach((w, i) => {
        if (!w || typeof w !== 'object' || !('id' in w)) {
          errors.push(`workflows[${i}] missing id field`);
        }
      });
    }

    if (Array.isArray(data.worktreeTemplates)) {
      data.worktreeTemplates.forEach((t, i) => {
        if (!t || typeof t !== 'object' || !('id' in t)) {
          errors.push(`worktreeTemplates[${i}] missing id field`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export all application data
 * Includes: projects, workflows, templates, settings, AI config, MCP config, deploy config
 */
export async function exportAllData(): Promise<ExportResult> {
  try {
    const filePath = await save({
      defaultPath: DEFAULT_EXPORT_FILENAME,
      filters: [{ name: 'PackageFlow Backup', extensions: [EXPORT_FILE_EXTENSION] }],
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    // Load all data in parallel for performance
    const [
      projects,
      workflows,
      templatesRes,
      stepTemplatesRes,
      settings,
      keyboardShortcuts,
      appVersion,
      // AI Integration data
      aiProvidersRes,
      aiTemplatesRes,
      // AI CLI Tools
      cliToolsRes,
      // MCP config
      mcpConfig,
      // MCP Actions
      mcpActions,
      mcpActionPermissions,
      // Deploy data (accounts without tokens, preferences)
      deployAccounts,
      deployPreferences,
    ] = await Promise.all([
      settingsAPI.loadProjects(),
      settingsAPI.loadWorkflows(),
      worktreeTemplateAPI.listTemplates(),
      stepTemplateAPI.loadCustomTemplates(),
      settingsAPI.loadSettings(),
      shortcutsAPI.loadSettings(),
      getAppVersion(),
      // AI
      aiAPI.listServices(),
      aiAPI.listTemplates(),
      // AI CLI Tools
      aiCLIAPI.listTools(),
      // MCP
      mcpAPI.getConfig(),
      // MCP Actions
      mcpActionAPI.listActions(),
      mcpActionAPI.listPermissions(),
      // Deploy
      deployAPI.getDeployAccounts(),
      deployAPI.getDeployPreferences(),
    ]);

    const templates = templatesRes.templates ?? [];
    const stepTemplates = stepTemplatesRes.templates ?? [];

    // Extract AI data from response wrappers
    const aiProviders: AIProviderConfig[] = aiProvidersRes.data ?? [];
    const aiTemplates: PromptTemplate[] = aiTemplatesRes.data ?? [];

    // Extract CLI tools from response (without api_key_provider_id references for security)
    const cliTools: CLIToolConfig[] = (cliToolsRes.data ?? []).map((tool) => ({
      ...tool,
      // Don't export api_key_provider_id as it references local provider IDs
      apiKeyProviderId: undefined,
    }));

    // Load project-specific AI settings for each project
    const projectAiSettings: ExportProjectAISettings[] = [];
    for (const project of projects) {
      try {
        const settingsRes = await aiAPI.getProjectSettings(project.path);
        if (settingsRes.data && (settingsRes.data.preferredProviderId || settingsRes.data.preferredTemplateId)) {
          projectAiSettings.push({
            projectPath: settingsRes.data.projectPath,
            preferredProviderId: settingsRes.data.preferredProviderId,
            preferredTemplateId: settingsRes.data.preferredTemplateId,
          });
        }
      } catch {
        // Skip if project AI settings don't exist
      }
    }

    // Load deployment configs for each project
    const deploymentConfigs: DeploymentConfig[] = [];
    for (const project of projects) {
      try {
        const config = await deployAPI.getDeploymentConfig(project.id);
        if (config) {
          deploymentConfigs.push(config);
        }
      } catch {
        // Skip if deployment config doesn't exist
      }
    }

    // Convert deploy accounts to export format (strip tokens for security)
    const exportDeployAccounts: ExportDeployAccount[] = deployAccounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      platformUserId: account.platformUserId,
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      connectedAt: account.connectedAt,
      expiresAt: account.expiresAt,
    }));

    // Convert deploy preferences to export format
    const exportDeployPreferences: ExportDeployPreferences = {
      defaultGithubPagesAccountId: deployPreferences.defaultGithubPagesAccountId ?? undefined,
      defaultNetlifyAccountId: deployPreferences.defaultNetlifyAccountId ?? undefined,
      defaultCloudflareAccountId: deployPreferences.defaultCloudflarePagesAccountId ?? undefined,
    };

    const settingsWithShortcuts = {
      ...settings,
      keyboardShortcuts,
    };

    const metadata: ExportMetadata = {
      version: EXPORT_FORMAT_VERSION,
      appVersion,
      exportedAt: new Date().toISOString(),
      exportType: 'full',
    };

    const exportData: ExportData = {
      metadata,
      data: {
        // Core data
        projects,
        workflows,
        worktreeTemplates: templates,
        customStepTemplates: stepTemplates,
        settings: settingsWithShortcuts,
        // AI Integration
        aiProviders,
        aiTemplates,
        projectAiSettings,
        // AI CLI Tools
        cliTools,
        // MCP
        mcpConfig,
        // MCP Actions
        mcpActions,
        mcpActionPermissions,
        // Deploy (without sensitive tokens)
        deployAccounts: exportDeployAccounts,
        deployPreferences: exportDeployPreferences,
        deploymentConfigs,
      },
    };

    console.log('Writing export file to:', filePath);
    try {
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    } catch (writeError) {
      console.error('writeTextFile error:', writeError);
      throw new Error(`Failed to write file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
    }

    const counts: ExportCounts = {
      projects: projects.length,
      workflows: workflows.length,
      templates: templates.length,
      stepTemplates: stepTemplates.length,
      hasSettings: true,
      aiProviders: aiProviders.length,
      aiTemplates: aiTemplates.length,
      projectAiSettings: projectAiSettings.length,
      cliTools: cliTools.length,
      hasMcpConfig: true,
      mcpActions: mcpActions.length,
      mcpActionPermissions: mcpActionPermissions.length,
      deployAccounts: exportDeployAccounts.length,
      hasDeployPreferences: true,
      deploymentConfigs: deploymentConfigs.length,
    };

    return {
      success: true,
      filePath,
      counts,
    };
  } catch (error) {
    console.error('Export failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'WRITE_ERROR';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Import Functions
// ============================================================================

/**
 * Select import file and parse preview
 */
export async function selectImportFile(): Promise<ImportFileResult> {
  try {
    const filePath = await open({
      filters: [{ name: 'PackageFlow Backup', extensions: [EXPORT_FILE_EXTENSION] }],
      multiple: false,
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    const content = await readTextFile(filePath as string);
    let importData: unknown;

    try {
      importData = JSON.parse(content);
    } catch {
      return { success: false, error: 'INVALID_FORMAT', filePath: filePath as string };
    }

    const validation = validateExportData(importData);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors?.join('; ') || 'INVALID_FORMAT',
        filePath: filePath as string,
      };
    }

    const data = importData as ExportData;

    const [existingProjects, existingWorkflows, existingTemplatesRes, existingStepTemplatesRes] = await Promise.all([
      settingsAPI.loadProjects(),
      settingsAPI.loadWorkflows(),
      worktreeTemplateAPI.listTemplates(),
      stepTemplateAPI.loadCustomTemplates(),
    ]);

    const conflicts = detectConflicts(data, {
      projects: existingProjects,
      workflows: existingWorkflows,
      templates: existingTemplatesRes.templates ?? [],
      stepTemplates: existingStepTemplatesRes.templates ?? [],
    });

    const counts: ExportCounts = {
      projects: data.data.projects?.length ?? 0,
      workflows: data.data.workflows?.length ?? 0,
      templates: data.data.worktreeTemplates?.length ?? 0,
      stepTemplates: data.data.customStepTemplates?.length ?? 0,
      hasSettings: !!data.data.settings,
      // AI Integration
      aiProviders: data.data.aiProviders?.length ?? 0,
      aiTemplates: data.data.aiTemplates?.length ?? 0,
      projectAiSettings: data.data.projectAiSettings?.length ?? 0,
      // AI CLI Tools
      cliTools: data.data.cliTools?.length ?? 0,
      // MCP
      hasMcpConfig: !!data.data.mcpConfig,
      // MCP Actions
      mcpActions: data.data.mcpActions?.length ?? 0,
      mcpActionPermissions: data.data.mcpActionPermissions?.length ?? 0,
      // Deploy
      deployAccounts: data.data.deployAccounts?.length ?? 0,
      hasDeployPreferences: !!data.data.deployPreferences,
      deploymentConfigs: data.data.deploymentConfigs?.length ?? 0,
    };

    const preview: ImportPreview = {
      metadata: data.metadata,
      counts,
      conflicts,
      versionWarning: validation.warnings?.[0],
    };

    return { success: true, filePath: filePath as string, preview };
  } catch (error) {
    console.error('Import file selection failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'READ_ERROR',
    };
  }
}

/**
 * Execute import operation
 * @param filePath - Path to the import file
 * @param strategy - Conflict resolution strategy
 *   - mode: 'merge' (default) - adds new items, handles conflicts per defaultAction
 *   - mode: 'replace' - completely replaces all existing data with imported data
 */
export async function executeImport(
  filePath: string,
  strategy: ConflictResolutionStrategy = { defaultAction: 'skip' }
): Promise<ImportResult> {
  const createEmptySummaryItem = (): ImportSummaryItem => ({
    projects: 0,
    workflows: 0,
    templates: 0,
    stepTemplates: 0,
    aiProviders: 0,
    aiTemplates: 0,
    cliTools: 0,
    mcpActions: 0,
    mcpActionPermissions: 0,
    deployAccounts: 0,
    deploymentConfigs: 0,
  });

  const summary = {
    imported: {
      ...createEmptySummaryItem(),
      settings: false,
      mcpConfig: false,
      deployPreferences: false,
      projectAiSettings: 0,
    },
    skipped: createEmptySummaryItem(),
    overwritten: createEmptySummaryItem(),
  };

  const isReplaceMode = strategy.mode === 'replace';

  try {
    const content = await readTextFile(filePath);
    const importData = JSON.parse(content) as ExportData;

    // In replace mode, we don't need existing data for merging
    // We'll just overwrite everything
    if (isReplaceMode) {
      // Replace mode: directly save imported data, replacing all existing
      if (importData.data.projects) {
        await settingsAPI.saveProjects(importData.data.projects);
        summary.imported.projects = importData.data.projects.length;
      } else {
        // If no projects in import, clear existing
        await settingsAPI.saveProjects([]);
      }

      if (importData.data.workflows) {
        await settingsAPI.saveWorkflows(importData.data.workflows);
        summary.imported.workflows = importData.data.workflows.length;
      } else {
        await settingsAPI.saveWorkflows([]);
      }

      if (importData.data.worktreeTemplates) {
        // First clear all existing templates
        const existingTemplatesRes = await worktreeTemplateAPI.listTemplates();
        for (const template of existingTemplatesRes.templates ?? []) {
          await worktreeTemplateAPI.deleteTemplate(template.id);
        }
        // Then save imported templates
        for (const template of importData.data.worktreeTemplates) {
          await worktreeTemplateAPI.saveTemplate(template);
        }
        summary.imported.templates = importData.data.worktreeTemplates.length;
      }

      if (importData.data.customStepTemplates) {
        // First clear all existing step templates
        const existingStepTemplatesRes = await stepTemplateAPI.loadCustomTemplates();
        for (const template of existingStepTemplatesRes.templates ?? []) {
          await stepTemplateAPI.deleteCustomTemplate(template.id);
        }
        // Then save imported step templates
        for (const template of importData.data.customStepTemplates) {
          await stepTemplateAPI.saveCustomTemplate(template);
        }
        summary.imported.stepTemplates = importData.data.customStepTemplates.length;
      }

      if (importData.data.settings) {
        const { keyboardShortcuts, ...otherSettings } = importData.data.settings;
        await settingsAPI.saveSettings(otherSettings);
        if (keyboardShortcuts) {
          await shortcutsAPI.saveSettings(keyboardShortcuts);
        }
        summary.imported.settings = true;
      }

      // Import AI Providers (replace mode)
      if (importData.data.aiProviders) {
        // Delete existing AI services first
        const existingServicesRes = await aiAPI.listServices();
        for (const service of existingServicesRes.data ?? []) {
          await aiAPI.deleteService(service.id);
        }
        // Add imported services (note: API keys are not included in export)
        for (const service of importData.data.aiProviders) {
          await aiAPI.addService({
            name: service.name,
            provider: service.provider,
            endpoint: service.endpoint,
            model: service.model,
          });
        }
        summary.imported.aiProviders = importData.data.aiProviders.length;
      }

      // Import AI Templates (replace mode)
      if (importData.data.aiTemplates) {
        // Delete existing non-builtin templates first
        const existingTemplatesRes = await aiAPI.listTemplates();
        for (const template of existingTemplatesRes.data ?? []) {
          if (!template.isBuiltin) {
            await aiAPI.deleteTemplate(template.id);
          }
        }
        // Add imported templates
        for (const template of importData.data.aiTemplates) {
          if (!template.isBuiltin) {
            await aiAPI.addTemplate({
              name: template.name,
              description: template.description,
              category: template.category,
              template: template.template,
              outputFormat: template.outputFormat,
            });
          }
        }
        summary.imported.aiTemplates = importData.data.aiTemplates.filter((t) => !t.isBuiltin).length;
      }

      // Import Project AI Settings (replace mode)
      if (importData.data.projectAiSettings) {
        for (const settings of importData.data.projectAiSettings) {
          await aiAPI.updateProjectSettings({
            projectPath: settings.projectPath,
            preferredProviderId: settings.preferredProviderId,
            preferredTemplateId: settings.preferredTemplateId,
          });
        }
        summary.imported.projectAiSettings = importData.data.projectAiSettings.length;
      }

      // Import CLI Tools (replace mode)
      if (importData.data.cliTools) {
        // Delete existing CLI tools first
        const existingToolsRes = await aiCLIAPI.listTools();
        for (const tool of existingToolsRes.data ?? []) {
          await aiCLIAPI.deleteTool(tool.id);
        }
        // Add imported tools
        for (const tool of importData.data.cliTools) {
          await aiCLIAPI.saveTool(tool);
        }
        summary.imported.cliTools = importData.data.cliTools.length;
      }

      // Import MCP Config (replace mode)
      if (importData.data.mcpConfig) {
        await mcpAPI.saveConfig(importData.data.mcpConfig);
        summary.imported.mcpConfig = true;
      }

      // Import MCP Actions (replace mode)
      if (importData.data.mcpActions) {
        // Delete existing MCP actions first
        const existingActions = await mcpActionAPI.listActions();
        for (const action of existingActions) {
          await mcpActionAPI.deleteAction(action.id);
        }
        // Add imported actions
        for (const action of importData.data.mcpActions) {
          await mcpActionAPI.createAction(
            action.actionType,
            action.name,
            action.description ?? null,
            action.config as unknown as Record<string, unknown>,
            action.projectId
          );
        }
        summary.imported.mcpActions = importData.data.mcpActions.length;
      }

      // Import MCP Action Permissions (replace mode)
      if (importData.data.mcpActionPermissions) {
        // Delete existing permissions first
        const existingPermissions = await mcpActionAPI.listPermissions();
        for (const permission of existingPermissions) {
          await mcpActionAPI.deletePermission(permission.id);
        }
        // Add imported permissions
        for (const permission of importData.data.mcpActionPermissions) {
          await mcpActionAPI.updatePermission(
            permission.actionId ?? null,
            permission.actionType ?? null,
            permission.permissionLevel
          );
        }
        summary.imported.mcpActionPermissions = importData.data.mcpActionPermissions.length;
      }

      // Import Deploy Preferences (replace mode)
      if (importData.data.deployPreferences) {
        const prefs = importData.data.deployPreferences;
        if (prefs.defaultGithubPagesAccountId) {
          await deployAPI.setDefaultAccount('github_pages', prefs.defaultGithubPagesAccountId);
        }
        if (prefs.defaultNetlifyAccountId) {
          await deployAPI.setDefaultAccount('netlify', prefs.defaultNetlifyAccountId);
        }
        if (prefs.defaultCloudflareAccountId) {
          await deployAPI.setDefaultAccount('cloudflare_pages', prefs.defaultCloudflareAccountId);
        }
        summary.imported.deployPreferences = true;
      }

      // Import Deployment Configs (replace mode)
      if (importData.data.deploymentConfigs) {
        for (const config of importData.data.deploymentConfigs) {
          await deployAPI.saveDeploymentConfig(config);
        }
        summary.imported.deploymentConfigs = importData.data.deploymentConfigs.length;
      }

      // Note: Deploy accounts are NOT imported in replace mode because they require OAuth re-authentication
      // Users should use the dedicated encrypted backup/restore feature for deploy accounts

      return { success: true, summary };
    }

    // Merge mode: existing behavior
    const [existingProjects, existingWorkflows, existingTemplatesRes, existingStepTemplatesRes] = await Promise.all([
      settingsAPI.loadProjects(),
      settingsAPI.loadWorkflows(),
      worktreeTemplateAPI.listTemplates(),
      stepTemplateAPI.loadCustomTemplates(),
    ]);

    const existingTemplates = existingTemplatesRes.templates ?? [];
    const existingStepTemplates = existingStepTemplatesRes.templates ?? [];

    if (importData.data.projects) {
      const result = mergeItems(
        importData.data.projects,
        existingProjects,
        'projects',
        strategy
      );
      summary.imported.projects = result.imported;
      summary.skipped.projects = result.skipped;
      summary.overwritten.projects = result.overwritten;
      await settingsAPI.saveProjects(result.merged);
    }

    if (importData.data.workflows) {
      const result = mergeItems(
        importData.data.workflows,
        existingWorkflows,
        'workflows',
        strategy
      );
      summary.imported.workflows = result.imported;
      summary.skipped.workflows = result.skipped;
      summary.overwritten.workflows = result.overwritten;
      await settingsAPI.saveWorkflows(result.merged);
    }

    if (importData.data.worktreeTemplates) {
      const result = mergeItems(
        importData.data.worktreeTemplates,
        existingTemplates,
        'templates',
        strategy
      );
      summary.imported.templates = result.imported;
      summary.skipped.templates = result.skipped;
      summary.overwritten.templates = result.overwritten;

      for (const template of result.merged) {
        await worktreeTemplateAPI.saveTemplate(template);
      }
    }

    if (importData.data.customStepTemplates) {
      const result = mergeItems(
        importData.data.customStepTemplates,
        existingStepTemplates,
        'stepTemplates',
        strategy
      );
      summary.imported.stepTemplates = result.imported;
      summary.skipped.stepTemplates = result.skipped;
      summary.overwritten.stepTemplates = result.overwritten;

      for (const template of result.merged) {
        await stepTemplateAPI.saveCustomTemplate(template);
      }
    }

    if (importData.data.settings) {
      const { keyboardShortcuts, ...otherSettings } = importData.data.settings;

      await settingsAPI.saveSettings(otherSettings);

      if (keyboardShortcuts) {
        await shortcutsAPI.saveSettings(keyboardShortcuts);
      }

      summary.imported.settings = true;
    }

    // Import AI Providers (merge mode - add new ones only)
    if (importData.data.aiProviders) {
      const existingServicesRes = await aiAPI.listServices();
      const existingIds = new Set((existingServicesRes.data ?? []).map((s) => s.id));

      for (const service of importData.data.aiProviders) {
        if (!existingIds.has(service.id)) {
          await aiAPI.addService({
            name: service.name,
            provider: service.provider,
            endpoint: service.endpoint,
            model: service.model,
          });
          summary.imported.aiProviders++;
        } else {
          summary.skipped.aiProviders++;
        }
      }
    }

    // Import AI Templates (merge mode - add new non-builtin ones only)
    if (importData.data.aiTemplates) {
      const existingTemplatesRes = await aiAPI.listTemplates();
      const existingIds = new Set((existingTemplatesRes.data ?? []).map((t) => t.id));

      for (const template of importData.data.aiTemplates) {
        if (!template.isBuiltin && !existingIds.has(template.id)) {
          await aiAPI.addTemplate({
            name: template.name,
            description: template.description,
            category: template.category,
            template: template.template,
            outputFormat: template.outputFormat,
          });
          summary.imported.aiTemplates++;
        } else if (!template.isBuiltin) {
          summary.skipped.aiTemplates++;
        }
      }
    }

    // Import Project AI Settings (merge mode - always update)
    if (importData.data.projectAiSettings) {
      for (const settings of importData.data.projectAiSettings) {
        await aiAPI.updateProjectSettings({
          projectPath: settings.projectPath,
          preferredProviderId: settings.preferredProviderId,
          preferredTemplateId: settings.preferredTemplateId,
        });
        summary.imported.projectAiSettings++;
      }
    }

    // Import CLI Tools (merge mode - add new ones only)
    if (importData.data.cliTools) {
      const existingToolsRes = await aiCLIAPI.listTools();
      const existingIds = new Set((existingToolsRes.data ?? []).map((t) => t.id));

      for (const tool of importData.data.cliTools) {
        if (!existingIds.has(tool.id)) {
          await aiCLIAPI.saveTool(tool);
          summary.imported.cliTools++;
        } else {
          summary.skipped.cliTools++;
        }
      }
    }

    // Import MCP Config (merge mode - always overwrite)
    if (importData.data.mcpConfig) {
      await mcpAPI.saveConfig(importData.data.mcpConfig);
      summary.imported.mcpConfig = true;
    }

    // Import MCP Actions (merge mode - add new ones only)
    if (importData.data.mcpActions) {
      const existingActions = await mcpActionAPI.listActions();
      const existingIds = new Set(existingActions.map((a) => a.id));

      for (const action of importData.data.mcpActions) {
        if (!existingIds.has(action.id)) {
          await mcpActionAPI.createAction(
            action.actionType,
            action.name,
            action.description ?? null,
            action.config as unknown as Record<string, unknown>,
            action.projectId
          );
          summary.imported.mcpActions++;
        } else {
          summary.skipped.mcpActions++;
        }
      }
    }

    // Import MCP Action Permissions (merge mode - add new ones only)
    if (importData.data.mcpActionPermissions) {
      const existingPermissions = await mcpActionAPI.listPermissions();
      const existingIds = new Set(existingPermissions.map((p) => p.id));

      for (const permission of importData.data.mcpActionPermissions) {
        if (!existingIds.has(permission.id)) {
          await mcpActionAPI.updatePermission(
            permission.actionId ?? null,
            permission.actionType ?? null,
            permission.permissionLevel
          );
          summary.imported.mcpActionPermissions++;
        } else {
          summary.skipped.mcpActionPermissions++;
        }
      }
    }

    // Import Deploy Preferences (merge mode - always overwrite)
    if (importData.data.deployPreferences) {
      const prefs = importData.data.deployPreferences;
      if (prefs.defaultGithubPagesAccountId) {
        await deployAPI.setDefaultAccount('github_pages', prefs.defaultGithubPagesAccountId);
      }
      if (prefs.defaultNetlifyAccountId) {
        await deployAPI.setDefaultAccount('netlify', prefs.defaultNetlifyAccountId);
      }
      if (prefs.defaultCloudflareAccountId) {
        await deployAPI.setDefaultAccount('cloudflare_pages', prefs.defaultCloudflareAccountId);
      }
      summary.imported.deployPreferences = true;
    }

    // Import Deployment Configs (merge mode - update existing or add new)
    if (importData.data.deploymentConfigs) {
      for (const config of importData.data.deploymentConfigs) {
        await deployAPI.saveDeploymentConfig(config);
        summary.imported.deploymentConfigs++;
      }
    }

    // Note: Deploy accounts are NOT imported in merge mode because they require OAuth re-authentication
    // Users should use the dedicated encrypted backup/restore feature for deploy accounts

    return { success: true, summary };
  } catch (error) {
    console.error('Import failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IMPORT_ERROR',
      summary,
    };
  }
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect conflicts between import data and existing data
 */
export function detectConflicts(
  importData: ExportData,
  existingData: {
    projects: { id: string; name: string; lastOpenedAt: string }[];
    workflows: { id: string; name: string; updatedAt: string }[];
    templates: { id: string; name: string; updatedAt?: string; createdAt: string }[];
    stepTemplates: { id: string; name: string; createdAt: string }[];
  }
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];

  const existingProjectIds = new Set(existingData.projects.map((p) => p.id));
  importData.data.projects?.forEach((p) => {
    if (existingProjectIds.has(p.id)) {
      const existing = existingData.projects.find((e) => e.id === p.id)!;
      conflicts.push({
        type: 'projects',
        id: p.id,
        name: p.name,
        existingUpdatedAt: existing.lastOpenedAt,
        importingUpdatedAt: p.lastOpenedAt,
      });
    }
  });

  const existingWorkflowIds = new Set(existingData.workflows.map((w) => w.id));
  importData.data.workflows?.forEach((w) => {
    if (existingWorkflowIds.has(w.id)) {
      const existing = existingData.workflows.find((e) => e.id === w.id)!;
      conflicts.push({
        type: 'workflows',
        id: w.id,
        name: w.name,
        existingUpdatedAt: existing.updatedAt,
        importingUpdatedAt: w.updatedAt,
      });
    }
  });

  const existingTemplateIds = new Set(existingData.templates.map((t) => t.id));
  importData.data.worktreeTemplates?.forEach((t) => {
    if (existingTemplateIds.has(t.id)) {
      const existing = existingData.templates.find((e) => e.id === t.id)!;
      conflicts.push({
        type: 'templates',
        id: t.id,
        name: t.name,
        existingUpdatedAt: existing.updatedAt || existing.createdAt,
        importingUpdatedAt: t.updatedAt || t.createdAt,
      });
    }
  });

  const existingStepTemplateIds = new Set(existingData.stepTemplates.map((t) => t.id));
  importData.data.customStepTemplates?.forEach((t) => {
    if (existingStepTemplateIds.has(t.id)) {
      const existing = existingData.stepTemplates.find((e) => e.id === t.id)!;
      conflicts.push({
        type: 'stepTemplates',
        id: t.id,
        name: t.name,
        existingUpdatedAt: existing.createdAt,
        importingUpdatedAt: t.createdAt,
      });
    }
  });

  return conflicts;
}

// ============================================================================
// UUID Generation
// ============================================================================

export function generateNewId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

interface MergeResult<T> {
  merged: T[];
  imported: number;
  skipped: number;
  overwritten: number;
}

function mergeItems<T extends { id: string }>(
  importItems: T[],
  existingItems: T[],
  type: DataType,
  strategy: ConflictResolutionStrategy
): MergeResult<T> {
  const existingMap = new Map(existingItems.map((item) => [item.id, item]));
  const result: T[] = [...existingItems];
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const item of importItems) {
    const existing = existingMap.get(item.id);
    const itemOverride = strategy.itemOverrides?.find(
      (o) => o.id === item.id && o.type === type
    );
    const action = itemOverride?.action ?? strategy.defaultAction;

    if (!existing) {
      result.push(item);
      imported++;
    } else if (action === 'skip') {
      skipped++;
    } else if (action === 'overwrite') {
      const index = result.findIndex((r) => r.id === item.id);
      if (index !== -1) {
        result[index] = item;
        overwritten++;
      }
    } else if (action === 'keepBoth') {
      const newItem = { ...item, id: generateNewId() };
      result.push(newItem);
      imported++;
    }
  }

  return { merged: result, imported, skipped, overwritten };
}

// ============================================================================
// Single Workflow Sharing
// ============================================================================

/** Result type for single item export/import */
export interface SingleExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface WorkflowImportResult {
  success: boolean;
  workflow?: Workflow;
  error?: string;
}

export interface NodeImportResult {
  success: boolean;
  node?: WorkflowNode;
  error?: string;
}

/**
 * Export a single workflow to a file
 */
export async function exportWorkflow(workflow: Workflow): Promise<SingleExportResult> {
  try {
    const defaultFilename = `${workflow.name.replace(/[^a-zA-Z0-9]/g, '-')}.${WORKFLOW_FILE_EXTENSION}`;
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'Workflow', extensions: [WORKFLOW_FILE_EXTENSION] }],
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    const exportData: WorkflowExportData = {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      type: 'workflow',
      workflow,
    };

    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));

    return { success: true, filePath };
  } catch (error) {
    console.error('Export workflow failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'EXPORT_ERROR',
    };
  }
}

/**
 * Import a workflow from a file
 * Returns the workflow with a new ID (caller is responsible for saving)
 */
export async function importWorkflow(): Promise<WorkflowImportResult> {
  try {
    const filePath = await open({
      filters: [{ name: 'Workflow', extensions: [WORKFLOW_FILE_EXTENSION] }],
      multiple: false,
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    const content = await readTextFile(filePath as string);
    let importData: unknown;

    try {
      importData = JSON.parse(content);
    } catch {
      return { success: false, error: 'INVALID_FORMAT' };
    }

    if (!importData || typeof importData !== 'object') {
      return { success: false, error: 'INVALID_FORMAT' };
    }

    const data = importData as Record<string, unknown>;
    if (data.type !== 'workflow' || !data.workflow) {
      return { success: false, error: 'NOT_A_WORKFLOW_FILE' };
    }

    const workflow = data.workflow as Workflow;
    const newWorkflow: Workflow = {
      ...workflow,
      id: generateNewId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: workflow.nodes.map((node) => ({
        ...node,
        id: generateNewId(),
      })),
    };

    if (workflow.incomingWebhook) {
      try {
        const newConfig = await incomingWebhookAPI.createConfig();
        newWorkflow.incomingWebhook = {
          ...newConfig,
          enabled: false,
        };
      } catch (error) {
        console.error('Failed to create incoming webhook config for import:', error);
        newWorkflow.incomingWebhook = undefined;
      }
    }

    return { success: true, workflow: newWorkflow };
  } catch (error) {
    console.error('Import workflow failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IMPORT_ERROR',
    };
  }
}

// ============================================================================
// Single Node Sharing
// ============================================================================

/**
 * Export a single node to a file
 */
export async function exportNode(node: WorkflowNode): Promise<SingleExportResult> {
  try {
    const defaultFilename = `${node.name.replace(/[^a-zA-Z0-9]/g, '-')}.${STEP_FILE_EXTENSION}`;
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{ name: 'Workflow Step', extensions: [STEP_FILE_EXTENSION] }],
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    const exportData: NodeExportData = {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      type: 'node',
      node,
    };

    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));

    return { success: true, filePath };
  } catch (error) {
    console.error('Export node failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'EXPORT_ERROR',
    };
  }
}

/**
 * Import a node from a file
 * Returns the node with a new ID (caller is responsible for adding to workflow)
 */
export async function importNode(): Promise<NodeImportResult> {
  try {
    const filePath = await open({
      filters: [{ name: 'Workflow Step', extensions: [STEP_FILE_EXTENSION] }],
      multiple: false,
    });

    if (!filePath) {
      return { success: false, error: 'USER_CANCELLED' };
    }

    const content = await readTextFile(filePath as string);
    let importData: unknown;

    try {
      importData = JSON.parse(content);
    } catch {
      return { success: false, error: 'INVALID_FORMAT' };
    }

    if (!importData || typeof importData !== 'object') {
      return { success: false, error: 'INVALID_FORMAT' };
    }

    const data = importData as Record<string, unknown>;
    if (data.type !== 'node' || !data.node) {
      return { success: false, error: 'NOT_A_STEP_FILE' };
    }

    const node = data.node as WorkflowNode;
    const newNode: WorkflowNode = {
      ...node,
      id: generateNewId(),
    };

    return { success: true, node: newNode };
  } catch (error) {
    console.error('Import node failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IMPORT_ERROR',
    };
  }
}
