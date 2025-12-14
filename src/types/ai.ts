// AI Integration TypeScript types
// Feature: AI CLI Integration (020-ai-cli-integration)

/** Supported AI service providers */
export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lm_studio';

/** Template category for different AI use cases */
export type TemplateCategory =
  | 'git_commit'
  | 'pull_request'
  | 'code_review'
  | 'documentation'
  | 'release_notes'
  | 'custom';

/** Commit message format types (for GitCommit category) */
export type CommitFormat = 'conventional_commits' | 'simple' | 'custom';

/** Category display info */
export interface CategoryInfo {
  id: TemplateCategory;
  name: string;
  description: string;
  variables: string[];
}

/** List of all template categories with their info */
export const TEMPLATE_CATEGORIES: CategoryInfo[] = [
  {
    id: 'git_commit',
    name: 'Git Commit',
    description: 'Generate commit messages',
    variables: ['diff'],
  },
  {
    id: 'pull_request',
    name: 'Pull Request',
    description: 'Generate PR descriptions',
    variables: ['diff', 'commits', 'branch', 'base_branch'],
  },
  {
    id: 'code_review',
    name: 'Code Review',
    description: 'Review code changes',
    variables: ['diff', 'file_path', 'code'],
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Generate documentation',
    variables: ['code', 'file_path', 'function_name'],
  },
  {
    id: 'release_notes',
    name: 'Release Notes',
    description: 'Generate release notes',
    variables: ['commits', 'version', 'previous_version'],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'General purpose template',
    variables: ['input'],
  },
];

/** Get category info by ID */
export function getCategoryInfo(categoryId: TemplateCategory): CategoryInfo | undefined {
  return TEMPLATE_CATEGORIES.find((c) => c.id === categoryId);
}

/** AI Service configuration */
export interface AIServiceConfig {
  /** Unique identifier (UUID v4) */
  id: string;
  /** User-defined name for this service */
  name: string;
  /** AI provider type */
  provider: AIProvider;
  /** API endpoint URL */
  endpoint: string;
  /** Selected model name */
  model: string;
  /** Whether this is the default service */
  isDefault: boolean;
  /** Whether this service is enabled */
  isEnabled: boolean;
  /** When this service was created (ISO 8601) */
  createdAt: string;
  /** When this service was last updated (ISO 8601) */
  updatedAt: string;
}

/** Prompt template for AI generation tasks */
export interface PromptTemplate {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Template category (determines available variables) */
  category: TemplateCategory;
  /** Prompt content with variable placeholders like {diff}, {code}, etc. */
  template: string;
  /** Output format type (mainly for GitCommit category) */
  outputFormat?: CommitFormat;
  /** Whether this is the default template for its category */
  isDefault: boolean;
  /** Whether this is a built-in template (cannot be deleted) */
  isBuiltin: boolean;
  /** When this template was created (ISO 8601) */
  createdAt: string;
  /** When this template was last updated (ISO 8601) */
  updatedAt: string;
}

/** Project-level AI settings override */
export interface ProjectAISettings {
  /** Project path (used as key) */
  projectPath: string;
  /** Preferred AI service ID for this project */
  preferredServiceId?: string;
  /** Preferred prompt template ID for this project */
  preferredTemplateId?: string;
}

/** Chat message for AI completion */
export interface ChatMessage {
  /** Role: "system", "user", or "assistant" */
  role: 'system' | 'user' | 'assistant';
  /** Message content */
  content: string;
}

/** Options for chat completion requests */
export interface ChatOptions {
  /** Temperature (0.0 - 2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Top-p sampling */
  topP?: number;
}

/** Response from chat completion */
export interface ChatResponse {
  /** Generated content */
  content: string;
  /** Tokens used (if available) */
  tokensUsed?: number;
  /** Model used */
  model: string;
}

/** Result from AI commit message generation */
export interface GenerateResult {
  /** Generated commit message */
  message: string;
  /** Tokens used (if available) */
  tokensUsed?: number;
}

/** Result from AI connection test */
export interface TestConnectionResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Response latency in milliseconds */
  latencyMs?: number;
  /** Available models (for Ollama/LMStudio) */
  models?: string[];
  /** Error message if failed */
  error?: string;
}

/** Model information (for Ollama/LMStudio) */
export interface ModelInfo {
  /** Model name */
  name: string;
  /** Model size in bytes */
  size?: number;
  /** Last modified time */
  modifiedAt?: string;
}

/** Request to add a new AI service */
export interface AddServiceRequest {
  name: string;
  provider: AIProvider;
  endpoint: string;
  model: string;
  /** API key (only for cloud providers) */
  apiKey?: string;
}

/** Request to update an AI service */
export interface UpdateServiceRequest {
  id: string;
  name?: string;
  endpoint?: string;
  model?: string;
  isEnabled?: boolean;
  /** API key (if provided, will be updated) */
  apiKey?: string;
}

/** Request to add a new prompt template */
export interface AddTemplateRequest {
  name: string;
  description?: string;
  category: TemplateCategory;
  template: string;
  /** Output format (mainly for GitCommit category) */
  outputFormat?: CommitFormat;
}

/** Request to update a prompt template */
export interface UpdateTemplateRequest {
  id: string;
  name?: string;
  description?: string;
  template?: string;
  outputFormat?: CommitFormat;
}

/** Request to generate a commit message */
export interface GenerateCommitMessageRequest {
  projectPath: string;
  /** Service ID (if not specified, use default) */
  serviceId?: string;
  /** Template ID (if not specified, use default) */
  templateId?: string;
}

/** Request to update project AI settings */
export interface UpdateProjectSettingsRequest {
  projectPath: string;
  /** Preferred service ID (null to clear) */
  preferredServiceId?: string | null;
  /** Preferred template ID (null to clear) */
  preferredTemplateId?: string | null;
}

// ============================================================================
// Helper types
// ============================================================================

/** Provider display info */
export interface ProviderInfo {
  id: AIProvider;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultEndpoint: string;
  defaultModel: string;
}

/** List of all supported providers with their info */
export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI GPT models (GPT-4o, GPT-4o-mini)',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models (Claude 3 Haiku, Sonnet, Opus)',
    requiresApiKey: true,
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google Gemini models (1.5 Flash, 1.5 Pro)',
    requiresApiKey: true,
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local Ollama server (Llama, Mistral, etc.)',
    requiresApiKey: false,
    defaultEndpoint: 'http://127.0.0.1:11434',
    defaultModel: 'llama3.2',
  },
  {
    id: 'lm_studio',
    name: 'LM Studio',
    description: 'Local LM Studio server',
    requiresApiKey: false,
    defaultEndpoint: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
  },
];

/** Get provider info by ID */
export function getProviderInfo(providerId: AIProvider): ProviderInfo | undefined {
  return AI_PROVIDERS.find((p) => p.id === providerId);
}

/** Check if provider requires API key */
export function providerRequiresApiKey(providerId: AIProvider): boolean {
  return providerId === 'openai' || providerId === 'anthropic' || providerId === 'gemini';
}
