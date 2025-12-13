/**
 * WorktreeSyncDialog - Sync worktree with base branch (rebase or merge)
 */

import { useState, useEffect, useCallback } from 'react';
import { GitBranch, RefreshCw, GitMerge, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import type { Worktree, CommitInfo } from '../../lib/tauri-api';
import { worktreeAPI } from '../../lib/tauri-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';

interface WorktreeSyncDialogProps {
  worktree: Worktree | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type SyncState = 'loading' | 'ready' | 'syncing' | 'success' | 'error';

export function WorktreeSyncDialog({
  worktree,
  isOpen,
  onClose,
  onComplete,
}: WorktreeSyncDialogProps) {
  const [state, setState] = useState<SyncState>('loading');
  const [behindCount, setBehindCount] = useState(0);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [baseBranch, setBaseBranch] = useState<string>('main');
  const [error, setError] = useState<string | null>(null);
  const [syncMethod, setSyncMethod] = useState<'rebase' | 'merge' | null>(null);

  // Load behind commits when dialog opens
  useEffect(() => {
    if (!isOpen || !worktree) {
      setState('loading');
      setBehindCount(0);
      setCommits([]);
      setError(null);
      setSyncMethod(null);
      return;
    }

    const loadBehindCommits = async () => {
      setState('loading');
      setError(null);

      try {
        const result = await worktreeAPI.getBehindCommits(worktree.path, undefined, 10);
        if (result.success) {
          setBehindCount(result.behindCount);
          setCommits(result.commits || []);
          setBaseBranch(result.baseBranch || 'main');
          setState('ready');
        } else {
          setError(result.error || 'Failed to check sync status');
          setState('error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      }
    };

    loadBehindCommits();
  }, [isOpen, worktree]);

  const handleSync = useCallback(async (method: 'rebase' | 'merge') => {
    if (!worktree) return;

    setState('syncing');
    setSyncMethod(method);
    setError(null);

    try {
      const result = await worktreeAPI.syncWorktree(worktree.path, baseBranch, method);
      if (result.success) {
        setState('success');
        // Auto-close after success
        setTimeout(() => {
          onComplete();
          onClose();
        }, 1500);
      } else {
        const errorMessages: Record<string, string> = {
          CONFLICT: 'Conflicts detected. Please resolve manually.',
          HAS_UNCOMMITTED_CHANGES: 'Please commit or stash your changes first.',
          PATH_NOT_FOUND: 'Worktree path not found.',
          NOT_A_WORKTREE: 'Not a valid Git worktree.',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Sync failed');
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, [worktree, baseBranch, onComplete, onClose]);

  const handleClose = () => {
    if (state !== 'syncing') {
      onClose();
    }
  };

  if (!worktree) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Sync Worktree
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Branch info */}
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{worktree.branch}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium text-blue-400">{baseBranch}</span>
          </div>

          {/* Loading state */}
          {state === 'loading' && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Checking sync status...
            </div>
          )}

          {/* Already up to date */}
          {state === 'ready' && behindCount === 0 && (
            <div className="text-center py-8">
              <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
              <p className="text-foreground font-medium">Already up to date</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your branch is not behind {baseBranch}
              </p>
            </div>
          )}

          {/* Behind commits */}
          {state === 'ready' && behindCount > 0 && (
            <>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-orange-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {behindCount} commit{behindCount > 1 ? 's' : ''} behind {baseBranch}
                  </span>
                </div>
              </div>

              {/* Commit list */}
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {commits.map((commit) => (
                  <div
                    key={commit.hash}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground flex-shrink-0">
                      {commit.shortHash}
                    </span>
                    <span className="text-foreground truncate flex-1" title={commit.message}>
                      {commit.message}
                    </span>
                  </div>
                ))}
                {behindCount > commits.length && (
                  <div className="text-xs text-muted-foreground text-center py-1">
                    ... and {behindCount - commits.length} more
                  </div>
                )}
              </div>

              {/* Sync options */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  onClick={() => handleSync('rebase')}
                  className="flex-1 bg-blue-600 hover:bg-blue-500"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rebase
                </Button>
                <Button
                  onClick={() => handleSync('merge')}
                  variant="outline"
                  className="flex-1"
                >
                  <GitMerge className="w-4 h-4 mr-2" />
                  Merge
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                <strong>Rebase:</strong> Cleaner history, replays your commits on top.
                <br />
                <strong>Merge:</strong> Preserves history, creates a merge commit.
              </p>
            </>
          )}

          {/* Syncing state */}
          {state === 'syncing' && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {syncMethod === 'rebase' ? 'Rebasing' : 'Merging'}... Please wait
            </div>
          )}

          {/* Success state */}
          {state === 'success' && (
            <div className="text-center py-8">
              <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
              <p className="text-foreground font-medium">
                {syncMethod === 'rebase' ? 'Rebase' : 'Merge'} successful!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Your branch is now up to date with {baseBranch}
              </p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-400">
                  <X className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleClose} variant="outline">
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Close button for up-to-date state */}
          {state === 'ready' && behindCount === 0 && (
            <div className="flex justify-end pt-2">
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
