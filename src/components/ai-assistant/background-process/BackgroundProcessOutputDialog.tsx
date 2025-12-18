/**
 * BackgroundProcessOutputDialog - Full-screen output viewer
 * Feature: AI Assistant Background Process Management
 *
 * Shows complete process output with:
 * - Virtual scrolling for large outputs
 * - Stdout/stderr differentiation
 * - Auto-scroll toggle
 * - Copy functionality
 * - Search (optional enhancement)
 *
 * Follows ToolOutputDialog patterns from ActionConfirmationCard
 */

import { useState, useCallback, useEffect, useRef, useId, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  X,
  Copy,
  Check,
  Terminal,
  Clock,
  Square,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowDown,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { registerModal, unregisterModal, isTopModal } from '../../ui/modalStack';
import type {
  BackgroundProcess,
  BackgroundProcessStatus,
} from '../../../types/background-process';

interface BackgroundProcessOutputDialogProps {
  /** Process to display */
  process: BackgroundProcess;
  /** Handler to close the dialog */
  onClose: () => void;
  /** Handler to stop the process */
  onStop: (processId: string) => Promise<void>;
}

/** Status configuration */
const statusConfig: Record<
  BackgroundProcessStatus,
  {
    label: string;
    icon: React.ElementType;
    borderColor: string;
    bgColor: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  starting: {
    label: 'Starting',
    icon: Loader2,
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/5',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  running: {
    label: 'Running',
    icon: Play,
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/5',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
  stopped: {
    label: 'Stopped',
    icon: Square,
    borderColor: 'border-zinc-500/30',
    bgColor: 'bg-zinc-500/5',
    iconBg: 'bg-zinc-500/10',
    iconColor: 'text-zinc-400',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/5',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/5',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
};

/** Format duration */
function formatDuration(startMs: number, endMs?: number): string {
  const end = endMs ?? Date.now();
  const seconds = Math.floor((end - startMs) / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Strip ANSI codes from output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function BackgroundProcessOutputDialog({
  process,
  onClose,
  onStop,
}: BackgroundProcessOutputDialogProps) {
  const modalId = useId();
  const [copied, setCopied] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const config = statusConfig[process.status];
  const StatusIcon = config.icon;
  const isRunning = process.status === 'running' || process.status === 'starting';

  // Prepare output lines for virtualization
  const outputLines = useMemo(() => {
    return process.outputLines.map((line, index) => ({
      ...line,
      index,
      displayContent: stripAnsi(line.content),
    }));
  }, [process.outputLines]);

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: outputLines.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 20, // Estimated line height
    overscan: 20, // Render extra items for smooth scrolling
  });

  // Register/unregister modal
  useEffect(() => {
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId]);

  // Handle ESC key
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

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current && outputLines.length > 0) {
      virtualizer.scrollToIndex(outputLines.length - 1, { align: 'end' });
    }
  }, [autoScroll, outputLines.length, virtualizer]);

  // Detect if user scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll]);

  // Copy all output
  const handleCopy = useCallback(async () => {
    try {
      const fullOutput = outputLines.map((l) => l.displayContent).join('\n');
      await navigator.clipboard.writeText(fullOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [outputLines]);

  // Stop process
  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await onStop(process.id);
    } finally {
      setIsStopping(false);
    }
  }, [onStop, process.id]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (outputLines.length > 0) {
      virtualizer.scrollToIndex(outputLines.length - 1, { align: 'end' });
      setAutoScroll(true);
    }
  }, [outputLines.length, virtualizer]);

  return (
    <div
      className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="process-output-title"
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
        {/* Header */}
        <div
          className={cn(
            'relative px-5 py-4 border-b border-border',
            'bg-gradient-to-r',
            config.bgColor
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
                'border',
                config.borderColor,
                config.iconBg,
                'shadow-lg'
              )}
            >
              <Terminal className={cn('w-5 h-5', config.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="process-output-title"
                className="text-base font-semibold text-foreground leading-tight"
              >
                {process.name}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusIcon
                  className={cn(
                    'w-4 h-4',
                    config.iconColor,
                    process.status === 'starting' && 'animate-spin'
                  )}
                />
                <span className="text-sm text-muted-foreground">{config.label}</span>
                <span className="text-sm text-muted-foreground">|</span>
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {formatDuration(process.startedAt, process.endedAt)}
                </span>
                {process.port && (
                  <>
                    <span className="text-sm text-muted-foreground">|</span>
                    <span className="text-sm text-amber-500 font-mono">
                      :{process.port}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Output content - Virtualized */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 bg-gray-950"
        >
          {outputLines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for output...</p>
              </div>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const line = outputLines[virtualRow.index];
                return (
                  <div
                    key={line.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={cn(
                      'px-3 py-0.5 font-mono text-sm',
                      'whitespace-pre-wrap break-all',
                      line.stream === 'stderr'
                        ? 'text-red-400 bg-red-500/5'
                        : 'text-gray-200'
                    )}
                  >
                    {line.displayContent}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Auto-scroll button - shows when not at bottom */}
        {!autoScroll && outputLines.length > 0 && (
          <button
            onClick={scrollToBottom}
            className={cn(
              'absolute bottom-20 right-8',
              'flex items-center gap-2 px-3 py-2 rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-lg hover:bg-primary/90',
              'transition-all duration-200',
              'animate-in fade-in-0 slide-in-from-bottom-2'
            )}
          >
            <ArrowDown className="w-4 h-4" />
            <span className="text-sm">Scroll to bottom</span>
          </button>
        )}

        {/* Footer */}
        <div
          className={cn(
            'px-5 py-3 border-t flex items-center justify-between',
            config.borderColor,
            config.bgColor
          )}
        >
          {/* Left: Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{process.totalLineCount} lines</span>
            {process.exitCode !== undefined && (
              <span
                className={cn(
                  'font-medium',
                  process.exitCode === 0 ? 'text-green-500' : 'text-red-500'
                )}
              >
                Exit code: {process.exitCode}
              </span>
            )}
            {autoScroll && isRunning && (
              <span className="flex items-center gap-1 text-green-500">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Auto-scrolling
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Stop button (for running processes) */}
            {isRunning && (
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={isStopping}
                className={cn(
                  'h-auto px-3 py-1.5 text-sm',
                  'border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                )}
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Square className="w-4 h-4 mr-2" />
                )}
                Stop
              </Button>
            )}
            {/* Copy button */}
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={outputLines.length === 0}
              className="h-auto px-3 py-1.5 text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  <span>Copy All</span>
                </>
              )}
            </Button>
            {/* Close button */}
            <Button
              variant="secondary"
              onClick={onClose}
              className="h-auto px-4 py-1.5 text-sm"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
