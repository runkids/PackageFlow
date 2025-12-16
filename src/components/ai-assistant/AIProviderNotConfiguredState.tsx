/**
 * AIProviderNotConfiguredState - Empty state when no AI provider is configured
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { Bot, Settings2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface AIProviderNotConfiguredStateProps {
  /** Handler to open settings page */
  onOpenSettings: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Empty state component displayed when no AI providers are configured.
 * Guides users to configure AI providers in Settings.
 */
export function AIProviderNotConfiguredState({
  onOpenSettings,
  className,
}: AIProviderNotConfiguredStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        'h-full p-8 text-center',
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-20 h-20 rounded-2xl',
          'bg-primary/10',
          'flex items-center justify-center',
          'mb-6'
        )}
      >
        <Bot className="w-10 h-10 text-primary" />
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-foreground mb-2">
        AI Providers Not Configured
      </h2>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        To use the AI Assistant, please configure at least one AI service in Settings.
        You can add OpenAI, Anthropic, or other supported AI providers.
      </p>

      {/* Action button */}
      <Button
        onClick={onOpenSettings}
        className={cn(
          'inline-flex items-center gap-2 px-6 py-3',
          'font-medium'
        )}
      >
        <Settings2 className="w-4 h-4" />
        Configure AI Providers
      </Button>
    </div>
  );
}
