/**
 * Shortcuts Settings Panel
 * Keyboard shortcuts configuration with improved visual hierarchy
 *
 * Features:
 * - Gradient cards for global shortcut section
 * - Visual keyboard key representations
 * - Category-based organization with SettingSection
 * - Consistent styling with Storage and Data panels
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Keyboard,
  Search,
  X,
  RotateCcw,
  Globe,
  AlertCircle,
  Command,
  Navigation,
  Zap,
  Database,
  HelpCircle,
  Info,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
import { ShortcutEditor } from '../ShortcutEditor';
import { useShortcutsContext } from '../../../contexts/ShortcutsContext';
import { formatShortcutKey, type KeyboardShortcut } from '../../../hooks/useKeyboardShortcuts';
import { SettingSection } from '../ui/SettingSection';
import { SettingInfoBox } from '../ui/SettingInfoBox';
import { Skeleton } from '../../ui/Skeleton';

// Default shortcuts - these match App.tsx DEFAULT_SHORTCUT_KEYS
const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'refresh',
    key: 'cmd+r',
    description: 'Reload projects & workflows',
    category: 'General',
    action: () => {},
  },
  {
    id: 'new',
    key: 'cmd+n',
    description: 'New item (context-aware)',
    category: 'General',
    action: () => {},
  },
  {
    id: 'save',
    key: 'cmd+s',
    description: 'Save current workflow',
    category: 'General',
    action: () => {},
  },
  {
    id: 'search',
    key: 'cmd+f',
    description: 'Focus search',
    category: 'General',
    action: () => {},
  },
  { id: 'export', key: 'cmd+e', description: 'Export data', category: 'Data', action: () => {} },
  { id: 'import', key: 'cmd+i', description: 'Import data', category: 'Data', action: () => {} },
  {
    id: 'tab-projects',
    key: 'cmd+1',
    description: 'Switch to Projects tab',
    category: 'Navigation',
    action: () => {},
  },
  {
    id: 'tab-workflows',
    key: 'cmd+2',
    description: 'Switch to Workflows tab',
    category: 'Navigation',
    action: () => {},
  },
  {
    id: 'stop-all',
    key: 'cmd+shift+k',
    description: 'Stop all running processes',
    category: 'Execution',
    action: () => {},
  },
  {
    id: 'deploy',
    key: 'cmd+shift+d',
    description: 'Quick deploy current project',
    category: 'Execution',
    action: () => {},
  },
  {
    id: 'help',
    key: 'cmd+/',
    description: 'Show keyboard shortcuts',
    category: 'Help',
    action: () => {},
  },
];

// Category icons mapping
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  General: <Command className="w-4 h-4" />,
  Navigation: <Navigation className="w-4 h-4" />,
  Execution: <Zap className="w-4 h-4" />,
  Data: <Database className="w-4 h-4" />,
  Help: <HelpCircle className="w-4 h-4" />,
};

// Category colors mapping
const CATEGORY_COLORS: Record<string, { border: string; iconBg: string; gradient: string }> = {
  General: {
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    gradient: 'from-blue-500/5 via-transparent to-transparent',
  },
  Navigation: {
    border: 'border-purple-500/20',
    iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    gradient: 'from-purple-500/5 via-transparent to-transparent',
  },
  Execution: {
    border: 'border-amber-500/20',
    iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    gradient: 'from-amber-500/5 via-transparent to-transparent',
  },
  Data: {
    border: 'border-green-500/20',
    iconBg: 'bg-green-500/10 text-green-600 dark:text-green-400',
    gradient: 'from-green-500/5 via-transparent to-transparent',
  },
  Help: {
    border: 'border-cyan-500/20',
    iconBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    gradient: 'from-cyan-500/5 via-transparent to-transparent',
  },
};

export const ShortcutsSettingsPanel: React.FC = () => {
  const {
    settings,
    isLoading,
    error,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    setGlobalShortcutsEnabled,
    setGlobalToggleShortcut,
  } = useShortcutsContext();

  const shortcuts = DEFAULT_SHORTCUTS;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isRecordingGlobal, setIsRecordingGlobal] = useState(false);
  const [recordedGlobalKey, setRecordedGlobalKey] = useState<string | null>(null);

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    for (const shortcut of shortcuts) {
      if (shortcut.category) {
        categorySet.add(shortcut.category);
      }
    }
    return Array.from(categorySet).sort();
  }, [shortcuts]);

  // Filter shortcuts
  const filteredShortcuts = useMemo(() => {
    return shortcuts.filter((shortcut) => {
      if (selectedCategory && shortcut.category !== selectedCategory) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = shortcut.description.toLowerCase().includes(query);
        const matchesKey = shortcut.key.toLowerCase().includes(query);
        const matchesCategory = shortcut.category?.toLowerCase().includes(query);
        if (!matchesDescription && !matchesKey && !matchesCategory) return false;
      }

      return true;
    });
  }, [shortcuts, searchQuery, selectedCategory]);

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

  // Get custom binding for a shortcut
  const getCustomBinding = (shortcutId: string) => {
    return settings.customBindings[shortcutId];
  };

  // Create effective shortcuts array with current custom keys for conflict detection
  const effectiveShortcutsForConflict = useMemo(() => {
    return shortcuts.map((shortcut) => {
      const binding = settings.customBindings[shortcut.id];
      return {
        ...shortcut,
        key: binding?.customKey || shortcut.key,
        enabled: binding?.enabled ?? true,
      };
    });
  }, [shortcuts, settings.customBindings]);

  // Handle global shortcut recording
  useEffect(() => {
    if (!isRecordingGlobal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecordingGlobal(false);
        setRecordedGlobalKey(null);
        return;
      }

      const parts: string[] = [];
      if (e.metaKey) parts.push('cmd');
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');

      const key = e.key.toLowerCase();
      if (!['meta', 'control', 'alt', 'shift'].includes(key)) {
        parts.push(key);
        setRecordedGlobalKey(parts.join('+'));
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecordingGlobal]);

  const handleSaveGlobalShortcut = async () => {
    if (recordedGlobalKey) {
      try {
        await setGlobalToggleShortcut(recordedGlobalKey);
        setIsRecordingGlobal(false);
        setRecordedGlobalKey(null);
      } catch {
        // Error is already set in context, keep recording state for retry
      }
    }
  };

  const handleUpdateShortcut = async (
    shortcutId: string,
    customKey: string | null,
    enabled: boolean
  ) => {
    await updateShortcut(shortcutId, customKey, enabled);
  };

  const handleResetShortcut = async (shortcutId: string) => {
    await resetShortcut(shortcutId);
  };

  const handleResetAll = async () => {
    if (confirm('Are you sure you want to reset all keyboard shortcuts to their defaults?')) {
      await resetAllShortcuts();
    }
  };

  // Count customized shortcuts
  const customizedCount = Object.keys(settings.customBindings).length;

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 pb-4 border-b border-border bg-background">
        <h2 className="text-xl font-semibold text-foreground flex items-center">
          <Keyboard className="w-5 h-5 pr-1" />
          Keyboard Shortcuts
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize keyboard shortcuts for quick actions
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-6">
        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Global Toggle Shortcut Section */}
        <SettingSection
          title="Global Toggle"
          description="Show or hide SpecForge from anywhere on your system"
          icon={<Globe className="w-4 h-4" />}
        >
          <div
            className={cn(
              'group relative p-4 rounded-lg',
              'bg-gradient-to-r from-blue-500/5 via-transparent to-transparent',
              'border border-blue-500/20',
              'transition-colors hover:border-blue-500/40'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Globe Icon */}
              <div
                className={cn(
                  'flex-shrink-0 p-2.5 rounded-lg',
                  'bg-blue-500/10 text-blue-500 dark:text-blue-400'
                )}
              >
                <Globe className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Global Toggle Shortcut
                  </span>
                  <Toggle
                    checked={settings.globalShortcutsEnabled}
                    onChange={() => setGlobalShortcutsEnabled(!settings.globalShortcutsEnabled)}
                    aria-label={
                      settings.globalShortcutsEnabled
                        ? 'Disable global shortcut'
                        : 'Enable global shortcut'
                    }
                    size="sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Quickly show or hide SpecForge window from any application
                </p>
              </div>
            </div>

            {/* Shortcut Recording */}
            <div className="mt-4">
              {isRecordingGlobal ? (
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex-1 px-4 py-2.5 bg-background border rounded-lg text-sm font-mono text-center',
                      recordedGlobalKey
                        ? 'border-green-500 text-green-600 dark:text-green-400'
                        : 'border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
                    )}
                  >
                    {recordedGlobalKey ? (
                      <KeyDisplay keys={recordedGlobalKey} />
                    ) : (
                      'Press your desired key combination...'
                    )}
                  </div>
                  <Button
                    onClick={handleSaveGlobalShortcut}
                    disabled={!recordedGlobalKey}
                    variant="outline-success"
                    size="sm"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setIsRecordingGlobal(false);
                      setRecordedGlobalKey(null);
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setIsRecordingGlobal(true)}
                  disabled={!settings.globalShortcutsEnabled}
                  className={cn(
                    'w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm transition-colors',
                    'flex items-center justify-center gap-2',
                    settings.globalShortcutsEnabled
                      ? 'text-foreground hover:bg-accent hover:border-border cursor-pointer'
                      : 'text-muted-foreground cursor-not-allowed opacity-60'
                  )}
                >
                  {settings.globalToggleShortcut ? (
                    <KeyDisplay keys={settings.globalToggleShortcut} />
                  ) : (
                    <span className="text-muted-foreground">Click to set shortcut</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </SettingSection>

        {/* Search and Filter Section */}
        <SettingSection
          title="Application Shortcuts"
          description="Shortcuts that work within the SpecForge application"
          icon={<Command className="w-4 h-4" />}
        >
          {/* Search and Reset Bar */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search shortcuts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full pl-10 pr-8 py-2 bg-background border border-border rounded-lg',
                  'text-sm text-foreground placeholder-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  'transition-colors'
                )}
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {customizedCount > 0 && (
              <Button
                onClick={handleResetAll}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All
              </Button>
            )}
          </div>

          {/* Category Tabs */}
          {categories.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-4">
              <CategoryTab
                label="All"
                count={shortcuts.length}
                isActive={selectedCategory === null}
                onClick={() => setSelectedCategory(null)}
              />
              {categories.map((category) => {
                const count = shortcuts.filter((s) => s.category === category).length;
                return (
                  <CategoryTab
                    key={category}
                    label={category}
                    count={count}
                    isActive={selectedCategory === category}
                    onClick={() => setSelectedCategory(category)}
                    icon={CATEGORY_ICONS[category]}
                  />
                );
              })}
            </div>
          )}

          {/* Shortcuts List */}
          {isLoading ? (
            <ShortcutsListSkeleton />
          ) : filteredShortcuts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No shortcuts found for "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-4">
              {/* Uncategorized shortcuts */}
              {groupedShortcuts.uncategorized.length > 0 && (
                <ShortcutCategoryCard
                  shortcuts={groupedShortcuts.uncategorized}
                  settings={settings}
                  effectiveShortcutsForConflict={effectiveShortcutsForConflict}
                  getCustomBinding={getCustomBinding}
                  onUpdate={handleUpdateShortcut}
                  onReset={handleResetShortcut}
                />
              )}

              {/* Categorized shortcuts */}
              {Object.entries(groupedShortcuts.groups).map(([category, categoryShortcuts]) => (
                <ShortcutCategoryCard
                  key={category}
                  category={category}
                  shortcuts={categoryShortcuts}
                  settings={settings}
                  effectiveShortcutsForConflict={effectiveShortcutsForConflict}
                  getCustomBinding={getCustomBinding}
                  onUpdate={handleUpdateShortcut}
                  onReset={handleResetShortcut}
                />
              ))}
            </div>
          )}
        </SettingSection>

        {/* Keyboard Shortcuts Tips */}
        <SettingInfoBox title="Tips" variant="info">
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>Click on any shortcut key to record a new key combination</span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>
                Press <KeyBadge keyName="Esc" /> to cancel recording
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>
                Use the toggle to temporarily disable shortcuts without losing your customizations
              </span>
            </li>
          </ul>
        </SettingInfoBox>

        {/* Footer Stats */}
        <div className="text-xs text-muted-foreground flex items-center justify-between pt-2 border-t border-border">
          <span>
            {customizedCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                {customizedCount} customized
              </span>
            ) : (
              'Using defaults'
            )}
          </span>
          <span>{filteredShortcuts.length} shortcuts</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Internal Components
