/**
 * ConversationHeader - Header bar for the chat area
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 *
 * Features:
 * - Model selector (per-conversation)
 * - Token usage indicator
 * - Project context badge
 * - Settings access
 */

import { useState, useEffect } from 'react';
import {
  Settings,
  Sparkles,
  Folder,
  ChevronDown,
  Check,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Dropdown, DropdownItem, DropdownSection } from '../ui/Dropdown';
import type { Conversation } from '../../types/ai-assistant';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
            isCritical
              ? 'bg-red-500/80'
              : isWarning
                ? 'bg-amber-500/80'
                : 'bg-purple-500/60'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Model selector dropdown
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
  const currentService = services.find((s) => s.id === currentServiceId);
  const enabledServices = services.filter((s) => s.isEnabled);

  if (enabledServices.length === 0) {
    return (
      <span className="text-xs text-muted-foreground px-2.5 py-1.5 bg-muted/30 rounded-lg border border-border/50">
        No AI provider configured
      </span>
    );
  }

  return (
    <Dropdown
      trigger={
        <button
          disabled={disabled}
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
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span className="truncate max-w-[100px]">
            {currentService?.name || 'Select provider'}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground/70" />
        </button>
      }
      align="left"
    >
      <DropdownSection>
        {enabledServices.map((service) => (
          <DropdownItem
            key={service.id}
            icon={
              service.id === currentServiceId ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <div className="w-4 h-4" />
              )
            }
            onClick={() => onSelect(service.id)}
          >
            <div className="flex flex-col">
              <span className="font-medium">{service.name}</span>
              <span className="text-[11px] text-muted-foreground/70">
                {service.provider} - {service.model}
              </span>
            </div>
          </DropdownItem>
        ))}
      </DropdownSection>
    </Dropdown>
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
}: ConversationHeaderProps) {
  const [aiProviders, setAiServices] = useState<AIProviderConfig[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  // Load AI services function
  const loadServices = async (autoSelectDefault = false) => {
    try {
      const result = await invoke<{ success: boolean; data?: AIProviderConfig[] }>('ai_list_providers');
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

  // Get project name from path
  const projectName = conversation?.projectPath
    ? conversation.projectPath.split('/').pop()
    : null;

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

        {/* Project context badge */}
        {projectName && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
              'text-xs text-muted-foreground/80',
              'bg-muted/30 border border-border/40'
            )}
          >
            <Folder className="w-3.5 h-3.5 text-blue-500/70" />
            <span className="truncate max-w-[120px]">{projectName}</span>
          </div>
        )}

      </div>

      {/* Right side - Token usage and settings */}
      <div className="flex items-center gap-3">
        {/* Token usage */}
        {tokensUsed > 0 && (
          <TokenUsageIndicator used={tokensUsed} />
        )}

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
