/**
 * BackgroundProcessCard - Display a single background process
 * Feature: AI Assistant Background Process Management
 *
 * Shows process status, name, last output line, and actions
 * Follows ActionConfirmationCard styling patterns
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Square,
  Play,
  Terminal,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Maximize2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import type {
  BackgroundProcess,
  BackgroundProcessStatus,
} from '../../../types/background-process';

interface BackgroundProcessCardProps {
  /** Process data */
  process: BackgroundProcess;
  /** Whether this card is selected/active */
  isSelected?: boolean;
  /** Handler to stop the process */
  onStop: (processId: string) => Promise<boolean | void>;
  /** Handler to select this process */
  onSelect: (processId: string) => void;
  /** Handler to open full output dialog */
  onViewFullOutput: (processId: string) => void;
  /** Handler to remove completed process */
  onRemove?: (processId: string) => void;
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
    pulseColor?: string;
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
    pulseColor: 'bg-blue-400',
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
    pulseColor: 'bg-green-400',
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
};

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

/** Strip ANSI codes from output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function BackgroundProcessCard({
  process,
  isSelected = false,
  onStop,
  onSelect,
  onViewFullOutput,
  onRemove,
  className,
}: BackgroundProcessCardProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = statusConfig[process.status];
  const StatusIcon = config.icon;
  const isRunning = process.status === 'running' || process.status === 'starting';
  const isTerminated = process.status === 'stopped' || process.status === 'failed' || process.status === 'completed';

  // Get last few lines of output for preview
  const outputPreview = useMemo(() => {
    const lines = process.outputLines.slice(-3);
    return lines.map((line) => stripAnsi(line.content)).join('\n');
  }, [process.outputLines]);

  // Get last line for collapsed view
  const lastOutputLine = useMemo(() => {
    const lastLine = process.outputLines[process.outputLines.length - 1];
    if (!lastLine) return null;
    return stripAnsi(lastLine.content).slice(0, 100);
  }, [process.outputLines]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await onStop(process.id);
    } finally {
      setIsStopping(false);
    }
  }, [onStop, process.id]);

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(process.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [process.command]);

  const handleCardClick = useCallback(() => {
    onSelect(process.id);
  }, [onSelect, process.id]);

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'rounded-xl border-2 transition-all duration-200',
        'cursor-pointer hover:shadow-md',
        config.border,
        config.bg,
        isSelected && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
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
          <StatusIcon
            className={cn(
              'w-4 h-4',
              process.status === 'starting' && 'animate-spin'
            )}
          />
          {/* Pulse indicator for running processes */}
          {config.pulseColor && isRunning && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
                config.pulseColor,
                'animate-pulse'
              )}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">
              {process.name}
            </span>
            {/* Status badge */}
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
            {/* Port badge */}
            {process.port && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-mono">
                :{process.port}
              </span>
            )}
          </div>

          {/* Project info */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Terminal className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {process.projectName || process.projectPath.split('/').pop()}
            </span>
            <span className="text-muted-foreground/50">|</span>
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{formatDuration(process.startedAt, process.endedAt)}</span>
          </div>

          {/* Last output line (collapsed preview) */}
          {lastOutputLine && !isExpanded && (
            <div className="mt-2 p-2 rounded-lg bg-background/50 border border-border/50">
              <code className="text-xs text-muted-foreground font-mono line-clamp-1">
                {lastOutputLine}
              </code>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleExpand}
            className="h-8 w-8"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>

          {/* Stop button (for running processes) */}
          {isRunning && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleStop();
              }}
              disabled={isStopping}
              className="h-8 w-8 hover:bg-red-500/10 hover:text-red-500"
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

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/50">
          {/* Command */}
          <div className="px-3 py-2 flex items-center gap-2 bg-muted/30">
            <code className="flex-1 text-xs font-mono text-foreground/80 truncate">
              {process.command}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyCommand();
              }}
              className="h-6 w-6 flex-shrink-0"
              title="Copy command"
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>

          {/* Output preview */}
          {outputPreview && (
            <div className="p-3">
              <pre
                className={cn(
                  'text-xs font-mono whitespace-pre-wrap break-all',
                  'bg-background/80 rounded-lg p-3 border border-border',
                  'max-h-32 overflow-hidden relative'
                )}
              >
                {outputPreview}
              </pre>
              {process.totalLineCount > 3 && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/90 to-transparent pointer-events-none rounded-b-lg" />
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{process.totalLineCount} lines</span>
              {process.exitCode !== undefined && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span
                    className={cn(
                      process.exitCode === 0 ? 'text-green-500' : 'text-red-500'
                    )}
                  >
                    Exit: {process.exitCode}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewFullOutput(process.id);
                }}
                className="h-7 text-xs"
              >
                <Maximize2 className="w-3 h-3 mr-1.5" />
                View Full Output
              </Button>
              {isTerminated && onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(process.id);
                  }}
                  className="h-7 text-xs text-muted-foreground hover:text-red-500"
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>

          {/* Error message for failed processes */}
          {process.status === 'failed' && process.exitCode !== undefined && (
            <div className="px-3 py-2 bg-red-500/5 border-t border-red-500/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-600 dark:text-red-400">
                Process exited with code {process.exitCode}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
