/**
 * BackgroundProcessPanel - Collapsible panel showing all background processes
 * Feature: AI Assistant Background Process Management
 *
 * Located at the bottom of the chat area (like IDE Terminal Panel)
 * Shows list of running/completed processes with actions
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Terminal,
  Square,
  Play,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { BackgroundProcessCard } from './BackgroundProcessCard';
import type {
  BackgroundProcess,
  PanelState,
} from '../../../types/background-process';

interface BackgroundProcessPanelProps {
  /** Map of all processes */
  processes: Map<string, BackgroundProcess>;
  /** Currently selected process ID */
  selectedProcessId: string | null;
  /** Panel expansion state */
  panelState: PanelState;
  /** Handler to change panel state */
  onPanelStateChange: (state: PanelState) => void;
  /** Handler to select a process */
  onSelectProcess: (processId: string | null) => void;
  /** Handler to stop a process */
  onStopProcess: (processId: string) => Promise<boolean | void>;
  /** Handler to stop all running processes */
  onStopAllProcesses: () => Promise<void>;
  /** Handler to remove a completed process */
  onRemoveProcess: (processId: string) => void;
  /** Handler to clear all completed processes */
  onClearCompleted: () => void;
  /** Handler to view full output of a process */
  onViewFullOutput: (processId: string) => void;
  /** Optional className */
  className?: string;
}

// Height constraints
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 500;
const COLLAPSED_HEIGHT = 40;
const DEFAULT_HEIGHT = 300;

// Storage key for persisting height
const HEIGHT_STORAGE_KEY = 'ai-assistant-process-panel-height';

export function BackgroundProcessPanel({
  processes,
  selectedProcessId,
  panelState,
  onPanelStateChange,
  onSelectProcess,
  onStopProcess,
  onStopAllProcesses,
  onRemoveProcess,
  onClearCompleted,
  onViewFullOutput,
  className,
}: BackgroundProcessPanelProps) {
  // Persisted height
  const [height, setHeight] = useState(() => {
    try {
      const saved = localStorage.getItem(HEIGHT_STORAGE_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_HEIGHT;
    } catch {
      return DEFAULT_HEIGHT;
    }
  });

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert processes map to array, sorted by start time (newest first)
  const processList = useMemo(() => {
    return Array.from(processes.values()).sort((a, b) => b.startedAt - a.startedAt);
  }, [processes]);

  // Count running processes
  const runningCount = useMemo(() => {
    return processList.filter(
      (p) => p.status === 'running' || p.status === 'starting'
    ).length;
  }, [processList]);

  // Count completed/stopped/failed processes
  const completedCount = useMemo(() => {
    return processList.filter(
      (p) => p.status === 'completed' || p.status === 'stopped' || p.status === 'failed'
    ).length;
  }, [processList]);

  // Persist height
  useEffect(() => {
    try {
      localStorage.setItem(HEIGHT_STORAGE_KEY, String(height));
    } catch {
      // Ignore storage errors
    }
  }, [height]);

  // Handle resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = height;
    },
    [height]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY;
      const newHeight = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, startHeightRef.current + delta)
      );
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Toggle collapse
  const handleToggleCollapse = useCallback(() => {
    onPanelStateChange(panelState === 'collapsed' ? 'expanded' : 'collapsed');
  }, [panelState, onPanelStateChange]);

  // Stop all running processes
  const handleStopAll = useCallback(async () => {
    setIsStoppingAll(true);
    try {
      await onStopAllProcesses();
    } finally {
      setIsStoppingAll(false);
    }
  }, [onStopAllProcesses]);

  // Don't render if no processes
  if (processes.size === 0) {
    return null;
  }

  const isCollapsed = panelState === 'collapsed';
  const isExpanded = panelState === 'expanded';

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col border-t border-border bg-card',
        isResizing && 'select-none',
        className
      )}
      style={{ height: isCollapsed ? COLLAPSED_HEIGHT : height }}
    >
      {/* Resize Handle - only show when expanded */}
      {isExpanded && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'h-1.5 cursor-ns-resize bg-secondary hover:bg-primary/50 transition-colors',
            'flex items-center justify-center group',
            isResizing && 'bg-primary/50'
          )}
        >
          <GripHorizontal className="w-8 h-3 text-muted-foreground/50 group-hover:text-primary/50" />
        </div>
      )}

      {/* Header */}
      <div className="h-10 flex items-center px-3 bg-card border-b border-border/50 select-none">
        {/* Icon and Title */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Background Processes
          </span>
          {/* Running count badge */}
          {runningCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {runningCount} running
            </span>
          )}
          {/* Total count */}
          {processes.size > runningCount && (
            <span className="text-xs text-muted-foreground">
              ({processes.size} total)
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Stop All (only show when expanded and has running) */}
          {!isCollapsed && runningCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStopAll}
              disabled={isStoppingAll}
              className="h-7 px-2 text-xs hover:bg-red-500/10 hover:text-red-500"
              title="Stop all running processes"
            >
              {isStoppingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Square className="w-3.5 h-3.5 mr-1.5" />
              )}
              Stop All
            </Button>
          )}

          {/* Clear Completed (only show when has completed) */}
          {!isCollapsed && completedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCompleted}
              className="h-7 px-2 text-xs"
              title="Clear completed processes"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear ({completedCount})
            </Button>
          )}

          {/* Collapse/Expand Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleCollapse}
            className="h-7 w-7"
            title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {isCollapsed ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {/* Process List - only show when expanded */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {processList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Terminal className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No background processes</p>
            </div>
          ) : (
            processList.map((process) => (
              <BackgroundProcessCard
                key={process.id}
                process={process}
                isSelected={process.id === selectedProcessId}
                onStop={onStopProcess}
                onSelect={onSelectProcess}
                onViewFullOutput={onViewFullOutput}
                onRemove={onRemoveProcess}
              />
            ))
          )}
        </div>
      )}

      {/* Collapsed summary - show last active process */}
      {isCollapsed && processList.length > 0 && (
        <div className="flex-1 flex items-center px-3 overflow-hidden">
          {runningCount > 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
              <Play className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <span className="truncate">
                {processList.find((p) => p.status === 'running')?.name || 'Process running'}
              </span>
              {runningCount > 1 && (
                <span className="text-xs text-muted-foreground/70">
                  +{runningCount - 1} more
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
              <span>{processes.size} process{processes.size > 1 ? 'es' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
