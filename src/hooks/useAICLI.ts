/**
 * AI CLI Hook
 * Manages AI CLI tool execution with streaming output
 * Feature: AI CLI Integration (020-ai-cli-integration)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { aiCLIAPI, aiCLIEvents, type UnlistenFn } from '../lib/tauri-api';
import type {
  CLIToolType,
  CLIToolConfig,
  DetectedCLITool,
  AICLIExecuteRequest,
  AICLIExecuteResult,
  AICLIOutputEvent,
  AICLIContext,
  AICLIOptions,
} from '../types/ai';

/** Output line for display */
export interface AICLIOutputLine {
  content: string;
  stream: 'stdout' | 'stderr' | 'status';
  timestamp: string;
}

/** Execution state */
export type AICLIExecutionState = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Hook state */
interface UseAICLIState {
  /** Current execution state */
  state: AICLIExecutionState;
  /** Current execution ID */
  executionId: string | null;
  /** Output lines for display */
  outputLines: AICLIOutputLine[];
  /** Error message if any */
  error: string | null;
  /** Execution duration in ms */
  durationMs: number | null;
  /** Exit code if completed */
  exitCode: number | null;
}

/** Hook return type */
interface UseAICLIReturn extends UseAICLIState {
  /** Execute a CLI command */
  execute: (
    tool: CLIToolType,
    prompt: string,
    projectPath: string,
    options?: {
      model?: string;
      context?: AICLIContext;
      cliOptions?: AICLIOptions;
    }
  ) => Promise<AICLIExecuteResult | null>;
  /** Cancel current execution */
  cancel: () => Promise<boolean>;
  /** Clear output */
  clearOutput: () => void;
  /** Whether currently running */
  isRunning: boolean;
}

