/**
 * KeyboardShortcutsDialog - Professional keyboard shortcuts dialog
 * Displays available keyboard shortcuts with search, category filter, and modern design
 *
 * Features:
 * - Centered dialog with smooth animation
 * - Search & category filter
 * - Grouped shortcuts with sticky headers
 * - Customization link to settings
 * - Full accessibility support
 * - Modal stack integration
 */

import * as React from 'react';
import {
  Keyboard,
  X,
  Search,
  Settings,
  Command,
  Navigation,
  Database,
  Play,
  Edit3,
  HelpCircle,
  Folder,
  GitBranch,
  Terminal,
  Globe,
} from 'lucide-react';
import {
  formatShortcutKey,
  type KeyboardShortcut,
} from '../../hooks/useKeyboardShortcuts';
import { useShortcutsContext } from '../../contexts/ShortcutsContext';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from './modalStack';

interface KeyboardShortcutsDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Handler for open state changes */
  onOpenChange: (open: boolean) => void;
  /** List of shortcuts to display */
  shortcuts: KeyboardShortcut[];
  /** Callback when customize button is clicked */
  onCustomize?: () => void;
}

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  General: Command,
  Navigation: Navigation,
  Data: Database,
  Execution: Play,
  Editor: Edit3,
  Help: HelpCircle,
  Project: Folder,
  Git: GitBranch,
  Terminal: Terminal,
  Deploy: Globe,
};

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
  onCustomize,
}: KeyboardShortcutsDialogProps) {
  const modalId = React.useId();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Get effective keys and enabled state from context
  const { getEffectiveKey, isShortcutEnabled } = useShortcutsContext();

  // Transform shortcuts with effective keys from context
  const effectiveShortcuts = React.useMemo(() => {
    return shortcuts.map((shortcut) => ({
      ...shortcut,
      key: getEffectiveKey(shortcut.id, shortcut.key),
      enabled: isShortcutEnabled(shortcut.id),
    }));
  }, [shortcuts, getEffectiveKey, isShortcutEnabled]);

  // Get unique categories
  const categories = React.useMemo(() => {
    const categorySet = new Set<string>();
    for (const shortcut of effectiveShortcuts) {
      if (shortcut.enabled !== false && shortcut.category) {
        categorySet.add(shortcut.category);
      }
    }
    return Array.from(categorySet).sort();
  }, [effectiveShortcuts]);

  // Filter shortcuts based on search query and selected category
  const filteredShortcuts = React.useMemo(() => {
    return effectiveShortcuts.filter((shortcut) => {
      if (shortcut.enabled === false) return false;

      // Category filter
      if (selectedCategory && shortcut.category !== selectedCategory)
        return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = shortcut.description
          .toLowerCase()
          .includes(query);
        const matchesKey = shortcut.key.toLowerCase().includes(query);
        const matchesCategory = shortcut.category
          ?.toLowerCase()
          .includes(query);
        if (!matchesDescription && !matchesKey && !matchesCategory)
          return false;
      }

      return true;
    });
  }, [effectiveShortcuts, searchQuery, selectedCategory]);

  // Group filtered shortcuts by category
  const groupedShortcuts = React.useMemo(() => {
    const groups: Record<string, KeyboardShortcut[]> = {};
    const uncategorized: KeyboardShortcut[] = [];

    for (const shortcut of filteredShortcuts) {
      if (shortcut.category) {
        if (!groups[shortcut.category]) {
          groups[shortcut.category] = [];
        }
        groups[shortcut.category].push(shortcut);
      } else {
        uncategorized.push(shortcut);
      }
    }

    return { groups, uncategorized };
  }, [filteredShortcuts]);

  // Enabled shortcut count
  const enabledCount = effectiveShortcuts.filter(
    (s) => s.enabled !== false
  ).length;

  // Register/unregister modal
  React.useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  // Handle ESC key with modal stack
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onOpenChange(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, onOpenChange, open]);

  // Focus search input when dialog opens
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      // Reset state when closed
      setSearchQuery('');
      setSelectedCategory(null);
      setFocusedIndex(-1);
    }
  }, [open]);

  // Handle keyboard navigation in list
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = filteredShortcuts.length;
    if (totalItems === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case '/':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        break;
    }
  };

  // Handle customize click
  const handleCustomize = () => {
    onOpenChange(false);
    onCustomize?.();
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="bg-cyan-500/30 text-cyan-300 dark:text-cyan-200 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className={cn(
            'relative w-full max-w-lg max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-cyan-500/30',
            'shadow-2xl shadow-black/60',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5 flex-shrink-0',
              'border-b border-border',
              'bg-gradient-to-r',
              'dark:from-cyan-500/15 dark:via-cyan-600/5 dark:to-transparent',
              'from-cyan-500/10 via-cyan-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                'absolute right-4 top-4',
                'p-2 rounded-lg',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Title area with icon badge */}
            <div className="flex items-center gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-cyan-500/20',
                  'bg-cyan-500/10',
                  'shadow-lg'
                )}
              >
                <Keyboard className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2
                    id="keyboard-shortcuts-title"
                    className="text-lg font-semibold text-foreground leading-tight"
                  >
                    Keyboard Shortcuts
                  </h2>
                  {onCustomize && (
                    <button
                      onClick={handleCustomize}
                      className={cn(
                        'p-1.5 rounded-lg',
                        'text-muted-foreground hover:text-foreground',
                        'hover:bg-accent/50',
                        'transition-colors duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-ring'
                      )}
                      aria-label="Customize shortcuts"
                      title="Customize shortcuts"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {enabledCount} shortcuts available
                </p>
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="px-4 py-3 border-b border-border bg-card/30 flex-shrink-0">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search shortcuts... (press / to focus)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full pl-10 pr-8 py-2 rounded-lg',
                  'bg-background border border-border',
                  'text-sm text-foreground placeholder-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50',
                  'transition-all duration-150'
                )}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                role="searchbox"
                aria-label="Search shortcuts"
                aria-controls="shortcuts-list"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category pills */}
            {categories.length > 1 && (
              <div
                className="flex gap-1.5 mt-3 flex-wrap"
                role="tablist"
                aria-label="Shortcut categories"
              >
                <button
                  onClick={() => setSelectedCategory(null)}
                  role="tab"
                  aria-selected={selectedCategory === null}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150',
                    selectedCategory === null
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-card text-muted-foreground border border-transparent hover:bg-accent hover:text-foreground'
                  )}
                >
                  All
                </button>
                {categories.map((category) => {
                  const IconComponent = CATEGORY_ICONS[category] || Keyboard;
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      role="tab"
                      aria-selected={selectedCategory === category}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 flex items-center gap-1',
                        selectedCategory === category
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-card text-muted-foreground border border-transparent hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <IconComponent className="w-3 h-3" />
                      {category}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shortcuts list */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto min-h-0 focus:outline-none"
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            id="shortcuts-list"
            role="listbox"
            aria-label="Available keyboard shortcuts"
          >
            {filteredShortcuts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                <Search className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm font-medium">No shortcuts found</p>
                <p className="text-xs mt-1">
                  Try adjusting your search or filter
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {/* Uncategorized shortcuts */}
                {groupedShortcuts.uncategorized.length > 0 && (
                  <div className="space-y-0.5">
                    {groupedShortcuts.uncategorized.map((shortcut, index) => (
                      <ShortcutRow
                        key={shortcut.id}
                        shortcut={shortcut}
                        searchQuery={searchQuery}
                        highlightText={highlightText}
                        isFocused={focusedIndex === index}
                      />
                    ))}
                  </div>
                )}

                {/* Categorized shortcuts */}
                {Object.entries(groupedShortcuts.groups).map(
                  ([category, categoryShortcuts]) => {
                    const IconComponent = CATEGORY_ICONS[category] || Keyboard;
                    return (
                      <div key={category}>
                        {/* Sticky category header */}
                        <div
                          className={cn(
                            'sticky top-0 z-10',
                            'px-3 py-2',
                            'bg-muted/80 dark:bg-muted/50',
                            'border-b border-border',
                            'backdrop-blur-sm',
                            'rounded-t-lg'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <IconComponent className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                              {category}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({categoryShortcuts.length})
                            </span>
                          </div>
                        </div>
                        <div className="space-y-0.5 mt-0.5">
                          {categoryShortcuts.map((shortcut, index) => {
                            const globalIndex =
                              groupedShortcuts.uncategorized.length +
                              Object.entries(groupedShortcuts.groups)
                                .slice(
                                  0,
                                  Object.keys(groupedShortcuts.groups).indexOf(
                                    category
                                  )
                                )
                                .reduce((acc, [, arr]) => acc + arr.length, 0) +
                              index;
                            return (
                              <ShortcutRow
                                key={shortcut.id}
                                shortcut={shortcut}
                                searchQuery={searchQuery}
                                highlightText={highlightText}
                                isFocused={focusedIndex === globalIndex}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4 flex-shrink-0',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-between'
            )}
          >
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">
                  Esc
                </kbd>
                <span>close</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">
                  /
                </kbd>
                <span>search</span>
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredShortcuts.length} shortcut
              {filteredShortcuts.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shortcut row component */
interface ShortcutRowProps {
  shortcut: KeyboardShortcut;
  searchQuery: string;
  highlightText: (text: string, query: string) => React.ReactNode;
  isFocused?: boolean;
}

function ShortcutRow({
  shortcut,
  searchQuery,
  highlightText,
  isFocused,
}: ShortcutRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 px-3 rounded-lg',
        'transition-colors duration-100',
        isFocused
          ? 'bg-cyan-500/10 ring-2 ring-cyan-500/30'
          : 'hover:bg-accent'
      )}
      role="option"
      aria-selected={isFocused}
    >
      <span className="text-sm text-foreground">
        {searchQuery
          ? highlightText(shortcut.description, searchQuery)
          : shortcut.description}
      </span>
      <kbd
        className={cn(
          'ml-4 flex-shrink-0',
          'px-2 py-1 rounded-lg',
          'bg-card border border-border',
          'text-xs text-muted-foreground font-mono',
          'shadow-sm'
        )}
      >
        {formatShortcutKey(shortcut.key)}
      </kbd>
    </div>
  );
}

/** Floating button component */
interface FloatingButtonProps {
  onClick: () => void;
  position?: 'bottom-left' | 'bottom-right';
  /** Bottom offset in pixels to avoid overlapping with other UI elements */
  bottomOffset?: number;
}

export function KeyboardShortcutsFloatingButton({
  onClick,
  position = 'bottom-right',
  bottomOffset = 64,
}: FloatingButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{ bottom: bottomOffset }}
      className={cn(
        'fixed z-40 p-2.5',
        'bg-card/80 hover:bg-card',
        'border border-border/50 hover:border-cyan-500/30',
        'rounded-xl shadow-lg hover:shadow-xl',
        'transition-all duration-200 group',
        'opacity-80 hover:opacity-100',
        'focus:outline-none focus:ring-2 focus:ring-cyan-500/50',
        position === 'bottom-left' ? 'left-4' : 'right-4 translate-y-9'
      )}
      title="Show keyboard shortcuts (Cmd+/)"
      aria-label="Show keyboard shortcuts"
    >
      <Keyboard className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
    </button>
  );
}
