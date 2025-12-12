/**
 * Workflow Output Panel Component
 * Displays workflow execution output in a dialog with terminal-like styling
 * Feature 013: Extended to show child workflow execution summaries
 * Feature: UI improvement - grouped output by node with visual distinction
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { X, Terminal, Copy, Check, Workflow, Loader2, CheckCircle2, XCircle, AlertCircle, List, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WorkflowExecutionState, OutputLine } from '../../hooks/useWorkflowExecution';
import type { ChildExecutionState } from '../../hooks/useChildExecution';
import { ExecutionStatusIcon } from './WorkflowExecutionStatus';
import { formatDuration } from '../../hooks/useWorkflowExecution';
import { formatChildDuration, formatChildProgress } from '../../hooks/useChildExecution';
import { OutputNodeGroup, groupOutputByNode } from './OutputNodeGroup';
import { VirtualizedOutputList, getOutputLineClassName } from './VirtualizedOutputList';

type ViewMode = 'grouped' | 'raw';

interface WorkflowOutputPanelProps {
  workflowId: string;
  workflowName: string;
  state: WorkflowExecutionState;
  onClose: () => void;
}

export function WorkflowOutputPanel({
  workflowId: _workflowId,
  workflowName,
  state,
  onClose,
}: WorkflowOutputPanelProps) {
  void _workflowId; // Reserved for future use
  const outputRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');

  const { status, output, startedAt, finishedAt, error, childExecutions } = state;
  const isActive = status === 'starting' || status === 'running';

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
      <div className="fixed inset-4 md:inset-8 lg:inset-12 flex flex-col bg-background rounded-xl border border-border shadow-2xl shadow-black/50 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-muted-foreground" />
            <h2 id="output-panel-title" className="text-sm font-medium text-foreground">
              {workflowName}
            </h2>
            <ExecutionStatusIcon status={status} />
            {startedAt && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(startedAt, finishedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* View mode toggle */}
            <div className="flex items-center bg-secondary rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setViewMode('grouped')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'grouped'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Grouped view"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'raw'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Raw view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            {/* Copy button */}
            <button
              onClick={handleCopy}
              disabled={output.length === 0}
              className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy output"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
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
        <div
          ref={outputRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 bg-card"
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

        {/* Footer with error or status */}
        {(error || status === 'completed' || status === 'failed' || status === 'cancelled') && (
          <div
            className={cn(
              'px-4 py-2 border-t text-xs',
              status === 'completed' && 'border-green-500/30 bg-green-500/10 text-green-400',
              status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-400',
              status === 'cancelled' && 'border-muted bg-muted/50 text-muted-foreground'
            )}
          >
            {error ? (
              <div className="flex items-start gap-2">
                <span className="font-medium">Error:</span>
                <span>{error}</span>
              </div>
            ) : status === 'completed' ? (
              <span>Workflow completed successfully</span>
            ) : status === 'cancelled' ? (
              <span>Workflow was cancelled</span>
            ) : (
              <span>Workflow failed</span>
            )}
          </div>
        )}

        {/* Auto-scroll indicator */}
        {!autoScroll && isActive && (
          <button
            onClick={() => {
              setAutoScroll(true);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            }}
            className="absolute bottom-16 right-6 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-full shadow-lg transition-colors"
          >
            Scroll to bottom
          </button>
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
