/**
 * Execution History Panel
 * Slide-over panel showing workflow execution history
 * Displays output in a dialog when clicking on history items
 *
 * Features:
 * - Grouped by date with visual separators
 * - Status-based styling with variant config
 * - Filter by status and trigger source
 * - Search functionality
 * - Statistics summary
 * - ConfirmDialog for delete operations
 * - Full accessibility support
 */

import { useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  MinusCircle,
  Trash2,
  Clock,
  Play,
  Terminal,
  Copy,
  Check,
  History,
  Search,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useExecutionHistoryContext } from '../../contexts/ExecutionHistoryContext';
import { useWorkflowExecutionContext } from '../../contexts/WorkflowExecutionContext';
import type { ExecutionHistoryItem, WorkflowOutputLine } from '../../lib/tauri-api';
import { VirtualizedOutputList, getOutputLineClassName } from './VirtualizedOutputList';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';

interface ExecutionHistoryPanelProps {
  workflowId: string;
  workflowName: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Status filter options */
type StatusFilter = 'all' | 'completed' | 'failed' | 'cancelled';

/** Trigger filter options */
type TriggerFilter = 'all' | 'manual' | 'mcp' | 'webhook';

/** Variant config for status-based styling */
const statusVariantConfig = {
  completed: {
    icon: CheckCircle,
    gradient: 'from-green-500/20 to-transparent',
    iconColor: 'text-green-500 dark:text-green-400',
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/5',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    gradient: 'from-red-500/20 to-transparent',
    iconColor: 'text-red-500 dark:text-red-400',
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/5',
    label: 'Failed',
  },
  cancelled: {
    icon: MinusCircle,
    gradient: 'from-muted/30 to-transparent',
    iconColor: 'text-muted-foreground',
    borderColor: 'border-muted',
    bgColor: 'bg-muted/30',
    label: 'Cancelled',
  },
} as const;

/** Format duration in human readable format */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Format date for display */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;

  return date.toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Group histories by date */
function groupByDate(items: ExecutionHistoryItem[]): Map<string, ExecutionHistoryItem[]> {
  const groups = new Map<string, ExecutionHistoryItem[]>();

  items.forEach((item) => {
    const date = new Date(item.finishedAt);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    let key: string;
    if (isToday) {
      key = 'Today';
    } else if (isYesterday) {
      key = 'Yesterday';
    } else {
      key = date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  });

  return groups;
}

/** Status icon component */
function StatusIcon({ status, className }: { status: string; className?: string }) {
  const config = statusVariantConfig[status as keyof typeof statusVariantConfig];
  if (!config) {
    return <Clock className={cn('w-4 h-4 text-muted-foreground', className)} />;
  }
  const IconComponent = config.icon;
  return <IconComponent className={cn('w-4 h-4', config.iconColor, className)} />;
}

/** Trigger source badge */
function TriggerBadge({ triggeredBy }: { triggeredBy: string }) {
  if (triggeredBy === 'mcp') {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 uppercase">
        MCP
      </span>
    );
  }
  if (triggeredBy === 'webhook') {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 uppercase">
        Webhook
      </span>
    );
  }
  // manual or default - don't show badge
  return null;
}

