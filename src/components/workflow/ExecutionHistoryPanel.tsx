/**
 * Execution History Panel
 * Slide-over panel showing workflow execution history
 * Displays output in a dialog when clicking on history items
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { X, CheckCircle, XCircle, MinusCircle, Trash2, Clock, Play, Terminal, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useExecutionHistoryContext } from '../../contexts/ExecutionHistoryContext';
import { useWorkflowExecutionContext } from '../../contexts/WorkflowExecutionContext';
import type { ExecutionHistoryItem, WorkflowOutputLine } from '../../lib/tauri-api';
import { VirtualizedOutputList, getOutputLineClassName } from './VirtualizedOutputList';

interface ExecutionHistoryPanelProps {
  workflowId: string;
  workflowName: string;
  isOpen: boolean;
  onClose: () => void;
}

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
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
    case 'cancelled':
      return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

/** Single history item */
function HistoryItem({
  item,
  onView,
  onDelete,
}: {
  item: ExecutionHistoryItem;
  onView: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const statusColors = {
    completed: 'border-green-500/30 bg-green-500/5 dark:border-green-500/30 dark:bg-green-500/5',
    failed: 'border-red-500/30 bg-red-500/5 dark:border-red-500/30 dark:bg-red-500/5',
    cancelled: 'border-muted bg-muted/30',
  };

  const statusColor = statusColors[item.status as keyof typeof statusColors] || statusColors.cancelled;

  return (
    <div
      className={cn(
        'relative p-3 rounded-lg border cursor-pointer transition-all group',
        statusColor,
        'hover:border-primary/50'
      )}
      onClick={onView}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Floating delete button */}
      <div
        className={cn(
          'absolute -right-2 top-1/2 -translate-y-1/2 transition-all duration-150',
          isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
        )}
      >
        <Button
          variant="destructive"
          size="icon"
          className="h-7 w-7 rounded-full shadow-md"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={item.status} />
          <span className="text-sm font-medium capitalize">{item.status}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDate(item.finishedAt)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(item.durationMs)}
        </span>
        <span>|</span>
        <span>
          Steps: {item.completedNodeCount}/{item.nodeCount}
        </span>
        {item.errorMessage && (
          <>
            <span>|</span>
            <span className="text-red-500 dark:text-red-400 truncate max-w-[150px]" title={item.errorMessage}>
              {item.errorMessage}
            </span>
          </>
        )}
      </div>
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
  const [copied, setCopied] = useState(false);

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

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const statusLabel = {
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
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
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 flex flex-col bg-background rounded-xl border border-border shadow-2xl shadow-black/50 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-muted-foreground" />
            <h2 id="history-output-title" className="text-sm font-medium text-foreground">
              {workflowName}
            </h2>
            <StatusIcon status={item.status} />
            <span className="text-xs text-muted-foreground">
              {statusLabel[item.status as keyof typeof statusLabel] || item.status}
            </span>
            <span className="text-xs text-muted-foreground">
              • {formatDuration(item.durationMs)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              disabled={item.output.length === 0}
              className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy output"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500 dark:text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-hidden p-4 bg-card">
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

        {/* Footer with status */}
        <div
          className={cn(
            'px-4 py-2 border-t text-xs',
            item.status === 'completed' && 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
            item.status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
            item.status === 'cancelled' && 'border-muted bg-muted/50 text-muted-foreground'
          )}
        >
          {item.errorMessage ? (
            <div className="flex items-start gap-2">
              <span className="font-medium">Error:</span>
              <span>{item.errorMessage}</span>
            </div>
          ) : item.status === 'completed' ? (
            <span>Completed at {formatDate(item.finishedAt)}</span>
          ) : item.status === 'cancelled' ? (
            <span>Cancelled at {formatDate(item.finishedAt)}</span>
          ) : (
            <span>Failed at {formatDate(item.finishedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExecutionHistoryPanel({
  workflowId,
  workflowName,
  isOpen,
  onClose,
}: ExecutionHistoryPanelProps) {
  const { getHistory, refreshHistory, deleteHistory, clearWorkflowHistory } = useExecutionHistoryContext();
  const { getExecutionState } = useWorkflowExecutionContext();
  const [selectedItem, setSelectedItem] = useState<ExecutionHistoryItem | null>(null);
  const lastFinishedAtRef = useRef<string | null>(null);

  // Get current execution status
  const executionState = getExecutionState(workflowId);
  const finishedAt = executionState.finishedAt?.toISOString() || null;

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

  const history = useMemo(() => {
    const items = getHistory(workflowId);
    // Sort by finishedAt descending (newest first)
    return [...items].sort(
      (a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()
    );
  }, [getHistory, workflowId]);

  const groupedHistory = useMemo(() => groupByDate(history), [history]);

  const handleDelete = async (historyId: string) => {
    try {
      await deleteHistory(workflowId, historyId);
    } catch (error) {
      console.error('Failed to delete history:', error);
    }
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all history for this workflow?')) {
      try {
        await clearWorkflowHistory(workflowId);
      } catch (error) {
        console.error('Failed to clear history:', error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-[360px] h-full bg-card border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">History</h2>
            <p className="text-sm text-muted-foreground truncate max-w-[250px]">
              {workflowName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Play className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm">No execution history yet</p>
              <p className="text-xs mt-1">Run your workflow to start recording history</p>
            </div>
          ) : (
            Array.from(groupedHistory.entries()).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">{date}</h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      onView={() => setSelectedItem(item)}
                      onDelete={() => handleDelete(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {history.length} execution{history.length !== 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={handleClearAll}
            >
              Clear All
            </Button>
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
    </div>
  );
}
