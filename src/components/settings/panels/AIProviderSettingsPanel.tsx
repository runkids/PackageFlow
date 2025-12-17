/**
 * AI Service Settings Panel
 * Redesigned with tabbed navigation matching MCP Settings style
 * Features: Service status card, tabbed content (Overview/Services/Add Service)
 */

import React, { useState, useCallback, useId, useMemo, useEffect, useRef } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Star,
  Edit2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Cloud,
  Server,
  CheckCircle2,
  XCircle,
  Settings2,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useAIService, getAIExecutionMode, setAIExecutionMode, type AIExecutionMode } from '../../../hooks/useAIService';
import { useDetectedCLITools } from '../../../hooks/useAICLI';
import { DeleteConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import { Select, type SelectOption } from '../../ui/Select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/Tabs';
import { Skeleton } from '../../ui/Skeleton';
import { AIProviderIcon, getProviderColorScheme } from '../../ui/AIProviderIcon';
import { CLIToolIcon, getCLIToolColorScheme } from '../../ui/CLIToolIcon';
import type {
  AIProvider,
  AIProviderConfig,
  AddServiceRequest,
  TestConnectionResult,
  ModelInfo,
  CLIToolType,
} from '../../../types/ai';
import { AI_PROVIDERS, getProviderInfo, providerRequiresApiKey, CLI_TOOLS } from '../../../types/ai';
import { cn } from '../../../lib/utils';
import { openUrl } from '../../../lib/tauri-api';

// ============================================================================
// Loading & Error States
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <Skeleton className="w-full h-20 rounded-xl" />
    <Skeleton className="w-full h-10 rounded-lg" />
    <Skeleton className="w-full h-64 rounded-lg" />
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <AlertCircle className="w-12 h-12 text-destructive mb-4" />
    <p className="text-sm text-muted-foreground mb-4">{message}</p>
    <button
      onClick={onRetry}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      Retry
    </button>
  </div>
);

// ============================================================================
// AI Status Card Component (similar to ServerStatusCard)
// ============================================================================

interface AIStatusCardProps {
  totalServices: number;
  localServices: number;
  cloudServices: number;
  defaultService: AIProviderConfig | undefined;
  hasEnabledServices: boolean;
  className?: string;
}

