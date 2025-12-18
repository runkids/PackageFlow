/**
 * BackgroundProcessStatusBar - Compact status bar for background processes
 * Feature: AI Assistant Background Process Management (UI Improvement)
 *
 * Displays at bottom of chat area showing:
 * - Running process count
 * - Quick access to show full panel
 * - Stop All button (when multiple running)
 *
 * Hidden when no processes exist
 */

import { useCallback } from 'react';
import { Terminal, ChevronUp, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface BackgroundProcessStatusBarProps {
  /** Number of running processes */
  runningCount: number;
  /** Total number of processes (including completed) */
  totalCount: number;
  /** Whether panel is currently expanded */
  isPanelOpen: boolean;
  /** Toggle panel visibility */
  onTogglePanel: () => void;
  /** Stop all running processes */
  onStopAll: () => Promise<void>;
  /** Optional className */
  className?: string;
}

export function BackgroundProcessStatusBar({
  runningCount,
  totalCount,
  isPanelOpen,
  onTogglePanel,
  onStopAll,
  className,
}: BackgroundProcessStatusBarProps) {
  // Don't render if no processes
  if (totalCount === 0) {
    return null;
  }

  const handleStopAll = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await onStopAll();
    },
    [onStopAll]
  );

  const hasRunning = runningCount > 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5',
        'border-t border-border bg-card/80 backdrop-blur-sm',
        'cursor-pointer hover:bg-muted/30 transition-colors',
        className
      )}
      onClick={onTogglePanel}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTogglePanel();
        }
      }}
    >
      {/* Left: Status indicator */}
      <div className="flex items-center gap-2">
        {/* Icon with pulse animation when running */}
        <div className="relative">
          <Terminal
            className={cn('w-4 h-4', hasRunning ? 'text-green-500' : 'text-muted-foreground')}
          />
          {hasRunning && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>

        {/* Status text */}
        <span className="text-sm text-foreground">
          {hasRunning ? (
            <>
              <span className="font-medium">{runningCount}</span>
              <span className="text-muted-foreground">
                {' '}
                running process{runningCount > 1 ? 'es' : ''}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {totalCount} completed process{totalCount > 1 ? 'es' : ''}
            </span>
          )}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Stop All button (only when running) */}
        {hasRunning && runningCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStopAll}
            className="h-6 px-2 text-xs hover:bg-red-500/10 hover:text-red-500"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop All
          </Button>
        )}

        {/* Toggle panel button */}
        <Button variant="ghost" size="sm" onClick={onTogglePanel} className="h-6 px-2 text-xs">
          <ChevronUp
            className={cn('w-4 h-4 transition-transform', isPanelOpen && 'rotate-180')}
          />
          <span className="ml-1">{isPanelOpen ? 'Hide' : 'Show'}</span>
        </Button>
      </div>
    </div>
  );
}
