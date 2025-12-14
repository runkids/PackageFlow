/**
 * useAIService Hook - AI Commit Message Generation
 * @see specs/020-ai-cli-integration/tasks.md - T021
 *
 * Provides AI service management and commit message generation functionality.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { aiAPI } from '../lib/tauri-api';
import type {
  AIServiceConfig,
  PromptTemplate,
  TestConnectionResult,
  ModelInfo,
  AddServiceRequest,
  UpdateServiceRequest,
  AddTemplateRequest,
  UpdateTemplateRequest,
  GenerateCommitMessageRequest,
  ProjectAISettings,
  UpdateProjectSettingsRequest,
} from '../types/ai';

// ============================================================================
// Types
// ============================================================================

export interface UseAIServiceOptions {
  /** Project path for project-specific settings */
  projectPath?: string;
  /** Whether to automatically load services and templates on mount */
  autoLoad?: boolean;
}

export interface UseAIServiceResult {
  // Services
  services: AIServiceConfig[];
  isLoadingServices: boolean;
  servicesError: string | null;
  loadServices: () => Promise<void>;
  addService: (config: AddServiceRequest) => Promise<AIServiceConfig | null>;
  updateService: (config: UpdateServiceRequest) => Promise<AIServiceConfig | null>;
  deleteService: (id: string) => Promise<boolean>;
  setDefaultService: (id: string) => Promise<boolean>;
  testConnection: (id: string) => Promise<TestConnectionResult | null>;
  listModels: (serviceId: string) => Promise<ModelInfo[]>;

  // Templates
  templates: PromptTemplate[];
  isLoadingTemplates: boolean;
  templatesError: string | null;
  loadTemplates: () => Promise<void>;
  addTemplate: (template: AddTemplateRequest) => Promise<PromptTemplate | null>;
  updateTemplate: (template: UpdateTemplateRequest) => Promise<PromptTemplate | null>;
  deleteTemplate: (id: string) => Promise<boolean>;
  setDefaultTemplate: (id: string) => Promise<boolean>;

  // Project settings
  projectSettings: ProjectAISettings | null;
  loadProjectSettings: () => Promise<void>;
  updateProjectSettings: (settings: Omit<UpdateProjectSettingsRequest, 'projectPath'>) => Promise<boolean>;

  // Commit message generation
  isGenerating: boolean;
  generateError: string | null;
  generateCommitMessage: (options?: { serviceId?: string; templateId?: string }) => Promise<string | null>;
  tokensUsed: number | null;

