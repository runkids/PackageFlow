/**
 * Shortcuts Settings Panel
 * Keyboard shortcuts configuration
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Keyboard,
  Search,
  X,
  RotateCcw,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { ShortcutEditor } from '../ShortcutEditor';
import { useShortcutsContext } from '../../../contexts/ShortcutsContext';
import { formatShortcutKey, type KeyboardShortcut } from '../../../hooks/useKeyboardShortcuts';

// Default shortcuts - these match App.tsx DEFAULT_SHORTCUT_KEYS
const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'refresh', key: 'cmd+r', description: 'Reload projects & workflows', category: 'General', action: () => {} },
  { id: 'new', key: 'cmd+n', description: 'New item (context-aware)', category: 'General', action: () => {} },
  { id: 'save', key: 'cmd+s', description: 'Save current workflow', category: 'General', action: () => {} },
  { id: 'search', key: 'cmd+f', description: 'Focus search', category: 'General', action: () => {} },
  { id: 'export', key: 'cmd+e', description: 'Export data', category: 'Data', action: () => {} },
  { id: 'import', key: 'cmd+i', description: 'Import data', category: 'Data', action: () => {} },
  { id: 'tab-projects', key: 'cmd+1', description: 'Switch to Projects tab', category: 'Navigation', action: () => {} },
  { id: 'tab-workflows', key: 'cmd+2', description: 'Switch to Workflows tab', category: 'Navigation', action: () => {} },
  { id: 'stop-all', key: 'cmd+shift+k', description: 'Stop all running processes', category: 'Execution', action: () => {} },
  { id: 'deploy', key: 'cmd+shift+d', description: 'Quick deploy current project', category: 'Execution', action: () => {} },
  { id: 'help', key: 'cmd+/', description: 'Show keyboard shortcuts', category: 'Help', action: () => {} },
];

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
    if (
      confirm(
        'Are you sure you want to reset all keyboard shortcuts to their defaults?'
      )
    ) {
      await resetAllShortcuts();
    }
  };

  // Count customized shortcuts
  const customizedCount = Object.keys(settings.customBindings).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 pb-6">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Keyboard className="w-5 h-5" />
          Keyboard Shortcuts
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize keyboard shortcuts for quick actions
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 mb-6 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-300">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Global shortcut section */}
      <div className="shrink-0 p-4 bg-card rounded-lg border border-border space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className="text-sm font-medium text-foreground">
                Global Toggle Shortcut
              </span>
              <p className="text-xs text-muted-foreground">
                Show/hide from anywhere
              </p>
            </div>
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => setGlobalShortcutsEnabled(!settings.globalShortcutsEnabled)}
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors duration-200',
              settings.globalShortcutsEnabled ? 'bg-blue-500' : 'bg-muted'
            )}
            title={settings.globalShortcutsEnabled ? 'Disable' : 'Enable'}
          >
            <span
              className={cn(
                'absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                settings.globalShortcutsEnabled ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isRecordingGlobal ? (
            <>
              <div
                className={cn(
                  'flex-1 px-3 py-2 bg-background border rounded-lg text-sm font-mono text-center',
                  recordedGlobalKey
                    ? 'border-green-500 text-green-400'
                    : 'border-blue-500 text-blue-400 animate-pulse'
                )}
              >
                {recordedGlobalKey
                  ? formatShortcutKey(recordedGlobalKey)
                  : 'Press keys...'}
              </div>
              <Button
                onClick={handleSaveGlobalShortcut}
                disabled={!recordedGlobalKey}
                variant="success"
              >
                Save
              </Button>
              <button
                onClick={() => {
                  setIsRecordingGlobal(false);
                  setRecordedGlobalKey(null);
                }}
                className="px-4 py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsRecordingGlobal(true)}
              disabled={!settings.globalShortcutsEnabled}
              className={cn(
                'flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm font-mono transition-colors',
                settings.globalShortcutsEnabled
                  ? 'text-foreground hover:bg-accent hover:border-border cursor-pointer'
                  : 'text-muted-foreground cursor-not-allowed'
              )}
            >
              {settings.globalToggleShortcut
                ? formatShortcutKey(settings.globalToggleShortcut)
                : 'Click to set shortcut'}
            </button>
          )}
        </div>
      </div>

      {/* Search and filter */}
      <div className="shrink-0 flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 transition-colors"
            autoComplete="off"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {customizedCount > 0 && (
          <button
            onClick={handleResetAll}
            className="px-3 py-2 bg-card hover:bg-accent border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            title="Reset all shortcuts to defaults"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All
          </button>
        )}
      </div>

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="shrink-0 flex gap-2 flex-wrap mb-6">
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
              />
            );
          })}
        </div>
      )}

      {/* Shortcuts list - scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredShortcuts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No shortcuts found for "{searchQuery}"
          </div>
        ) : (
          <>
            {/* Uncategorized */}
            {groupedShortcuts.uncategorized.length > 0 && (
              <div className="space-y-1">
                {groupedShortcuts.uncategorized.map((shortcut) => {
                  const binding = getCustomBinding(shortcut.id);
                  return (
                    <ShortcutEditor
                      key={shortcut.id}
                      shortcut={shortcut}
                      customKey={binding?.customKey ?? null}
                      enabled={binding?.enabled ?? true}
                      allShortcuts={effectiveShortcutsForConflict}
                      onUpdate={(key, enabled) =>
                        handleUpdateShortcut(shortcut.id, key, enabled)
                      }
                      onReset={() => handleResetShortcut(shortcut.id)}
                    />
                  );
                })}
              </div>
            )}

            {/* Categorized */}
            {Object.entries(groupedShortcuts.groups).map(
              ([category, categoryShortcuts]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {categoryShortcuts.map((shortcut) => {
                      const binding = getCustomBinding(shortcut.id);
                      return (
                        <ShortcutEditor
                          key={shortcut.id}
                          shortcut={shortcut}
                          customKey={binding?.customKey ?? null}
                          enabled={binding?.enabled ?? true}
                          allShortcuts={effectiveShortcutsForConflict}
                          onUpdate={(key, enabled) =>
                            handleUpdateShortcut(shortcut.id, key, enabled)
                          }
                          onReset={() => handleResetShortcut(shortcut.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Footer info */}
      <div className="shrink-0 text-xs text-muted-foreground flex items-center justify-between pt-4 mt-4 border-t border-border">
        <span>
          {customizedCount > 0 ? `${customizedCount} customized` : 'Using defaults'}
        </span>
        <span>{filteredShortcuts.length} shortcuts</span>
      </div>
    </div>
  );
};

interface CategoryTabProps {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function CategoryTab({ label, count, isActive, onClick }: CategoryTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1',
        isActive
          ? 'bg-blue-500/20 text-blue-400'
          : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
      <span
        className={cn(
          'text-[10px] tabular-nums',
          isActive ? 'text-blue-400/70' : 'text-muted-foreground'
        )}
      >
        {count}
      </span>
    </button>
  );
}