const AIStatusCard: React.FC<AIStatusCardProps> = ({
  totalServices,
  localServices,
  cloudServices,
  defaultService,
  hasEnabledServices,
  className,
}) => {
  return (
    <div className={cn('relative', className)}>
      {/* Gradient border wrapper - purple → blue → cyan theme */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl',
          'bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500',
          'transition-opacity duration-300',
          hasEnabledServices ? 'opacity-100' : 'opacity-30'
        )}
      />

      {/* Inner content with background */}
      <div
        className={cn(
          'relative flex items-center gap-4 p-4 rounded-[11px] m-[1px]',
          'bg-card/95 dark:bg-card/90 backdrop-blur-sm',
          'transition-all duration-300'
        )}
      >
        {/* Icon with gradient background */}
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
            'transition-all duration-300',
            hasEnabledServices
              ? 'bg-gradient-to-br from-purple-500/20 via-blue-500/15 to-cyan-500/10'
              : 'bg-muted'
          )}
        >
          {hasEnabledServices ? (
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#ai-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <defs>
                <linearGradient id="ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              {/* Bot icon - head with antenna */}
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              {/* Ears */}
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              {/* Eyes - filled circles */}
              <circle cx="9" cy="13" r="1" fill="url(#ai-gradient)" stroke="none" />
              <circle cx="15" cy="13" r="1" fill="url(#ai-gradient)" stroke="none" />
            </svg>
          ) : (
            <Bot className="w-6 h-6 text-muted-foreground" />
          )}
        </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">AI Providers</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
            {totalServices} configured
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {defaultService
            ? `Default: ${defaultService.name} (${getProviderInfo(defaultService.provider)?.name})`
            : 'No default provider selected'}
        </p>
      </div>

      {/* Status & Stats */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Stats badges */}
        <div className="hidden sm:flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-green-500/10 text-green-600 dark:text-green-400'
            )}
          >
            <Server className="w-3 h-3" />
            <span>{localServices} Local</span>
          </div>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            )}
          >
            <Cloud className="w-3 h-3" />
            <span>{cloudServices} Cloud</span>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'transition-all duration-300',
            hasEnabledServices
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {hasEnabledServices ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3" />
              <span>No Providers</span>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

// ============================================================================
// Provider Selector Component (similar to PermissionQuickModeSelector)
// ============================================================================

interface ProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
  disabled?: boolean;
  className?: string;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className,
}) => {
  // Group providers by type
  const localProviders = AI_PROVIDERS.filter((p) => !p.requiresApiKey);
  const cloudProviders = AI_PROVIDERS.filter((p) => p.requiresApiKey);

  const renderProviderButton = (provider: typeof AI_PROVIDERS[0]) => {
    const isSelected = value === provider.id;
    const isLocal = !provider.requiresApiKey;
    const colorScheme = getProviderColorScheme(provider.id);

    return (
      <button
        key={provider.id}
        type="button"
        onClick={() => onChange(provider.id)}
        disabled={disabled}
        className={cn(
          'flex flex-col items-center gap-2 p-3 rounded-xl',
          'border-2 transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isSelected
            ? colorScheme.selected
            : 'border-border bg-card/50 text-muted-foreground',
          !isSelected && !disabled && colorScheme.unselected,
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Icon */}
        <span
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            'transition-colors duration-200',
            isSelected ? colorScheme.iconBg : 'bg-muted text-muted-foreground'
          )}
        >
          <AIProviderIcon provider={provider.id} size={20} />
        </span>

        {/* Label */}
        <span className="text-sm font-medium">{provider.name}</span>

        {/* Description - hidden on mobile */}
        <span
          className={cn(
            'text-[10px] text-center leading-tight hidden sm:block',
            isSelected ? 'opacity-80' : 'text-muted-foreground'
          )}
        >
          {isLocal ? 'Local' : 'Cloud'}
        </span>
      </button>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Local Providers */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
            Local (Privacy-First)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {localProviders.map(renderProviderButton)}
        </div>
      </div>

      {/* Cloud Providers */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Cloud Providers
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cloudProviders.map(renderProviderButton)}
        </div>
      </div>

      {/* Info text for selected provider */}
      <div
        className={cn(
          'p-3 rounded-lg text-sm',
          'bg-muted/50 border border-border'
        )}
      >
        {value === 'ollama' && (
          <p>Ollama runs AI models locally on your machine. Great for privacy and offline use.</p>
        )}
        {value === 'lm_studio' && (
          <p>LM Studio provides a local inference server with a simple UI for managing models.</p>
        )}
        {value === 'openai' && (
          <p>OpenAI provides GPT-4o and GPT-4o-mini models. Requires an API key from OpenAI.</p>
        )}
        {value === 'anthropic' && (
          <p>Anthropic provides Claude models known for helpful and harmless responses.</p>
        )}
        {value === 'gemini' && (
          <p>Google Gemini offers multimodal AI capabilities with fast response times.</p>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Service Card Component (improved design)
// ============================================================================

interface ServiceCardProps {
  service: AIProviderConfig;
  testResult?: TestConnectionResult;
  isTesting: boolean;
  isLoadingModels: boolean;
  availableModels?: ModelInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onTest: () => void;
  onLoadModels: () => void;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  testResult,
  isTesting,
  isLoadingModels,
  availableModels,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  onLoadModels,
}) => {
  const providerInfo = getProviderInfo(service.provider);
  const colorScheme = getProviderColorScheme(service.provider);
  const isLocal = !providerRequiresApiKey(service.provider);

  return (
    <div
      className={cn(
        'p-4 rounded-xl border-2 transition-all duration-200',
        'hover:shadow-sm',
        colorScheme.selected
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Icon with provider branding */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              'transition-colors',
              colorScheme.iconBg
            )}
          >
            <AIProviderIcon provider={service.provider} size={20} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">{service.name}</span>
              {service.isDefault && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs font-medium">
                  <Star className="w-3 h-3" />
                  Default
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-medium">{providerInfo?.name}</span>
              <span className="text-muted-foreground/50">|</span>
              <code className="px-1.5 py-0.5 bg-muted rounded text-[11px]">{service.model}</code>
            </div>
            {testResult && (
              <div
                className={cn(
                  'text-xs mt-2 flex items-center gap-1.5',
                  testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {testResult.success ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    <span>Connected ({testResult.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    <span className="truncate max-w-[200px]">{testResult.error || 'Connection failed'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onTest}
            disabled={isTesting}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            title="Test connection"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
          </button>
          {isLocal && (
            <button
              onClick={onLoadModels}
              disabled={isLoadingModels}
              className={cn(
                'p-2 rounded-lg transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              title="Load available models"
            >
              {isLoadingModels ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          )}
          {!service.isDefault && (
            <button
              onClick={onSetDefault}
              className={cn(
                'p-2 rounded-lg transition-colors',
                'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              title="Set as default"
            >
              <Star className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onEdit}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            title="Edit provider"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            title="Delete provider"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Available models (for local services) */}
      {availableModels && availableModels.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Available Models ({availableModels.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableModels.slice(0, 10).map((model) => (
              <span
                key={model.name}
                className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  model.name === service.model
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {model.name}
              </span>
            ))}
            {availableModels.length > 10 && (
              <span className="px-2 py-0.5 text-muted-foreground text-xs">
                +{availableModels.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Overview Tab Content
// ============================================================================

interface OverviewTabProps {
  services: AIProviderConfig[];
  localServices: AIProviderConfig[];
  cloudServices: AIProviderConfig[];
  defaultService: AIProviderConfig | undefined;
  defaultCliTool: CLIToolType | null;
  executionMode: AIExecutionMode;
  onExecutionModeChange: (mode: AIExecutionMode) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  services,
  localServices,
  cloudServices,
  defaultService,
  defaultCliTool,
  executionMode,
  onExecutionModeChange,
}) => {
  // Get CLI tool display name and color scheme
  const cliToolName = defaultCliTool
    ? CLI_TOOLS.find((t) => t.id === defaultCliTool)?.name || defaultCliTool
    : null;

  const cliToolColors = defaultCliTool ? getCLIToolColorScheme(defaultCliTool) : null;

  // Get API provider color scheme
  const apiProviderColors = defaultService ? getProviderColorScheme(defaultService.provider) : null;

  // Render API provider icon - shows brand icon if default is set, otherwise shows stacked icons
  const renderAPIIcon = () => {
    if (defaultService) {
      return (
        <AIProviderIcon
          provider={defaultService.provider}
          size={16}
          className={executionMode === 'api' ? undefined : 'opacity-70'}
        />
      );
    }
    // Show stacked mini icons when no default is set
    return (
      <div className="flex items-center -space-x-1">
        <AIProviderIcon provider="openai" size={12} className="opacity-50" />
        <AIProviderIcon provider="anthropic" size={12} className="opacity-50" />
        <AIProviderIcon provider="gemini" size={12} className="opacity-50" />
      </div>
    );
  };

  // Render CLI tool icon - shows brand icon if default is set, otherwise shows stacked icons
  const renderCLIIcon = () => {
    if (defaultCliTool) {
      return (
        <CLIToolIcon
          tool={defaultCliTool}
          size={16}
          className={executionMode === 'cli' ? undefined : 'opacity-70'}
        />
      );
    }
    // Show stacked mini icons when no default is set
    return (
      <div className="flex items-center -space-x-1">
        <CLIToolIcon tool="claude_code" size={12} className="opacity-50" />
        <CLIToolIcon tool="codex" size={12} className="opacity-50" />
        <CLIToolIcon tool="gemini_cli" size={12} className="opacity-50" />
      </div>
    );
  };

  // Determine mode styles
  const apiModeSelected = executionMode === 'api';
  const cliModeSelected = executionMode === 'cli';

  // Get API button styles based on provider and selection state
  const getAPIButtonStyles = () => {
    if (apiModeSelected && apiProviderColors) {
      // Selected state with provider colors
      return apiProviderColors.selected;
    }
    if (!defaultService) {
      // No default service set - use default blue style for API mode
      return apiModeSelected
        ? 'border-blue-500 bg-blue-500/10'
        : 'border-border hover:border-blue-500/50 hover:bg-blue-500/5';
    }
    // Has default service but not selected - use neutral hover
    return 'border-border hover:border-muted-foreground/30 hover:bg-muted/20';
  };

  // Get CLI button styles based on tool and selection state
  const getCLIButtonStyles = () => {
    if (cliModeSelected && cliToolColors) {
      // Selected state with tool colors
      return cn(cliToolColors.borderActive, cliToolColors.bgActive);
    }
    if (!defaultCliTool) {
      // No default tool set
      return 'border-border';
    }
    // Has default tool but not selected - use neutral hover
    return 'border-border hover:border-muted-foreground/30 hover:bg-muted/20';
  };

  return (
    <div className="space-y-4">
      {/* Execution Mode Selector */}
      <div className="p-4 rounded-lg border border-border bg-card/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">AI Execution Mode</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* API Mode */}
          <button
            onClick={() => onExecutionModeChange('api')}
            className={cn(
              'p-3 rounded-lg border-2 transition-all text-left',
              getAPIButtonStyles()
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {renderAPIIcon()}
              <span className={cn(
                'text-sm font-medium',
                apiModeSelected && apiProviderColors ? 'text-foreground' : (apiModeSelected ? 'text-blue-500' : 'text-foreground')
              )}>
                API Mode
              </span>
              {apiModeSelected && (
                <CheckCircle2 className={cn(
                  'w-3.5 h-3.5 ml-auto',
                  apiProviderColors ? 'text-primary' : 'text-blue-500'
                )} />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use cloud AI services via API
            </p>
            {defaultService && apiModeSelected && (
              <p className={cn(
                'text-[10px] mt-1',
                apiProviderColors ? 'text-muted-foreground' : 'text-blue-500'
              )}>
                Default: {defaultService.name}
              </p>
            )}
          </button>

          {/* CLI Mode */}
          <button
            onClick={() => onExecutionModeChange('cli')}
            disabled={!defaultCliTool}
            className={cn(
              'p-3 rounded-lg border-2 transition-all text-left',
              !defaultCliTool && 'opacity-50 cursor-not-allowed',
              getCLIButtonStyles()
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {renderCLIIcon()}
              <span className={cn(
                'text-sm font-medium',
                cliModeSelected && cliToolColors ? cliToolColors.text : 'text-foreground'
              )}>
                CLI Mode
              </span>
              {cliModeSelected && (
                <CheckCircle2 className={cn(
                  'w-3.5 h-3.5 ml-auto',
                  cliToolColors ? cliToolColors.text : 'text-primary'
                )} />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Use local CLI tools (Claude, Codex, etc.)
            </p>
            {defaultCliTool ? (
              cliModeSelected && (
                <p className={cn('text-[10px] mt-1', cliToolColors?.text)}>
                  Default: {cliToolName}
                </p>
              )
            ) : (
              <p className="text-[10px] text-yellow-500 mt-1">
                Set default CLI tool first
              </p>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
            <Server className="w-4 h-4" />
            <span className="text-xs font-medium">Local Providers</span>
          </div>
          <span className="text-lg font-semibold text-foreground">{localServices.length}</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Privacy-first, runs locally</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
            <Cloud className="w-4 h-4" />
            <span className="text-xs font-medium">Cloud Providers</span>
          </div>
          <span className="text-lg font-semibold text-foreground">{cloudServices.length}</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Powered by API providers</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
            <Star className="w-4 h-4" />
            <span className="text-xs font-medium">Default Provider</span>
          </div>
          <span className="text-lg font-semibold text-foreground truncate block">
            {defaultService?.name || 'None'}
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {defaultService ? getProviderInfo(defaultService.provider)?.name : 'Not configured'}
          </p>
        </div>
      </div>

      {/* Usage Info Card */}
      <div className="p-4 rounded-lg border border-border bg-card/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-foreground">AI Features</h4>
            <p className="text-xs text-muted-foreground mt-1">
              AI providers power intelligent features like commit message generation,
              code review suggestions, and security analysis. Configure both API and CLI
              options, then choose your preferred execution mode above.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {services.length === 0 && (
        <div className="p-6 border border-dashed border-border rounded-lg bg-muted/20 text-center">
          <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-medium text-foreground mb-1">No Providers Configured</h4>
          <p className="text-xs text-muted-foreground mb-4">
            Add an AI provider to enable intelligent features. We recommend starting with
            Ollama for local, privacy-first AI.
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CLI Tools Tab Content
// ============================================================================

interface CLIToolsTabProps {
  detectedTools: Array<{ toolType: CLIToolType; binaryPath: string; version?: string }>;
  isLoading: boolean;
  error: string | null;
  defaultCliTool: CLIToolType | null;
  onSetDefault: (tool: CLIToolType) => void;
  onRefresh: () => void;
}

const CLIToolsTab: React.FC<CLIToolsTabProps> = ({
  detectedTools,
  isLoading,
  error,
  defaultCliTool,
  onSetDefault,
  onRefresh,
}) => {
  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">CLI Tools</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detected AI CLI tools on your system
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50'
          )}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-full h-16 rounded-lg" />
          ))}
        </div>
      )}

      {/* CLI Tools List */}
      {!isLoading && (
        <div className="space-y-3">
          {CLI_TOOLS.map((tool) => {
            const detected = detectedTools.find((t) => t.toolType === tool.id);
            const isAvailable = !!detected;
            const isDefault = defaultCliTool === tool.id;
            const colors = getCLIToolColorScheme(tool.id);

            return (
              <div
                key={tool.id}
                className={cn(
                  'p-4 rounded-xl border-2 transition-all duration-200',
                  isAvailable
                    ? cn(colors.bgActive, colors.borderActive)
                    : 'border-border bg-muted/20',
                  !isAvailable && 'opacity-60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Brand Icon */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        'transition-all duration-200',
                        isAvailable ? colors.iconBg : 'bg-muted'
                      )}
                    >
                      <CLIToolIcon tool={tool.id} size={22} />
                    </div>

                    {/* Tool Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'text-sm font-semibold',
                          isAvailable ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {tool.name}
                        </span>
                        {isDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs font-medium">
                            <Star className="w-3 h-3" />
                            Default
                          </span>
                        )}
                        {isAvailable && (
                          <span className={cn(
                            'px-2 py-0.5 text-[10px] font-medium rounded-full',
                            'bg-green-500/10 text-green-600 dark:text-green-400'
                          )}>
                            Installed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isAvailable ? (
                          <span className="flex items-center gap-2 flex-wrap">
                            {detected.version && (
                              <code className="px-1.5 py-0.5 bg-muted rounded text-[11px] font-mono">
                                v{detected.version}
                              </code>
                            )}
                            <span className="text-muted-foreground/70 truncate max-w-[200px]" title={detected.binaryPath}>
                              {detected.binaryPath}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">{tool.description}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isAvailable && !isDefault && (
                      <button
                        onClick={() => onSetDefault(tool.id)}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                          'bg-primary/10 text-primary hover:bg-primary/20',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        )}
                      >
                        Set Default
                      </button>
                    )}

                    {isAvailable && (
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center',
                        'bg-green-500/15'
                      )}>
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                    )}

                    {!isAvailable && (
                      <button
                        onClick={() => openUrl(tool.installUrl)}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                          'bg-accent text-accent-foreground hover:bg-accent/80',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        )}
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Usage Info */}
      <div className="p-4 rounded-xl border border-border bg-card/50 mt-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D97757]/10 via-emerald-500/10 to-blue-500/10 flex items-center justify-center shrink-0 border border-border/50">
            <Terminal className="w-5 h-5 text-foreground/70" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-foreground">CLI Tool Integration</h4>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              CLI tools are used for Code Review, Security Analysis, and Git Commit message
              generation. The default tool will be used when no specific tool is selected.
            </p>
            {/* Supported tools preview */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Supported:
              </span>
              <div className="flex items-center gap-2">
                {CLI_TOOLS.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
                    title={tool.name}
                  >
                    <CLIToolIcon tool={tool.id} size={14} />
                    <span className="text-[10px] font-medium text-muted-foreground">{tool.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Services Tab Content
// ============================================================================

interface ServicesTabProps {
  localServices: AIProviderConfig[];
  cloudServices: AIProviderConfig[];
  testResult: Record<string, TestConnectionResult>;
  testingServiceId: string | null;
  loadingModels: string | null;
  availableModels: Record<string, ModelInfo[]>;
  onEdit: (service: AIProviderConfig) => void;
  onDelete: (service: AIProviderConfig) => void;
  onSetDefault: (providerId: string) => void;
  onTest: (service: AIProviderConfig) => void;
  onLoadModels: (service: AIProviderConfig) => void;
}

const ServicesTab: React.FC<ServicesTabProps> = ({
  localServices,
  cloudServices,
  testResult,
  testingServiceId,
  loadingModels,
  availableModels,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  onLoadModels,
}) => {
  if (localServices.length === 0 && cloudServices.length === 0) {
    return (
      <div className="p-8 border border-dashed border-border rounded-lg bg-muted/20 text-center">
        <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h4 className="text-sm font-medium text-foreground mb-1">No Providers Yet</h4>
        <p className="text-xs text-muted-foreground">
          Go to the "Add Provider" tab to configure your first AI provider.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Local Providers */}
      {localServices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-green-500" />
            </div>
            <span className="text-sm font-medium text-foreground">Local Providers</span>
            <span className="text-xs text-muted-foreground">({localServices.length})</span>
          </div>
          <div className="space-y-2">
            {localServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                testResult={testResult[service.id]}
                isTesting={testingServiceId === service.id}
                isLoadingModels={loadingModels === service.id}
                availableModels={availableModels[service.id]}
                onEdit={() => onEdit(service)}
                onDelete={() => onDelete(service)}
                onSetDefault={() => onSetDefault(service.id)}
                onTest={() => onTest(service)}
                onLoadModels={() => onLoadModels(service)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cloud Providers */}
      {cloudServices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Cloud className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-foreground">Cloud Providers</span>
            <span className="text-xs text-muted-foreground">({cloudServices.length})</span>
          </div>
          <div className="space-y-2">
            {cloudServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                testResult={testResult[service.id]}
                isTesting={testingServiceId === service.id}
                isLoadingModels={loadingModels === service.id}
                availableModels={availableModels[service.id]}
                onEdit={() => onEdit(service)}
                onDelete={() => onDelete(service)}
                onSetDefault={() => onSetDefault(service.id)}
                onTest={() => onTest(service)}
                onLoadModels={() => onLoadModels(service)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Add/Edit Service Tab Content
// ============================================================================

interface AddServiceTabProps {
  editingService: AIProviderConfig | null;
  formData: AddServiceRequest;
  formError: string | null;
  isSubmitting: boolean;
  showApiKey: boolean;
  formModels: ModelInfo[];
  isProbingModels: boolean;
  probeError: string | null;
  formId: string;
  onFormDataChange: (data: Partial<AddServiceRequest>) => void;
  onProviderChange: (provider: AIProvider) => void;
  onProbeModels: () => void;
  onToggleShowApiKey: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const AddServiceTab: React.FC<AddServiceTabProps> = ({
  editingService,
  formData,
  formError,
  isSubmitting,
  showApiKey,
  formModels,
  isProbingModels,
  probeError,
  formId,
  onFormDataChange,
  onProviderChange,
  onProbeModels,
  onToggleShowApiKey,
  onSubmit,
  onCancel,
}) => {
  const currentProviderInfo = getProviderInfo(formData.provider);
  const requiresApiKey = providerRequiresApiKey(formData.provider);

  const modelOptions = useMemo<SelectOption[]>(() => {
    const values = new Map<string, SelectOption>();
    formModels.forEach((model) => {
      values.set(model.name, {
        value: model.name,
        label: model.name,
        description: model.modifiedAt ? `Updated ${model.modifiedAt}` : undefined,
      });
    });
    if (formData.model && !values.has(formData.model)) {
      values.set(formData.model, { value: formData.model, label: formData.model });
    }
    return Array.from(values.values());
  }, [formModels, formData.model]);

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable Form Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1 pb-4">
        {/* Form Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {editingService ? 'Edit Provider' : 'Add New Provider'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editingService
                ? 'Update the provider configuration below'
                : 'Configure a new AI provider'}
            </p>
          </div>
          {editingService && (
            <button
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel editing
            </button>
          )}
        </div>

        {/* Error */}
        {formError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* Provider Selection */}
        {!editingService && (
          <ProviderSelector
            value={formData.provider}
            onChange={onProviderChange}
            disabled={isSubmitting}
          />
        )}

      {/* Provider Details Form */}
      <div className="p-4 border border-border rounded-xl bg-card/50 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Provider Configuration</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-muted-foreground mb-1.5">
              Provider Name
            </label>
            <input
              id={`${formId}-name`}
              type="text"
              value={formData.name}
              onChange={(e) => onFormDataChange({ name: e.target.value })}
              placeholder={`My ${currentProviderInfo?.name || 'AI'} Provider`}
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-background border border-border',
                'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                'placeholder:text-muted-foreground/50'
              )}
            />
          </div>

          {/* Model */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor={`${formId}-model`} className="block text-xs font-medium text-muted-foreground">
                Model
              </label>
              <button
                type="button"
                onClick={onProbeModels}
                disabled={isProbingModels || (requiresApiKey && !formData.apiKey)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded transition-colors',
                  'border border-border',
                  'hover:border-primary hover:text-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isProbingModels ? 'Loading...' : 'Fetch models'}
              </button>
            </div>

            {modelOptions.length > 0 ? (
              <Select
                value={formData.model}
                onValueChange={(val) => onFormDataChange({ model: val })}
                options={modelOptions}
                placeholder="Choose a model"
                aria-label="Model"
              />
            ) : (
              <input
                id={`${formId}-model`}
                type="text"
                value={formData.model}
                onChange={(e) => onFormDataChange({ model: e.target.value })}
                placeholder={currentProviderInfo?.defaultModel || 'model-name'}
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-background border border-border',
                  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                  'placeholder:text-muted-foreground/50'
                )}
              />
            )}

            {probeError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {probeError}
              </p>
            )}
          </div>

          {/* Endpoint */}
          <div className="col-span-2">
            <label htmlFor={`${formId}-endpoint`} className="block text-xs font-medium text-muted-foreground mb-1.5">
              API Endpoint
            </label>
            <input
              id={`${formId}-endpoint`}
              type="text"
              value={formData.endpoint}
              onChange={(e) => onFormDataChange({ endpoint: e.target.value })}
              placeholder={currentProviderInfo?.defaultEndpoint || 'https://api.example.com'}
              className={cn(
                'w-full px-3 py-2 rounded-lg text-sm font-mono',
                'bg-background border border-border',
                'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                'placeholder:text-muted-foreground/50'
              )}
            />
          </div>

          {/* API Key (for cloud providers) */}
          {requiresApiKey && (
            <div className="col-span-2">
              <label htmlFor={`${formId}-apikey`} className="block text-xs font-medium text-muted-foreground mb-1.5">
                API Key {editingService && <span className="text-muted-foreground/70">(leave empty to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  id={`${formId}-apikey`}
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey || ''}
                  onChange={(e) => onFormDataChange({ apiKey: e.target.value })}
                  placeholder={editingService ? '********' : 'sk-...'}
                  className={cn(
                    'w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono',
                    'bg-background border border-border',
                    'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                    'placeholder:text-muted-foreground/50'
                  )}
                />
                <button
                  type="button"
                  onClick={onToggleShowApiKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Stored securely in system keychain
              </p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Submit Button - Fixed at bottom */}
      <div className="shrink-0 pt-4 border-t border-border bg-background">
        <div className="flex justify-end gap-2">
          {editingService && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingService ? 'Update Provider' : 'Add Provider'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function AIProviderSettingsPanel() {
  const {
    services,
    isLoadingServices,
    servicesError,
    addService,
    updateService,
    deleteService,
    setDefaultService,
    testConnection,
    listModels,
    probeModels,
    loadServices,
  } = useAIService({ autoLoad: true });

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview');

  // CLI Tools state
  const { tools: detectedCLITools, loading: cliToolsLoading, error: cliToolsError, refresh: refreshCLITools } = useDetectedCLITools();
  const [defaultCliTool, setDefaultCliToolState] = useState<CLIToolType | null>(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('packageflow:defaultCliTool');
    return saved ? (saved as CLIToolType) : null;
  });

  // AI Execution Mode state
  const [executionMode, setExecutionModeState] = useState<AIExecutionMode>(() => {
    return getAIExecutionMode();
  });

  // Handle setting default CLI tool
  const handleSetDefaultCliTool = useCallback((tool: CLIToolType) => {
    setDefaultCliToolState(tool);
    localStorage.setItem('packageflow:defaultCliTool', tool);
  }, []);

  // Handle execution mode change
  const handleExecutionModeChange = useCallback((mode: AIExecutionMode) => {
    setExecutionModeState(mode);
    setAIExecutionMode(mode);
  }, []);

  // UI state
  const [editingService, setEditingService] = useState<AIProviderConfig | null>(null);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestConnectionResult>>({});
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, ModelInfo[]>>({});
  const [formModels, setFormModels] = useState<ModelInfo[]>([]);
  const [isProbingModels, setIsProbingModels] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<AIProviderConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AddServiceRequest>({
    name: '',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    apiKey: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const formId = useId();

  // Computed values
  const localServices = useMemo(() => services.filter((s) => !providerRequiresApiKey(s.provider)), [services]);
  const cloudServices = useMemo(() => services.filter((s) => providerRequiresApiKey(s.provider)), [services]);
  const defaultService = useMemo(() => services.find((s) => s.isDefault), [services]);

  // Track if we've tested connections for this tab visit
  const hasTestedRef = useRef<boolean>(false);

  // Auto test connections when switching to Services tab
  useEffect(() => {
    if (activeTab === 'services' && services.length > 0 && !hasTestedRef.current) {
      hasTestedRef.current = true;
      // Test all services in parallel
      const testAllServices = async () => {
        for (const service of services) {
          // Skip if already testing
          if (testingServiceId === service.id) continue;
          // Skip if already have recent result
          if (testResult[service.id]) continue;

          setTestingServiceId(service.id);
          try {
            const result = await testConnection(service.id);
            if (result) {
              setTestResult((prev) => ({ ...prev, [service.id]: result }));
            }
          } catch {
            // Error handling in hook
          } finally {
            setTestingServiceId(null);
          }
        }
      };
      testAllServices();
    }

    // Reset when leaving services tab
    if (activeTab !== 'services') {
      hasTestedRef.current = false;
    }
  }, [activeTab, services, testConnection, testingServiceId, testResult]);

  // Handle provider change - update defaults
  const handleProviderChange = useCallback((provider: AIProvider) => {
    const info = getProviderInfo(provider);
    if (info) {
      setFormData((prev) => ({
        ...prev,
        provider,
        endpoint: info.defaultEndpoint,
        model: info.defaultModel,
        apiKey: '',
      }));
    }
    setShowApiKey(false);
    setFormModels([]);
    setProbeError(null);
  }, []);

  // Handle form data change
  const handleFormDataChange = useCallback((data: Partial<AddServiceRequest>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    const defaultProvider = AI_PROVIDERS[3]; // Ollama
    setFormData({
      name: '',
      provider: defaultProvider.id,
      endpoint: defaultProvider.defaultEndpoint,
      model: defaultProvider.defaultModel,
      apiKey: '',
    });
    setEditingService(null);
    setFormError(null);
    setShowApiKey(false);
    setFormModels([]);
    setProbeError(null);
  }, []);

  // Start editing service
  const handleStartEdit = useCallback((service: AIProviderConfig) => {
    setEditingService(service);
    setFormError(null);
    setShowApiKey(false);
    setFormModels([]);
    setProbeError(null);
    setFormData({
      name: service.name,
      provider: service.provider,
      endpoint: service.endpoint,
      model: service.model,
      apiKey: '',
    });
    setActiveTab('add');
  }, []);

  // Cancel form
  const handleCancelForm = useCallback(() => {
    resetForm();
    setActiveTab('services');
  }, [resetForm]);

  // Submit form (add or update)
  const handleSubmit = useCallback(async () => {
    if (!formData.name.trim()) {
      setFormError('Please enter a provider name');
      return;
    }
    if (!formData.endpoint.trim()) {
      setFormError('Please enter an API endpoint');
      return;
    }
    if (!formData.model.trim()) {
      setFormError('Please enter a model name');
      return;
    }
    if (providerRequiresApiKey(formData.provider) && !editingService && !formData.apiKey?.trim()) {
      setFormError('Please enter an API key');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingService) {
        const result = await updateService({
          id: editingService.id,
          name: formData.name,
          endpoint: formData.endpoint,
          model: formData.model,
          apiKey: formData.apiKey || undefined,
        });
        if (result) {
          resetForm();
          setActiveTab('services');
        }
      } else {
        const result = await addService(formData);
        if (result) {
          resetForm();
          setActiveTab('services');
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingService, addService, updateService, resetForm]);

  // Test connection
  const handleTestConnection = useCallback(async (service: AIProviderConfig) => {
    setTestingServiceId(service.id);
    try {
      const result = await testConnection(service.id);
      if (result) {
        setTestResult((prev) => ({ ...prev, [service.id]: result }));
      }
    } catch {
      // Error handling in hook
    } finally {
      setTestingServiceId(null);
    }
  }, [testConnection]);

  // Load models
  const handleLoadModels = useCallback(async (service: AIProviderConfig) => {
    setLoadingModels(service.id);
    try {
      const models = await listModels(service.id);
      if (models) {
        setAvailableModels((prev) => ({ ...prev, [service.id]: models }));
      }
    } catch {
      // Error handling in hook
    } finally {
      setLoadingModels(null);
    }
  }, [listModels]);

  // Probe models for current form
  const handleProbeModels = useCallback(async () => {
    setProbeError(null);
    setIsProbingModels(true);
    try {
      if (!formData.endpoint.trim()) {
        setProbeError('Please enter an API endpoint first');
        return;
      }

      const needsKey = providerRequiresApiKey(formData.provider);

      const models = await probeModels({
        provider: formData.provider,
        endpoint: formData.endpoint,
        model: formData.model || undefined,
        apiKey: needsKey ? formData.apiKey : undefined,
      });

      setFormModels(models);

      if (models.length === 0) {
        setProbeError('No models found at this endpoint');
      } else if (!formData.model || !models.some((m) => m.name === formData.model)) {
        setFormData((prev) => ({ ...prev, model: models[0].name }));
      }
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsProbingModels(false);
    }
  }, [formData, probeModels]);

  // Delete service
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteService(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error in hook
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteService]);

  // Render header component for reuse
  const renderHeader = () => (
    <div>
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Bot className="w-5 h-5" />
        AI Providers
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Configure AI providers for code review, commit messages, and more
      </p>
    </div>
  );

  // Render
  if (isLoadingServices) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 pb-4">
          {renderHeader()}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (servicesError) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 pb-4">
          {renderHeader()}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorState message={servicesError} onRetry={loadServices} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Fixed Header Section */}
      <div className="shrink-0 space-y-4 pb-4">
        {/* Header */}
        {renderHeader()}

        {/* Status Card */}
        <AIStatusCard
          totalServices={services.length}
          localServices={localServices.length}
          cloudServices={cloudServices.length}
          defaultService={defaultService}
          hasEnabledServices={services.length > 0}
        />
      </div>

      {/* Scrollable Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 pb-4">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              <span>Providers</span>
              {services.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-muted rounded-full">
                  {services.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="cli-tools" className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>CLI Tools</span>
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>{editingService ? 'Edit' : 'Add'}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content Area - flex container for proper height inheritance */}
        <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden pr-1">
          <TabsContent value="overview" className="mt-0 px-0.5 overflow-y-auto">
            <OverviewTab
              services={services}
              localServices={localServices}
              cloudServices={cloudServices}
              defaultService={defaultService}
              defaultCliTool={defaultCliTool}
              executionMode={executionMode}
              onExecutionModeChange={handleExecutionModeChange}
            />
          </TabsContent>

          <TabsContent value="services" className="mt-0 px-0.5 overflow-y-auto">
            <ServicesTab
              localServices={localServices}
              cloudServices={cloudServices}
              testResult={testResult}
              testingServiceId={testingServiceId}
              loadingModels={loadingModels}
              availableModels={availableModels}
              onEdit={handleStartEdit}
              onDelete={setDeleteTarget}
              onSetDefault={setDefaultService}
              onTest={handleTestConnection}
              onLoadModels={handleLoadModels}
            />
          </TabsContent>

          <TabsContent value="cli-tools" className="mt-0 px-0.5 overflow-y-auto">
            <CLIToolsTab
              detectedTools={detectedCLITools.map((t) => ({
                toolType: t.toolType,
                binaryPath: t.binaryPath,
                version: t.version ?? undefined,
              }))}
              isLoading={cliToolsLoading}
              error={cliToolsError}
              defaultCliTool={defaultCliTool}
              onSetDefault={handleSetDefaultCliTool}
              onRefresh={refreshCLITools}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-0 px-0.5 flex-1 min-h-0 flex flex-col">
            <AddServiceTab
              editingService={editingService}
              formData={formData}
              formError={formError}
              isSubmitting={isSubmitting}
              showApiKey={showApiKey}
              formModels={formModels}
              isProbingModels={isProbingModels}
              probeError={probeError}
              formId={formId}
              onFormDataChange={handleFormDataChange}
              onProviderChange={handleProviderChange}
              onProbeModels={handleProbeModels}
              onToggleShowApiKey={() => setShowApiKey(!showApiKey)}
              onSubmit={handleSubmit}
              onCancel={handleCancelForm}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        itemType="AI Provider"
        itemName={deleteTarget?.name || ''}
        isLoading={isDeleting}
      />
    </div>
  );
}