/** Detected tools cache */
interface DetectedToolsState {
  tools: DetectedCLITool[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing AI CLI tool execution
 */
export function useAICLI(): UseAICLIReturn {
  const [state, setState] = useState<UseAICLIState>({
    state: 'idle',
    executionId: null,
    outputLines: [],
    error: null,
    durationMs: null,
    exitCode: null,
  });

  const unlistenRef = useRef<UnlistenFn | null>(null);
  const executionIdRef = useRef<string | null>(null);

  // Setup event listener for streaming output
  useEffect(() => {
    let isMounted = true;

    const setupListener = async () => {
      try {
        const unlisten = await aiCLIEvents.onOutput((event: AICLIOutputEvent) => {
          if (!isMounted) return;

          // Accept events when:
          // 1. We don't have an execution ID yet (first events during execution)
          // 2. The event's execution ID matches our stored ID
          // This fixes the timing issue where events arrive before execute() returns
          if (executionIdRef.current === null) {
            // First event during execution - capture the execution ID
            executionIdRef.current = event.executionId;
            console.log('[useAICLI] Captured execution ID from first event:', event.executionId);
          } else if (event.executionId !== executionIdRef.current) {
            // Event from a different execution - ignore
            return;
          }

          setState((prev) => ({
            ...prev,
            executionId: executionIdRef.current,
            outputLines: [
              ...prev.outputLines,
              {
                content: event.content,
                stream: event.outputType,
                timestamp: event.timestamp,
              },
            ],
            // Mark as completed if final
            state: event.isFinal ? (prev.exitCode === 0 ? 'completed' : 'failed') : prev.state,
          }));
        });

        if (isMounted) {
          unlistenRef.current = unlisten;
        } else {
          // Component unmounted before listener was set up
          unlisten();
        }
      } catch (err) {
        console.error('[useAICLI] Failed to setup event listener:', err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlistenRef.current) {
        try {
          unlistenRef.current();
        } catch (err) {
          console.error('[useAICLI] Error during cleanup:', err);
        }
        unlistenRef.current = null;
      }
    };
  }, []);

  const execute = useCallback(
    async (
      tool: CLIToolType,
      prompt: string,
      projectPath: string,
      options?: {
        model?: string;
        context?: AICLIContext;
        cliOptions?: AICLIOptions;
      }
    ): Promise<AICLIExecuteResult | null> => {
      // Reset state and execution ID ref for new execution
      executionIdRef.current = null;
      setState({
        state: 'running',
        executionId: null,
        outputLines: [],
        error: null,
        durationMs: null,
        exitCode: null,
      });

      const request: AICLIExecuteRequest = {
        tool,
        prompt,
        projectPath,
        model: options?.model,
        context: options?.context,
        options: options?.cliOptions,
      };

      console.log('[useAICLI] Executing request:', request);

      try {
        const response = await aiCLIAPI.execute(request);
        console.log('[useAICLI] Response:', response);

        if (!response.success || !response.data) {
          console.error('[useAICLI] Execution failed:', response.error);
          setState((prev) => ({
            ...prev,
            state: 'failed',
            error: response.error || 'Unknown error',
          }));
          return null;
        }

        const result = response.data;
        executionIdRef.current = result.executionId;

        setState((prev) => ({
          ...prev,
          executionId: result.executionId,
          exitCode: result.exitCode ?? null,
          durationMs: result.durationMs ?? null,
          state: result.cancelled
            ? 'cancelled'
            : result.exitCode === 0
              ? 'completed'
              : 'failed',
        }));

        return result;
      } catch (err) {
        console.error('[useAICLI] Exception during execution:', err);
        const errorMessage = err instanceof Error ? err.message : 'Execution failed';
        setState((prev) => ({
          ...prev,
          state: 'failed',
          error: errorMessage,
        }));
        return null;
      }
    },
    []
  );

  const cancel = useCallback(async (): Promise<boolean> => {
    if (!executionIdRef.current) return false;

    try {
      const response = await aiCLIAPI.cancel(executionIdRef.current);
      if (response.success && response.data) {
        setState((prev) => ({
          ...prev,
          state: 'cancelled',
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const clearOutput = useCallback(() => {
    setState({
      state: 'idle',
      executionId: null,
      outputLines: [],
      error: null,
      durationMs: null,
      exitCode: null,
    });
    executionIdRef.current = null;
  }, []);

  return {
    ...state,
    execute,
    cancel,
    clearOutput,
    isRunning: state.state === 'running',
  };
}

/**
 * Hook for detecting available AI CLI tools
 */
export function useDetectedCLITools(): DetectedToolsState & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<DetectedToolsState>({
    tools: [],
    loading: true,
    error: null,
  });

  const detectTools = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await aiCLIAPI.detectTools();
      if (response.success && response.data) {
        setState({
          tools: response.data,
          loading: false,
          error: null,
        });
      } else {
        setState({
          tools: [],
          loading: false,
          error: response.error || 'Failed to detect tools',
        });
      }
    } catch (err) {
      setState({
        tools: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to detect tools',
      });
    }
  }, []);

  useEffect(() => {
    detectTools();
  }, [detectTools]);

  return {
    ...state,
    refresh: detectTools,
  };
}

/**
 * Hook for managing AI CLI with per-project state integration
 * Combines execution with history management
 */
export function useAICLIWithProject(projectPath: string | undefined): UseAICLIReturn & {
  /** Current project path */
  projectPath: string | undefined;
} {
  const baseHook = useAICLI();

  return {
    ...baseHook,
    projectPath,
  };
}

/**
 * Hook for managing CLI tool configurations
 */
export function useCLIToolConfigs(): {
  configs: CLIToolConfig[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveConfig: (config: CLIToolConfig) => Promise<boolean>;
  deleteConfig: (id: string) => Promise<boolean>;
} {
  const [configs, setConfigs] = useState<CLIToolConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await aiCLIAPI.listTools();
      if (response.success && response.data) {
        setConfigs(response.data);
      } else {
        setError(response.error || 'Failed to load configs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const saveConfig = useCallback(async (config: CLIToolConfig): Promise<boolean> => {
    try {
      const response = await aiCLIAPI.saveTool(config);
      if (response.success) {
        await loadConfigs();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [loadConfigs]);

  const deleteConfig = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await aiCLIAPI.deleteTool(id);
      if (response.success) {
        await loadConfigs();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [loadConfigs]);

  return {
    configs,
    loading,
    error,
    refresh: loadConfigs,
    saveConfig,
    deleteConfig,
  };
}
