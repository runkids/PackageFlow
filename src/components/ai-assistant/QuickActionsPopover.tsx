/**
 * QuickActionsPopover - Categorized quick actions with popover menu
 * Redesigned to handle 15+ actions gracefully with category grouping
 *
 * Features:
 * - Click-to-open popover with categorized actions
 * - Grid layout within each category
 * - Keyboard navigation support
 * - Context-aware disabled states
 * - Mode indicators (instant/smart/ai)
 */

import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import {
  Zap,
  ChevronDown,
  // Category icons
  GitBranch,
  Package,
  Workflow,
  Shield,
  Activity,
  Settings,
  Lightbulb,
  // Action icons
  HelpCircle,
  GitCommit,
  GitFork,
  FileDiff,
  FileSearch,
  FolderOpen,
  TestTube,
  Hammer,
  Terminal,
  Play,
  AlertTriangle,
  StopCircle,
  Search,
  Bell,
  FolderGit2,
  Info,
  // Time Machine icons
  Camera,
  History,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SuggestedAction } from '../../types/ai-assistant';

// ============================================================================
// Types
// ============================================================================

interface QuickActionsPopoverProps {
  /** List of suggested actions to display */
  suggestions: SuggestedAction[];
  /** Handler when an action is clicked */
  onAction: (action: SuggestedAction) => void;
  /** Whether actions are disabled (e.g., during generation) */
  disabled?: boolean;
  /** Current project path for context-aware states */
  currentProjectPath?: string;
  /** Optional class name */
  className?: string;
}

// ============================================================================
// Category Configuration
// ============================================================================

/** Category display order */
const CATEGORY_ORDER: Array<NonNullable<SuggestedAction['category']>> = [
  'git',
  'project',
  'workflow',
  'security',
  'process',
  'system',
  'general',
];

/** Category configuration */
interface CategoryConfig {
  label: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
}

