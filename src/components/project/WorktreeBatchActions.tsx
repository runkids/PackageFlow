/**
 * WorktreeBatchActions - Batch operations for multiple worktrees
 */

import { useState, useCallback } from 'react';
import { ArrowDownToLine, Check, X, Loader2, Trash2, GitMerge, CloudDownload } from 'lucide-react';
import type { Worktree } from '../../lib/tauri-api';
import { gitAPI, worktreeAPI } from '../../lib/tauri-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';

interface FetchResult {
  path: string;
  branch: string | null;
  status: 'pending' | 'fetching' | 'success' | 'error';
  message?: string;
}

interface PullResult {
  path: string;
  branch: string | null;
  status: 'pending' | 'pulling' | 'success' | 'error' | 'skipped';
  message?: string;
}

interface CleanResult {
  path: string;
  branch: string | null;
  status: 'pending' | 'removing' | 'success' | 'error';
  message?: string;
}

interface WorktreeBatchActionsProps {
  worktrees: Worktree[];
  projectPath: string;
  onComplete: () => void;
}

export function WorktreeBatchActions({ worktrees, projectPath, onComplete }: WorktreeBatchActionsProps) {
  // Settings for path display format
  const { formatPath } = useSettings();

  // Fetch All state
  const [isFetchDialogOpen, setIsFetchDialogOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResults, setFetchResults] = useState<FetchResult[]>([]);

  // Pull All state
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullResults, setPullResults] = useState<PullResult[]>([]);

  // Clean Merged state
  const [isCleanDialogOpen, setIsCleanDialogOpen] = useState(false);
  const [isFetchingMerged, setIsFetchingMerged] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [mergedWorktrees, setMergedWorktrees] = useState<Worktree[]>([]);
  const [baseBranch, setBaseBranch] = useState<string>('main');
  const [cleanResults, setCleanResults] = useState<CleanResult[]>([]);
  const [deleteBranch, setDeleteBranch] = useState(true);

  // Fetch All handler
  const handleFetchAll = useCallback(async () => {
    // Filter worktrees that have tracking branch (can be fetched)
    const fetchableWorktrees = worktrees.filter((w) => !w.isDetached);

    if (fetchableWorktrees.length === 0) {
      return;
    }

    // Initialize results
    const initialResults: FetchResult[] = fetchableWorktrees.map((w) => ({
      path: w.path,
      branch: w.branch,
      status: 'pending',
    }));
    setFetchResults(initialResults);
    setIsFetchDialogOpen(true);
    setIsFetching(true);

    // Fetch each worktree sequentially
    for (let i = 0; i < fetchableWorktrees.length; i++) {
      const worktree = fetchableWorktrees[i];

      // Update status to fetching
      setFetchResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'fetching' } : r))
      );

      try {
        const result = await gitAPI.fetch(worktree.path);

        if (result.success) {
          setFetchResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'success',
                    message: 'Fetched',
                  }
                : r
            )
          );
        } else {
          const errorMessages: Record<string, string> = {
            AUTH_FAILED: 'Authentication failed',
            NETWORK_ERROR: 'Network error',
            NO_REMOTE: 'No remote configured',
            INVALID_REMOTE: 'Invalid remote configuration',
          };
          const errorMsg = result.error
            ? errorMessages[result.error] || result.error
            : 'Fetch failed';

          setFetchResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'error',
                    message: errorMsg,
                  }
                : r
            )
          );
        }
      } catch (err) {
        setFetchResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: 'error',
                  message: err instanceof Error ? err.message : 'Unknown error',
                }
              : r
          )
        );
      }
    }

    setIsFetching(false);
  }, [worktrees]);

  const handleCloseFetch = () => {
    setIsFetchDialogOpen(false);
    setFetchResults([]);
    onComplete();
  };

  const handlePullAll = useCallback(async () => {
    // Filter worktrees that have tracking branch (can be pulled)
    const pullableWorktrees = worktrees.filter((w) => !w.isDetached);

    if (pullableWorktrees.length === 0) {
      return;
    }

    // Initialize results
    const initialResults: PullResult[] = pullableWorktrees.map((w) => ({
      path: w.path,
      branch: w.branch,
      status: 'pending',
    }));
    setPullResults(initialResults);
    setIsPullDialogOpen(true);
    setIsPulling(true);

    // Pull each worktree sequentially
    for (let i = 0; i < pullableWorktrees.length; i++) {
      const worktree = pullableWorktrees[i];

      // Update status to pulling
      setPullResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'pulling' } : r))
      );

      try {
        const result = await gitAPI.pull(worktree.path);

        if (result.success) {
          setPullResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: result.hasConflicts ? 'error' : 'success',
                    message: result.hasConflicts
                      ? 'Conflicts detected, resolve manually'
                      : result.updatedFiles
                        ? `${result.updatedFiles} files updated`
                        : 'Already up to date',
                  }
                : r
            )
          );
        } else {
          // Map error codes to user-friendly messages
          const errorMessages: Record<string, string> = {
            MERGE_CONFLICT: 'Conflicts detected, resolve manually',
            NO_UPSTREAM: 'No upstream branch',
            NO_REMOTE: 'No remote configured',
            AUTH_FAILED: 'Authentication failed',
            NETWORK_ERROR: 'Network error',
          };
          const errorMsg = result.error
            ? errorMessages[result.error] || result.error
            : 'Pull failed';

          setPullResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'error',
                    message: errorMsg,
                  }
                : r
            )
          );
        }
      } catch (err) {
        setPullResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: 'error',
                  message: err instanceof Error ? err.message : 'Unknown error',
                }
              : r
          )
        );
      }
    }

    setIsPulling(false);
  }, [worktrees]);

  const handleClosePull = () => {
    setIsPullDialogOpen(false);
    setPullResults([]);
    onComplete();
  };

  // Clean Merged handlers
  const handleOpenCleanMerged = useCallback(async () => {
    setIsCleanDialogOpen(true);
    setIsFetchingMerged(true);
    setMergedWorktrees([]);
    setCleanResults([]);

    try {
      const result = await worktreeAPI.getMergedWorktrees(projectPath);
      if (result.success && result.mergedWorktrees) {
        setMergedWorktrees(result.mergedWorktrees);
        setBaseBranch(result.baseBranch || 'main');
      }
    } catch (err) {
      console.error('Failed to fetch merged worktrees:', err);
    } finally {
      setIsFetchingMerged(false);
    }
  }, [projectPath]);

  const handleCleanMerged = useCallback(async () => {
    if (mergedWorktrees.length === 0) return;

    // Initialize clean results
    const initialResults: CleanResult[] = mergedWorktrees.map((w) => ({
      path: w.path,
      branch: w.branch,
      status: 'pending',
    }));
    setCleanResults(initialResults);
    setIsCleaning(true);

    // Remove each worktree sequentially
    for (let i = 0; i < mergedWorktrees.length; i++) {
      const worktree = mergedWorktrees[i];

      // Update status to removing
      setCleanResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'removing' } : r))
      );

      try {
        const result = await worktreeAPI.removeWorktree({
          projectPath,
          worktreePath: worktree.path,
          force: false,
          deleteBranch,
        });

        if (result.success) {
          setCleanResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'success',
                    message: deleteBranch ? 'Removed with branch' : 'Removed',
                  }
                : r
            )
          );
        } else {
          const errorMessages: Record<string, string> = {
            HAS_UNCOMMITTED_CHANGES: 'Has uncommitted changes',
            WORKTREE_NOT_FOUND: 'Worktree not found',
            CANNOT_REMOVE_MAIN: 'Cannot remove main worktree',
          };
          const errorMsg = result.error
            ? errorMessages[result.error] || result.error
            : 'Remove failed';

          setCleanResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'error',
                    message: errorMsg,
                  }
                : r
            )
          );
        }
      } catch (err) {
        setCleanResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: 'error',
                  message: err instanceof Error ? err.message : 'Unknown error',
                }
              : r
          )
        );
      }
    }

    setIsCleaning(false);
  }, [mergedWorktrees, projectPath, deleteBranch]);

  const handleCloseClean = () => {
    setIsCleanDialogOpen(false);
    setMergedWorktrees([]);
    setCleanResults([]);
    onComplete();
  };

  const fetchSuccessCount = fetchResults.filter((r) => r.status === 'success').length;
  const fetchErrorCount = fetchResults.filter((r) => r.status === 'error').length;
  const pullSuccessCount = pullResults.filter((r) => r.status === 'success').length;
  const pullErrorCount = pullResults.filter((r) => r.status === 'error').length;
  const cleanSuccessCount = cleanResults.filter((r) => r.status === 'success').length;
  const cleanErrorCount = cleanResults.filter((r) => r.status === 'error').length;

  return (
    <>
      {/* Fetch All Button */}
      <button
        onClick={handleFetchAll}
        disabled={worktrees.filter((w) => !w.isDetached).length === 0}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Fetch all worktrees"
      >
        <CloudDownload className="w-3.5 h-3.5" />
        Fetch All
      </button>

      {/* Pull All Button */}
      <button
        onClick={handlePullAll}
        disabled={worktrees.filter((w) => !w.isDetached).length === 0}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Pull all worktrees"
      >
        <ArrowDownToLine className="w-3.5 h-3.5" />
        Pull All
      </button>

      {/* Clean Merged Button */}
      <button
        onClick={handleOpenCleanMerged}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
        title="Clean merged worktrees"
      >
        <GitMerge className="w-3.5 h-3.5" />
        Clean Merged
      </button>

      {/* Fetch Progress Dialog */}
      <Dialog open={isFetchDialogOpen} onOpenChange={(open) => !isFetching && !open && handleCloseFetch()}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <CloudDownload className="w-5 h-5 text-cyan-400" />
              Fetch All Worktrees
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {/* Progress list */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {fetchResults.map((result) => (
                <div
                  key={result.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg border',
                    result.status === 'success' && 'bg-green-500/5 border-green-500/20',
                    result.status === 'error' && 'bg-red-500/5 border-red-500/20',
                    result.status === 'fetching' && 'bg-cyan-500/5 border-cyan-500/20',
                    result.status === 'pending' && 'bg-muted/50 border-border'
                  )}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {result.status === 'pending' && (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    {result.status === 'fetching' && (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    )}
                    {result.status === 'success' && (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                    {result.status === 'error' && <X className="w-4 h-4 text-red-400" />}
                  </div>

                  {/* Branch name and message */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {result.branch || '(detached)'}
                    </div>
                    {result.message && (
                      <div
                        className={cn(
                          'text-xs truncate',
                          result.status === 'error'
                            ? 'text-red-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {result.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {!isFetching && fetchResults.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  {fetchSuccessCount > 0 && (
                    <span className="text-green-400">{fetchSuccessCount} succeeded</span>
                  )}
                  {fetchSuccessCount > 0 && fetchErrorCount > 0 && ', '}
                  {fetchErrorCount > 0 && (
                    <span className="text-red-400">{fetchErrorCount} failed</span>
                  )}
                </div>
                <Button onClick={handleCloseFetch} className="bg-blue-600 hover:bg-blue-500">
                  Done
                </Button>
              </div>
            )}

            {/* Fetching indicator */}
            {isFetching && (
              <div className="text-center text-sm text-muted-foreground">
                Fetching... Please wait
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pull Progress Dialog */}
      <Dialog open={isPullDialogOpen} onOpenChange={(open) => !isPulling && !open && handleClosePull()}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-blue-400" />
              Pull All Worktrees
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {/* Progress list */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {pullResults.map((result) => (
                <div
                  key={result.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg border',
                    result.status === 'success' && 'bg-green-500/5 border-green-500/20',
                    result.status === 'error' && 'bg-red-500/5 border-red-500/20',
                    result.status === 'pulling' && 'bg-blue-500/5 border-blue-500/20',
                    result.status === 'pending' && 'bg-muted/50 border-border'
                  )}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {result.status === 'pending' && (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    {result.status === 'pulling' && (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {result.status === 'success' && (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                    {result.status === 'error' && <X className="w-4 h-4 text-red-400" />}
                  </div>

                  {/* Branch name and message */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {result.branch || '(detached)'}
                    </div>
                    {result.message && (
                      <div
                        className={cn(
                          'text-xs truncate',
                          result.status === 'error'
                            ? 'text-red-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {result.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {!isPulling && pullResults.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  {pullSuccessCount > 0 && (
                    <span className="text-green-400">{pullSuccessCount} succeeded</span>
                  )}
                  {pullSuccessCount > 0 && pullErrorCount > 0 && ', '}
                  {pullErrorCount > 0 && (
                    <span className="text-red-400">{pullErrorCount} failed</span>
                  )}
                </div>
                <Button onClick={handleClosePull} className="bg-blue-600 hover:bg-blue-500">
                  Done
                </Button>
              </div>
            )}

            {/* Pulling indicator */}
            {isPulling && (
              <div className="text-center text-sm text-muted-foreground">
                Pulling... Please wait
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Clean Merged Dialog */}
      <Dialog open={isCleanDialogOpen} onOpenChange={(open) => !isCleaning && !open && handleCloseClean()}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-purple-400" />
              Clean Merged Worktrees
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {/* Loading state */}
            {isFetchingMerged && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Finding merged worktrees...
              </div>
            )}

            {/* No merged worktrees */}
            {!isFetchingMerged && mergedWorktrees.length === 0 && cleanResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <GitMerge className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No merged worktrees found</p>
                <p className="text-xs mt-1">All worktrees have unmerged changes</p>
              </div>
            )}

            {/* Merged worktrees list (before cleaning) */}
            {!isFetchingMerged && mergedWorktrees.length > 0 && cleanResults.length === 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Found {mergedWorktrees.length} worktree{mergedWorktrees.length > 1 ? 's' : ''} merged into <span className="font-medium text-foreground">{baseBranch}</span>:
                </p>

                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {mergedWorktrees.map((w) => (
                    <div
                      key={w.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-muted/50"
                    >
                      <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {w.branch || '(detached)'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={w.path}>
                          {formatPath(w.path)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Options */}
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteBranch}
                    onChange={(e) => setDeleteBranch(e.target.checked)}
                    className="rounded border-border"
                  />
                  Also delete branches
                </label>

                {/* Confirm button */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={handleCloseClean}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCleanMerged}
                    className="bg-red-600 hover:bg-red-500"
                  >
                    Remove {mergedWorktrees.length} Worktree{mergedWorktrees.length > 1 ? 's' : ''}
                  </Button>
                </div>
              </>
            )}

            {/* Clean progress */}
            {cleanResults.length > 0 && (
              <>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {cleanResults.map((result) => (
                    <div
                      key={result.path}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg border',
                        result.status === 'success' && 'bg-green-500/5 border-green-500/20',
                        result.status === 'error' && 'bg-red-500/5 border-red-500/20',
                        result.status === 'removing' && 'bg-purple-500/5 border-purple-500/20',
                        result.status === 'pending' && 'bg-muted/50 border-border'
                      )}
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        {result.status === 'pending' && (
                          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        {result.status === 'removing' && (
                          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        )}
                        {result.status === 'success' && (
                          <Check className="w-4 h-4 text-green-400" />
                        )}
                        {result.status === 'error' && <X className="w-4 h-4 text-red-400" />}
                      </div>

                      {/* Branch name and message */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {result.branch || '(detached)'}
                        </div>
                        {result.message && (
                          <div
                            className={cn(
                              'text-xs truncate',
                              result.status === 'error'
                                ? 'text-red-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            {result.message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                {!isCleaning && (
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                      {cleanSuccessCount > 0 && (
                        <span className="text-green-400">{cleanSuccessCount} removed</span>
                      )}
                      {cleanSuccessCount > 0 && cleanErrorCount > 0 && ', '}
                      {cleanErrorCount > 0 && (
                        <span className="text-red-400">{cleanErrorCount} failed</span>
                      )}
                    </div>
                    <Button onClick={handleCloseClean} className="bg-blue-600 hover:bg-blue-500">
                      Done
                    </Button>
                  </div>
                )}

                {/* Cleaning indicator */}
                {isCleaning && (
                  <div className="text-center text-sm text-muted-foreground">
                    Removing... Please wait
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