/** Single history item */
function HistoryItem({
  item,
  onView,
  onDelete,
  isSelected,
}: {
  item: ExecutionHistoryItem;
  onView: () => void;
  onDelete: () => void;
  isSelected?: boolean;
}) {
  const config = statusVariantConfig[item.status as keyof typeof statusVariantConfig] || statusVariantConfig.cancelled;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all group',
        config.borderColor,
        config.bgColor,
        'hover:border-primary/50 hover:shadow-sm',
        isSelected && 'ring-2 ring-primary/50'
      )}
      onClick={onView}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView();
        }
      }}
    >
      <div className="flex items-start justify-between">
        {/* Left: Status & Info */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              'bg-gradient-to-br',
              config.gradient
            )}
          >
            <StatusIcon status={item.status} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{config.label}</span>
              <TriggerBadge triggeredBy={item.triggeredBy} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{formatDate(item.finishedAt)}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(item.durationMs)}
              </span>
              <span>
                Steps: {item.completedNodeCount}/{item.nodeCount}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete history item"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Error message preview */}
      {item.errorMessage && (
        <div className="mt-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-500 dark:text-red-400 line-clamp-2">
            {item.errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

/** History Output Dialog - displays output in a modal like WorkflowOutputPanel */
interface HistoryOutputDialogProps {
  item: ExecutionHistoryItem;
  workflowName: string;
  onClose: () => void;
}

function HistoryOutputDialog({ item, workflowName, onClose }: HistoryOutputDialogProps) {
  const modalId = useId();
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const config = statusVariantConfig[item.status as keyof typeof statusVariantConfig] || statusVariantConfig.cancelled;

  // Register/unregister modal
  useEffect(() => {
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId]);

  // Handle ESC key with modal stack
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, onClose]);

  // Focus trap
  useEffect(() => {
    if (contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, []);

  // Render function for history output lines
  const renderHistoryOutputLine = useCallback((line: WorkflowOutputLine) => {
    return (
      <div className={getOutputLineClassName(line.stream, line.content)}>
        {line.content}
      </div>
    );
  }, []);

  // Copy all output to clipboard
  const handleCopy = async () => {
    const text = item.output.map((line) => line.content).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-output-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={contentRef}
        className={cn(
          'fixed inset-4 md:inset-8 lg:inset-12 flex flex-col',
          'bg-background rounded-xl',
          'border',
          config.borderColor,
          'shadow-2xl shadow-black/60',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          'focus:outline-none'
        )}
        tabIndex={-1}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4 border-b border-border',
            'bg-gradient-to-r',
            'dark:from-indigo-500/15 dark:via-indigo-600/5 dark:to-transparent',
            'from-indigo-500/10 via-indigo-600/5 to-transparent'
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'absolute right-4 top-4',
              'p-2 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-11 h-11 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border border-indigo-500/20',
                'bg-indigo-500/10',
                'shadow-lg'
              )}
            >
              <Terminal className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="history-output-title"
                className="text-base font-semibold text-foreground leading-tight"
              >
                {workflowName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusIcon status={item.status} />
                <span className="text-sm text-muted-foreground">
                  {config.label}
                </span>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(item.durationMs)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-hidden p-4 bg-card/30">
          <VirtualizedOutputList
            lines={item.output}
            renderLine={renderHistoryOutputLine}
            autoScroll={false}
            className="h-full"
            emptyState={
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Terminal className="w-12 h-12 mb-3 opacity-30" />
                <p>No output recorded</p>
              </div>
            }
          />
        </div>

        {/* Footer */}
        <div
          className={cn(
            'px-5 py-3 border-t flex items-center justify-between',
            item.status === 'completed' && 'border-green-500/30 bg-green-500/5',
            item.status === 'failed' && 'border-red-500/30 bg-red-500/5',
            item.status === 'cancelled' && 'border-muted bg-muted/30'
          )}
        >
          {/* Left: Status info */}
          <div className="text-xs text-muted-foreground">
            {item.errorMessage ? (
              <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
                <span className="font-medium">Error:</span>
                <span className="truncate max-w-[300px]">{item.errorMessage}</span>
              </div>
            ) : (
              <span>
                {config.label} at {formatDate(item.finishedAt)}
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={item.output.length === 0}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                'text-sm font-medium',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent',
                'border border-transparent hover:border-border',
                'transition-all duration-150',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className={cn(
                'px-4 py-1.5 rounded-lg',
                'text-sm font-medium',
                'bg-secondary hover:bg-accent',
                'text-foreground',
                'border border-border',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Filter button component */
function FilterButton({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          'border transition-colors',
          value !== 'all'
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-border bg-background hover:bg-accent text-muted-foreground'
        )}
      >
        <Filter className="w-3 h-3" />
        <span>{label}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 min-w-[120px] py-1 bg-background border border-border rounded-lg shadow-lg">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs transition-colors',
                  value === option.value
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ExecutionHistoryPanel({
  workflowId,
  workflowName,
  isOpen,
  onClose,
}: ExecutionHistoryPanelProps) {
  const modalId = useId();
  const { getHistory, refreshHistory, deleteHistory, clearWorkflowHistory } = useExecutionHistoryContext();
  const { getExecutionState } = useWorkflowExecutionContext();
  const [selectedItem, setSelectedItem] = useState<ExecutionHistoryItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ExecutionHistoryItem | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const lastFinishedAtRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Get current execution status
  const executionState = getExecutionState(workflowId);
  const finishedAt = executionState.finishedAt?.toISOString() || null;

  // Register/unregister modal
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key with modal stack
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
  }, [modalId, isOpen, onClose]);

  // Refresh history when panel opens
  useEffect(() => {
    if (isOpen) {
      refreshHistory(workflowId);
    }
  }, [isOpen, workflowId, refreshHistory]);

  // Refresh history when execution completes (finishedAt changes)
  useEffect(() => {
    // Skip if panel is not open
    if (!isOpen) return;

    // Skip if finishedAt hasn't changed or is null
    if (!finishedAt || finishedAt === lastFinishedAtRef.current) {
      lastFinishedAtRef.current = finishedAt;
      return;
    }

    // finishedAt changed - new execution completed
    lastFinishedAtRef.current = finishedAt;

    // Delay to ensure backend has saved the history
    const timer = setTimeout(() => {
      refreshHistory(workflowId);
    }, 300);

    return () => clearTimeout(timer);
  }, [finishedAt, isOpen, workflowId, refreshHistory]);

  // Get and filter history
  const history = useMemo(() => {
    let items = getHistory(workflowId);

    // Apply status filter
    if (statusFilter !== 'all') {
      items = items.filter((item) => item.status === statusFilter);
    }

    // Apply trigger filter
    if (triggerFilter !== 'all') {
      items = items.filter((item) => item.triggeredBy === triggerFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.workflowName.toLowerCase().includes(query) ||
          item.errorMessage?.toLowerCase().includes(query)
      );
    }

    // Sort by finishedAt descending (newest first)
    return [...items].sort(
      (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()
    );
  }, [getHistory, workflowId, statusFilter, triggerFilter, searchQuery]);

  // All history (unfiltered) for stats
  const allHistory = useMemo(() => getHistory(workflowId), [getHistory, workflowId]);

  // Statistics
  const stats = useMemo(() => {
    const completed = allHistory.filter((h) => h.status === 'completed').length;
    const failed = allHistory.filter((h) => h.status === 'failed').length;
    const avgDuration =
      allHistory.length > 0
        ? allHistory.reduce((sum, h) => sum + h.durationMs, 0) / allHistory.length
        : 0;
    return { completed, failed, avgDuration, total: allHistory.length };
  }, [allHistory]);

  const groupedHistory = useMemo(() => groupByDate(history), [history]);

  const hasActiveFilters = statusFilter !== 'all' || triggerFilter !== 'all' || searchQuery.trim() !== '';

  const handleDelete = async (historyId: string) => {
    try {
      await deleteHistory(workflowId, historyId);
    } catch (error) {
      console.error('Failed to delete history:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearWorkflowHistory(workflowId);
      setShowClearAllConfirm(false);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setTriggerFilter('all');
    setSearchQuery('');
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-panel-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative w-[400px] h-full bg-background',
          'border-l border-indigo-500/30',
          'flex flex-col',
          'animate-in slide-in-from-right duration-200',
          'shadow-2xl shadow-black/50'
        )}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4',
            'border-b border-border',
            'bg-gradient-to-r',
            'dark:from-indigo-500/15 dark:via-indigo-600/5 dark:to-transparent',
            'from-indigo-500/10 via-indigo-600/5 to-transparent'
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'absolute right-4 top-4',
              'p-2 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border border-indigo-500/20',
                'bg-indigo-500/10',
                'shadow-lg'
              )}
            >
              <History className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="history-panel-title"
                className="text-lg font-semibold text-foreground leading-tight"
              >
                Execution History
              </h2>
              <p
                className="mt-1 text-sm text-muted-foreground truncate"
                title={workflowName}
              >
                {workflowName}
              </p>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        {allHistory.length > 0 && (
          <div className="px-4 py-3 border-b border-border bg-card/30">
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full pl-8 pr-3 py-1.5 rounded-lg text-xs',
                    'bg-background border border-border',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
                  )}
                />
              </div>

              {/* Status Filter */}
              <FilterButton
                label="Status"
                value={statusFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
              />

              {/* Trigger Filter */}
              <FilterButton
                label="Trigger"
                value={triggerFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'manual', label: 'Manual' },
                  { value: 'mcp', label: 'MCP' },
                  { value: 'webhook', label: 'Webhook' },
                ]}
                onChange={(v) => setTriggerFilter(v as TriggerFilter)}
              />

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Reset filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div
          className="flex-1 overflow-auto p-4 space-y-4"
          role="listbox"
          aria-label="Execution history entries"
        >
          {allHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Play className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">No execution history yet</p>
              <p className="text-xs mt-1">Run your workflow to start recording history</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">No matching results</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
              <button
                onClick={resetFilters}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            Array.from(groupedHistory.entries()).map(([date, items]) => (
              <div key={date} role="group" aria-label={`Executions from ${date}`}>
                {/* Date separator */}
                <div className="sticky top-0 z-10 py-2 bg-background/95 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {date}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      onView={() => setSelectedItem(item)}
                      onDelete={() => setDeleteConfirmItem(item)}
                      isSelected={selectedItem?.id === item.id}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with statistics */}
        {allHistory.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-card/50">
            <div className="flex items-center justify-between">
              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  {stats.completed}
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-red-500" />
                  {stats.failed}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Avg: {formatDuration(stats.avgDuration)}
                </span>
              </div>

              {/* Clear All */}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setShowClearAllConfirm(true)}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Output Dialog */}
      {selectedItem && (
        <HistoryOutputDialog
          item={selectedItem}
          workflowName={workflowName}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Delete Item Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteConfirmItem}
        onOpenChange={(open) => !open && setDeleteConfirmItem(null)}
        variant="destructive"
        title="Delete History Entry"
        description="Are you sure you want to delete this execution history? This action cannot be undone."
        itemName={deleteConfirmItem ? formatDate(deleteConfirmItem.finishedAt) : ''}
        confirmText="Delete"
        onConfirm={() => {
          if (deleteConfirmItem) {
            handleDelete(deleteConfirmItem.id);
            setDeleteConfirmItem(null);
          }
        }}
      />

      {/* Clear All Confirm Dialog */}
      <ConfirmDialog
        open={showClearAllConfirm}
        onOpenChange={setShowClearAllConfirm}
        variant="destructive"
        title="Clear All History"
        description="Are you sure you want to clear all execution history for this workflow? This action cannot be undone."
        itemName={workflowName}
        confirmText="Clear All"
        onConfirm={handleClearAll}
      />
    </div>
  );
}
