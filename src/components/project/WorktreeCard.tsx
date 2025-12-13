/**
 * WorktreeCard - Grid view card for Git worktree display
 * Displays worktree status with color-coded borders and quick actions
 */

import { useState, useMemo } from 'react';
import { GitBranch, Code2, FolderOpen, Trash2, ChevronDown, ArrowDownToLine, RefreshCw, Archive } from 'lucide-react';
import type { Worktree, WorktreeStatus, EditorDefinition } from '../../lib/tauri-api';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import { Dropdown, DropdownItem, DropdownSection } from '../ui/Dropdown';
import { WorktreeStatusBadge } from './WorktreeStatusBadge';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';

interface WorktreeCardProps {
  worktree: Worktree;
  status: WorktreeStatus | undefined;
  isLoadingStatus: boolean;
  availableEditors: EditorDefinition[];
  onOpenInEditor: (path: string, editorId?: string) => void;
  onSwitchWorkingDirectory?: (path: string) => void;
  onRemove: (worktree: Worktree) => void;
  onPull?: (worktree: Worktree) => void;
  onSync?: (worktree: Worktree) => void;
  onStash?: (worktree: Worktree) => void;
}

export function WorktreeCard({
  worktree,
  status,
  isLoadingStatus,
  availableEditors,
  onOpenInEditor,
  onSwitchWorkingDirectory,
  onRemove,
  onPull,
  onSync,
  onStash,
}: WorktreeCardProps) {
  // Settings for path display format
  const { formatPath } = useSettings();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Determine border color based on status
  const borderColorClass = useMemo(() => {
    if (worktree.isMain) return 'border-blue-500/50 hover:border-blue-500';
    if (!status) return 'border-border hover:border-accent';
    if (status.uncommittedCount > 0) return 'border-yellow-500/50 hover:border-yellow-500';
    if (status.behind > 0) return 'border-orange-500/50 hover:border-orange-500';
    return 'border-green-500/50 hover:border-green-500';
  }, [worktree.isMain, status]);

  // Determine background color for main worktree
  const bgClass = useMemo(() => {
    if (worktree.isMain) return 'bg-blue-500/5';
    return 'bg-card';
  }, [worktree.isMain]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCardClick = () => {
    if (onSwitchWorkingDirectory && !worktree.isMain) {
      onSwitchWorkingDirectory(worktree.path);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group p-4 rounded-lg border-2 transition-all cursor-pointer',
          borderColorClass,
          bgClass
        )}
        onContextMenu={handleContextMenu}
        onClick={handleCardClick}
        role="article"
        aria-label={`Worktree: ${worktree.branch || 'detached HEAD'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch
              className={cn(
                'w-5 h-5 flex-shrink-0',
                worktree.isMain ? 'text-blue-400' : 'text-muted-foreground'
              )}
            />
            <h4
              className={cn(
                'text-sm font-medium truncate',
                worktree.isMain ? 'text-blue-400' : 'text-foreground'
              )}
              title={worktree.branch || '(detached HEAD)'}
            >
              {worktree.branch || '(detached HEAD)'}
            </h4>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {worktree.isMain && (
              <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                Main
              </span>
            )}
            {worktree.isDetached && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                Detached
              </span>
            )}
          </div>
        </div>

        {/* Path */}
        <p
          className="text-xs text-muted-foreground truncate mb-2"
          title={worktree.path}
        >
          {formatPath(worktree.path)}
        </p>

        {/* Commit SHA and Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {worktree.head?.substring(0, 7)}
          </span>
          <WorktreeStatusBadge
            status={status}
            isLoading={isLoadingStatus}
            compact
          />
        </div>

        {/* Hover Actions - matching list view style */}
        <div
          className="flex items-center justify-end gap-0.5 mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Open in Editor */}
          {availableEditors.length > 0 && (
            availableEditors.length === 1 ? (
              <button
                onClick={() => onOpenInEditor(worktree.path, availableEditors[0].id)}
                className="p-1.5 rounded hover:bg-accent transition-colors"
                title={`Open in ${availableEditors[0].name}`}
              >
                <Code2 className="w-3.5 h-3.5 text-blue-400" />
              </button>
            ) : (
              <Dropdown
                trigger={
                  <button
                    className="flex items-center gap-1.5 p-1.5 rounded hover:bg-accent transition-colors"
                    title="Open in Editor"
                  >
                    <Code2 className="w-3.5 h-3.5 text-blue-400" />
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                }
                align="right"
              >
                <DropdownSection title="Open in">
                  {availableEditors.map((editor) => (
                    <DropdownItem
                      key={editor.id}
                      onClick={() => onOpenInEditor(worktree.path, editor.id)}
                      icon={<Code2 className="w-4 h-4" />}
                    >
                      {editor.name}
                    </DropdownItem>
                  ))}
                </DropdownSection>
              </Dropdown>
            )
          )}
          {/* Pull button */}
          {onPull && !worktree.isDetached && (
            <button
              onClick={() => onPull(worktree)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Pull"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}
          {/* Sync button */}
          {onSync && !worktree.isMain && !worktree.isDetached && (
            <button
              onClick={() => onSync(worktree)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Sync with main"
            >
              <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
            </button>
          )}
          {/* Stash button */}
          {onStash && (
            <button
              onClick={() => onStash(worktree)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Stash"
            >
              <Archive className="w-3.5 h-3.5 text-purple-400" />
            </button>
          )}
          {onSwitchWorkingDirectory && !worktree.isMain && (
            <button
              onClick={() => onSwitchWorkingDirectory(worktree.path)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Switch working directory"
            >
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {!worktree.isMain && (
            <button
              onClick={() => onRemove(worktree)}
              className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          {availableEditors.map((editor) => (
            <ContextMenuItem
              key={editor.id}
              onClick={() => {
                onOpenInEditor(worktree.path, editor.id);
                setContextMenu(null);
              }}
              icon={<Code2 className="w-4 h-4" />}
            >
              Open in {editor.name}
            </ContextMenuItem>
          ))}
          {availableEditors.length > 0 && <ContextMenuSeparator />}
          {onPull && !worktree.isDetached && (
            <ContextMenuItem
              onClick={() => {
                onPull(worktree);
                setContextMenu(null);
              }}
              icon={<ArrowDownToLine className="w-4 h-4" />}
            >
              Pull
            </ContextMenuItem>
          )}
          {onSync && !worktree.isMain && !worktree.isDetached && (
            <ContextMenuItem
              onClick={() => {
                onSync(worktree);
                setContextMenu(null);
              }}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Sync with Main
            </ContextMenuItem>
          )}
          {onStash && (
            <ContextMenuItem
              onClick={() => {
                onStash(worktree);
                setContextMenu(null);
              }}
              icon={<Archive className="w-4 h-4" />}
            >
              Stash
            </ContextMenuItem>
          )}
          {onSwitchWorkingDirectory && !worktree.isMain && (
            <ContextMenuItem
              onClick={() => {
                onSwitchWorkingDirectory(worktree.path);
                setContextMenu(null);
              }}
              icon={<FolderOpen className="w-4 h-4" />}
            >
              Switch Working Directory
            </ContextMenuItem>
          )}
          {!worktree.isMain && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => {
                  onRemove(worktree);
                  setContextMenu(null);
                }}
                icon={<Trash2 className="w-4 h-4" />}
                destructive
              >
                Remove Worktree
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
    </>
  );
}
