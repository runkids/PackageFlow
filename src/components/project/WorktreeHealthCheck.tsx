/**
 * WorktreeHealthCheck - Displays warnings for worktrees that need attention
 */

import { useMemo } from 'react';
import { AlertTriangle, ArrowDown, FileEdit, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { Worktree, WorktreeStatus } from '../../lib/tauri-api';
import { cn } from '../../lib/utils';

interface HealthIssue {
  worktree: Worktree;
  type: 'behind' | 'uncommitted' | 'stale';
  message: string;
  severity: 'warning' | 'info';
}

interface WorktreeHealthCheckProps {
  worktrees: Worktree[];
  statuses: Record<string, WorktreeStatus>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** Days without activity to consider stale */
  staleDays?: number;
}

export function WorktreeHealthCheck({
  worktrees,
  statuses,
  isCollapsed,
  onToggleCollapse,
  staleDays = 14,
}: WorktreeHealthCheckProps) {
  const issues = useMemo<HealthIssue[]>(() => {
    const result: HealthIssue[] = [];
    const now = new Date();

    for (const worktree of worktrees) {
      if (worktree.isMain) continue; // Skip main worktree

      const status = statuses[worktree.path];
      if (!status) continue;

      // Check if behind
      if (status.behind > 0) {
        result.push({
          worktree,
          type: 'behind',
          message: `${status.behind} commits behind`,
          severity: 'warning',
        });
      }

      // Check for uncommitted changes
      if (status.uncommittedCount > 0) {
        result.push({
          worktree,
          type: 'uncommitted',
          message: `${status.uncommittedCount} uncommitted changes`,
          severity: 'warning',
        });
      }

      // Check if stale (no activity for N days)
      if (status.lastCommitTime) {
        const lastCommit = new Date(status.lastCommitTime);
        const daysSinceLastCommit = Math.floor(
          (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLastCommit >= staleDays) {
          result.push({
            worktree,
            type: 'stale',
            message: `${daysSinceLastCommit} days inactive`,
            severity: 'info',
          });
        }
      }
    }

    // Sort by severity (warning first) then by type
    return result.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'warning' ? -1 : 1;
      }
      const typeOrder = { behind: 0, uncommitted: 1, stale: 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    });
  }, [worktrees, statuses, staleDays]);

  if (issues.length === 0) {
    return null;
  }

  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  const getIcon = (type: HealthIssue['type']) => {
    switch (type) {
      case 'behind':
        return <ArrowDown className="w-3.5 h-3.5 text-orange-400" />;
      case 'uncommitted':
        return <FileEdit className="w-3.5 h-3.5 text-yellow-400" />;
      case 'stale':
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-yellow-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-yellow-400">
            {issues.length} worktree{issues.length > 1 ? 's' : ''} need attention
          </span>
          {warningCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
              {warningCount} warning{warningCount > 1 ? 's' : ''}
            </span>
          )}
          {infoCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded">
              {infoCount} info
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Issue list - collapsible */}
      {!isCollapsed && (
        <div className="border-t border-yellow-500/20">
          {issues.map((issue, index) => (
            <div
              key={`${issue.worktree.path}-${issue.type}`}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm',
                index !== issues.length - 1 && 'border-b border-yellow-500/10'
              )}
            >
              {getIcon(issue.type)}
              <span
                className={cn(
                  'font-medium truncate',
                  issue.severity === 'warning' ? 'text-foreground' : 'text-muted-foreground'
                )}
                title={issue.worktree.branch || issue.worktree.path}
              >
                {issue.worktree.branch || '(detached)'}
              </span>
              <span className="text-muted-foreground">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
