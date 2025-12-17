/**
 * QuickActionChips - Contextual action suggestions as clickable chips
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Feature 023 - Category grouping with headers (T057-T058)
 * Enhancement: Staggered animation for expand/collapse (Feature 023)
 */

import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  HelpCircle,
  GitCommit,
  FileSearch,
  TestTube,
  Hammer,
  Terminal,
  GitBranch,
  GitFork,
  FileDiff,
  Play,
  FolderGit2,
  FolderOpen,
  Package,
  Workflow,
  Lightbulb,
  Zap,
  Info,
  // Feature 024: New icons for security, process, system categories
  Shield,
  AlertTriangle,
  Activity,
  StopCircle,
  Search,
  Settings,
  Bell,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SuggestedAction } from '../../types/ai-assistant';

interface QuickActionChipsProps {
  /** List of suggested actions to display */
  suggestions: SuggestedAction[];
  /** Handler when a chip is clicked - receives the full action object */
  onAction: (action: SuggestedAction) => void;
  /** Whether the chips are disabled (e.g., during generation) */
  disabled?: boolean;
  /** Optional class name */
  className?: string;
  /** Whether to group by category with headers (Feature 023) */
  grouped?: boolean;
  /** Whether chips are visible (controls staggered animation) */
  isVisible?: boolean;
  /** Horizontal inline mode for collapsible quick actions */
  horizontal?: boolean;
  /** Current project path for context (Feature 024) */
  currentProjectPath?: string;
}

// ============================================================================
// Animation Configuration
// ============================================================================

/** Animation timing constants (in milliseconds) */
const ANIMATION_CONFIG = {
  /** Delay between each chip animation */
  staggerDelay: 50,
  /** Duration of individual chip animation */
  duration: 200,
  /** Maximum delay cap to prevent overly long animations */
  maxDelay: 400,
} as const;

/** Horizontal mode animation timing constants */
const HORIZONTAL_ANIMATION_CONFIG = {
  /** Delay between each chip animation */
  staggerDelay: 40,
  /** Duration of individual chip animation */
  duration: 180,
  /** Maximum delay cap */
  maxDelay: 300,
} as const;

// ============================================================================
// Category Configuration (Feature 023 - T058)
// ============================================================================

/** Category display order */
const CATEGORY_ORDER: Array<SuggestedAction['category']> = [
  'git',
  'project',
  'workflow',
  'security',
  'process',
  'system',
  'general',
];

/** Category configuration for headers */
interface CategoryConfig {
  label: string;
  icon: React.ElementType;
  colorClass: string;
}

const CATEGORY_CONFIG: Record<NonNullable<SuggestedAction['category']>, CategoryConfig> = {
  git: {
    label: 'Git',
    icon: FolderGit2,
    colorClass: 'text-orange-500',
  },
  project: {
    label: 'Project',
    icon: Package,
    colorClass: 'text-blue-500',
  },
  workflow: {
    label: 'Workflow',
    icon: Workflow,
    colorClass: 'text-purple-500',
  },
  // Feature 024: New categories
  security: {
    label: 'Security',
    icon: Shield,
    colorClass: 'text-red-500',
  },
  process: {
    label: 'Process',
    icon: Activity,
    colorClass: 'text-cyan-500',
  },
  system: {
    label: 'System',
    icon: Settings,
    colorClass: 'text-gray-500',
  },
  general: {
    label: 'General',
    icon: Lightbulb,
    colorClass: 'text-green-500',
  },
};

