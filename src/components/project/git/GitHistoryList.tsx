/**
 * Git History List - Shows commit history with details
 * @see specs/009-git-integration/tasks.md - T018
 */

import { useState, useEffect, useCallback } from 'react';
import {
  GitCommit,
  User,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { gitAPI } from '../../../lib/tauri-api';
import type { Commit } from '../../../types/git';
import { Button } from '../../ui/Button';

interface GitHistoryListProps {
  /** Project path for Git operations */
  projectPath: string;
  /** Number of commits to load per page */
  pageSize?: number;
  /** Whether this tab is currently active (for polling optimization) */
  isActive?: boolean;
}

export function GitHistoryList({ projectPath, pageSize = 50, isActive = true }: GitHistoryListProps) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Load commit history (silent refresh when data exists)
  const loadHistory = useCallback(
    async (silent = false) => {
      if (!projectPath) return;

      // Only show loading spinner on initial load (no existing data)
      if (!silent && commits.length === 0) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await gitAPI.getCommitHistory(projectPath, 0, pageSize);
        if (response.success && response.commits) {
          setCommits(response.commits);
          setHasMore(response.commits.length >= pageSize);
        } else {
          setError(response.error || 'Failed to load commit history');
        }
      } catch (err) {
        setError('Failed to connect to Git');
        console.error('Git history error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath, pageSize, commits.length]
  );

  // Load more commits
  const loadMore = useCallback(async () => {
    if (!projectPath || isLoading) return;

    setIsLoading(true);

    try {
      const response = await gitAPI.getCommitHistory(projectPath, commits.length, pageSize);
      if (response.success && response.commits) {
        setCommits((prev) => [...prev, ...response.commits!]);
        setHasMore(response.commits.length >= pageSize);
      }
    } catch (err) {
      console.error('Git history error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, pageSize, commits.length, isLoading]);

  // Initial load
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-refresh every 30 seconds (silent background update) - only when tab is active
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      loadHistory(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadHistory, isActive]);

  // Copy SHA to clipboard
  const handleCopySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopiedSha(sha);
      setTimeout(() => setCopiedSha(null), 2000);
    } catch (err) {
      console.error('Failed to copy SHA:', err);
    }
  };

  // Format date from ISO string
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  // Format time from ISO string
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">{error}</div>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <GitCommit className="w-12 h-12 mb-2" />
        <p>No commits yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {commits.map((commit) => {
        const isExpanded = expandedCommit === commit.hash;
        const [firstLine, ...restLines] = commit.message.split('\n');
        const hasDetails = restLines.filter((l) => l.trim()).length > 0;

        return (
          <div key={commit.hash} className="hover:bg-accent transition-colors">
            {/* Commit Header */}
            <div className="p-3 flex items-start gap-3">
              {/* Expand/Collapse Button */}
              <Button
                onClick={() => setExpandedCommit(isExpanded ? null : commit.hash)}
                variant="ghost"
                size="icon"
                className="h-auto w-auto mt-0.5 p-0.5"
                disabled={!hasDetails}
              >
                {hasDetails ? (
                  isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )
                ) : (
                  <div className="w-4 h-4" />
                )}
              </Button>

              {/* Commit Info */}
              <div className="flex-1 min-w-0">
                {/* Message */}
                <p className="text-sm text-foreground break-words">{firstLine}</p>

                {/* Metadata */}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  {/* Author */}
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {commit.author}
                  </span>

                  {/* Date */}
                  <span
                    className="flex items-center gap-1"
                    title={new Date(commit.date).toLocaleString()}
                  >
                    <Calendar className="w-3 h-3" />
                    {formatDate(commit.date)} at {formatTime(commit.date)}
                  </span>
                </div>
              </div>

              {/* SHA */}
              <div className="flex items-center gap-1">
                <code className="text-xs text-muted-foreground font-mono bg-card px-2 py-0.5 rounded">
                  {commit.shortHash}
                </code>
                <Button
                  onClick={() => handleCopySha(commit.hash)}
                  variant="ghost"
                  size="icon"
                  className="h-auto w-auto p-1"
                  title="Copy full SHA"
                >
                  {copiedSha === commit.hash ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && hasDetails && (
              <div className="px-3 pb-3 ml-8">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                  {restLines.join('\n').trim()}
                </pre>
              </div>
            )}
          </div>
        );
      })}

      {/* Load More */}
      {hasMore && (
        <div className="p-3 text-center">
          <Button
            onClick={loadMore}
            disabled={isLoading}
            variant="ghost"
            className="text-blue-400 hover:text-blue-300"
          >
            {isLoading ? 'Loading...' : 'Load more commits'}
          </Button>
        </div>
      )}
    </div>
  );
}
