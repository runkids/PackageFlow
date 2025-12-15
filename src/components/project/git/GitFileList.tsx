/**
 * Git File List - Shows staged, modified, and untracked files
 * @see specs/009-git-integration/tasks.md - T016
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Check,
  FileEdit,
  FileQuestion,
  FilePlus,
  FileX,
  FileSymlink,
  AlertTriangle,
  Undo2,
  Trash2,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { GitFile } from '../../../types/git';

interface GitFileListProps {
  /** Staged files */
  stagedFiles: GitFile[];
  /** Unstaged changed files */
  changedFiles: GitFile[];
  /** Untracked files */
  untrackedFiles: GitFile[];
  /** Stage file handler */
  onStageFile: (path: string) => void;
  /** Unstage file handler */
  onUnstageFile: (path: string) => void;
  /** Stage all handler */
  onStageAll: () => void;
  /** Unstage all handler */
  onUnstageAll: () => void;
  /** Discard changes handler */
  onDiscardFile?: (path: string) => void;
  /** Discard all changes handler */
  onDiscardAll?: () => void;
  /** Delete untracked file handler */
  onDeleteUntracked?: (path: string) => void;
  /** Delete all untracked files handler */
  onDeleteAllUntracked?: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Handler for file click to view diff */
  onFileClick?: (file: GitFile) => void;
}

// File status icons and colors
const FILE_STATUS_CONFIG = {
  modified: { icon: FileEdit, color: 'text-yellow-400', label: 'M' },
  added: { icon: FilePlus, color: 'text-green-400', label: 'A' },
  deleted: { icon: FileX, color: 'text-red-400', label: 'D' },
  renamed: { icon: FileSymlink, color: 'text-blue-400', label: 'R' },
  copied: { icon: FileSymlink, color: 'text-blue-400', label: 'C' },
  untracked: { icon: FilePlus, color: 'text-green-400', label: 'N' }, // N for New
  conflict: { icon: AlertTriangle, color: 'text-red-500', label: 'U' },
  ignored: { icon: FileQuestion, color: 'text-muted-foreground/50', label: '!' },
} as const;

interface FileSectionProps {
  title: string;
  files: GitFile[];
  isExpanded: boolean;
  onToggle: () => void;
  actionButton: {
    label: string;
    onClick: () => void;
  };
  secondaryButton?: {
    label: string;
    onClick: () => void;
  };
  onFileAction: (path: string) => void;
  fileActionIcon: typeof Plus;
  fileActionTitle: string;
  onSecondaryFileAction?: (path: string) => void;
  secondaryFileActionIcon?: typeof Undo2;
  secondaryFileActionTitle?: string;
  isStaged?: boolean;
  /** Handler for file click to view diff */
  onFileClick?: (file: GitFile) => void;
  /** Handler for double-click to toggle staging */
  onDoubleClick?: (path: string) => void;
}

// Module-level click state tracker for distinguishing single vs double clicks
const clickState = new Map<string, { timer: ReturnType<typeof setTimeout> | null; count: number }>();

function handleFileClick(
  filePath: string,
  file: GitFile,
  onSingleClick?: (file: GitFile) => void,
  onDoubleClick?: (path: string) => void
) {
  const state = clickState.get(filePath) || { timer: null, count: 0 };
  state.count += 1;

  if (state.count === 1) {
    // First click - set timer for single click action
    state.timer = setTimeout(() => {
      const currentState = clickState.get(filePath);
      if (currentState && currentState.count === 1) {
        // Single click - open diff viewer
        onSingleClick?.(file);
      }
      clickState.delete(filePath);
    }, 250);
    clickState.set(filePath, state);
  } else if (state.count >= 2) {
    // Double click - toggle staging
    if (state.timer) {
      clearTimeout(state.timer);
    }
    clickState.delete(filePath);
    onDoubleClick?.(filePath);
  }
}