const CATEGORY_CONFIG: Record<NonNullable<SuggestedAction['category']>, CategoryConfig> = {
  git: {
    label: 'Git',
    icon: FolderGit2,
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
  project: {
    label: 'Project',
    icon: Package,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  workflow: {
    label: 'Workflow',
    icon: Workflow,
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
  },
  security: {
    label: 'Security',
    icon: Shield,
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  process: {
    label: 'Process',
    icon: Activity,
    colorClass: 'text-cyan-500',
    bgClass: 'bg-cyan-500/10',
  },
  system: {
    label: 'System',
    icon: Settings,
    colorClass: 'text-gray-500',
    bgClass: 'bg-gray-500/10',
  },
  general: {
    label: 'General',
    icon: Lightbulb,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-500/10',
  },
};

/** Icon name to component mapping */
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
  Shield,
  AlertTriangle,
  Activity,
  StopCircle,
  Search,
  Settings,
  Bell,
  Package,
  // Time Machine icons
  Camera,
  History,
  ShieldCheck,
};

// ============================================================================
// Utility Functions
// ============================================================================

/** Get icon component by name */
function getIcon(iconName?: string): React.ElementType | null {
  if (!iconName) return null;
  return ICON_MAP[iconName] || null;
}

/** Group suggestions by category */
function groupByCategory(
  suggestions: SuggestedAction[]
): Map<NonNullable<SuggestedAction['category']>, SuggestedAction[]> {
  const groups = new Map<NonNullable<SuggestedAction['category']>, SuggestedAction[]>();

  // Initialize groups in order
  for (const category of CATEGORY_ORDER) {
    groups.set(category, []);
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

/** Get mode indicator styling */
function getModeStyles(mode: SuggestedAction['mode']): { dot: string; ring: string } {
  switch (mode) {
    case 'instant':
      return { dot: 'bg-green-500/60', ring: 'ring-green-500/20' };
    case 'smart':
      return { dot: 'bg-blue-500/60', ring: 'ring-blue-500/20' };
    case 'ai':
    default:
      return { dot: '', ring: '' };
  }
}

// ============================================================================
// Sub-components
// ============================================================================

/** Individual action button within the popover */
function ActionButton({
  action,
  onClick,
  disabled,
  contextDisabled,
  onKeyDown,
  tabIndex,
  isHighlighted,
}: {
  action: SuggestedAction;
  onClick: () => void;
  disabled: boolean;
  contextDisabled: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
  isHighlighted?: boolean;
}) {
  const Icon = getIcon(action.icon);
  const modeStyles = getModeStyles(action.mode);
  const isDisabled = disabled || contextDisabled;

  const tooltipText = useMemo(() => {
    if (contextDisabled) return 'Select a project to enable this action';
    if (action.mode === 'instant') return 'Instant result (no AI)';
    if (action.mode === 'smart') return 'AI will analyze';
    return undefined;
  }, [contextDisabled, action.mode]);

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      className={cn(
        'flex items-center gap-2 px-3 py-2 w-full text-left',
        'rounded-lg border transition-all duration-150',
        'text-sm',
        // Base styling
        'bg-background border-border/50',
        'hover:bg-muted/70 hover:border-border',
        // Focus/highlight styling
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        isHighlighted && 'bg-muted/70 border-border ring-2 ring-ring ring-offset-1',
        // Mode ring indicator
        !contextDisabled && modeStyles.ring && `ring-1 ${modeStyles.ring}`,
        // Disabled states
        contextDisabled &&
          'opacity-40 cursor-not-allowed bg-muted/20 hover:bg-muted/20 hover:border-border/50',
        disabled && !contextDisabled && 'opacity-50 cursor-not-allowed'
      )}
      title={tooltipText}
      aria-label={`${action.label}${contextDisabled ? ' (requires project)' : ''}`}
    >
      {Icon && (
        <Icon
          className={cn(
            'w-4 h-4 flex-shrink-0 text-muted-foreground',
            contextDisabled && 'opacity-60'
          )}
        />
      )}
      <span className={cn('flex-1 truncate', contextDisabled && 'opacity-80')}>{action.label}</span>
      {/* Mode indicator dot */}
      {modeStyles.dot && !contextDisabled && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', modeStyles.dot)}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** Category section with header and action grid */
function CategorySection({
  category,
  actions,
  onAction,
  disabled,
  currentProjectPath,
  highlightedIndex,
  startIndex,
  onKeyNavigation,
}: {
  category: NonNullable<SuggestedAction['category']>;
  actions: SuggestedAction[];
  onAction: (action: SuggestedAction) => void;
  disabled: boolean;
  currentProjectPath?: string;
  highlightedIndex: number;
  startIndex: number;
  onKeyNavigation: (e: React.KeyboardEvent, index: number) => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const CategoryIcon = config.icon;

  return (
    <div className="space-y-2">
      {/* Category header */}
      <div className={cn('flex items-center gap-2 px-2 py-1')}>
        <div className={cn('p-1 rounded', config.bgClass)}>
          <CategoryIcon className={cn('w-3.5 h-3.5', config.colorClass)} />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground/60">({actions.length})</span>
      </div>

      {/* Actions grid - 2 columns on wider screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-1">
        {actions.map((action, idx) => {
          const globalIndex = startIndex + idx;
          const isContextDisabled = action.requiresProject === true && !currentProjectPath;

          return (
            <ActionButton
              key={action.id}
              action={action}
              onClick={() => onAction(action)}
              disabled={disabled}
              contextDisabled={isContextDisabled}
              isHighlighted={highlightedIndex === globalIndex}
              tabIndex={highlightedIndex === globalIndex ? 0 : -1}
              onKeyDown={(e) => onKeyNavigation(e, globalIndex)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * QuickActionsPopover - Click-to-open categorized actions menu
 *
 * Designed to handle 15+ actions with:
 * - Category grouping for organization
 * - Grid layout for efficient space usage
 * - Full keyboard navigation
 * - Context-aware disabled states
 */
export function QuickActionsPopover({
  suggestions,
  onAction,
  disabled = false,
  currentProjectPath,
  className,
}: QuickActionsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const triggerId = useId();

  // Group suggestions by category
  const groupedSuggestions = useMemo(() => groupByCategory(suggestions), [suggestions]);

  // Flatten for keyboard navigation
  const flatActions = useMemo(() => {
    const flat: SuggestedAction[] = [];
    for (const items of groupedSuggestions.values()) {
      flat.push(...items);
    }
    return flat;
  }, [groupedSuggestions]);

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // Calculate popover position to avoid collision with viewport edges
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const popoverHeight = 400; // max-h-[400px]
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;

      // If not enough space below but more space above, position on top
      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        setPopoverPosition('top');
      } else {
        setPopoverPosition('bottom');
      }
    }
  }, [isOpen]);

  // Handle trigger click
  const handleTriggerClick = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  // Handle trigger keyboard
  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTriggerClick();
      } else if (e.key === 'ArrowDown' && !isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    },
    [handleTriggerClick, isOpen]
  );

  // Handle action selection
  const handleActionClick = useCallback(
    (action: SuggestedAction) => {
      onAction(action);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onAction]
  );

  // Handle keyboard navigation within popover
  const handleKeyNavigation = useCallback(
    (e: React.KeyboardEvent, _currentIndex: number) => {
      const total = flatActions.length;
      if (total === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev + 1) % total);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev - 1 + total) % total);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Move to next column (skip 1 in 2-column layout)
          setHighlightedIndex((prev) => Math.min(prev + 1, total - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setHighlightedIndex(total - 1);
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const action = flatActions[highlightedIndex];
          if (action) {
            const isContextDisabled = action.requiresProject === true && !currentProjectPath;
            if (!disabled && !isContextDisabled) {
              handleActionClick(action);
            }
          }
          break;
        }
        case 'Tab':
          // Allow tab to close popover and move focus
          setIsOpen(false);
          break;
      }
    },
    [flatActions, highlightedIndex, disabled, currentProjectPath, handleActionClick]
  );

  // Calculate category start indices for highlighting
  const categoryStartIndices = useMemo(() => {
    const indices: number[] = [];
    let currentIndex = 0;
    for (const items of groupedSuggestions.values()) {
      indices.push(currentIndex);
      currentIndex += items.length;
    }
    return indices;
  }, [groupedSuggestions]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        id={triggerId}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={isOpen ? popoverId : undefined}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5',
          'text-xs font-medium rounded-full',
          'bg-muted/40 border border-border/50',
          'hover:bg-muted/60 hover:border-border/70',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          'transition-all duration-200',
          isOpen && 'bg-muted/60 border-border/70',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Zap className="w-3 h-3 text-muted-foreground" />
        <span className="text-muted-foreground">Quick Actions</span>
        <span className="text-muted-foreground/60">({suggestions.length})</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Popover content */}
      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="menu"
          aria-labelledby={triggerId}
          className={cn(
            'absolute z-50 left-0',
            'w-[340px] sm:w-[420px] max-h-[400px] flex flex-col',
            // Enhanced visual separation from background
            'bg-card/95 backdrop-blur-sm',
            'border-2 border-border/60',
            // Ring effect for additional contrast in dark mode
            'ring-1 ring-black/5 dark:ring-white/10',
            // Stronger shadow for depth perception
            'shadow-2xl shadow-black/25 dark:shadow-black/50',
            'rounded-xl',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            // Position based on collision detection
            popoverPosition === 'top'
              ? 'bottom-full mb-2 slide-in-from-bottom-2'
              : 'top-full mt-2 slide-in-from-top-2'
          )}
        >
          {/* Fixed Header */}
          <div className="flex-shrink-0 pt-3 px-3 pb-2 border-b border-border">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-medium text-foreground">Quick Actions</h3>
              <span className="text-xs text-muted-foreground">{suggestions.length} available</span>
            </div>
          </div>

          {/* Scrollable Categorized actions */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4">
            {Array.from(groupedSuggestions.entries()).map(([category, actions], categoryIdx) => (
              <CategorySection
                key={category}
                category={category}
                actions={actions}
                onAction={handleActionClick}
                disabled={disabled}
                currentProjectPath={currentProjectPath}
                highlightedIndex={highlightedIndex}
                startIndex={categoryStartIndices[categoryIdx]}
                onKeyNavigation={handleKeyNavigation}
              />
            ))}
          </div>

          {/* Fixed Footer hint */}
          <div className="flex-shrink-0 pt-2 pb-3 px-3 border-t border-border">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 px-1">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
                Instant
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
                AI Analysis
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-muted/50 rounded font-mono">Esc</kbd>
                Close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickActionsPopover;
