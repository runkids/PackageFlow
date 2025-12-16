/**
 * AIProviderNotConfiguredState - Empty state when no AI provider is configured
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { Bot, Settings2, Sparkles } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface AIProviderNotConfiguredStateProps {
  /** Handler to open settings page */
  onOpenSettings: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Empty state component displayed when no AI providers are configured.
 * Guides users to configure AI providers in Settings.
 *
 * Visual design:
 * - Purple gradient icon badge with Bot icon and Sparkles decoration
 * - Clear title and description
 * - Primary action button to open settings
 * - Background dot pattern for visual interest
 * - Keyboard shortcut hint
 */
export function AIProviderNotConfiguredState({
  onOpenSettings,
  className,
}: AIProviderNotConfiguredStateProps) {
  return (
    <EmptyState
      icon={Bot}
      decorativeIcon={Sparkles}
      title="AI Providers Not Configured"
      description="To use the AI Assistant, configure at least one AI service in Settings. You can add OpenAI, Anthropic, Google Gemini, or local providers like Ollama and LM Studio."
      variant="purple"
      showBackgroundPattern
      action={{
        label: 'Configure AI Providers',
        icon: Settings2,
        onClick: onOpenSettings,
      }}
      shortcuts={[
        { key: 'Cmd+,', label: 'Open Settings' },
      ]}
      className={className}
    />
  );
}
