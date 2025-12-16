/**
 * WorktreeCard - Grid view card for Git worktree display
 * Displays worktree status with color-coded borders and quick actions
 */

import { useState, useMemo } from 'react';
import { GitBranch, Code2, FolderOpen, Trash2, ChevronDown, ArrowDownToLine, RefreshCw, Archive, Bookmark, MoreHorizontal } from 'lucide-react';
import type { Worktree, WorktreeStatus, EditorDefinition } from '../../lib/tauri-api';
import type { WorktreeSessionStatus } from '../../types/worktree-sessions';
import { Button } from '../ui/Button';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import { Dropdown, DropdownItem, DropdownSection, DropdownSeparator } from '../ui/Dropdown';
import { WorktreeStatusBadge } from './WorktreeStatusBadge';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';

interface WorktreeCardProps {
  worktree: Worktree;
  status: WorktreeStatus | undefined;
  sessionStatus?: WorktreeSessionStatus;
  isLoadingStatus: boolean;
  availableEditors: EditorDefinition[];
  onOpenInEditor: (path: string, editorId?: string) => void;
  onOpenSession?: (worktree: Worktree) => void;
  onSwitchWorkingDirectory?: (path: string) => void;
  onRemove: (worktree: Worktree) => void;
  onPull?: (worktree: Worktree) => void;
  onSync?: (worktree: Worktree) => void;
  onStash?: (worktree: Worktree) => void;
}

export function WorktreeCard({
  worktree,
  status,
  sessionStatus,
  isLoadingStatus,
  availableEditors,
  onOpenInEditor,
  onOpenSession,
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
            {sessionStatus && (
              <span
                className={cn(
                  'px-1.5 py-0.5 text-xs rounded',
                  sessionStatus === 'broken'
                    ? 'bg-red-500/20 text-red-400'
                    : sessionStatus === 'archived'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-green-500/20 text-green-400'
                )}
              >
                {sessionStatus === 'active'
                  ? 'Session'
                  : sessionStatus === 'archived'
                    ? 'Archived'
                    : 'Broken'}
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

        {/* Session Entry - Always Visible */}
        {onOpenSession && (
          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSession(worktree);
            }}
            className={cn(
              'w-full mt-3 px-2 text-xs text-left h-auto justify-start flex items-center gap-2',
              sessionStatus
                ? 'bg-muted/50 hover:bg-muted'
                : 'border border-dashed border-border hover:border-muted-foreground hover:bg-muted/30'
            )}
          >
            <Bookmark
              className={cn(
                'w-3.5 h-3.5 flex-shrink-0',
                sessionStatus === 'broken'
                  ? 'text-red-400'
                  : sessionStatus === 'archived'
                    ? 'text-muted-foreground'
                    : sessionStatus
                      ? 'text-blue-400'
                      : 'text-muted-foreground'
              )}
            />
            <span className={cn(
              'truncate',
              sessionStatus ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {sessionStatus
                ? sessionStatus === 'broken'
                  ? 'Session (Broken)'
                  : sessionStatus === 'archived'
                    ? 'Session (Archived)'
                    : 'View Session'
                : '+ Start Session'}
            </span>
          </Button>
        )}

        {/* Hover Actions - Progressive Disclosure Pattern */}
        <div
          className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Primary Action: Open in Editor */}
          {availableEditors.length > 0 && (
            availableEditors.length === 1 ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenInEditor(worktree.path, availableEditors[0].id)}
                title={`Open in ${availableEditors[0].name}`}
              >
                <Code2 className="w-3.5 h-3.5 text-blue-400" />
              </Button>
            ) : (
              <Dropdown
                trigger={
                  <Button
                    variant="ghost"
                    className="flex items-center gap-0.5 h-9 px-1.5"
                    title="Open in Editor"
                  >
                    <Code2 className="w-3.5 h-3.5 text-blue-400" />
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </Button>
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

          {/* Primary Action: Pull (if applicable) */}
          {onPull && !worktree.isDetached && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPull(worktree)}
              title="Pull"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
            </Button>
          )}

          {/* More Menu - Secondary Actions */}
          <Dropdown
            trigger={
              <Button
                variant="ghost"
                size="icon"
                title="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            }
            align="right"
          >
            {/* Git Operations Section */}
            <DropdownSection title="Git">
              {onSync && !worktree.isMain && !worktree.isDetached && (
                <DropdownItem
                  onClick={() => onSync(worktree)}
                  icon={<RefreshCw className="w-4 h-4 text-orange-400" />}
                >
                  Sync with Main
                </DropdownItem>
              )}
              {onStash && (
                <DropdownItem
                  onClick={() => onStash(worktree)}
                  icon={<Archive className="w-4 h-4 text-purple-400" />}
                >
                  Stash Changes
                </DropdownItem>
              )}
            </DropdownSection>

            {/* Navigation Section */}
            {onSwitchWorkingDirectory && !worktree.isMain && (
              <>
                <DropdownSeparator />
                <DropdownItem
                  onClick={() => onSwitchWorkingDirectory(worktree.path)}
                  icon={<FolderOpen className="w-4 h-4" />}
                >
                  Switch Directory
                </DropdownItem>
              </>
            )}

            {/* Danger Zone */}
            {!worktree.isMain && (
              <>
                <DropdownSeparator />
                <DropdownItem
                  onClick={() => onRemove(worktree)}
                  icon={<Trash2 className="w-4 h-4" />}
                  destructive
                >
                  Remove Worktree
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Context Menu - Simplified for power users */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          {/* Open in Editor */}
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

          {/* Pull */}
          {onPull && !worktree.isDetached && (
            <>
              {availableEditors.length > 0 && <ContextMenuSeparator />}
              <ContextMenuItem
                onClick={() => {
                  onPull(worktree);
                  setContextMenu(null);
                }}
                icon={<ArrowDownToLine className="w-4 h-4" />}
              >
                Pull
              </ContextMenuItem>
            </>
          )}

          {/* Remove */}
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
