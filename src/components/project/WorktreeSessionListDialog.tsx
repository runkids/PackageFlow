/**
 * WorktreeSessionListDialog
 * Browse sessions across worktrees (active/archived/broken)
 * Enhanced UI with gradient header, icon badge, and improved list styling
 * @see specs/001-worktree-sessions/spec.md
 */

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Download, Search, Upload, X, FolderGit2, Archive, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useSettings } from '../../contexts/SettingsContext';
import { open, save, writeTextFile, readTextFile } from '../../lib/tauri-api';
import type { WorktreeSession, WorktreeSessionStatus } from '../../types/worktree-sessions';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';

type StatusFilter = 'all' | WorktreeSessionStatus;

interface WorktreeSessionListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: WorktreeSession[];
  onOpenSession: (worktreePath: string) => void;
  onImportSession?: (session: WorktreeSession) => Promise<void>;
}

function getStatusBadgeConfig(status: WorktreeSessionStatus): {
  label: string;
  className: string;
  icon: typeof CheckCircle;
} {
  if (status === 'archived') {
    return {
      label: 'Archived',
      className: 'bg-muted/80 text-muted-foreground border-muted-foreground/20',
      icon: Archive,
    };
  }
  if (status === 'broken') {
    return {
      label: 'Broken',
      className: 'bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/30',
      icon: AlertCircle,
    };
  }
  return {
    label: 'Active',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    icon: CheckCircle,
  };
}

