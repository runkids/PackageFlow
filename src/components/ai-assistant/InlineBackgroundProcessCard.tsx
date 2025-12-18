/**
 * InlineBackgroundProcessCard - Lightweight inline card for background processes
 * Feature: AI Assistant Background Process Management (UI Improvement)
 *
 * Displays inline in chat messages showing:
 * - Process status indicator
 * - Last 1-2 output lines
 * - Stop button (for running processes)
 * - View Full Output button
 * - Auto-collapses to one-line summary when completed
 *
 * Follows ActionConfirmationCard styling patterns
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Play,
  Square,
  Terminal,
  CheckCircle,
  XCircle,
  Loader2,
  Maximize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import type { BackgroundProcess, BackgroundProcessStatus } from '../../types/background-process';

interface InlineBackgroundProcessCardProps {
  /** Process data */
  process: BackgroundProcess;
  /** Handler to stop the process */
  onStop: () => Promise<void>;
  /** Handler to open full output dialog */
  onViewFullOutput: () => void;
  /** Optional className */
  className?: string;
}

/** Status configuration for visual styling */
const statusConfig: Record<
  BackgroundProcessStatus,
  {
    label: string;
    icon: React.ElementType;
    border: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    animate?: boolean;
  }
> = {
  starting: {
    label: 'Starting',
    icon: Loader2,
    border: 'border-blue-500/40',
    bg: 'bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500 dark:text-blue-400',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-600 dark:text-blue-400',
    badgeBorder: 'border-blue-500/30',
    animate: true,
  },
  running: {
    label: 'Running',
    icon: Play,
    border: 'border-green-500/40',
    bg: 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent',
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-500 dark:text-green-400',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-600 dark:text-green-400',
    badgeBorder: 'border-green-500/30',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    border: 'border-green-500/40',
    bg: 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent',
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-500 dark:text-green-400',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-600 dark:text-green-400',
    badgeBorder: 'border-green-500/30',
  },
  stopped: {
    label: 'Stopped',
    icon: Square,
    border: 'border-zinc-500/40',
    bg: 'bg-gradient-to-br from-zinc-500/10 via-zinc-500/5 to-transparent',
    iconBg: 'bg-zinc-500/15',
    iconColor: 'text-zinc-500 dark:text-zinc-400',
    badgeBg: 'bg-zinc-500/15',
    badgeText: 'text-zinc-600 dark:text-zinc-400',
    badgeBorder: 'border-zinc-500/30',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    border: 'border-red-500/40',
    bg: 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500 dark:text-red-400',
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-600 dark:text-red-400',
    badgeBorder: 'border-red-500/30',
  },
};

/** Strip ANSI codes from output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Format duration in human readable form */
function formatDuration(startMs: number, endMs?: number): string {
  const end = endMs ?? Date.now();
  const seconds = Math.floor((end - startMs) / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function InlineBackgroundProcessCard({
  process,
  onStop,
  onViewFullOutput,
  className,
}: InlineBackgroundProcessCardProps) {
  const [isStopping, setIsStopping] = useState(false);

  const config = statusConfig[process.status];
  const StatusIcon = config.icon;
  const isRunning = process.status === 'running' || process.status === 'starting';
  const isTerminated = ['completed', 'stopped', 'failed'].includes(process.status);

  // Auto-collapse when terminated
  const [isCollapsed, setIsCollapsed] = useState(isTerminated);

  // Expand/collapse on status change
  useEffect(() => {
    if (isTerminated && !isCollapsed) {
      // Auto-collapse after a short delay when process terminates
      const timer = setTimeout(() => setIsCollapsed(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isTerminated, isCollapsed]);

  // Get last 2 lines of output for preview
  const outputPreview = useMemo(() => {
    const lines = process.outputLines.slice(-2);
    return lines.map((line) => stripAnsi(line.content)).join('\n');
  }, [process.outputLines]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await onStop();
    } finally {
      setIsStopping(false);
    }
  }, [onStop]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Collapsed view - single line summary
  if (isCollapsed && isTerminated) {
    return (
      <button
        onClick={handleToggleCollapse}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'border transition-all duration-200',
          'hover:bg-muted/50 cursor-pointer text-left',
          config.border,
          'bg-card/50',
          className
        )}
      >
        <StatusIcon className={cn('w-4 h-4 flex-shrink-0', config.iconColor)} />
        <span className="text-sm font-medium text-foreground truncate">
          {process.name}
        </span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded', config.badgeBg, config.badgeText)}>
          {config.label}
        </span>
        {process.exitCode !== undefined && process.exitCode !== 0 && (
          <span className="text-xs text-red-500">(exit {process.exitCode})</span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDuration(process.startedAt, process.endedAt)}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
    );
  }

  // Expanded view - full card
  return (
    <div
      className={cn(
        'rounded-xl border-2 overflow-hidden',
        'transition-all duration-200',
        config.border,
        config.bg,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {/* Status Icon */}
        <div
          className={cn(
            'relative p-2 rounded-xl border flex-shrink-0',
            config.iconBg,
            config.iconColor,
            config.border
          )}
        >
          <StatusIcon className={cn('w-4 h-4', config.animate && 'animate-spin')} />
          {/* Pulse indicator for running */}
          {isRunning && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
                'bg-green-400 animate-pulse'
              )}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground truncate">{process.name}</span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                config.badgeBg,
                config.badgeText,
                config.badgeBorder
              )}
            >
              {config.label}
            </span>
            {process.port && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-mono">
                :{process.port}
              </span>
            )}
          </div>

          {/* Project info and duration */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="truncate">
              {process.projectName || process.projectPath.split('/').pop()}
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span>{formatDuration(process.startedAt, process.endedAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Collapse button (only for terminated) */}
          {isTerminated && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleCollapse}
              className="h-7 w-7"
              title="Collapse"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}

          {/* Stop button (for running processes) */}
          {isRunning && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStop}
              disabled={isStopping}
              className="h-7 w-7 hover:bg-red-500/10 hover:text-red-500"
              title="Stop process"
            >
              {isStopping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Output preview */}
      {outputPreview && (
        <div className="px-3 pb-2">
          <pre
            className={cn(
              'text-xs font-mono whitespace-pre-wrap break-all',
              'bg-background/60 rounded-lg p-2 border border-border/50',
              'max-h-16 overflow-hidden relative',
              'text-foreground/70'
            )}
          >
            {outputPreview}
          </pre>
        </div>
      )}

      {/* Footer with View Full button */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-t border-border/30">
        <span className="text-xs text-muted-foreground">
          {process.totalLineCount} lines
          {process.exitCode !== undefined && (
            <span className={process.exitCode === 0 ? 'text-green-500' : 'text-red-500'}>
              {' '}
              | exit {process.exitCode}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewFullOutput}
          className="h-6 text-xs px-2"
        >
          <Maximize2 className="w-3 h-3 mr-1" />
          View Full
        </Button>
      </div>
    </div>
  );
}
