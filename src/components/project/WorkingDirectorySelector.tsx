/**
 * Working Directory Selector Component
 * A redesigned worktree selector with enhanced UX for desktop applications
 * @see specs/001-worktree-enhancements/tasks.md
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  GitBranch,
  ChevronDown,
  Code2,
  FolderOpen,
  Check,
  FileEdit,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';
import type { Worktree, WorktreeStatus, EditorDefinition } from '../../lib/tauri-api';
import { worktreeAPI } from '../../lib/tauri-api';

interface WorkingDirectorySelectorProps {
  /** List of available worktrees */
  worktrees: Worktree[];
  /** Currently selected worktree path */
  selectedPath: string;
  /** Map of worktree statuses keyed by path */
  statuses?: Record<string, WorktreeStatus>;
  /** Whether statuses are loading */
  isLoadingStatuses?: boolean;
  /** Available editors for "Open in" action */
  availableEditors?: EditorDefinition[];
  /** Callback when selection changes */
  onChange: (path: string) => void;
  /** Optional className */
  className?: string;
}

/**
 * Compact status indicators for worktree
 */
function WorktreeStatusIndicator({
  status,
  compact = false,
}: {
  status: WorktreeStatus | undefined;
  compact?: boolean;
}) {
  if (!status) return null;

  const { uncommittedCount, ahead, behind, hasTrackingBranch } = status;
  const hasChanges = uncommittedCount > 0;
  const hasAheadBehind = hasTrackingBranch && (ahead > 0 || behind > 0);

  if (!hasChanges && !hasAheadBehind) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {hasChanges && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-yellow-400"
            title={`${uncommittedCount} uncommitted change${uncommittedCount > 1 ? 's' : ''}`}
          />
        )}
        {hasAheadBehind && ahead > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" title={`${ahead} ahead`} />
        )}
        {hasAheadBehind && behind > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" title={`${behind} behind`} />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {hasChanges && (
        <span
          className="flex items-center gap-0.5 text-yellow-400"
          title={`${uncommittedCount} uncommitted change${uncommittedCount > 1 ? 's' : ''}`}
        >
          <FileEdit className="w-3 h-3" />
          <span>{uncommittedCount}</span>
        </span>
      )}
      {hasAheadBehind && ahead > 0 && (
        <span
          className="flex items-center gap-0.5 text-green-400"
          title={`${ahead} commit${ahead > 1 ? 's' : ''} ahead`}
        >
          <ArrowUp className="w-3 h-3" />
          <span>{ahead}</span>
        </span>
      )}
      {hasAheadBehind && behind > 0 && (
        <span
          className="flex items-center gap-0.5 text-orange-400"
          title={`${behind} commit${behind > 1 ? 's' : ''} behind`}
        >
          <ArrowDown className="w-3 h-3" />
          <span>{behind}</span>
        </span>
      )}
    </div>
  );
}

export function WorkingDirectorySelector({
  worktrees,
  selectedPath,
  statuses = {},
  isLoadingStatuses = false,
  availableEditors = [],
  onChange,
  className,
}: WorkingDirectorySelectorProps) {
  const { formatPath } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find current selected worktree
  const selectedWorktree = worktrees.find((w) => w.path === selectedPath);
  const selectedStatus = statuses[selectedPath];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
          setFocusedIndex(worktrees.findIndex((w) => w.path === selectedPath));
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < worktrees.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : worktrees.length - 1));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < worktrees.length) {
            onChange(worktrees[focusedIndex].path);
            setIsOpen(false);
            setFocusedIndex(-1);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(worktrees.length - 1);
          break;
      }
    },
    [isOpen, worktrees, selectedPath, focusedIndex, onChange]
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  // Open in editor handler
  const handleOpenInEditor = useCallback(
    async (e: React.MouseEvent, editorId?: string) => {
      e.stopPropagation();
      try {
        await worktreeAPI.openInEditor(selectedPath, editorId);
      } catch (err) {
        console.error('Failed to open in editor:', err);
      }
    },
    [selectedPath]
  );

  // Only show when there are multiple worktrees
  if (worktrees.length <= 1) return null;

  const displayLabel = selectedWorktree?.branch || selectedPath.split('/').pop() || 'Main';
  const isMainWorktree = selectedWorktree?.isMain ?? false;

  return (
    <div ref={containerRef} className={cn('relative', className)} onKeyDown={handleKeyDown}>
      {/* Selector Card */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select working directory"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer',
          'bg-card/60 hover:bg-card/80',
          isOpen ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-border hover:border-muted'
        )}
      >
        {/* Git Branch Icon */}
        <div
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-lg',
            isMainWorktree ? 'bg-blue-500/15' : 'bg-muted/50'
          )}
        >
          <GitBranch
            className={cn(
              'w-4.5 h-4.5',
              isMainWorktree ? 'text-blue-400' : 'text-muted-foreground'
            )}
          />
        </div>

        {/* Worktree Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Working Directory
            </span>
            {isMainWorktree && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded">
                Main
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-medium text-foreground truncate">{displayLabel}</span>
            {/* Loading skeleton for status */}
            {isLoadingStatuses ? (
              <div className="h-3 w-12 bg-muted rounded animate-pulse" />
            ) : (
              <WorktreeStatusIndicator status={selectedStatus} />
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1">
          {/* Open in Editor Button */}
          {availableEditors.length > 0 && (
            <button
              onClick={(e) => handleOpenInEditor(e, availableEditors[0]?.id)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                'text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10',
                'opacity-0 group-hover:opacity-100 focus:opacity-100'
              )}
              title={`Open in ${availableEditors[0]?.name || 'Editor'}`}
            >
              <Code2 className="w-4 h-4" />
            </button>
          )}

          {/* Dropdown Arrow */}
          <div className="p-1.5">
            <ChevronDown
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Worktree options"
          className={cn(
            'absolute z-50 w-full mt-2 py-1.5',
            'bg-card border border-border rounded-lg shadow-xl',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
            'max-h-[320px] overflow-y-auto'
          )}
        >
          {/* Section Header */}
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Select Worktree
          </div>

          {/* Worktree List */}
          {worktrees.map((worktree, index) => {
            const isSelected = worktree.path === selectedPath;
            const isFocused = index === focusedIndex;
            const status = statuses[worktree.path];
            const label = worktree.branch || worktree.path.split('/').pop() || 'Unknown';

            return (
              <div
                key={worktree.path}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(worktree.path);
                  setIsOpen(false);
                  setFocusedIndex(-1);
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                  isSelected ? 'bg-blue-500/15' : isFocused ? 'bg-accent/70' : 'hover:bg-accent'
                )}
              >
                {/* Branch Icon */}
                <GitBranch
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    worktree.isMain ? 'text-blue-400' : 'text-muted-foreground'
                  )}
                />

                {/* Worktree Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-medium truncate',
                        isSelected ? 'text-blue-400' : 'text-foreground'
                      )}
                    >
                      {label}
                    </span>
                    {worktree.isMain && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                        Main
                      </span>
                    )}
                    {worktree.isDetached && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-400 rounded flex-shrink-0">
                        Detached
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-xs text-muted-foreground truncate"
                      title={formatPath(worktree.path)}
                    >
                      {formatPath(worktree.path)}
                    </span>
                    <WorktreeStatusIndicator status={status} compact />
                  </div>
                </div>

                {/* Selected Indicator */}
                {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              </div>
            );
          })}

          {/* Footer Hint */}
          <div className="px-3 py-2 mt-1 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Scripts will run in the selected directory</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