export function WorktreeSessionListDialog({
  isOpen,
  onClose,
  sessions,
  onOpenSession,
  onImportSession,
}: WorktreeSessionListDialogProps) {
  const modalId = React.useId();
  const { formatPath } = useSettings();
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [query, setQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Register/unregister modal for ESC handling
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key
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
  }, [modalId, onClose, isOpen]);

  // Focus trap
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFilter('active');
    setQuery('');
    setImportError(null);
  }, [isOpen]);

  const handleExportAll = async () => {
    if (sessions.length === 0) return;

    const filePath = await save({
      defaultPath: `sessions-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!filePath) return;

    try {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sessions,
      };
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    } catch (err) {
      console.error('Failed to export sessions:', err);
    }
  };

  const handleImport = async () => {
    if (!onImportSession) return;
    setImportError(null);

    const filePath = await open({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    });

    if (!filePath || Array.isArray(filePath)) return;

    try {
      const content = await readTextFile(filePath);
      const data = JSON.parse(content);

      if (data.session) {
        // Single session export
        await onImportSession(data.session);
      } else if (data.sessions && Array.isArray(data.sessions)) {
        // Multiple sessions export
        for (const session of data.sessions) {
          await onImportSession(session);
        }
      } else {
        setImportError('Invalid session file format');
      }
    } catch (err) {
      console.error('Failed to import sessions:', err);
      setImportError('Failed to import: invalid file');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => (filter === 'all' ? true : s.status === filter))
      .filter((s) => {
        if (!q) return true;
        const tags = s.tags.join(' ').toLowerCase();
        const branch = (s.branchSnapshot || '').toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          tags.includes(q) ||
          branch.includes(q) ||
          s.worktreePath.toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [filter, query, sessions]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-list-dialog-title"
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
          className={cn(
            'relative w-full max-w-3xl max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-teal-500/30',
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
              'relative px-6 py-5',
              'border-b border-border',
              'bg-gradient-to-r',
              'from-teal-500/10 via-cyan-600/5 to-transparent',
              'dark:from-teal-500/20 dark:via-cyan-600/10 dark:to-transparent'
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-4 top-4"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Title area with icon badge */}
            <div className="flex items-start gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-teal-500/20',
                  'bg-teal-500/10',
                  'shadow-lg'
                )}
              >
                <Bookmark className="w-6 h-6 text-teal-500 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2
                  id="session-list-dialog-title"
                  className="text-lg font-semibold text-foreground leading-tight flex items-center gap-2"
                >
                  Sessions
                  {sessions.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({sessions.length})
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse and manage your worktree sessions
                </p>
              </div>
            </div>

            {/* Header actions */}
            <div className="flex items-center gap-2 mt-4">
              {onImportSession && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleImport}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent/50',
                    'border border-transparent hover:border-border',
                    'transition-all duration-150'
                  )}
                  title="Import sessions from JSON"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import
                </Button>
              )}
              {sessions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExportAll}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent/50',
                    'border border-transparent hover:border-border',
                    'transition-all duration-150'
                  )}
                  title="Export all sessions as JSON"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Export All
                </Button>
              )}
            </div>

            {importError && (
              <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500 dark:text-red-400">
                {importError}
              </div>
            )}
          </div>

          {/* Filters and search */}
          <div className="px-6 py-4 border-b border-border bg-card/30">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Status filter pills */}
              <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg flex-shrink-0">
                {(['all', 'active', 'archived', 'broken'] as const).map((k) => {
                  const isActive = filter === k;
                  const badge = k === 'all' ? null : getStatusBadgeConfig(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilter(k)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-md',
                        'transition-all duration-150',
                        isActive
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      {k === 'all' ? 'All' : badge?.label}
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, tags, branch, path..."
                  className={cn(
                    'pl-9',
                    'bg-background/50 border-border',
                    'focus:border-teal-500/50 focus:ring-teal-500/20'
                  )}
                />
              </div>
            </div>
          </div>

          {/* Content area */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto min-h-0 p-6 focus:outline-none"
            tabIndex={-1}
          >
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <FolderGit2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground font-medium">No sessions found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {sessions.length === 0
                    ? 'Create a session from any worktree to get started'
                    : 'Try adjusting your search or filter'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((s) => {
                  const badge = getStatusBadgeConfig(s.status);
                  const StatusIcon = badge.icon;
                  return (
                    <Button
                      key={s.id}
                      variant="ghost"
                      onClick={() => {
                        onOpenSession(s.worktreePath);
                        onClose();
                      }}
                      className={cn(
                        'w-full text-left rounded-xl h-auto justify-start',
                        'bg-card/50 dark:bg-card/30',
                        'border border-border/80',
                        'px-4 py-3.5',
                        'hover:bg-accent/50 hover:border-teal-500/30',
                        'focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/30',
                        'transition-all duration-150',
                        'group',
                        'overflow-hidden'
                      )}
                      title={s.worktreePath}
                    >
                      <div className="flex items-start justify-between gap-3 w-full overflow-hidden">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="w-4 h-4 text-teal-500 dark:text-teal-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-foreground truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {s.title}
                            </span>
                          </div>
                          <div className="mt-1 ml-6 text-xs text-muted-foreground truncate">
                            {s.branchSnapshot || '(detached HEAD)'} — {formatPath(s.worktreePath)}
                          </div>
                          {s.tags.length > 0 && (
                            <div className="mt-2 ml-6 flex flex-wrap gap-1">
                              {s.tags.slice(0, 6).map((t) => (
                                <span
                                  key={t}
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded-md',
                                    'bg-muted/80 text-muted-foreground',
                                    'border border-border/50'
                                  )}
                                >
                                  {t}
                                </span>
                              ))}
                              {s.tags.length > 6 && (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded-md',
                                    'bg-muted/80 text-muted-foreground',
                                    'border border-border/50'
                                  )}
                                >
                                  +{s.tags.length - 6}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5',
                              'px-2 py-1 text-xs font-medium rounded-md',
                              'border',
                              badge.className
                            )}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {new Date(s.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-between gap-4',
              'flex-shrink-0'
            )}
          >
            <div className="text-xs text-muted-foreground">
              {filtered.length} of {sessions.length} sessions
            </div>
            <Button
              variant="ghost"
              onClick={onClose}
              className="bg-secondary hover:bg-accent border border-border"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
