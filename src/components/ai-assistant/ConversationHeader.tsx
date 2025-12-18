/**
 * ConversationHeader - Header bar for the chat area
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Feature 024 - Context-Aware AI Assistant (Project Selector)
 *
 * Features:
 * - Model selector (per-conversation)
 * - Token usage indicator
 * - Project context selector (Feature 024)
 * - Settings access
 */

import { useState, useEffect, useRef } from 'react';
import { Settings, Sparkles, ChevronDown, Check, Loader2, Bot } from 'lucide-react';
import { AIProviderIcon, getProviderColorScheme } from '../ui/AIProviderIcon';
import type { AIProvider } from '../../types/ai';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import type { Conversation } from '../../types/ai-assistant';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ProjectContextSelector } from './ProjectContextSelector';

interface ConversationHeaderProps {
  /** Current conversation */
  conversation: Conversation | null;
  /** Total tokens used in this conversation */
  tokensUsed: number;
  /** Whether AI is currently generating */
  isGenerating: boolean;
  /** Handler for settings click */
  onSettingsClick: () => void;
  /** Selected provider ID (when no conversation exists) */
  selectedProviderId?: string | null;
  /** Handler for provider selection (when no conversation exists) */
  onProviderSelect?: (providerId: string) => void;
  /** Handler for service change */
  onServiceChange?: () => void;
  /** Feature 024: Current project path (may differ from conversation.projectPath) */
  currentProjectPath?: string;
  /** Feature 024: Handler for project context change */
  onProjectContextChange?: (projectPath: string | null) => void;
}

interface AIProviderConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  isEnabled: boolean;
  isDefault: boolean;
}

/**
 * Token usage indicator with visual progress
 */
function TokenUsageIndicator({
  used,
  limit = 100000,
  showLabel = true,
}: {
  used: number;
  limit?: number;
  showLabel?: boolean;
}) {
  const percentage = Math.min((used / limit) * 100, 100);
  const isWarning = percentage > 75;
  const isCritical = percentage > 90;

  // Format token count (e.g., 1.2k, 15k)
  const formatTokens = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
        'bg-muted/30 border border-border/40',
        'text-xs text-muted-foreground/80'
      )}
      title={`${used.toLocaleString()} tokens used`}
    >
      {showLabel && (
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-purple-500/70" />
          <span className="font-mono">{formatTokens(used)}</span>
        </span>
      )}
      <div className="w-12 h-1.5 bg-muted/60 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            isCritical ? 'bg-red-500/80' : isWarning ? 'bg-amber-500/80' : 'bg-purple-500/60'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Individual provider item in the dropdown
 */
function ProviderItem({
  service,
  isSelected,
  onClick,
}: {
  service: AIProviderConfig;
  isSelected: boolean;
  onClick: () => void;
}) {
  const providerType = service.provider?.toLowerCase() as AIProvider;
  const colorScheme = service.provider ? getProviderColorScheme(providerType) : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left',
        'transition-colors duration-100',
        'focus:outline-none focus-visible:bg-accent/50',
        isSelected
          ? 'bg-primary/10 dark:bg-primary/15'
          : 'hover:bg-accent/50 dark:hover:bg-accent/30'
      )}
    >
      {/* Icon container - uses provider-specific color scheme */}
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          'transition-colors duration-100',
          colorScheme ? colorScheme.iconBg : 'bg-muted text-muted-foreground'
        )}
      >
        {service.provider ? (
          <AIProviderIcon provider={providerType} size={16} />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col flex-1 min-w-0">
        <span
          className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-foreground' : 'text-foreground/90'
          )}
        >
          {service.name}
        </span>
        <span
          className={cn(
            'text-[11px] truncate',
            isSelected ? 'text-muted-foreground' : 'text-muted-foreground/70'
          )}
        >
          {service.model}
        </span>
      </div>

      {/* Check indicator */}
      {isSelected && (
        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
          <Check className="w-4 h-4 text-primary" />
        </div>
      )}
    </button>
  );
}

/**
 * Model selector dropdown - redesigned to match ProjectContextSelector
 */
