/**
 * Keyboard Shortcuts Hint Component
 * Displays keyboard shortcuts help UI with search and category filter
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Keyboard, X, Search, Settings } from 'lucide-react';
import { formatShortcutKey, type KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';
import { useShortcutsContext } from '../../contexts/ShortcutsContext';
import { cn } from '../../lib/utils';

interface KeyboardShortcutsHintProps {
  /** List of shortcuts to display */
  shortcuts: KeyboardShortcut[];
  /** Whether to show the floating button */
  showFloatingButton?: boolean;
  /** Button position */
  position?: 'bottom-left' | 'bottom-right';
  /** Callback when customize button is clicked */
  onCustomize?: () => void;
}

/**
 * Keyboard Shortcuts Hint Component
 * Provides a floating button to display all available shortcuts
 * with search and category filter functionality
 */
export function KeyboardShortcutsHint({
  shortcuts,
  showFloatingButton = true,
  position = 'bottom-right',
  onCustomize,
}: KeyboardShortcutsHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get effective keys and enabled state from context
  const { getEffectiveKey, isShortcutEnabled } = useShortcutsContext();

  // Transform shortcuts with effective keys from context
  const effectiveShortcuts = useMemo(() => {
    return shortcuts.map(shortcut => ({
      ...shortcut,
      key: getEffectiveKey(shortcut.id, shortcut.key),
      enabled: isShortcutEnabled(shortcut.id),
    }));
  }, [shortcuts, getEffectiveKey, isShortcutEnabled]);

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    for (const shortcut of effectiveShortcuts) {
      if (shortcut.enabled !== false && shortcut.category) {
        categorySet.add(shortcut.category);
      }
    }
    return Array.from(categorySet).sort();
  }, [effectiveShortcuts]);

  // Filter shortcuts based on search query and selected category
  const filteredShortcuts = useMemo(() => {
    return effectiveShortcuts.filter((shortcut) => {
      if (shortcut.enabled === false) return false;

      // Category filter
      if (selectedCategory && shortcut.category !== selectedCategory) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = shortcut.description.toLowerCase().includes(query);
        const matchesKey = shortcut.key.toLowerCase().includes(query);
        const matchesCategory = shortcut.category?.toLowerCase().includes(query);
        if (!matchesDescription && !matchesKey && !matchesCategory) return false;
      }

      return true;
    });
  }, [effectiveShortcuts, searchQuery, selectedCategory]);

  // Group filtered shortcuts by category
  const groupedShortcuts = useMemo(() => {
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

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow panel to render
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when closed
      setSearchQuery('');
      setSelectedCategory(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Listen for custom event to open shortcuts panel
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-shortcuts-hint', handleOpen);
    return () => window.removeEventListener('open-shortcuts-hint', handleOpen);
  }, []);

  const handleCustomize = () => {
    if (onCustomize) {
      setIsOpen(false);
      onCustomize();
    } else {
      // Emit event for other components to handle
      window.dispatchEvent(new CustomEvent('open-shortcuts-settings'));
      setIsOpen(false);
    }
  };

  if (!showFloatingButton) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed z-40 p-2 bg-card hover:bg-accent border border-border rounded-lg shadow-lg transition-all duration-200 group',
          position === 'bottom-left' ? 'left-4 bottom-16' : 'right-4 bottom-16'
        )}
        title="Show keyboard shortcuts (⌘/)"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
      </button>

      {/* Shortcuts panel */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Panel */}
          <div
            className="relative w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-medium text-foreground">Keyboard Shortcuts</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCustomize}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                  aria-label="Customize shortcuts"
                  title="Customize shortcuts"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search box */}
            <div className="px-4 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 transition-colors"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category filter tabs */}
            {categories.length > 1 && (
              <div className="px-4 py-2 border-b border-border flex gap-1 overflow-x-auto">
                <CategoryTab
                  label="All"
                  isActive={selectedCategory === null}
                  onClick={() => setSelectedCategory(null)}
                />
                {categories.map((category) => (
                  <CategoryTab
                    key={category}
                    label={category}
                    isActive={selectedCategory === category}
                    onClick={() => setSelectedCategory(category)}
                  />
                ))}
              </div>
            )}

            {/* Shortcuts list */}
            <div className="max-h-[50vh] overflow-y-auto p-4 space-y-4">
              {filteredShortcuts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No shortcuts found for "{searchQuery}"
                </div>
              ) : (
                <>
                  {/* Uncategorized shortcuts */}
                  {groupedShortcuts.uncategorized.length > 0 && (
                    <div className="space-y-1">
                      {groupedShortcuts.uncategorized.map((shortcut) => (
                        <ShortcutRow key={shortcut.id} shortcut={shortcut} searchQuery={searchQuery} />
                      ))}
                    </div>
                  )}

                  {/* Categorized shortcuts */}
                  {Object.entries(groupedShortcuts.groups).map(([category, categoryShortcuts]) => (
                    <div key={category}>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {category}
                      </h3>
                      <div className="space-y-1">
                        {categoryShortcuts.map((shortcut) => (
                          <ShortcutRow key={shortcut.id} shortcut={shortcut} searchQuery={searchQuery} />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Press <kbd className="px-1.5 py-0.5 bg-card rounded text-muted-foreground">Esc</kbd> to close
              </span>
              <span className="text-muted-foreground">
                {filteredShortcuts.length} shortcut{filteredShortcuts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface CategoryTabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function CategoryTab({ label, isActive, onClick }: CategoryTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap',
        isActive
          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          : 'bg-card text-muted-foreground border border-transparent hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

interface ShortcutRowProps {
  shortcut: KeyboardShortcut;
  searchQuery?: string;
}

function ShortcutRow({ shortcut, searchQuery }: ShortcutRowProps) {
  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent transition-colors">
      <span className="text-sm text-foreground">
        {searchQuery ? highlightText(shortcut.description, searchQuery) : shortcut.description}
      </span>
      <kbd className="px-2 py-1 bg-card border border-border rounded text-xs text-muted-foreground font-mono ml-4 flex-shrink-0">
        {formatShortcutKey(shortcut.key)}
      </kbd>
    </div>
  );
}

/**
 * Mini shortcut badge (for Tooltip or Button)
 */
interface ShortcutBadgeProps {
  shortcutKey: string;
  className?: string;
}

export function ShortcutBadge({ shortcutKey, className }: ShortcutBadgeProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 bg-card border border-border rounded text-[10px] text-muted-foreground font-mono',
        className
      )}
    >
      {formatShortcutKey(shortcutKey)}
    </kbd>
  );
}

/**
 * Toast notification style shortcut hint
 * Displayed when user executes a keyboard shortcut
 */
interface ShortcutToastProps {
  message: string;
  shortcutKey: string;
  visible: boolean;
  onHide?: () => void;
}

export function ShortcutToast({ message, shortcutKey, visible, onHide }: ShortcutToastProps) {
  useEffect(() => {
    if (visible && onHide) {
      const timer = setTimeout(onHide, 1500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg shadow-lg">
        <span className="text-sm text-foreground">{message}</span>
        <kbd className="px-2 py-0.5 bg-background border border-border rounded text-xs text-muted-foreground font-mono">
          {formatShortcutKey(shortcutKey)}
        </kbd>
      </div>
    </div>
  );
}
