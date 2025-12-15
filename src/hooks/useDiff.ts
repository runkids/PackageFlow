/**
 * useDiff Hook - Manages diff data loading for Git Diff Viewer
 * @see specs/010-git-diff-viewer/tasks.md - T011
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { gitAPI, type FileDiff } from '../lib/tauri-api';

export type DiffType = 'staged' | 'unstaged';

export interface UseDiffOptions {
  /** Project path */
  projectPath: string;
  /** File path relative to repository root */
  filePath: string;
  /** Diff type - staged or unstaged */
  diffType: DiffType;
  /** Whether to skip initial fetch */
  skip?: boolean;
  /** Auto-refresh interval in ms (0 to disable) */
  autoRefreshInterval?: number;
}

export interface UseDiffResult {
  /** The diff data, or null if not loaded */
  diff: FileDiff | null;
  /** Whether the diff is currently loading */
  isLoading: boolean;
  /** Whether a background refresh is happening */
  isRefreshing: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Refetch the diff */
  refetch: () => Promise<void>;
  /** Last refresh timestamp */
  lastRefreshed: Date | null;
}

/**
 * Hook for loading and managing diff data for a single file
 */
export function useDiff({
  projectPath,
  filePath,
  diffType,
  skip = false,
  autoRefreshInterval = 0,
}: UseDiffOptions): UseDiffResult {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isInitialLoadRef = useRef(true);

  const fetchDiff = useCallback(async (silent = false) => {
    if (!projectPath || !filePath) {
      setDiff(null);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    // For subsequent loads, show refreshing indicator instead of full loading
    if (silent || !isInitialLoadRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await gitAPI.getFileDiff(
        projectPath,
        filePath,
        diffType === 'staged'
      );

      if (response.success) {
        setDiff(response.diff || null);
        setError(null);
        setLastRefreshed(new Date());
      } else {
        setDiff(null);
        setError(response.error || 'Failed to load diff');
      }
    } catch (err) {
      setDiff(null);
      setError(err instanceof Error ? err.message : 'Failed to load diff');
      console.error('Diff loading error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isInitialLoadRef.current = false;
    }
  }, [projectPath, filePath, diffType]);

  // Fetch diff on mount and when dependencies change
  useEffect(() => {
    if (!skip) {
      isInitialLoadRef.current = true;
      fetchDiff();
    }
  }, [fetchDiff, skip]);

  // Auto-refresh interval
  useEffect(() => {
    if (skip || autoRefreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchDiff(true); // Silent refresh
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [fetchDiff, skip, autoRefreshInterval]);

  const refetch = useCallback(() => fetchDiff(false), [fetchDiff]);

  return {
    diff,
    isLoading,
    isRefreshing,
    error,
    refetch,
    lastRefreshed,
  };
}