function ModelSelector({
  currentServiceId,
  services,
  disabled,
  onSelect,
}: {
  currentServiceId: string | null;
  services: AIProviderConfig[];
  disabled: boolean;
  onSelect: (providerId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentService = services.find((s) => s.id === currentServiceId);
  const enabledServices = services.filter((s) => s.isEnabled);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (enabledServices.length === 0) {
    return (
      <span className="text-xs text-muted-foreground px-2.5 py-1.5 bg-muted/30 rounded-lg border border-border/50">
        No AI provider configured
      </span>
    );
  }

  // Render provider icon for trigger button
  const renderTriggerIcon = () => {
    if (!currentService?.provider) {
      return <Bot className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />;
    }
    const providerType = currentService.provider.toLowerCase() as AIProvider;
    return <AIProviderIcon provider={providerType} size={14} />;
  };

  const handleSelect = (serviceId: string) => {
    onSelect(serviceId);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
          'text-xs font-medium',
          'bg-muted/40 hover:bg-muted/60',
          'border border-border/60 hover:border-border',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Select AI provider"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {renderTriggerIcon()}
        <span className="truncate max-w-[100px]">
          {currentService?.name || 'Select provider'}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-muted-foreground/70 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-[1000] mt-1.5 left-0',
            'min-w-[260px] max-w-[320px]',
            'rounded-xl shadow-lg',
            'bg-card',
            'border border-border',
            'overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
            'duration-150'
          )}
          role="listbox"
          aria-label="AI provider options"
        >
          {/* Section header */}
          <div className="px-3 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              AI Providers
            </span>
          </div>

          {/* Provider list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {enabledServices.map((service) => (
              <ProviderItem
                key={service.id}
                service={service}
                isSelected={service.id === currentServiceId}
                onClick={() => handleSelect(service.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Conversation header component
 */
export function ConversationHeader({
  conversation,
  tokensUsed,
  isGenerating,
  onSettingsClick,
  selectedProviderId,
  onProviderSelect,
  onServiceChange,
  currentProjectPath,
  onProjectContextChange,
}: ConversationHeaderProps) {
  const [aiProviders, setAiServices] = useState<AIProviderConfig[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  // Load AI services function
  const loadServices = async (autoSelectDefault = false) => {
    try {
      const result = await invoke<{ success: boolean; data?: AIProviderConfig[] }>(
        'ai_list_providers'
      );
      if (result.success && result.data) {
        setAiServices(result.data);
        // Auto-select default provider if nothing is selected and no conversation
        if (autoSelectDefault && !conversation && !selectedProviderId) {
          const defaultProvider = result.data.find((p) => p.isDefault && p.isEnabled);
          if (defaultProvider) {
            onProviderSelect?.(defaultProvider.id);
          } else {
            // Fallback to first enabled provider
            const firstEnabled = result.data.find((p) => p.isEnabled);
            if (firstEnabled) {
              onProviderSelect?.(firstEnabled.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load AI services:', err);
    } finally {
      setIsLoadingServices(false);
    }
  };

  // Load AI services on mount
  useEffect(() => {
    loadServices(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for AI services update event
  useEffect(() => {
    const unlisten = listen('ai:services-updated', () => {
      loadServices(false);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle model selection
  const handleModelSelect = async (providerId: string) => {
    // If no conversation yet, just update the selected provider in parent state
    if (!conversation) {
      onProviderSelect?.(providerId);
      return;
    }

    try {
      await invoke('ai_assistant_update_conversation_service', {
        conversationId: conversation.id,
        providerId,
      });
      // Notify parent to reload conversation
      onServiceChange?.();
    } catch (err) {
      console.error('Failed to update conversation service:', err);
    }
  };

  // Determine current service ID: conversation's provider takes precedence, then selectedProviderId
  const currentServiceId = conversation?.providerId ?? selectedProviderId ?? null;

  // Feature 024: Effective project path (prop takes precedence for hybrid mode)
  const effectiveProjectPath = currentProjectPath ?? conversation?.projectPath;

  return (
    <header
      className={cn(
        'flex items-center justify-between',
        'px-4 py-2.5',
        'border-b border-border/50',
        'bg-gradient-to-r from-card/80 via-card/60 to-card/80',
        'backdrop-blur-sm',
        'relative z-10'
      )}
    >
      {/* Left side - Model selector and project context */}
      <div className="flex items-center gap-3">
        {/* Model selector */}
        {isLoadingServices ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Loading providers...</span>
          </div>
        ) : (
          <ModelSelector
            currentServiceId={currentServiceId}
            services={aiProviders}
            disabled={isGenerating}
            onSelect={handleModelSelect}
          />
        )}

        {/* Feature 024: Project context selector */}
        <ProjectContextSelector
          currentProjectPath={effectiveProjectPath ?? undefined}
          onProjectChange={onProjectContextChange ?? (() => {})}
          disabled={isGenerating}
          isConversationBound={!!conversation?.projectPath}
        />
      </div>

      {/* Right side - Token usage and settings */}
      <div className="flex items-center gap-3">
        {/* Token usage */}
        {tokensUsed > 0 && <TokenUsageIndicator used={tokensUsed} />}

        {/* Settings button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          className="h-8 w-8 rounded-lg hover:bg-muted/60"
          aria-label="AI Settings"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
