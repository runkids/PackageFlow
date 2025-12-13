/**
 * WorktreeStashDialog - Quick stash management for worktrees
 */

import { useState, useEffect, useCallback } from 'react';
import { Archive, ArchiveRestore, Trash2, Plus, Loader2, Check, X } from 'lucide-react';
import type { Worktree, Stash } from '../../lib/tauri-api';
import { gitAPI } from '../../lib/tauri-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface WorktreeStashDialogProps {
  worktree: Worktree | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type DialogMode = 'list' | 'create';

export function WorktreeStashDialog({
  worktree,
  isOpen,
  onClose,
  onComplete,
}: WorktreeStashDialogProps) {
  const [mode, setMode] = useState<DialogMode>('list');
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [actioningIndex, setActioningIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create stash form
  const [stashMessage, setStashMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);

  // Load stashes when dialog opens
  useEffect(() => {
    if (!isOpen || !worktree) {
      setStashes([]);
      setError(null);
      setSuccessMessage(null);
      setMode('list');
      setStashMessage('');
      return;
    }

    loadStashes();
  }, [isOpen, worktree]);

  const loadStashes = useCallback(async () => {
    if (!worktree) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await gitAPI.listStashes(worktree.path);
      if (result.success && result.stashes) {
        setStashes(result.stashes);
      } else {
        setError(result.error || 'Failed to load stashes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [worktree]);

  const handleCreateStash = useCallback(async () => {
    if (!worktree) return;

    setIsActioning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await gitAPI.createStash(
        worktree.path,
        stashMessage.trim() || undefined,
        includeUntracked
      );

      if (result.success) {
        setSuccessMessage('Changes stashed successfully');
        setStashMessage('');
        setMode('list');
        await loadStashes();
        onComplete();
      } else {
        setError(result.error || 'Failed to create stash');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsActioning(false);
    }
  }, [worktree, stashMessage, includeUntracked, loadStashes, onComplete]);

  const handleApplyStash = useCallback(async (index: number, pop: boolean) => {
    if (!worktree) return;

    setIsActioning(true);
    setActioningIndex(index);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await gitAPI.applyStash(worktree.path, index, pop);

      if (result.success) {
        setSuccessMessage(pop ? 'Stash popped successfully' : 'Stash applied successfully');
        await loadStashes();
        onComplete();
      } else {
        const errorMessages: Record<string, string> = {
          CONFLICT: 'Conflicts detected, resolve manually',
          STASH_NOT_FOUND: 'Stash not found',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Failed to apply stash');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsActioning(false);
      setActioningIndex(null);
    }
  }, [worktree, loadStashes, onComplete]);

  const handleDropStash = useCallback(async (index: number) => {
    if (!worktree) return;

    setIsActioning(true);
    setActioningIndex(index);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await gitAPI.dropStash(worktree.path, index);

      if (result.success) {
        setSuccessMessage('Stash dropped');
        await loadStashes();
      } else {
        setError(result.error || 'Failed to drop stash');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsActioning(false);
      setActioningIndex(null);
    }
  }, [worktree, loadStashes]);

  const handleClose = () => {
    if (!isActioning) {
      onClose();
    }
  };

  if (!worktree) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Archive className="w-5 h-5 text-purple-400" />
            Stash - {worktree.branch || 'detached'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Mode tabs */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-md p-1">
            <button
              onClick={() => setMode('list')}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm rounded transition-colors',
                mode === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Stashes ({stashes.length})
            </button>
            <button
              onClick={() => setMode('create')}
              className={cn(
                'flex-1 px-3 py-1.5 text-sm rounded transition-colors',
                mode === 'create'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Create New
            </button>
          </div>

          {/* Error/Success messages */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <X className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
              <Check className="w-4 h-4 flex-shrink-0" />
              {successMessage}
            </div>
          )}

          {/* List mode */}
          {mode === 'list' && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading stashes...
                </div>
              ) : stashes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No stashes</p>
                  <p className="text-xs mt-1">Create a stash to save your changes</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {stashes.map((stash) => (
                    <div
                      key={stash.index}
                      className="group flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {stash.message || `stash@{${stash.index}}`}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {stash.branch} · {new Date(stash.date).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {actioningIndex === stash.index ? (
                          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleApplyStash(stash.index, true)}
                              disabled={isActioning}
                              className="p-1.5 rounded hover:bg-accent transition-colors"
                              title="Pop (apply and remove)"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5 text-green-400" />
                            </button>
                            <button
                              onClick={() => handleDropStash(stash.index)}
                              disabled={isActioning}
                              className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
                              title="Drop"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Create mode */}
          {mode === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Message (optional)
                </label>
                <input
                  type="text"
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                  placeholder="WIP: my changes..."
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeUntracked}
                  onChange={(e) => setIncludeUntracked(e.target.checked)}
                  className="rounded border-border"
                />
                Include untracked files
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setMode('list')}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateStash}
                  disabled={isActioning}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {isActioning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Stashing...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Stash
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Close button for list mode */}
          {mode === 'list' && !isLoading && (
            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={handleClose} variant="outline">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
