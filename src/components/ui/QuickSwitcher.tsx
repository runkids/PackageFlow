/**
 * Quick Switcher Component
 * A keyboard-driven command palette for quick navigation
 * @see specs/001-worktree-enhancements/tasks.md - T040-T042
 * @see _docs/ui-design-spec.md - Dialog Pattern, Icon Badge Pattern, Sticky Header Pattern
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { Search, X, Command } from 'lucide-react';
import { cn } from '../../lib/utils';
import { registerModal, unregisterModal, isTopModal } from './modalStack';

export interface QuickSwitcherItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  category?: string;
  keywords?: string[];
  shortcut?: string;
  status?: {
    type: 'success' | 'warning' | 'error' | 'info';
    label?: string;
  };
  disabled?: boolean;
  onSelect?: () => void;
}

interface QuickSwitcherProps {
  items: QuickSwitcherItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (item: QuickSwitcherItem) => void;
  placeholder?: string;
  emptyMessage?: string;
  title?: string;
  subtitle?: string;
  /** Show category filter pills */
  showCategoryFilter?: boolean;
  /** IDs of recently used items (shown in Recent category) */
  recentItemIds?: string[];
  /** Maximum number of recent items to show */
  maxRecentItems?: number;
  /** Callback when an item is used (for tracking recent usage) */
  onItemUsed?: (itemId: string) => void;
  /** Theme color for accents */
  themeColor?: 'blue' | 'cyan' | 'purple' | 'indigo';
  /** Icon to display in header badge */
  headerIcon?: React.ReactNode;
}

/**
 * Score a match (higher is better)
 */
function scoreMatch(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  // Exact match at start
  if (lowerText.startsWith(lowerQuery)) {
    return 100;
  }

  // Exact substring match
  const index = lowerText.indexOf(lowerQuery);
  if (index !== -1) {
    return 80 - index; // Earlier matches score higher
  }

  // Fuzzy match - count consecutive matches
  let score = 0;
  let queryIndex = 0;
  let consecutive = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
      consecutive++;
      score += consecutive * 2;
    } else {
      consecutive = 0;
    }
  }

  return queryIndex === lowerQuery.length ? score : 0;
}

/** Theme color configuration */
const themeColorConfig = {
  blue: {
    gradient: 'dark:from-blue-500/15 dark:via-blue-600/5 dark:to-transparent from-blue-500/10 via-blue-600/5 to-transparent',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    iconColor: 'text-blue-400',
    selectedBg: 'bg-blue-500/15',
    selectedBorder: 'border-blue-400',
    pillActive: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    highlight: 'bg-blue-500/30 text-blue-300 dark:text-blue-200',
  },
  cyan: {
    gradient: 'dark:from-cyan-500/15 dark:via-cyan-600/5 dark:to-transparent from-cyan-500/10 via-cyan-600/5 to-transparent',
    border: 'border-cyan-500/30',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    iconColor: 'text-cyan-400',
    selectedBg: 'bg-cyan-500/15',
    selectedBorder: 'border-cyan-400',
    pillActive: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    highlight: 'bg-cyan-500/30 text-cyan-300 dark:text-cyan-200',
  },
  purple: {
    gradient: 'dark:from-purple-500/15 dark:via-purple-600/5 dark:to-transparent from-purple-500/10 via-purple-600/5 to-transparent',
    border: 'border-purple-500/30',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    iconColor: 'text-purple-400',
    selectedBg: 'bg-purple-500/15',
    selectedBorder: 'border-purple-400',
    pillActive: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    highlight: 'bg-purple-500/30 text-purple-300 dark:text-purple-200',
  },
  indigo: {
    gradient: 'dark:from-indigo-500/15 dark:via-indigo-600/5 dark:to-transparent from-indigo-500/10 via-indigo-600/5 to-transparent',
    border: 'border-indigo-500/30',
    iconBg: 'bg-indigo-500/10 border-indigo-500/20',
    iconColor: 'text-indigo-400',
    selectedBg: 'bg-indigo-500/15',
    selectedBorder: 'border-indigo-400',
    pillActive: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    highlight: 'bg-indigo-500/30 text-indigo-300 dark:text-indigo-200',
  },
} as const;