/** Map icon names to Lucide components */
const ICON_MAP: Record<string, React.ElementType> = {
  HelpCircle,
  GitCommit,
  GitBranch,
  GitFork,
  FileDiff,
  FileSearch,
  FolderOpen,
  TestTube,
  Hammer,
  Terminal,
  Play,
  Workflow,
  Zap,
  Info,
  // Feature 024: New icons for security, process, system
  Shield,
  AlertTriangle,
  Activity,
  StopCircle,
  Search,
  Settings,
  Bell,
  Package,
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
 * Group suggestions by category (Feature 023 - T057)
 */
function groupByCategory(
  suggestions: SuggestedAction[]
): Map<NonNullable<SuggestedAction['category']>, SuggestedAction[]> {
  const groups = new Map<NonNullable<SuggestedAction['category']>, SuggestedAction[]>();

  // Initialize groups in order
  for (const category of CATEGORY_ORDER) {
    if (category) {
      groups.set(category, []);
    }
  }

  // Group suggestions
  for (const suggestion of suggestions) {
    const category = suggestion.category ?? 'general';
    const group = groups.get(category);
    if (group) {
      group.push(suggestion);
    }
  }

  // Remove empty groups
  for (const [category, items] of groups) {
    if (items.length === 0) {
      groups.delete(category);
    }
  }

  return groups;
}

/** Animation state for a chip */
type ChipAnimationState = 'entering' | 'visible' | 'exiting' | 'hidden';

/**
 * Calculate animation delay based on index and direction
 * @param index - Chip index
 * @param total - Total number of chips
 * @param isEntering - True for enter animation, false for exit
 */
function getAnimationDelay(index: number, total: number, isEntering: boolean): number {
  const effectiveIndex = isEntering ? index : total - 1 - index;
  return Math.min(effectiveIndex * ANIMATION_CONFIG.staggerDelay, ANIMATION_CONFIG.maxDelay);
}

/**
 * Get mode indicator color
 */
function getModeIndicatorColor(mode: SuggestedAction['mode']): string {
  switch (mode) {
    case 'instant':
      return 'bg-green-500/60'; // Green for instant (no AI)
    case 'smart':
      return 'bg-blue-500/60'; // Blue for smart (AI summary)
    case 'ai':
    default:
      return ''; // No indicator for full AI mode (default)
  }
}

/**
 * Single chip button component with staggered animation support
 * Feature 024: Supports context-disabled state with tooltip
 */
function ChipButton({
  suggestion,
  onAction,
  disabled,
  animationState = 'visible',
  animationDelay = 0,
  horizontal = false,
  contextDisabled = false,
}: {
  suggestion: SuggestedAction;
  onAction: (action: SuggestedAction) => void;
  disabled: boolean;
  animationState?: ChipAnimationState;
  animationDelay?: number;
  /** Whether using horizontal expand animation */
  horizontal?: boolean;
  /** Feature 024: Whether this action is disabled due to missing project context */
  contextDisabled?: boolean;
}) {
  const Icon = getIcon(suggestion.icon);
  const variantStyles = getVariantStyles(suggestion.variant);
  const modeIndicatorColor = getModeIndicatorColor(suggestion.mode);

  // Feature 024: Combine disabled states
  const isDisabled = disabled || contextDisabled;

  // Generate animation styles based on mode
  const animationStyles = useMemo(() => {
    const config = horizontal ? HORIZONTAL_ANIMATION_CONFIG : ANIMATION_CONFIG;

    if (animationState === 'visible') {
      return { opacity: 1, transform: 'translateX(0) scale(1)' };
    }
    if (animationState === 'hidden') {
      return {
        opacity: 0,
        transform: horizontal ? 'translateX(-12px) scale(0.9)' : 'translateX(-8px) scale(0.95)',
        visibility: 'hidden' as const,
      };
    }
    // For entering/exiting, CSS handles the animation
    return {
      animationDelay: `${animationDelay}ms`,
      animationDuration: `${config.duration}ms`,
    };
  }, [animationState, animationDelay, horizontal]);

  // Handle click - pass the full action to parent
  const handleClick = useCallback(() => {
    onAction(suggestion);
  }, [suggestion, onAction]);

  // Feature 024: Generate tooltip text
  const tooltipText = useMemo(() => {
    if (contextDisabled) {
      return 'Select a project to enable this action';
    }
    if (suggestion.mode === 'instant') {
      return 'Instant result (no AI)';
    }
    if (suggestion.mode === 'smart') {
      return 'AI will analyze';
    }
    return undefined;
  }, [contextDisabled, suggestion.mode]);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5',
        'text-xs font-medium rounded-full border',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'whitespace-nowrap flex-shrink-0',
        variantStyles,
        // Feature 024: Different styling for context-disabled vs general disabled
        contextDisabled &&
          'opacity-40 cursor-not-allowed bg-muted/30 border-border/50 hover:bg-muted/30 hover:border-border/50',
        disabled && !contextDisabled && 'opacity-50 cursor-not-allowed',
        // Mode indicator for instant/smart modes (only when not context-disabled)
        !contextDisabled && suggestion.mode === 'instant' && 'ring-1 ring-green-500/20',
        !contextDisabled && suggestion.mode === 'smart' && 'ring-1 ring-blue-500/20',
        // Animation classes - different for horizontal mode
        horizontal && animationState === 'entering' && 'animate-chip-slide-in',
        horizontal && animationState === 'exiting' && 'animate-chip-slide-out',
        !horizontal && animationState === 'entering' && 'animate-chip-enter',
        !horizontal && animationState === 'exiting' && 'animate-chip-exit',
        animationState === 'hidden' && 'invisible',
        // Base transition for non-animated interactions
        (animationState === 'visible' || animationState === 'hidden') &&
          'transition-all duration-200'
      )}
      style={animationStyles}
      aria-label={`${suggestion.label}: ${suggestion.prompt || 'Execute action'}${contextDisabled ? ' (requires project)' : ''}`}
      title={tooltipText}
    >
      {Icon && <Icon className={cn('w-3.5 h-3.5', contextDisabled && 'opacity-60')} />}
      <span>{suggestion.label}</span>
      {/* Mode indicator dot for instant/smart (hide when context-disabled) */}
      {modeIndicatorColor && !contextDisabled && (
        <span className={cn('w-1.5 h-1.5 rounded-full', modeIndicatorColor)} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Hook to manage staggered animation state for chips
 */
function useChipAnimation(
  isVisible: boolean | undefined,
  itemCount: number,
  horizontal: boolean = false
): ChipAnimationState {
  const [animationState, setAnimationState] = useState<ChipAnimationState>(
    isVisible === undefined ? 'visible' : isVisible ? 'visible' : 'hidden'
  );
  const prevVisibleRef = useRef(isVisible);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate total animation duration based on mode
  const getTotalAnimationDuration = useCallback(
    (count: number) => {
      const config = horizontal ? HORIZONTAL_ANIMATION_CONFIG : ANIMATION_CONFIG;
      const maxDelay = Math.min((count - 1) * config.staggerDelay, config.maxDelay);
      return maxDelay + config.duration + 50; // Extra buffer
    },
    [horizontal]
  );

  useEffect(() => {
    // Skip if isVisible is not controlled
    if (isVisible === undefined) {
      setAnimationState('visible');
      return;
    }

    // Detect visibility change
    if (prevVisibleRef.current !== isVisible) {
      // Clear any pending animation completion
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      if (isVisible) {
        // Start enter animation
        setAnimationState('entering');
        animationTimeoutRef.current = setTimeout(() => {
          setAnimationState('visible');
        }, getTotalAnimationDuration(itemCount));
      } else {
        // Start exit animation
        setAnimationState('exiting');
        animationTimeoutRef.current = setTimeout(() => {
          setAnimationState('hidden');
        }, getTotalAnimationDuration(itemCount));
      }

      prevVisibleRef.current = isVisible;
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [isVisible, itemCount, getTotalAnimationDuration]);

  return animationState;
}

/**
 * Calculate animation delay for horizontal mode (left to right on enter, right to left on exit)
 */
function getHorizontalAnimationDelay(index: number, total: number, isEntering: boolean): number {
  const effectiveIndex = isEntering ? index : total - 1 - index;
  return Math.min(
    effectiveIndex * HORIZONTAL_ANIMATION_CONFIG.staggerDelay,
    HORIZONTAL_ANIMATION_CONFIG.maxDelay
  );
}

/**
 * Quick action chips component - displays contextual suggestions
 * Feature 023: Supports grouped display with category headers
 * Enhancement: Staggered animation for expand/collapse
 * Enhancement: Horizontal inline mode for collapsible quick actions
 */
export function QuickActionChips({
  suggestions,
  onAction,
  disabled = false,
  className,
  grouped = false,
  isVisible,
  horizontal = false,
  currentProjectPath,
}: QuickActionChipsProps) {
  // Feature 024: Check if an action should be context-disabled
  const isContextDisabled = useCallback(
    (action: SuggestedAction): boolean => {
      // If requiresProject is true and no project path, disable
      return action.requiresProject === true && !currentProjectPath;
    },
    [currentProjectPath]
  );

  // Group suggestions by category (memoized)
  const groupedSuggestions = useMemo(() => {
    if (!grouped) return null;
    return groupByCategory(suggestions);
  }, [suggestions, grouped]);

  // Animation state management
  const animationState = useChipAnimation(isVisible, suggestions.length, horizontal);

  // Don't render if fully hidden
  if (animationState === 'hidden' && isVisible === false) {
    return null;
  }

  if (suggestions.length === 0) {
    return null;
  }

  // Determine if animation is active
  const isAnimating = animationState === 'entering' || animationState === 'exiting';
  const isEntering = animationState === 'entering';

  // Horizontal inline display for collapsible quick actions
  if (horizontal) {
    return (
      <div className={cn('flex items-center gap-2 overflow-hidden', className)}>
        {suggestions.map((suggestion, index) => {
          const delay = isAnimating
            ? getHorizontalAnimationDelay(index, suggestions.length, isEntering)
            : 0;

          return (
            <ChipButton
              key={suggestion.id}
              suggestion={suggestion}
              onAction={onAction}
              disabled={disabled}
              animationState={animationState}
              animationDelay={delay}
              horizontal
              contextDisabled={isContextDisabled(suggestion)}
            />
          );
        })}
      </div>
    );
  }

  // Grouped display with category headers (Feature 023 - T057/T058)
  if (grouped && groupedSuggestions && groupedSuggestions.size > 1) {
    let globalIndex = 0;
    const totalItems = suggestions.length;

    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {Array.from(groupedSuggestions.entries()).map(([category, items]) => {
          const config = CATEGORY_CONFIG[category];
          const CategoryIcon = config.icon;

          return (
            <div key={category} className="flex flex-col gap-1.5">
              {/* Category header */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CategoryIcon className={cn('w-3.5 h-3.5', config.colorClass)} />
                <span className="font-medium">{config.label}</span>
              </div>
              {/* Chips */}
              <div className="flex flex-wrap gap-2">
                {items.map((suggestion) => {
                  const currentIndex = globalIndex++;
                  const delay = isAnimating
                    ? getAnimationDelay(currentIndex, totalItems, isEntering)
                    : 0;

                  return (
                    <ChipButton
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAction={onAction}
                      disabled={disabled}
                      animationState={animationState}
                      animationDelay={delay}
                      contextDisabled={isContextDisabled(suggestion)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Flat display (default behavior) with staggered animation
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {suggestions.map((suggestion, index) => {
        const delay = isAnimating ? getAnimationDelay(index, suggestions.length, isEntering) : 0;

        return (
          <ChipButton
            key={suggestion.id}
            suggestion={suggestion}
            onAction={onAction}
            disabled={disabled}
            animationState={animationState}
            animationDelay={delay}
            contextDisabled={isContextDisabled(suggestion)}
          />
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
    mode: 'ai',
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
    mode: 'ai',
  },
  {
    id: 'review-changes',
    label: 'Review changes',
    prompt: 'Review my staged changes and suggest improvements',
    icon: 'FileSearch',
    variant: 'default',
    category: 'git',
    mode: 'ai',
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
    mode: 'ai',
  },
  {
    id: 'build-project',
    label: 'Build project',
    prompt: 'Build this project',
    icon: 'Hammer',
    variant: 'default',
    category: 'project',
    mode: 'ai',
  },
];
