/**
 * Git Status View - Shows branch info, remote status, and push/pull buttons
 * @see specs/009-git-integration/tasks.md - T015
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { gitAPI } from '../../../lib/tauri-api';
import { Button } from '../../ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/Dialog';
import { Select, type SelectOption } from '../../ui/Select';
import type { GitRemote } from '../../../types/git';

interface PushOptions {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  force?: boolean;
}

interface GitStatusViewProps {
  /** Current branch name */
  branch: string;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
  /** Whether there's a tracking branch */
  hasTrackingBranch: boolean;
  /** Project path for remote operations */
  projectPath: string;
  /** Push handler */
  onPush: (options?: PushOptions) => Promise<{ success: boolean; error?: string }>;
  /** Pull handler */
  onPull: () => Promise<{ success: boolean; hasConflicts?: boolean; error?: string }>;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when remotes change */
  onRemotesChange?: () => void;
}

export function GitStatusView({
  branch,
  ahead,
  behind,
  hasTrackingBranch,
  projectPath,
  onPush,
  onPull,
  isLoading = false,
  onRemotesChange,
}: GitStatusViewProps) {
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [isUpstreamDialogOpen, setIsUpstreamDialogOpen] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<string>('');

  const getUserFriendlyError = useCallback((rawError: string) => {
    const trimmed = rawError.trim();

    // Error codes from backend
    if (trimmed === 'NOT_GIT_REPO') {
      return 'This directory is not a Git repository.';
    }
    if (trimmed === 'NO_REMOTE') {
      return 'No remote configured. Go to Settings tab to add one.';
    }
    if (trimmed === 'NO_UPSTREAM') {
      return 'No upstream branch. Set upstream (e.g. "git push -u <remote> <branch>").';
    }
    if (trimmed === 'MERGE_CONFLICT') {
      return 'Merge conflicts detected. Please resolve them manually.';
    }
    if (trimmed === 'REJECTED_NON_FAST_FORWARD') {
      return 'Push rejected (non-fast-forward). Pull/rebase then try again.';
    }
    if (trimmed === 'AUTH_FAILED') {
      return 'Authentication failed. Check Settings > Authentication.';
    }
    if (trimmed === 'NETWORK_ERROR') {
      return 'Network error. Check your internet connection.';
    }
    if (trimmed === 'INVALID_REMOTE') {
      return 'Remote is invalid or not accessible. Check Settings > Remotes.';
    }
    if (trimmed === 'REMOTE_REQUIRED') {
      return 'Remote is required for this operation.';
    }

    // Fallback: parse raw git error strings
    const withoutPrefix = trimmed.startsWith('GIT_ERROR: ')
      ? trimmed.slice('GIT_ERROR: '.length)
      : trimmed;
    const lower = withoutPrefix.toLowerCase();

    if (lower.includes('could not read username') || lower.includes('auth_failed') || lower.includes('permission denied')) {
      return 'Authentication failed. Check Settings > Authentication.';
    }
    if (lower.includes('network_error') || lower.includes('could not resolve') || lower.includes('connection refused')) {
      return 'Network error. Check your internet connection.';
    }
    if (lower.includes('no configured push destination') || lower.includes('no remote repository specified')) {
      return 'No remote configured. Go to Settings tab to add one.';
    }
    if (lower.includes('no upstream') || lower.includes('no tracking information') || lower.includes('there is no tracking information')) {
      return 'No upstream branch. Set upstream (e.g. "git push -u <remote> <branch>").';
    }
    if (lower.includes('does not appear to be a git repository')) {
      return 'Remote is invalid or not accessible. Check Settings > Remotes.';
    }

    return withoutPrefix;
  }, []);

  const remoteOptions = useMemo<SelectOption[]>(
    () => remotes.map((remote) => ({ value: remote.name, label: remote.name })),
    [remotes]
  );

  const selectedRemoteInfo = useMemo(
    () => remotes.find((remote) => remote.name === selectedRemote) ?? null,
    [remotes, selectedRemote]
  );

  // Load remotes to check if any exist
  const loadRemotes = useCallback(async () => {
    if (!projectPath) return;

    try {
      const response = await gitAPI.getRemotes(projectPath);
      if (response.success && response.remotes) {
        setRemotes(response.remotes);
      }
    } catch (err) {
      console.error('Failed to load remotes:', err);
    }
  }, [projectPath]);

  useEffect(() => {
    loadRemotes();
  }, [loadRemotes]);

  useEffect(() => {
    if (selectedRemote) return;
    if (remotes.length === 0) return;

    const preferredRemote = remotes.find((r) => r.name === 'origin')?.name ?? remotes[0].name;
    setSelectedRemote(preferredRemote);
  }, [remotes, selectedRemote]);

  const openUpstreamDialog = useCallback(() => {
    if (remotes.length === 0) {
      setOperationError('No remote configured. Go to Settings tab to add one.');
      return;
    }

    if (!selectedRemote) {
      const preferredRemote = remotes.find((r) => r.name === 'origin')?.name ?? remotes[0].name;
      setSelectedRemote(preferredRemote);
    }

    setOperationError(null);
    setIsUpstreamDialogOpen(true);
  }, [remotes, selectedRemote]);

  const handlePush = async () => {
    if (remotes.length === 0) {
      setOperationError('No remote configured. Go to Settings tab to add one.');
      return;
    }

    if (!hasTrackingBranch) {
      openUpstreamDialog();
      return;
    }

    setIsPushing(true);
    setOperationError(null);
    try {
      const result = await onPush();
      if (!result.success && result.error) {
        setOperationError(getUserFriendlyError(result.error));
      }
    } finally {
      setIsPushing(false);
    }
  };

  const handleSetUpstream = async () => {
    if (!selectedRemote) return;

    setIsPushing(true);
    setOperationError(null);

    try {
      const result = await onPush({ remote: selectedRemote, branch, setUpstream: true });
      if (result.success) {
        setIsUpstreamDialogOpen(false);
        return;
      }
      if (result.error) {
        setOperationError(getUserFriendlyError(result.error));
      } else {
        setOperationError('Failed to set upstream');
      }
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    if (remotes.length === 0) {
      setOperationError('No remote configured. Go to Settings tab to add one.');
      return;
    }

    setIsPulling(true);
    setOperationError(null);
    try {
      const result = await onPull();
      if (!result.success && result.error) {
        setOperationError(getUserFriendlyError(result.error));
      } else if (result.hasConflicts) {
        setOperationError('Merge conflicts detected. Please resolve them manually.');
      }
    } finally {
      setIsPulling(false);
    }
  };

  // Fetch from remote
  const handleFetch = async () => {
    if (remotes.length === 0) {
      setOperationError('No remote configured. Go to Settings tab to add one.');
      return;
    }

    setIsFetching(true);
    setOperationError(null);

    try {
      const response = await gitAPI.fetch(projectPath, { allRemotes: true });
      if (response.success) {
        onRemotesChange?.();
      } else {
        setOperationError(response.error ? getUserFriendlyError(response.error) : 'Failed to fetch');
      }
    } catch (err) {
      setOperationError('Failed to fetch');
      console.error('Fetch error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  const hasRemotes = remotes.length > 0;

  return (
    <div className="bg-card rounded-lg p-4 space-y-3">
      {/* Branch Info Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-blue-400" />
          <span className="font-medium text-foreground">{branch}</span>

          {/* Ahead/Behind indicators */}
          {hasTrackingBranch && (ahead > 0 || behind > 0) && (
            <div className="flex items-center gap-2 text-sm">
              {ahead > 0 && (
                <span
                  className="flex items-center gap-0.5 text-green-400"
                  title={`${ahead} commit${ahead > 1 ? 's' : ''} ahead of remote`}
                >
                  <ArrowUp className="w-3 h-3" />
                  <span>{ahead}</span>
                </span>
              )}
              {behind > 0 && (
                <span
                  className="flex items-center gap-0.5 text-orange-400"
                  title={`${behind} commit${behind > 1 ? 's' : ''} behind remote`}
                >
                  <ArrowDown className="w-3 h-3" />
                  <span>{behind}</span>
                </span>
              )}
            </div>
          )}

          {/* Tracking status */}
          {!hasTrackingBranch && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CloudOff className="w-3 h-3" />
                No upstream
              </span>
              {hasRemotes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openUpstreamDialog}
                  disabled={isPushing || isPulling || isFetching || isLoading}
                  className="h-6 px-2 text-xs"
                >
                  Set upstream
                </Button>
              )}
            </div>
          )}
          {hasTrackingBranch && ahead === 0 && behind === 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Cloud className="w-3 h-3" />
              Up to date
            </span>
          )}
        </div>

        {/* Fetch/Push/Pull Buttons */}
        <div className="flex items-center gap-2">
          {/* Fetch Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={isFetching || isPulling || isPushing || isLoading || !hasRemotes}
            title={!hasRemotes ? 'Configure remote in Settings' : 'Fetch from all remotes'}
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1.5" />
            )}
            Fetch
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePull}
            disabled={isPulling || isPushing || isFetching || isLoading || !hasRemotes}
            title={!hasRemotes ? 'Configure remote in Settings' : 'Pull from remote'}
          >
            {isPulling ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <ArrowDown className="w-4 h-4 mr-1.5" />
            )}
            Pull
          </Button>
          <Button
            size="sm"
            onClick={handlePush}
            disabled={isPushing || isPulling || isFetching || isLoading || !hasRemotes || ahead === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white"
            title={!hasRemotes ? 'Configure remote in Settings' : ahead === 0 ? 'Nothing to push' : 'Push to remote'}
          >
            {isPushing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4 mr-1.5" />
            )}
            Push
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {operationError && (
        <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
          {operationError}
        </div>
      )}

      <Dialog open={isUpstreamDialogOpen} onOpenChange={setIsUpstreamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set upstream</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Bind <span className="font-medium text-foreground">{branch}</span> to a remote branch.
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Remote</label>
              <Select
                value={selectedRemote}
                onValueChange={setSelectedRemote}
                options={remoteOptions}
                placeholder="Select a remote..."
                disabled={isPushing || isPulling || isFetching || isLoading}
                aria-label="Remote"
              />
              {selectedRemoteInfo?.url && (
                <div className="text-xs text-muted-foreground truncate" title={selectedRemoteInfo.url}>
                  {selectedRemoteInfo.url}
                </div>
              )}
              {selectedRemote && (
                <div className="text-xs text-muted-foreground">
                  Target: <span className="text-foreground">{selectedRemote}/{branch}</span>
                </div>
              )}
            </div>

            {operationError && (
              <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
                {operationError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUpstreamDialogOpen(false)}
              disabled={isPushing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetUpstream}
              disabled={!selectedRemote || isPushing || isPulling || isFetching || isLoading}
              className="bg-blue-600 hover:bg-blue-500 text-white"
              title={!selectedRemote ? 'Select a remote' : `Set upstream to ${selectedRemote}/${branch}`}
            >
              {isPushing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4 mr-1.5" />
              )}
              Set upstream
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
