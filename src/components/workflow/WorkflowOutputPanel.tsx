/**
 * Workflow Output Panel Component
 * Displays workflow execution output in a dialog with terminal-like styling
 * Feature 013: Extended to show child workflow execution summaries
 * Feature: UI improvement - grouped output by node with visual distinction
 * Feature: UI redesign - matches HistoryOutputDialog style with gradient header
 */

import { useRef, useEffect, useMemo, useState, useCallback, useId } from 'react';
import { X, Terminal, Copy, Check, Workflow, Loader2, CheckCircle2, XCircle, AlertCircle, List, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import type { WorkflowExecutionState, OutputLine } from '../../hooks/useWorkflowExecution';
import type { ChildExecutionState } from '../../hooks/useChildExecution';
import { ExecutionStatusIcon } from './WorkflowExecutionStatus';
import { formatDuration } from '../../hooks/useWorkflowExecution';
import { formatChildDuration, formatChildProgress } from '../../hooks/useChildExecution';
import { OutputNodeGroup, groupOutputByNode } from './OutputNodeGroup';
import { VirtualizedOutputList, getOutputLineClassName } from './VirtualizedOutputList';
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';

type ViewMode = 'grouped' | 'raw';

interface WorkflowOutputPanelProps {
  workflowId: string;
  workflowName: string;
  state: WorkflowExecutionState;
  onClose: () => void;
}

/** Status label mapping */
const statusLabels: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function WorkflowOutputPanel({
  workflowId: _workflowId,
  workflowName,
  state,
  onClose,
}: WorkflowOutputPanelProps) {
  void _workflowId; // Reserved for future use
  const modalId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  const { status, output, startedAt, finishedAt, error, childExecutions } = state;
  const isActive = status === 'starting' || status === 'running';

  // Register/unregister modal
  useEffect(() => {
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId]);

  // Focus trap
  useEffect(() => {
    if (contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, []);

  // Feature 013: Check if there are any child executions to display
  const childExecutionEntries = useMemo(() => {
    return Object.entries(childExecutions || {});
  }, [childExecutions]);

  const hasChildExecutions = childExecutionEntries.length > 0;

  // Group output by node for grouped view
  const groupedOutput = useMemo(() => {
    return groupOutputByNode(output);
  }, [output]);

  // Get the latest (currently running) node ID
  const latestNodeId = useMemo(() => {
    if (groupedOutput.length === 0) return null;
    const runningGroups = groupedOutput.filter((g) => g.status === 'running');
    if (runningGroups.length > 0) {
      return runningGroups[runningGroups.length - 1].nodeId;
    }
    return groupedOutput[groupedOutput.length - 1].nodeId;
  }, [groupedOutput]);

  // Auto-scroll to bottom when new output arrives (only for grouped view)
  useEffect(() => {
    if (viewMode === 'grouped' && autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll, viewMode]);

  // Handle scroll to detect if user scrolled up (for grouped view)
  const handleScroll = useCallback(() => {
    if (outputRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  }, []);

  // Handle scroll change from virtualized list (for raw view)
  const handleVirtualizedScrollChange = useCallback((isAtBottom: boolean) => {
    setAutoScroll(isAtBottom);
  }, []);

  // Render function for raw output lines
  const renderRawOutputLine = useCallback((line: OutputLine) => {
    return (
      <div className={getOutputLineClassName(line.stream, line.content, line.nodeType)}>
        {line.content}
      </div>
    );
  }, []);

  // Copy all output to clipboard
  const handleCopy = async () => {
    const text = output.map((line) => line.content).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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

  return (
    <div
      className="fixed inset-0 z-50 animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="output-panel-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={contentRef}
        className={cn(
          'fixed inset-4 md:inset-8 lg:inset-12 flex flex-col',
          'bg-background rounded-xl',
          'border border-indigo-500/30',
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
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-4 top-4 h-auto w-auto p-2"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </Button>

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
                id="output-panel-title"
                className="text-base font-semibold text-foreground leading-tight"
              >
                {workflowName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <ExecutionStatusIcon status={status} />
                <span className="text-sm text-muted-foreground">
                  {statusLabels[status] || status}
                </span>
                {startedAt && (
                  <>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(startedAt, finishedAt)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center bg-secondary rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grouped')}
                className={cn(
                  'h-7 w-7 rounded-md',
                  viewMode === 'grouped'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Grouped view"
              >
                <Layers className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('raw')}
                className={cn(
                  'h-7 w-7 rounded-md',
                  viewMode === 'raw'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Raw view"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-hidden p-4 bg-card/30">
          <div
            ref={outputRef}
            onScroll={handleScroll}
            className="h-full overflow-auto"
          >
          {output.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Terminal className="w-12 h-12 mb-3 opacity-30" />
              <p>{isActive ? 'Waiting for output...' : 'No output'}</p>
            </div>
          ) : viewMode === 'grouped' ? (
            // Grouped view - output organized by node
            <div className="space-y-3">
              {groupedOutput.map((group) => (
                <OutputNodeGroup
                  key={group.nodeId}
                  group={group}
                  isLatest={group.nodeId === latestNodeId}
                  defaultExpanded={group.status === 'running' || group.nodeId === latestNodeId}
                />
              ))}
              {/* Cursor indicator when running */}
              {isActive && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse" />
                  <span>Workflow is running...</span>
                </div>
              )}
            </div>
          ) : (
            // Raw view - virtualized line-by-line output
            <VirtualizedOutputList
              lines={output}
              renderLine={renderRawOutputLine}
              autoScroll={autoScroll}
              onScrollChange={handleVirtualizedScrollChange}
              className="h-full"
            />
          )}
          </div>
        </div>

        {/* Feature 013: Child Workflow Execution Summary */}
        {hasChildExecutions && (
          <div className="px-4 py-3 border-t border-border bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              <Workflow className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-foreground">
                Child Workflow Executions ({childExecutionEntries.length})
              </span>
            </div>
            <div className="space-y-2">
              {childExecutionEntries.map(([nodeId, child]) => (
                <ChildExecutionSummary key={nodeId} nodeId={nodeId} child={child} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className={cn(
            'px-5 py-3 border-t flex items-center justify-between',
            status === 'completed' && 'border-green-500/30 bg-green-500/5',
            status === 'failed' && 'border-red-500/30 bg-red-500/5',
            status === 'cancelled' && 'border-muted bg-muted/30',
            isActive && 'border-blue-500/30 bg-blue-500/5'
          )}
        >
          {/* Left: Status info */}
          <div className="text-xs text-muted-foreground">
            {error ? (
              <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
                <span className="font-medium">Error:</span>
                <span className="truncate max-w-[300px]">{error}</span>
              </div>
            ) : isActive ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                Workflow is running...
              </span>
            ) : status === 'completed' ? (
              <span>Workflow completed successfully</span>
            ) : status === 'cancelled' ? (
              <span>Workflow was cancelled</span>
            ) : status === 'failed' ? (
              <span>Workflow failed</span>
            ) : null}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={output.length === 0}
              className="h-auto px-3 py-1.5 text-sm"
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
            </Button>
            <Button
              variant="secondary"
              onClick={onClose}
              className="h-auto px-4 py-1.5 text-sm"
            >
              Close
            </Button>
          </div>
        </div>

        {/* Auto-scroll indicator */}
        {!autoScroll && isActive && (
          <Button
            onClick={() => {
              setAutoScroll(true);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            }}
            size="sm"
            className="absolute bottom-20 right-6 rounded-full shadow-lg"
          >
            Scroll to bottom
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact output preview for inline display
 */
interface OutputPreviewProps {
  output: OutputLine[];
  maxLines?: number;
  className?: string;
}

export function OutputPreview({ output, maxLines = 3, className }: OutputPreviewProps) {
  if (output.length === 0) return null;

  const previewLines = output.slice(-maxLines);

  return (
    <div
      className={cn(
        'font-mono text-xs p-2 bg-card rounded border border-border overflow-hidden',
        className
      )}
    >
      {previewLines.map((line) => (
        <div
          key={line.id}
          className={cn(
            'truncate',
            line.stream === 'stderr' ? 'text-red-400' : 'text-muted-foreground'
          )}
        >
          {line.content}
        </div>
      ))}
      {output.length > maxLines && (
        <div className="text-muted-foreground mt-1">
          ... {output.length - maxLines} more lines
        </div>
      )}
    </div>
  );
}

/**
 * Feature 013: Child Execution Summary Item
 * Displays the status and progress of a child workflow execution
 */
interface ChildExecutionSummaryProps {
  nodeId: string;
  child: ChildExecutionState;
}

function ChildExecutionSummary({ nodeId: _nodeId, child }: ChildExecutionSummaryProps) {
  void _nodeId; // Reserved for future use

  const StatusIcon = useMemo(() => {
    switch (child.status) {
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'cancelled':
        return <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />;
      default:
        return null;
    }
  }, [child.status]);

  const progressPercent = useMemo(() => {
    if (child.totalSteps === 0) return 0;
    return Math.round((child.currentStep / child.totalSteps) * 100);
  }, [child.currentStep, child.totalSteps]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg border text-xs',
        child.status === 'running' && 'bg-purple-500/10 border-purple-500/30',
        child.status === 'completed' && 'bg-green-500/10 border-green-500/30',
        child.status === 'failed' && 'bg-red-500/10 border-red-500/30',
        child.status === 'cancelled' && 'bg-gray-500/10 border-gray-500/30'
      )}
    >
      {/* Status Icon */}
      {StatusIcon}

      {/* Workflow Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {child.childWorkflowName}
          </span>
          <span className="text-muted-foreground">
            {formatChildProgress(child)}
          </span>
        </div>

        {/* Progress Bar (when running) */}
        {child.status === 'running' && child.totalSteps > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {child.currentNodeName && (
              <span className="text-muted-foreground truncate max-w-[100px]">
                {child.currentNodeName}
              </span>
            )}
          </div>
        )}

        {/* Error Message (when failed) */}
        {child.status === 'failed' && child.errorMessage && (
          <div className="mt-1 text-red-400 truncate">
            {child.errorMessage}
          </div>
        )}
      </div>

      {/* Duration */}
      {child.durationMs && (
        <span className="text-muted-foreground shrink-0">
          {formatChildDuration(child.durationMs)}
        </span>
      )}
    </div>
  );
}
