/**
 * QuickActionChips - Contextual action suggestions as clickable chips
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import {
  HelpCircle,
  GitCommit,
  FileSearch,
  TestTube,
  Hammer,
  Terminal,
  GitBranch,
  Play,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SuggestedAction } from '../../types/ai-assistant';

interface QuickActionChipsProps {
  /** List of suggested actions to display */
  suggestions: SuggestedAction[];
  /** Handler when a chip is clicked */
  onAction: (prompt: string) => void;
  /** Whether the chips are disabled (e.g., during generation) */
  disabled?: boolean;
  /** Optional class name */
  className?: string;
}

/** Map icon names to Lucide components */
const ICON_MAP: Record<string, React.ElementType> = {
  HelpCircle,
  GitCommit,
  FileSearch,
  TestTube,
  Hammer,
  Terminal,
  GitBranch,
  Play,
};

/** Get icon component by name */
function getIcon(iconName?: string): React.ElementType | null {
  if (!iconName) return null;
  return ICON_MAP[iconName] || null;
}

/** Get chip variant styles */
function getVariantStyles(variant?: string): string {
  switch (variant) {
    case 'primary':
      return 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/30';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20 hover:border-yellow-500/30';
    default:
      return 'bg-muted/50 text-foreground/80 border-border hover:bg-muted hover:border-border/80';
  }
}

/**
 * Quick action chips component - displays contextual suggestions
 */
export function QuickActionChips({
  suggestions,
  onAction,
  disabled = false,
  className,
}: QuickActionChipsProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {suggestions.map((suggestion) => {
        const Icon = getIcon(suggestion.icon);
        const variantStyles = getVariantStyles(suggestion.variant);

        return (
          <button
            key={suggestion.id}
            onClick={() => onAction(suggestion.prompt)}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5',
              'text-xs font-medium rounded-full border',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              variantStyles,
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={`${suggestion.label}: ${suggestion.prompt}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{suggestion.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Default quick actions when no project context is available
 */
export const DEFAULT_QUICK_ACTIONS: SuggestedAction[] = [
  {
    id: 'help',
    label: 'What can you do?',
    prompt: 'What can you help me with?',
    icon: 'HelpCircle',
    variant: 'default',
    category: 'general',
  },
];

/**
 * Git-related quick actions
 */
export const GIT_QUICK_ACTIONS: SuggestedAction[] = [
  {
    id: 'commit-message',
    label: 'Generate commit',
    prompt: 'Generate a commit message for my staged changes',
    icon: 'GitCommit',
    variant: 'primary',
    category: 'git',
  },
  {
    id: 'review-changes',
    label: 'Review changes',
    prompt: 'Review my staged changes and suggest improvements',
    icon: 'FileSearch',
    variant: 'default',
    category: 'git',
  },
];

/**
 * Project-related quick actions
 */
export const PROJECT_QUICK_ACTIONS: SuggestedAction[] = [
  {
    id: 'run-tests',
    label: 'Run tests',
    prompt: 'Run the test suite for this project',
    icon: 'TestTube',
    variant: 'default',
    category: 'project',
  },
  {
    id: 'build-project',
    label: 'Build project',
    prompt: 'Build this project',
    icon: 'Hammer',
    variant: 'default',
    category: 'project',
  },
];