// ============================================================================

/** Visual keyboard key badge */
interface KeyBadgeProps {
  keyName: string;
  className?: string;
}

const KeyBadge: React.FC<KeyBadgeProps> = ({ keyName, className }) => {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5',
        'bg-muted border border-border rounded',
        'text-[10px] font-mono font-medium text-foreground',
        'shadow-sm',
        className
      )}
    >
      {keyName}
    </kbd>
  );
};

/** Visual keyboard key display for shortcuts */
interface KeyDisplayProps {
  keys: string;
  className?: string;
}

const KeyDisplay: React.FC<KeyDisplayProps> = ({ keys, className }) => {
  const formattedKeys = formatShortcutKey(keys);
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  // Split the formatted key string into individual keys
  const keyParts = isMac
    ? formattedKeys.split('').filter((k) => k.trim())
    : formattedKeys.split('+').filter((k) => k.trim());

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keyParts.map((key, index) => (
        <KeyBadge key={index} keyName={key} />
      ))}
    </span>
  );
};

/** Category tab component */
interface CategoryTabProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

const CategoryTab: React.FC<CategoryTabProps> = ({ label, count, isActive, onClick, icon }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5',
        isActive
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {icon && <span className="opacity-70">{icon}</span>}
      {label}
      <span
        className={cn(
          'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full',
          isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        {count}
      </span>
    </button>
  );
};

/** Loading skeleton for shortcuts list */
const ShortcutsListSkeleton: React.FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="p-4 rounded-lg border border-border bg-card">
        <Skeleton className="w-24 h-4 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-center justify-between py-2">
              <Skeleton className="w-48 h-4" />
              <div className="flex items-center gap-2">
                <Skeleton className="w-20 h-6 rounded" />
                <Skeleton className="w-10 h-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** Shortcut category card component */
interface ShortcutCategoryCardProps {
  category?: string;
  shortcuts: KeyboardShortcut[];
  settings: {
    customBindings: Record<string, { customKey?: string | null; enabled?: boolean }>;
  };
  effectiveShortcutsForConflict: KeyboardShortcut[];
  getCustomBinding: (id: string) => { customKey?: string | null; enabled?: boolean } | undefined;
  onUpdate: (id: string, customKey: string | null, enabled: boolean) => void;
  onReset: (id: string) => void;
}

const ShortcutCategoryCard: React.FC<ShortcutCategoryCardProps> = ({
  category,
  shortcuts,
  effectiveShortcutsForConflict,
  getCustomBinding,
  onUpdate,
  onReset,
}) => {
  const colors = category ? CATEGORY_COLORS[category] : null;
  const icon = category ? CATEGORY_ICONS[category] : null;

  return (
    <div
      className={cn('rounded-lg border bg-card overflow-hidden', colors?.border || 'border-border')}
    >
      {/* Category Header */}
      {category && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2.5',
            'border-b',
            colors?.border || 'border-border',
            'bg-gradient-to-r',
            colors?.gradient || 'from-muted/50 via-transparent to-transparent'
          )}
        >
          {icon && (
            <div
              className={cn('p-1.5 rounded', colors?.iconBg || 'bg-muted text-muted-foreground')}
            >
              {icon}
            </div>
          )}
          <span className="text-sm font-medium text-foreground">{category}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {shortcuts.length} shortcuts
          </span>
        </div>
      )}

      {/* Shortcuts List */}
      <div className="divide-y divide-border">
        {shortcuts.map((shortcut) => {
          const binding = getCustomBinding(shortcut.id);
          return (
            <ShortcutEditor
              key={shortcut.id}
              shortcut={shortcut}
              customKey={binding?.customKey ?? null}
              enabled={binding?.enabled ?? true}
              allShortcuts={effectiveShortcutsForConflict}
              onUpdate={(key, enabled) => onUpdate(shortcut.id, key, enabled)}
              onReset={() => onReset(shortcut.id)}
            />
          );
        })}
      </div>
    </div>
  );
};
