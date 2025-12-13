/**
 * WorktreeSessionListDialog
 * Browse sessions across worktrees (active/archived/broken)
 * @see specs/001-worktree-sessions/spec.md
 */

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useSettings } from '../../contexts/SettingsContext';
import type { WorktreeSession, WorktreeSessionStatus } from '../../types/worktree-sessions';
import { cn } from '../../lib/utils';

type StatusFilter = 'all' | WorktreeSessionStatus;

interface WorktreeSessionListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: WorktreeSession[];
  onOpenSession: (worktreePath: string) => void;
}

function statusBadge(status: WorktreeSessionStatus): { label: string; className: string } {
  if (status === 'archived') return { label: 'Archived', className: 'bg-muted text-muted-foreground' };
  if (status === 'broken') return { label: 'Broken', className: 'bg-red-500/20 text-red-400' };
  return { label: 'Active', className: 'bg-green-500/20 text-green-400' };
}

export function WorktreeSessionListDialog({
  isOpen,
  onClose,
  sessions,
  onOpenSession,
}: WorktreeSessionListDialogProps) {
  const { formatPath } = useSettings();
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFilter('active');
    setQuery('');
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogClose onClick={onClose} />

        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-blue-400" />
              Sessions
              {sessions.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {sessions.length}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4 max-h-[70vh] overflow-auto pr-1">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-1">
                {(['all', 'active', 'archived', 'broken'] as const).map((k) => (
                  <Button
                    key={k}
                    variant="ghost"
                    onClick={() => setFilter(k)}
                    className={cn(
                      'text-xs',
                      filter === k ? 'bg-muted text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {k === 'all' ? 'All' : statusBadge(k).label}
                  </Button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, tags, branch, path..."
                  className="pl-9"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No sessions found.
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((s) => {
                  const badge = statusBadge(s.status);
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        onOpenSession(s.worktreePath);
                        onClose();
                      }}
                      className={cn(
                        'w-full text-left rounded-lg border border-border bg-muted/10',
                        'px-4 py-3 hover:bg-accent transition-colors'
                      )}
                      title={s.worktreePath}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {s.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.branchSnapshot || '(detached HEAD)'} — {formatPath(s.worktreePath)}
                          </div>
                          {s.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {s.tags.slice(0, 6).map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
                                >
                                  {t}
                                </span>
                              ))}
                              {s.tags.length > 6 && (
                                <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
                                  +{s.tags.length - 6}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span className={cn('px-2 py-0.5 text-xs rounded', badge.className)}>
                            {badge.label}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {new Date(s.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
