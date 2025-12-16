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

interface ConversationHeaderProps {
  /** Current conversation */
  conversation: Conversation | null;
  /** Total tokens used in this conversation */
  tokensUsed: number;
  /** Whether AI is currently generating */
  isGenerating: boolean;
  /** Handler for settings click */
  onSettingsClick: () => void;
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

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3 inline mr-1" />
          {used.toLocaleString()} tokens
        </span>
      )}
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            isCritical
              ? 'bg-red-500'
              : isWarning
                ? 'bg-amber-500'
                : 'bg-primary'
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
      <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded">
        No AI service configured
      </span>
    );
  }

  return (
    <Dropdown
      trigger={
        <button
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md',
            'text-xs font-medium',
            'bg-muted/50 hover:bg-muted',
            'border border-border',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span className="truncate max-w-[120px]">
            {currentService?.name || 'Select model'}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
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
              <span className="text-xs text-muted-foreground">
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
  onServiceChange,
}: ConversationHeaderProps) {
  const [aiProviders, setAiServices] = useState<AIProviderConfig[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  // Load AI services
  useEffect(() => {
    async function loadServices() {
      try {
        const result = await invoke<{ success: boolean; data?: AIProviderConfig[] }>('ai_list_services');
        if (result.success && result.data) {
          setAiServices(result.data);
        }
      } catch (err) {
        console.error('Failed to load AI services:', err);
      } finally {
        setIsLoadingServices(false);
      }
    }
    loadServices();
  }, []);

  // Handle model selection
  const handleModelSelect = async (providerId: string) => {
    if (!conversation) return;

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

  // Get project name from path
  const projectName = conversation?.projectPath
    ? conversation.projectPath.split('/').pop()
    : null;

  return (
    <header
      className={cn(
        'flex items-center justify-between',
        'px-4 py-2',
        'border-b border-border',
        'bg-card/50 backdrop-blur-sm'
      )}
    >
      {/* Left side - Model selector and project context */}
      <div className="flex items-center gap-3">
        {/* Model selector */}
        {isLoadingServices ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Loading...</span>
          </div>
        ) : (
          <ModelSelector
            currentServiceId={conversation?.providerId ?? null}
            services={aiProviders}
            disabled={isGenerating}
            onSelect={handleModelSelect}
          />
        )}

        {/* Project context badge */}
        {projectName && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md',
              'text-xs text-muted-foreground',
              'bg-muted/30 border border-border/50'
            )}
          >
            <Folder className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{projectName}</span>
          </div>
        )}

        {/* Generating indicator */}
        {isGenerating && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Generating...</span>
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
          className="h-7 w-7"
          aria-label="AI Settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