/** Highlight matching text in search results */
function highlightText(text: string, query: string, highlightClass: string): React.ReactNode {
  if (!query.trim()) return text;

  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  );
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className={cn(highlightClass, 'rounded px-0.5')}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function QuickSwitcher({
  items,
  isOpen,
  onClose,
  onSelect,
  placeholder = 'Search...',
  emptyMessage = 'No results found',
  title,
  subtitle,
  showCategoryFilter = false,
  recentItemIds = [],
  maxRecentItems = 5,
  onItemUsed,
  themeColor = 'blue',
  headerIcon,
}: QuickSwitcherProps) {
  const modalId = useId();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Theme configuration
  const theme = themeColorConfig[themeColor];

  // Build items with recent category
  const itemsWithRecent = useMemo(() => {
    if (recentItemIds.length === 0) return items;

    const recentSet = new Set(recentItemIds.slice(0, maxRecentItems));
    const recentItems: QuickSwitcherItem[] = [];
    const otherItems: QuickSwitcherItem[] = [];

    for (const item of items) {
      if (recentSet.has(item.id)) {
        // Create a copy with Recent category
        recentItems.push({
          ...item,
          category: 'Recent',
          // Preserve original ID for selection
        });
      }
      otherItems.push(item);
    }

    // Sort recent items by their order in recentItemIds
    recentItems.sort((a, b) => {
      const aIndex = recentItemIds.indexOf(a.id);
      const bIndex = recentItemIds.indexOf(b.id);
      return aIndex - bIndex;
    });

    return [...recentItems, ...otherItems];
  }, [items, recentItemIds, maxRecentItems]);

  // Filter and sort items based on query
  const filteredItems = useMemo(() => {
    let result = itemsWithRecent;

    // Apply category filter
    if (selectedCategory) {
      result = result.filter(item => item.category === selectedCategory);
    }

    if (!query.trim()) {
      return result;
    }

    return result
      .map((item) => {
        // Check title
        let score = scoreMatch(query, item.title);

        // Check subtitle
        if (item.subtitle) {
          score = Math.max(score, scoreMatch(query, item.subtitle) * 0.8);
        }

        // Check keywords
        if (item.keywords) {
          for (const keyword of item.keywords) {
            score = Math.max(score, scoreMatch(query, keyword) * 0.6);
          }
        }

        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [itemsWithRecent, query, selectedCategory]);

  // Get all available categories for filter pills
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    for (const item of itemsWithRecent) {
      if (item.category) {
        categorySet.add(item.category);
      }
    }
    // Define category order
    const categoryOrder = ['Recent', 'Worktrees', 'Sessions', 'Open in Editor', 'Run Script', 'Switch Directory'];
    return Array.from(categorySet).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [itemsWithRecent]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, QuickSwitcherItem[]> = {};
    const uncategorized: QuickSwitcherItem[] = [];

    for (const item of filteredItems) {
      if (item.category) {
        if (!groups[item.category]) {
          groups[item.category] = [];
        }
        groups[item.category].push(item);
      } else {
        uncategorized.push(item);
      }
    }

    return { groups, uncategorized };
  }, [filteredItems]);

  // Modal stack registration
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key with modal stack
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen, onClose]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSelectedCategory(null);
      // Focus input after a brief delay to ensure the modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keep selected item in view
  useEffect(() => {
    if (listRef.current && filteredItems.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredItems.length]);

  // Find category boundaries for Tab navigation
  const getCategoryBoundaries = useCallback(() => {
    const boundaries: { category: string; startIndex: number }[] = [];
    let index = 0;

    // Add uncategorized items first
    if (groupedItems.uncategorized.length > 0) {
      boundaries.push({ category: '', startIndex: 0 });
      index += groupedItems.uncategorized.length;
    }

    // Add categorized items
    for (const [category, categoryItems] of Object.entries(groupedItems.groups)) {
      boundaries.push({ category, startIndex: index });
      index += categoryItems.length;
    }

    return boundaries;
  }, [groupedItems]);

  // Jump to next/previous category
  const jumpToCategory = useCallback((direction: 'next' | 'prev') => {
    const boundaries = getCategoryBoundaries();
    if (boundaries.length === 0) return;

    // Find current category index
    let currentBoundaryIndex = 0;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (selectedIndex >= boundaries[i].startIndex) {
        currentBoundaryIndex = i;
        break;
      }
    }

    // Calculate next boundary index
    let nextBoundaryIndex: number;
    if (direction === 'next') {
      nextBoundaryIndex = (currentBoundaryIndex + 1) % boundaries.length;
    } else {
      nextBoundaryIndex = currentBoundaryIndex === 0 ? boundaries.length - 1 : currentBoundaryIndex - 1;
    }

    setSelectedIndex(boundaries[nextBoundaryIndex].startIndex);
  }, [selectedIndex, getCategoryBoundaries]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          e.preventDefault();
          setSelectedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setSelectedIndex(filteredItems.length - 1);
          break;
        case 'Tab':
          e.preventDefault();
          jumpToCategory(e.shiftKey ? 'prev' : 'next');
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex] && !filteredItems[selectedIndex].disabled) {
            const item = filteredItems[selectedIndex];
            onItemUsed?.(item.id);
            item.onSelect?.();
            onSelect?.(item);
            onClose();
          }
          break;
        // ESC is handled by the document-level event listener
      }
    },
    [filteredItems, selectedIndex, onSelect, onClose, onItemUsed, jumpToCategory]
  );

  // Handle '/' key to focus search (on document level)
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  // Handle item click
  const handleItemClick = useCallback(
    (item: QuickSwitcherItem) => {
      if (item.disabled) return;
      onItemUsed?.(item.id);
      item.onSelect?.();
      onSelect?.(item);
      onClose();
    },
    [onSelect, onClose, onItemUsed]
  );

  // Reset selected index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  // Flatten items with indices for keyboard navigation
  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] animate-in fade-in-0 duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-switcher-title"
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-xl max-h-[70vh]',
          'bg-background rounded-2xl',
          'border',
          theme.border,
          'shadow-2xl shadow-black/60',
          'animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-bottom-4',
          'flex flex-col overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4 flex-shrink-0',
            'border-b border-border',
            'bg-gradient-to-r',
            theme.gradient
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'absolute right-4 top-4',
              'p-2 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border',
                theme.iconBg,
                'shadow-lg'
              )}
            >
              {headerIcon || <Command className={cn('w-6 h-6', theme.iconColor)} />}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="quick-switcher-title"
                className="text-lg font-semibold text-foreground leading-tight"
              >
                {title || 'Quick Switcher'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {subtitle || `${filteredItems.length} actions available`}
              </p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label="Search actions"
            aria-controls="quick-switcher-results"
            aria-activedescendant={filteredItems.length > 0 ? `quick-switcher-item-${selectedIndex}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground outline-none text-base"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className={cn(
                'p-1.5 rounded-md',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50',
                'transition-colors duration-150'
              )}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category filter pills */}
        {showCategoryFilter && categories.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2 border-b border-border flex-wrap" role="tablist">
            <button
              onClick={() => setSelectedCategory(null)}
              role="tab"
              aria-selected={selectedCategory === null}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150',
                'border',
                selectedCategory === null
                  ? theme.pillActive
                  : 'border-transparent bg-card text-muted-foreground hover:bg-accent'
              )}
            >
              All ({itemsWithRecent.length})
            </button>
            {categories.map((category) => {
              const count = itemsWithRecent.filter(i => i.category === category).length;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  role="tab"
                  aria-selected={selectedCategory === category}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150',
                    'border',
                    selectedCategory === category
                      ? theme.pillActive
                      : 'border-transparent bg-card text-muted-foreground hover:bg-accent'
                  )}
                >
                  {category} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Results list */}
        <div
          ref={listRef}
          id="quick-switcher-results"
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto min-h-0"
        >
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <>
              {/* Uncategorized items first */}
              {groupedItems.uncategorized.map((item) => {
                const index = flatIndex++;
                return (
                  <QuickSwitcherItemRow
                    key={item.id}
                    item={item}
                    isSelected={index === selectedIndex}
                    dataIndex={index}
                    query={query}
                    theme={theme}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  />
                );
              })}

              {/* Grouped items with sticky headers */}
              {Object.entries(groupedItems.groups).map(([category, categoryItems]) => (
                <div key={category}>
                  {/* Sticky category header */}
                  <div
                    className={cn(
                      'sticky top-0 z-10',
                      'px-3 py-2',
                      'bg-muted/80 dark:bg-muted/50',
                      'border-b border-border',
                      'backdrop-blur-sm'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                        {category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({categoryItems.length})
                      </span>
                    </div>
                  </div>
                  {categoryItems.map((item) => {
                    const index = flatIndex++;
                    return (
                      <QuickSwitcherItemRow
                        key={item.id}
                        item={item}
                        isSelected={index === selectedIndex}
                        dataIndex={index}
                        query={query}
                        theme={theme}
                        onClick={() => handleItemClick(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      />
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground bg-card/50 flex-shrink-0">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">Tab</kbd>
            category
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-[10px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

interface QuickSwitcherItemRowProps {
  item: QuickSwitcherItem;
  isSelected: boolean;
  dataIndex: number;
  query: string;
  theme: typeof themeColorConfig[keyof typeof themeColorConfig];
  onClick: () => void;
  onMouseEnter: () => void;
}

/** Status indicator colors */
const statusColors = {
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
} as const;

function QuickSwitcherItemRow({
  item,
  isSelected,
  dataIndex,
  query,
  theme,
  onClick,
  onMouseEnter,
}: QuickSwitcherItemRowProps) {
  return (
    <div
      id={`quick-switcher-item-${dataIndex}`}
      data-index={dataIndex}
      role="option"
      aria-selected={isSelected}
      aria-disabled={item.disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer',
        'transition-colors duration-100',
        'border-l-2',
        item.disabled && 'opacity-50 cursor-not-allowed',
        isSelected
          ? cn(theme.selectedBg, theme.selectedBorder)
          : 'border-transparent hover:bg-accent'
      )}
    >
      {/* Icon */}
      {item.icon && (
        <span
          className={cn(
            'shrink-0',
            isSelected ? theme.iconColor : 'text-muted-foreground'
          )}
        >
          {item.icon}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {highlightText(item.title, query, theme.highlight)}
          </span>
          {/* Status indicator */}
          {item.status && (
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                statusColors[item.status.type]
              )}
              title={item.status.label}
            />
          )}
        </div>
        {item.subtitle && (
          <div className="text-xs text-muted-foreground truncate">
            {highlightText(item.subtitle, query, theme.highlight)}
          </div>
        )}
      </div>

      {/* Shortcut hint */}
      {item.shortcut && (
        <kbd className="flex-shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">
          {item.shortcut}
        </kbd>
      )}
    </div>
  );
}
