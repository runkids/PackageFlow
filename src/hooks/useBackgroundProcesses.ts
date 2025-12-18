/**
 * useBackgroundProcesses - State management for AI Assistant background processes
 * Feature: AI Assistant Background Process Management
 *
 * Manages:
 * - Process lifecycle (spawn, stop, remove)
 * - Output streaming
 * - Panel state
 * - Process selection
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BackgroundProcess,
  SpawnProcessRequest,
  PanelState,
  ProcessOutputPayload,
  ProcessStatusPayload,
  ProcessOutputLine,
  UseBackgroundProcessesReturn,
} from '../types/background-process';

// Backend payload types (different from frontend types)
interface BackendOutputLine {
  content: string;
  stream: string;
  timestamp: string; // ISO 8601
}

interface BackendProcessOutputPayload {
  processId: string;
  conversationId?: string;
  output: BackendOutputLine[];
}

interface BackendProcessStatusPayload {
  processId: string;
  conversationId?: string;
  status: string; // starting | running | completed | failed | stopped | timed_out
  exitCode?: number;
  patternMatched: boolean;
}

interface BackendProcessStartedPayload {
  processId: string;
  name: string;
  command: string;
  cwd: string;
  projectPath: string;
  projectName?: string;
  status: string;
  startedAt: string; // ISO 8601
  conversationId?: string;
  messageId?: string;
}

// Maximum output lines to keep in memory per process
const MAX_OUTPUT_LINES = 5000;

// Storage key for panel state
const PANEL_STATE_KEY = 'ai-assistant-process-panel-state';

/**
 * Hook for managing background processes
 */