  // Computed helpers
  defaultService: AIServiceConfig | undefined;
  defaultTemplate: PromptTemplate | undefined;
  enabledServices: AIServiceConfig[];
  hasConfiguredService: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAIService(options: UseAIServiceOptions = {}): UseAIServiceResult {
  const { projectPath, autoLoad = true } = options;

  // Services state
  const [services, setServices] = useState<AIServiceConfig[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  // Templates state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Project settings state
  const [projectSettings, setProjectSettings] = useState<ProjectAISettings | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);

  // ============================================================================
  // Service Management
  // ============================================================================

  const loadServices = useCallback(async () => {
    setIsLoadingServices(true);
    setServicesError(null);

    try {
      const response = await aiAPI.listServices();
      if (response.success && response.data) {
        setServices(response.data);
      } else {
        setServicesError(response.error || 'Failed to load AI services');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error loading AI services';
      setServicesError(message);
      console.error('Load AI services error:', err);
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  const addService = useCallback(async (config: AddServiceRequest): Promise<AIServiceConfig | null> => {
    try {
      const response = await aiAPI.addService(config);
      if (response.success && response.data) {
        // Refresh the list to get updated data
        await loadServices();
        return response.data;
      } else {
        setServicesError(response.error || 'Failed to add AI service');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error adding AI service';
      setServicesError(message);
      console.error('Add AI service error:', err);
      return null;
    }
  }, [loadServices]);

  const updateService = useCallback(async (config: UpdateServiceRequest): Promise<AIServiceConfig | null> => {
    try {
      const response = await aiAPI.updateService(config);
      if (response.success && response.data) {
        await loadServices();
        return response.data;
      } else {
        setServicesError(response.error || 'Failed to update AI service');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error updating AI service';
      setServicesError(message);
      console.error('Update AI service error:', err);
      return null;
    }
  }, [loadServices]);

  const deleteService = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await aiAPI.deleteService(id);
      if (response.success) {
        await loadServices();
        return true;
      } else {
        setServicesError(response.error || 'Failed to delete AI service');
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error deleting AI service';
      setServicesError(message);
      console.error('Delete AI service error:', err);
      return false;
    }
  }, [loadServices]);

  const setDefaultServiceHandler = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await aiAPI.setDefaultService(id);
      if (response.success) {
        await loadServices();
        return true;
      } else {
        setServicesError(response.error || 'Failed to set default service');
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error setting default service';
      setServicesError(message);
      console.error('Set default service error:', err);
      return false;
    }
  }, [loadServices]);

  const testConnectionHandler = useCallback(async (id: string): Promise<TestConnectionResult | null> => {
    try {
      const response = await aiAPI.testConnection(id);
      if (response.success && response.data) {
        return response.data;
      } else {
        return {
          success: false,
          error: response.error || 'Connection test failed',
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error testing connection';
      console.error('Test connection error:', err);
      return {
        success: false,
        error: message,
      };
    }
  }, []);

  const listModelsHandler = useCallback(async (serviceId: string): Promise<ModelInfo[]> => {
    try {
      const response = await aiAPI.listModels(serviceId);
      if (response.success && response.data) {
        return response.data;
      } else {
        console.error('List models error:', response.error);
        return [];
      }
    } catch (err) {
      console.error('List models error:', err);
      return [];
    }
  }, []);

  // ============================================================================
  // Template Management
  // ============================================================================

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    setTemplatesError(null);

    try {
      const response = await aiAPI.listTemplates();
      if (response.success && response.data) {
        setTemplates(response.data);
      } else {
        setTemplatesError(response.error || 'Failed to load prompt templates');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error loading prompt templates';
      setTemplatesError(message);
      console.error('Load templates error:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const addTemplate = useCallback(async (template: AddTemplateRequest): Promise<PromptTemplate | null> => {
    try {
      const response = await aiAPI.addTemplate(template);
      if (response.success && response.data) {
        await loadTemplates();
        return response.data;
      } else {
        setTemplatesError(response.error || 'Failed to add template');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error adding template';
      setTemplatesError(message);
      console.error('Add template error:', err);
      return null;
    }
  }, [loadTemplates]);

  const updateTemplate = useCallback(async (template: UpdateTemplateRequest): Promise<PromptTemplate | null> => {
    try {
      const response = await aiAPI.updateTemplate(template);
      if (response.success && response.data) {
        await loadTemplates();
        return response.data;
      } else {
        setTemplatesError(response.error || 'Failed to update template');
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error updating template';
      setTemplatesError(message);
      console.error('Update template error:', err);
      return null;
    }
  }, [loadTemplates]);

  const deleteTemplate = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await aiAPI.deleteTemplate(id);
      if (response.success) {
        await loadTemplates();
        return true;
      } else {
        setTemplatesError(response.error || 'Failed to delete template');
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error deleting template';
      setTemplatesError(message);
      console.error('Delete template error:', err);
      return false;
    }
  }, [loadTemplates]);

  const setDefaultTemplateHandler = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await aiAPI.setDefaultTemplate(id);
      if (response.success) {
        await loadTemplates();
        return true;
      } else {
        setTemplatesError(response.error || 'Failed to set default template');
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error setting default template';
      setTemplatesError(message);
      console.error('Set default template error:', err);
      return false;
    }
  }, [loadTemplates]);

  // ============================================================================
  // Project Settings
  // ============================================================================

  const loadProjectSettings = useCallback(async () => {
    if (!projectPath) {
      setProjectSettings(null);
      return;
    }

    try {
      const response = await aiAPI.getProjectSettings(projectPath);
      if (response.success && response.data) {
        setProjectSettings(response.data);
      } else {
        // Not having project settings is not an error, use defaults
        setProjectSettings({
          projectPath,
          preferredServiceId: undefined,
          preferredTemplateId: undefined,
        });
      }
    } catch (err) {
      console.error('Load project settings error:', err);
      setProjectSettings({
        projectPath,
        preferredServiceId: undefined,
        preferredTemplateId: undefined,
      });
    }
  }, [projectPath]);

  const updateProjectSettingsHandler = useCallback(async (
    settings: Omit<UpdateProjectSettingsRequest, 'projectPath'>
  ): Promise<boolean> => {
    if (!projectPath) {
      console.error('Cannot update project settings without projectPath');
      return false;
    }

    try {
      const response = await aiAPI.updateProjectSettings({
        projectPath,
        ...settings,
      });
      if (response.success) {
        await loadProjectSettings();
        return true;
      } else {
        console.error('Update project settings error:', response.error);
        return false;
      }
    } catch (err) {
      console.error('Update project settings error:', err);
      return false;
    }
  }, [projectPath, loadProjectSettings]);

  // ============================================================================
  // Commit Message Generation
  // ============================================================================

  const generateCommitMessage = useCallback(async (
    options?: { serviceId?: string; templateId?: string }
  ): Promise<string | null> => {
    if (!projectPath) {
      setGenerateError('Please select a project first');
      return null;
    }

    setIsGenerating(true);
    setGenerateError(null);
    setTokensUsed(null);

    try {
      const request: GenerateCommitMessageRequest = {
        projectPath,
        serviceId: options?.serviceId,
        templateId: options?.templateId,
      };

      const response = await aiAPI.generateCommitMessage(request);

      if (response.success && response.data) {
        setTokensUsed(response.data.tokensUsed ?? null);
        return response.data.message;
      } else {
        const error = response.error || 'Failed to generate commit message';
        setGenerateError(error);
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error generating commit message';
      setGenerateError(message);
      console.error('Generate commit message error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [projectPath]);

  // ============================================================================
  // Computed Values
  // ============================================================================

  const defaultService = useMemo(() => {
    return services.find((s) => s.isDefault);
  }, [services]);

  const defaultTemplate = useMemo(() => {
    return templates.find((t) => t.isDefault);
  }, [templates]);

  const enabledServices = useMemo(() => {
    return services.filter((s) => s.isEnabled);
  }, [services]);

  const hasConfiguredService = useMemo(() => {
    return enabledServices.length > 0;
  }, [enabledServices]);

  // ============================================================================
  // Auto-load on mount
  // ============================================================================

  useEffect(() => {
    if (autoLoad) {
      loadServices();
      loadTemplates();
    }
  }, [autoLoad, loadServices, loadTemplates]);

  useEffect(() => {
    if (autoLoad && projectPath) {
      loadProjectSettings();
    }
  }, [autoLoad, projectPath, loadProjectSettings]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Services
    services,
    isLoadingServices,
    servicesError,
    loadServices,
    addService,
    updateService,
    deleteService,
    setDefaultService: setDefaultServiceHandler,
    testConnection: testConnectionHandler,
    listModels: listModelsHandler,

    // Templates
    templates,
    isLoadingTemplates,
    templatesError,
    loadTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate: setDefaultTemplateHandler,

    // Project settings
    projectSettings,
    loadProjectSettings,
    updateProjectSettings: updateProjectSettingsHandler,

    // Generation
    isGenerating,
    generateError,
    generateCommitMessage,
    tokensUsed,

    // Computed
    defaultService,
    defaultTemplate,
    enabledServices,
    hasConfiguredService,
  };
}

// ============================================================================
// Simplified Hook for Just Generation
// ============================================================================

export interface UseAICommitMessageOptions {
  projectPath: string;
}

export interface UseAICommitMessageResult {
  /** Generate a commit message */
  generate: (options?: { serviceId?: string; templateId?: string }) => Promise<string | null>;
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Error message if generation failed */
  error: string | null;
  /** Number of tokens used in the last generation */
  tokensUsed: number | null;
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Simplified hook for commit message generation only.
 * Use this when you just need to generate commit messages without service management.
 */
export function useAICommitMessage(options: UseAICommitMessageOptions): UseAICommitMessageResult {
  const { projectPath } = options;
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);

  const generate = useCallback(async (
    genOptions?: { serviceId?: string; templateId?: string }
  ): Promise<string | null> => {
    if (!projectPath) {
      setError('Please select a project first');
      return null;
    }

    setIsGenerating(true);
    setError(null);
    setTokensUsed(null);

    try {
      const request: GenerateCommitMessageRequest = {
        projectPath,
        serviceId: genOptions?.serviceId,
        templateId: genOptions?.templateId,
      };

      const response = await aiAPI.generateCommitMessage(request);

      if (response.success && response.data) {
        setTokensUsed(response.data.tokensUsed ?? null);
        return response.data.message;
      } else {
        const errorMsg = response.error || 'Failed to generate commit message';
        setError(errorMsg);
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error generating commit message';
      setError(message);
      console.error('Generate commit message error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [projectPath]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    generate,
    isGenerating,
    error,
    tokensUsed,
    clearError,
  };
}
