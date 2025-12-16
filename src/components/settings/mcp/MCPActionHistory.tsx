/**
 * MCPActionHistory Component
 * Displays action execution history with filtering and expandable details
 * @see specs/021-mcp-actions/spec.md
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  History,
  Play,
  Globe,
  GitBranch,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Filter,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Select } from '../../ui/Select';
import { useActionHistory } from '../../../hooks/useMCPActions';
import type {
  MCPActionExecution,
  MCPActionType,
  ExecutionStatus,
} from '../../../types/mcp-action';

// ============================================================================
// Types
// ============================================================================

interface MCPActionHistoryProps {
  className?: string;
  /** Max height for scrollable area */
  maxHeight?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPE_CONFIG: Record<
  MCPActionType,
  { icon: React.ReactNode; colorClass: string; bgClass: string }
> = {
  script: {
    icon: <Play className="w-3 h-3" />,
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
  },
  webhook: {
    icon: <Globe className="w-3 h-3" />,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  workflow: {
    icon: <GitBranch className="w-3 h-3" />,
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
  },
};

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { icon: React.ReactNode; label: string; colorClass: string; bgClass: string }
> = {
  pending_confirm: {
    icon: <Clock className="w-3 h-3" />,
    label: 'Pending',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
  },
  queued: {
    icon: <Clock className="w-3 h-3" />,
    label: 'Queued',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  running: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: 'Running',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  completed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: 'Completed',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
  },
  failed: {
    icon: <XCircle className="w-3 h-3" />,
    label: 'Failed',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  cancelled: {
    icon: <X className="w-3 h-3" />,
    label: 'Cancelled',
    colorClass: 'text-gray-500',
    bgClass: 'bg-gray-500/10',
  },
  timed_out: {
    icon: <AlertCircle className="w-3 h-3" />,
    label: 'Timed Out',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
  denied: {
    icon: <XCircle className="w-3 h-3" />,
    label: 'Denied',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
};

// ============================================================================
// Filter Controls Component
// ============================================================================

/** Action type filter options */
const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'script', label: 'Script' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'workflow', label: 'Workflow' },
];

/** Status filter options */
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'pending_confirm', label: 'Pending' },
  { value: 'denied', label: 'Denied' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface FilterControlsProps {
  actionType: MCPActionType | 'all';
  status: ExecutionStatus | 'all';
  onActionTypeChange: (type: MCPActionType | 'all') => void;
  onStatusChange: (status: ExecutionStatus | 'all') => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  actionType,
  status,
  onActionTypeChange,
  onStatusChange,
}) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Filter:</span>
      </div>

      {/* Action type filter */}
      <Select
        value={actionType}
        onValueChange={(value) => onActionTypeChange(value as MCPActionType | 'all')}
        options={ACTION_TYPE_OPTIONS}
        size="sm"
        className="w-[110px]"
        aria-label="Filter by action type"
      />

      {/* Status filter */}
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as ExecutionStatus | 'all')}
        options={STATUS_OPTIONS}
        size="sm"
        className="w-[120px]"
        aria-label="Filter by status"
      />
    </div>
  );
};

// ============================================================================
// Execution Row Component
// ============================================================================

interface ExecutionRowProps {
  execution: MCPActionExecution;
}

const ExecutionRow: React.FC<ExecutionRowProps> = ({ execution }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const typeConfig = ACTION_TYPE_CONFIG[execution.actionType];
  const statusConfig = STATUS_CONFIG[execution.status];

  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(execution.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, [execution.startedAt]);

  // Format duration
  const formattedDuration = useMemo(() => {
    if (!execution.durationMs) return null;
    if (execution.durationMs < 1000) return `${execution.durationMs}ms`;
    if (execution.durationMs < 60000) return `${(execution.durationMs / 1000).toFixed(1)}s`;
    return `${(execution.durationMs / 60000).toFixed(1)}m`;
  }, [execution.durationMs]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Main row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-3 w-full py-2 px-3 text-left',
          'hover:bg-muted/30 transition-colors'
        )}
      >
        {/* Expand icon */}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        )}

        {/* Type icon */}
        <span className={cn('p-1 rounded', typeConfig.bgClass, typeConfig.colorClass)}>
          {typeConfig.icon}
        </span>

        {/* Action name */}
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{execution.actionName}</span>

        {/* Status badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
            statusConfig.bgClass,
            statusConfig.colorClass
          )}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>

        {/* Duration */}
        {formattedDuration && (
          <span className="text-xs text-muted-foreground">{formattedDuration}</span>
        )}

        {/* Time */}
        <span className="text-xs text-muted-foreground">{formattedTime}</span>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Execution ID:</span>
              <code className="ml-1 text-foreground">{execution.id.slice(0, 8)}...</code>
            </div>
            {execution.sourceClient && (
              <div>
                <span className="text-muted-foreground">Source:</span>
                <span className="ml-1">{execution.sourceClient}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Started:</span>
              <span className="ml-1">{new Date(execution.startedAt).toLocaleString()}</span>
            </div>
            {execution.completedAt && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-1">{new Date(execution.completedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Parameters */}
          {execution.parameters && Object.keys(execution.parameters).length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Parameters:</span>
              <pre className="mt-1 p-2 rounded bg-muted/50 text-xs overflow-x-auto max-h-24">
                {JSON.stringify(execution.parameters, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {execution.result && (
            <div>
              <span className="text-xs text-muted-foreground">Result:</span>
              <pre className="mt-1 p-2 rounded bg-muted/50 text-xs overflow-x-auto max-h-32">
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error message */}
          {execution.errorMessage && (
            <div>
              <span className="text-xs text-red-500">Error:</span>
              <pre className="mt-1 p-2 rounded bg-red-500/10 text-xs text-red-500 overflow-x-auto">
                {execution.errorMessage}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const MCPActionHistory: React.FC<MCPActionHistoryProps> = ({
  className,
  maxHeight = '400px',
}) => {
  const [actionTypeFilter, setActionTypeFilter] = useState<MCPActionType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');

  const { executions, isLoading, error, refresh, cleanup } = useActionHistory({
    limit: 100,
    actionType: actionTypeFilter === 'all' ? undefined : actionTypeFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  // Handle cleanup
  const handleCleanup = useCallback(async () => {
    if (window.confirm('Delete execution history older than 30 days or beyond 1000 entries?')) {
      const deleted = await cleanup(1000, 30);
      console.log(`Cleaned up ${deleted} old execution records`);
    }
  }, [cleanup]);

  if (isLoading && executions.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading execution history...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
        <button onClick={refresh} className="text-sm text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Execution History</span>
          <span className="text-xs text-muted-foreground">({executions.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCleanup}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            title="Cleanup old entries"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={refresh}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <FilterControls
        actionType={actionTypeFilter}
        status={statusFilter}
        onActionTypeChange={setActionTypeFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Execution list */}
      <div
        className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight }}
      >
        {executions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No execution history found
          </div>
        ) : (
          executions.map((execution) => (
            <ExecutionRow key={execution.id} execution={execution} />
          ))
        )}
      </div>
    </div>
  );
};

export default MCPActionHistory;