function FileSection({
  title,
  files,
  isExpanded,
  onToggle,
  actionButton,
  secondaryButton,
  onFileAction,
  fileActionIcon: FileActionIcon,
  fileActionTitle,
  onSecondaryFileAction,
  secondaryFileActionIcon: SecondaryFileActionIcon,
  secondaryFileActionTitle,
  isStaged = false,
  onFileClick,
  onDoubleClick,
}: FileSectionProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {title} ({files.length})
        </button>
        <div className="flex items-center gap-1">
          {secondaryButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={secondaryButton.onClick}
              className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20"
            >
              {secondaryButton.label}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={actionButton.onClick}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            {actionButton.label}
          </Button>
        </div>
      </div>

      {/* File List */}
      {isExpanded && (
        <div className="space-y-0.5 pl-2">
          {files.map((file) => {
            const config = FILE_STATUS_CONFIG[file.status] || FILE_STATUS_CONFIG.modified;
            const Icon = config.icon;

            return (
              <div
                key={file.path}
                className="group flex items-center gap-2 py-1 px-2 rounded hover:bg-accent transition-colors cursor-pointer"
                onClick={() => handleFileClick(file.path, file, onFileClick, onDoubleClick)}
                title={`${file.path}\nClick: View diff | Double-click: ${isStaged ? 'Unstage' : 'Stage'}`}
              >
                {/* Status Icon */}
                {isStaged ? (
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : (
                  <Icon className={`w-4 h-4 ${config.color} flex-shrink-0`} />
                )}

                {/* File Path */}
                <span className="flex-1 text-sm text-foreground truncate" title={file.path}>
                  {file.path}
                </span>

                {/* Status Label */}
                {!isStaged && (
                  <span className={`text-xs ${config.color} font-mono`}>
                    {config.label}
                  </span>
                )}

                {/* Secondary Action Button (Discard) */}
                {onSecondaryFileAction && SecondaryFileActionIcon && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSecondaryFileAction(file.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 hover:bg-red-500/20 transition-opacity"
                    title={secondaryFileActionTitle}
                  >
                    <SecondaryFileActionIcon className="w-3.5 h-3.5 text-red-400" />
                  </Button>
                )}

                {/* Primary Action Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileAction(file.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 transition-opacity"
                  title={fileActionTitle}
                >
                  <FileActionIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GitFileList({
  stagedFiles,
  changedFiles,
  untrackedFiles,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onDiscardFile,
  onDiscardAll,
  onDeleteUntracked,
  onDeleteAllUntracked,
  isLoading = false,
  onFileClick,
}: GitFileListProps) {
  const [expandedSections, setExpandedSections] = useState({
    staged: true,
    changes: true,
    untracked: true,
  });

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'discard' | 'discard-all' | 'delete' | 'delete-all';
    filePath?: string;
  }>({ open: false, type: 'discard' });

  const handleDiscardFileWithConfirm = (path: string) => {
    setConfirmDialog({ open: true, type: 'discard', filePath: path });
  };

  const handleDiscardAllWithConfirm = () => {
    setConfirmDialog({ open: true, type: 'discard-all' });
  };

  const handleDeleteUntrackedWithConfirm = (path: string) => {
    setConfirmDialog({ open: true, type: 'delete', filePath: path });
  };

  const handleDeleteAllUntrackedWithConfirm = () => {
    setConfirmDialog({ open: true, type: 'delete-all' });
  };

  const handleConfirmAction = () => {
    switch (confirmDialog.type) {
      case 'discard':
        if (confirmDialog.filePath && onDiscardFile) {
          onDiscardFile(confirmDialog.filePath);
        }
        break;
      case 'discard-all':
        onDiscardAll?.();
        break;
      case 'delete':
        if (confirmDialog.filePath && onDeleteUntracked) {
          onDeleteUntracked(confirmDialog.filePath);
        }
        break;
      case 'delete-all':
        onDeleteAllUntracked?.();
        break;
    }
    setConfirmDialog({ open: false, type: 'discard' });
  };

  const getConfirmDialogProps = () => {
    switch (confirmDialog.type) {
      case 'discard':
        return {
          variant: 'warning' as const,
          title: 'Discard Changes',
          description: 'Are you sure you want to discard changes to this file? This action cannot be undone.',
          itemName: confirmDialog.filePath,
          confirmText: 'Discard',
        };
      case 'discard-all':
        return {
          variant: 'warning' as const,
          title: 'Discard All Changes',
          description: `Are you sure you want to discard all ${changedFiles.length} changed file(s)? This action cannot be undone.`,
          confirmText: 'Discard All',
        };
      case 'delete':
        return {
          variant: 'destructive' as const,
          title: 'Delete Untracked File',
          description: 'Are you sure you want to delete this untracked file? This action cannot be undone.',
          itemName: confirmDialog.filePath,
          confirmText: 'Delete',
        };
      case 'delete-all':
        return {
          variant: 'destructive' as const,
          title: 'Delete All Untracked Files',
          description: `Are you sure you want to delete all ${untrackedFiles.length} untracked file(s)? This action cannot be undone.`,
          confirmText: 'Delete All',
        };
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const totalChanges = stagedFiles.length + changedFiles.length + untrackedFiles.length;

  if (totalChanges === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Check className="w-12 h-12 mx-auto mb-2 text-green-500" />
        <p>Working directory clean</p>
        <p className="text-sm">No changes to commit</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Staged Changes */}
      <FileSection
        title="Staged Changes"
        files={stagedFiles}
        isExpanded={expandedSections.staged}
        onToggle={() => toggleSection('staged')}
        actionButton={{
          label: 'Unstage All',
          onClick: onUnstageAll,
        }}
        onFileAction={onUnstageFile}
        fileActionIcon={Minus}
        fileActionTitle="Unstage file"
        isStaged
        onFileClick={onFileClick}
        onDoubleClick={onUnstageFile}
      />

      {/* Changes (Modified but not staged) */}
      <FileSection
        title="Changes"
        files={changedFiles}
        isExpanded={expandedSections.changes}
        onToggle={() => toggleSection('changes')}
        actionButton={{
          label: 'Stage All',
          onClick: onStageAll,
        }}
        secondaryButton={onDiscardAll ? {
          label: 'Discard All',
          onClick: handleDiscardAllWithConfirm,
        } : undefined}
        onFileAction={onStageFile}
        fileActionIcon={Plus}
        fileActionTitle="Stage file"
        onSecondaryFileAction={onDiscardFile ? handleDiscardFileWithConfirm : undefined}
        secondaryFileActionIcon={Undo2}
        secondaryFileActionTitle="Discard changes"
        onFileClick={onFileClick}
        onDoubleClick={onStageFile}
      />

      {/* Untracked Files */}
      <FileSection
        title="Untracked"
        files={untrackedFiles}
        isExpanded={expandedSections.untracked}
        onToggle={() => toggleSection('untracked')}
        actionButton={{
          label: 'Stage All',
          onClick: onStageAll,
        }}
        secondaryButton={onDeleteAllUntracked ? {
          label: 'Delete All',
          onClick: handleDeleteAllUntrackedWithConfirm,
        } : undefined}
        onFileAction={onStageFile}
        fileActionIcon={Plus}
        fileActionTitle="Stage file"
        onSecondaryFileAction={onDeleteUntracked ? handleDeleteUntrackedWithConfirm : undefined}
        secondaryFileActionIcon={Trash2}
        secondaryFileActionTitle="Delete file"
        onFileClick={onFileClick}
        onDoubleClick={onStageFile}
      />

      {/* Stage All Button */}
      {(changedFiles.length > 0 || untrackedFiles.length > 0) && (
        <Button
          variant="secondary"
          onClick={onStageAll}
          disabled={isLoading}
          className="w-full"
        >
          Stage All Changes
        </Button>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        onConfirm={handleConfirmAction}
        {...getConfirmDialogProps()}
      />
    </div>
  );
}