export function useBackgroundProcesses(): UseBackgroundProcessesReturn {
  // Process state
  const [processes, setProcesses] = useState<Map<string, BackgroundProcess>>(new Map());
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  // Panel state with persistence
  const [panelState, setPanelStateInternal] = useState<PanelState>(() => {
    try {
      const saved = localStorage.getItem(PANEL_STATE_KEY);
      return (saved as PanelState) || 'collapsed';
    } catch {
      return 'collapsed';
    }
  });

  // Event listener cleanup refs
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenStatusRef = useRef<UnlistenFn | null>(null);
  const unlistenStartedRef = useRef<UnlistenFn | null>(null);

  // Persist panel state
  const setPanelState = useCallback((state: PanelState) => {
    setPanelStateInternal(state);
    try {
      localStorage.setItem(PANEL_STATE_KEY, state);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Convenience methods for panel
  const expandPanel = useCallback(() => setPanelState('expanded'), [setPanelState]);
  const collapsePanel = useCallback(() => setPanelState('collapsed'), [setPanelState]);

  // Generate unique output line ID
  const generateLineId = useCallback((processId: string, index: number) => {
    return `${processId}-${index}-${Date.now()}`;
  }, []);

  // Handle incoming output
  const handleProcessOutput = useCallback((payload: ProcessOutputPayload) => {
    setProcesses((prev) => {
      const process = prev.get(payload.processId);
      if (!process) return prev;

      const newLine: ProcessOutputLine = {
        id: generateLineId(payload.processId, process.totalLineCount),
        content: payload.content,
        stream: payload.stream,
        timestamp: payload.timestamp,
      };

      // Keep only MAX_OUTPUT_LINES
      const newOutputLines = [...process.outputLines, newLine];
      if (newOutputLines.length > MAX_OUTPUT_LINES) {
        newOutputLines.splice(0, newOutputLines.length - MAX_OUTPUT_LINES);
      }

      const next = new Map(prev);
      next.set(payload.processId, {
        ...process,
        outputLines: newOutputLines,
        totalLineCount: process.totalLineCount + 1,
      });
      return next;
    });
  }, [generateLineId]);

  // Handle status changes
  const handleStatusChange = useCallback((payload: ProcessStatusPayload) => {
    setProcesses((prev) => {
      const process = prev.get(payload.processId);
      if (!process) return prev;

      const next = new Map(prev);
      next.set(payload.processId, {
        ...process,
        status: payload.status,
        exitCode: payload.exitCode,
        endedAt: payload.status !== 'running' && payload.status !== 'starting'
          ? payload.timestamp
          : undefined,
      });
      return next;
    });
  }, []);

  // Setup event listeners
  useEffect(() => {
    let isMounted = true;

    const setupListeners = async () => {
      // Listen for process output events (batched)
      unlistenOutputRef.current = await listen<BackendProcessOutputPayload>(
        'ai:background-process-output',
        (event) => {
          if (isMounted) {
            // Backend sends batched output, process each line
            const { processId, output } = event.payload;
            for (const line of output) {
              handleProcessOutput({
                processId,
                content: line.content,
                stream: line.stream as 'stdout' | 'stderr',
                timestamp: new Date(line.timestamp).getTime(),
              });
            }
          }
        }
      );

      // Listen for process status events
      unlistenStatusRef.current = await listen<BackendProcessStatusPayload>(
        'ai:background-process-status',
        (event) => {
          if (isMounted) {
            // Map backend status to frontend status
            const statusMap: Record<string, ProcessStatusPayload['status']> = {
              starting: 'starting',
              running: 'running',
              completed: 'completed',
              failed: 'failed',
              stopped: 'stopped',
              timed_out: 'failed', // Map timed_out to failed for simplicity
            };
            handleStatusChange({
              processId: event.payload.processId,
              status: statusMap[event.payload.status] || 'failed',
              exitCode: event.payload.exitCode,
              timestamp: Date.now(),
            });
          }
        }
      );

      // Listen for process started events (creates new process entry)
      unlistenStartedRef.current = await listen<BackendProcessStartedPayload>(
        'ai:background-process-started',
        (event) => {
          if (isMounted) {
            const payload = event.payload;
            console.log('[useBackgroundProcesses] Process started event:', payload.processId);

            // Map backend status to frontend status
            const statusMap: Record<string, BackgroundProcess['status']> = {
              starting: 'starting',
              running: 'running',
              completed: 'completed',
              failed: 'failed',
              stopped: 'stopped',
            };

            // Create new process entry
            const newProcess: BackgroundProcess = {
              id: payload.processId,
              name: payload.name,
              command: payload.command,
              cwd: payload.cwd,
              projectPath: payload.projectPath,
              projectName: payload.projectName,
              status: statusMap[payload.status] || 'starting',
              startedAt: new Date(payload.startedAt).getTime(),
              outputLines: [],
              totalLineCount: 0,
              autoScroll: true,
              conversationId: payload.conversationId,
              messageId: payload.messageId,
            };

            setProcesses((prev) => {
              const next = new Map(prev);
              next.set(payload.processId, newProcess);
              return next;
            });

            // Select the new process (panel stays collapsed - user can expand manually)
            setSelectedProcessId(payload.processId);
          }
        }
      );
    };

    setupListeners();

    return () => {
      isMounted = false;
      unlistenOutputRef.current?.();
      unlistenStatusRef.current?.();
      unlistenStartedRef.current?.();
    };
  }, [handleProcessOutput, handleStatusChange, setPanelState]);

  // Spawn a new process
  const spawnProcess = useCallback(async (request: SpawnProcessRequest): Promise<string | null> => {
    try {
      const response = await invoke<{ success: boolean; processId?: string; error?: string }>(
        'ai_assistant_spawn_background_process',
        { request }
      );

      if (!response.success || !response.processId) {
        console.error('[useBackgroundProcesses] Failed to spawn:', response.error);
        return null;
      }

      const processId = response.processId;

      // Create initial process entry
      const newProcess: BackgroundProcess = {
        id: processId,
        name: request.name,
        command: `${request.command} ${request.args.join(' ')}`.trim(),
        cwd: request.cwd,
        projectPath: request.projectPath,
        projectName: request.projectName,
        status: 'starting',
        startedAt: Date.now(),
        outputLines: [],
        totalLineCount: 0,
        autoScroll: true,
        conversationId: request.conversationId,
        messageId: request.messageId,
      };

      setProcesses((prev) => {
        const next = new Map(prev);
        next.set(processId, newProcess);
        return next;
      });

      // Select the new process (panel stays collapsed - user can expand manually)
      setSelectedProcessId(processId);

      return processId;
    } catch (err) {
      console.error('[useBackgroundProcesses] Error spawning process:', err);
      return null;
    }
  }, [setPanelState]);

  // Stop a process
  const stopProcess = useCallback(async (processId: string): Promise<boolean> => {
    try {
      const response = await invoke<{ success: boolean; error?: string }>(
        'ai_assistant_stop_background_process',
        { processId }
      );

      if (!response.success) {
        console.error('[useBackgroundProcesses] Failed to stop:', response.error);
        return false;
      }

      // Update status locally (event listener will also update, but this is faster)
      setProcesses((prev) => {
        const process = prev.get(processId);
        if (!process) return prev;

        const next = new Map(prev);
        next.set(processId, {
          ...process,
          status: 'stopped',
          endedAt: Date.now(),
        });
        return next;
      });

      return true;
    } catch (err) {
      console.error('[useBackgroundProcesses] Error stopping process:', err);
      return false;
    }
  }, []);

  // Stop all running processes
  const stopAllProcesses = useCallback(async (): Promise<void> => {
    const runningIds = Array.from(processes.entries())
      .filter(([_, p]) => p.status === 'running' || p.status === 'starting')
      .map(([id]) => id);

    await Promise.all(runningIds.map((id) => stopProcess(id)));
  }, [processes, stopProcess]);

  // Select a process
  const selectProcess = useCallback((processId: string | null) => {
    setSelectedProcessId(processId);
  }, []);

  // Remove a process from the list
  const removeProcess = useCallback((processId: string) => {
    setProcesses((prev) => {
      const next = new Map(prev);
      next.delete(processId);
      return next;
    });

    // If removed process was selected, select another
    if (selectedProcessId === processId) {
      const remaining = Array.from(processes.keys()).filter((id) => id !== processId);
      setSelectedProcessId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  }, [selectedProcessId, processes]);

  // Clear all completed/stopped/failed processes
  const clearCompletedProcesses = useCallback(() => {
    setProcesses((prev) => {
      const next = new Map(prev);
      for (const [id, process] of next) {
        if (
          process.status === 'completed' ||
          process.status === 'stopped' ||
          process.status === 'failed'
        ) {
          next.delete(id);
        }
      }
      return next;
    });

    // Update selected if it was removed
    const process = processes.get(selectedProcessId || '');
    if (
      process &&
      (process.status === 'completed' ||
        process.status === 'stopped' ||
        process.status === 'failed')
    ) {
      const remaining = Array.from(processes.entries())
        .filter(([_, p]) => p.status === 'running' || p.status === 'starting')
        .map(([id]) => id);
      setSelectedProcessId(remaining.length > 0 ? remaining[0] : null);
    }
  }, [processes, selectedProcessId]);

  // Toggle auto-scroll for a process
  const toggleAutoScroll = useCallback((processId: string) => {
    setProcesses((prev) => {
      const process = prev.get(processId);
      if (!process) return prev;

      const next = new Map(prev);
      next.set(processId, {
        ...process,
        autoScroll: !process.autoScroll,
      });
      return next;
    });
  }, []);

  // Computed values
  const runningCount = useMemo(() => {
    return Array.from(processes.values()).filter(
      (p) => p.status === 'running' || p.status === 'starting'
    ).length;
  }, [processes]);

  const hasRunningProcesses = runningCount > 0;

  const getProcessById = useCallback(
    (id: string): BackgroundProcess | undefined => {
      return processes.get(id);
    },
    [processes]
  );

  // Get process by message ID (for inline cards in chat)
  const getProcessByMessageId = useCallback(
    (messageId: string): BackgroundProcess | undefined => {
      for (const process of processes.values()) {
        if (process.messageId === messageId) {
          return process;
        }
      }
      return undefined;
    },
    [processes]
  );

  return {
    // State
    processes,
    selectedProcessId,
    panelState,

    // Actions
    spawnProcess,
    stopProcess,
    stopAllProcesses,
    selectProcess,
    removeProcess,
    clearCompletedProcesses,
    toggleAutoScroll,

    // Panel state
    setPanelState,
    expandPanel,
    collapsePanel,

    // Computed
    runningCount,
    hasRunningProcesses,
    getProcessById,
    getProcessByMessageId,
  };
}
