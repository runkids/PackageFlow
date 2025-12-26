/**
 * Script execution state management hook
 * @see specs/002-frontend-project-manager/spec.md - US2
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  scriptAPI,
  tauriEvents,
  type ExecuteScriptParams,
  type ScriptOutputPayload,
  type ScriptCompletedPayload,
  type UnlistenFn,
} from '../lib/tauri-api';

export interface RunningScript {
  executionId: string;
  scriptName: string;
  projectName?: string;
  projectPath: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  port?: number; // Detected port from output
}

// Performance optimization: Output memory limit (512KB)
const MAX_OUTPUT_SIZE = 512 * 1024;

// Performance optimization: Port detection overlap region
const PORT_DETECTION_OVERLAP = 200;

// Performance optimization: Compile regex patterns once at module scope
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

// High priority patterns - actual running server URLs
const URL_PATTERNS = [
  // Vite specific: "Local: http://localhost:5174/"
  /Local:\s+(?:http|https):\/\/[^:]+:(\d{4,5})/gi,
  // Next.js: "- Local: http://localhost:3000"
  /-\s*Local:\s+(?:http|https):\/\/[^:]+:(\d{4,5})/gi,
  // General URL patterns (localhost, 127.0.0.1, 0.0.0.0)
  /(?:http|https):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/gi,
];

// Low priority patterns - may match "port in use" messages
const FALLBACK_PATTERNS = [
  // Next.js: "started server on 0.0.0.0:3000"
  /started\s+server\s+on\s+[\d.]+:(\d{4,5})/gi,
  // "listening on port 3000" style
  /(?:listening|running|started|server|ready)\s+(?:on|at)\s+(?:port\s+)?(\d{4,5})/gi,
  // "port 3000" or ":3000" standalone with context
  /(?:on|at|port)\s*:?\s*(\d{4,5})\b/gi,
];

// Strip ANSI escape codes from output for pattern matching
function stripAnsi(str: string): string {
  return str.replace(ANSI_ESCAPE_PATTERN, '');
}

/**
 * Helper function to extract port from output
 * Prioritizes specific URL patterns over generic "port" mentions
 *
 * Performance optimization:
 * - Only searches searchRegion (new chunk + overlap) instead of entire output
 * - Returns early if port already detected
 */
function extractPortFromOutput(
  searchRegion: string,
  existingPort?: number
): number | undefined {
  // If port already detected, skip searching
  if (existingPort !== undefined) {
    return existingPort;
  }

  // Strip ANSI codes first for cleaner matching
  const cleanOutput = stripAnsi(searchRegion);

  // First try high priority URL patterns - take the LAST match (most recent)
  let lastUrlPort: number | undefined;
  for (const pattern of URL_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(cleanOutput)) !== null) {
      if (match[1]) {
        const port = parseInt(match[1], 10);
        if (port >= 1024 && port <= 65535) {
          lastUrlPort = port;
        }
      }
    }
  }

  // If we found a URL port, use it (most reliable)
  if (lastUrlPort !== undefined) {
    return lastUrlPort;
  }

  // Fall back to other patterns only if no URL was found
  for (const pattern of FALLBACK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(cleanOutput)) !== null) {
      if (match[1]) {
        const port = parseInt(match[1], 10);
        if (port >= 1024 && port <= 65535) {
          return port;
        }
      }
    }
  }

  return undefined;
}

/**
 * Append new output to existing output with memory limit
 * Keeps the most recent content within MAX_OUTPUT_SIZE
 */
function appendOutputWithLimit(existingOutput: string, newChunk: string): string {
  const combined = existingOutput + newChunk;
  if (combined.length > MAX_OUTPUT_SIZE) {
    return combined.slice(-MAX_OUTPUT_SIZE);
  }
  return combined;
}

/**
 * Get search region for port detection: overlap from existing + new chunk
 */
function getPortSearchRegion(existingOutput: string, newChunk: string): string {
  const overlapStart = Math.max(0, existingOutput.length - PORT_DETECTION_OVERLAP);
  return existingOutput.slice(overlapStart) + newChunk;
}

interface UseScriptExecutionReturn {
  runningScripts: Map<string, RunningScript>;
  activeExecutionId: string | null;

  executeScript: (params: ExecuteScriptParams & { projectName?: string }) => Promise<string | null>;
  cancelScript: (executionId: string) => Promise<boolean>;
  setActiveExecution: (executionId: string | null) => void;
  registerExternalExecution: (
    executionId: string,
    scriptName: string,
    projectPath: string,
    projectName?: string
  ) => void;
  clearOutput: (executionId: string) => Promise<void>;
  clearAllOutputs: () => void;

  // Feature 008: stdin interaction
  writeToStdin: (executionId: string, input: string) => Promise<boolean>;
  sendInterrupt: (executionId: string) => Promise<boolean>;

  // Feature 008: PTY integration - register PTY sessions for icon state and port detection
  registerPtyExecution: (
    sessionId: string,
    scriptName: string,
    projectPath: string,
    projectName?: string
  ) => void;
  updatePtyOutput: (sessionId: string, output: string) => void;
  updatePtyStatus: (
    sessionId: string,
    status: 'running' | 'completed' | 'failed',
    exitCode?: number
  ) => void;
  removePtyExecution: (sessionId: string) => void;

  // Feature 008: Kill all PTY sessions (for "Stop All Processes")
  killAllPtySignal: number;
  triggerKillAllPty: () => void;
  // Direct kill function registration (for beforeunload sync call)
  registerKillAllPtyFn: (fn: () => void) => void;
  killAllPtyDirect: () => void;

  getScriptOutput: (executionId: string) => string;
  getActiveOutput: () => string;
  isAnyRunning: () => boolean;
}

export function useScriptExecution(): UseScriptExecutionReturn {
  const [runningScripts, setRunningScripts] = useState<Map<string, RunningScript>>(new Map());
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);

  // Feature 008: Signal to trigger kill all PTY sessions
  // PTY terminal listens to this signal and kills all sessions when it changes
  const [killAllPtySignal, setKillAllPtySignal] = useState(0);

  // Direct kill function ref (for beforeunload sync call)
  const killAllPtyFnRef = useRef<(() => void) | null>(null);

  const cleanupFns = useRef<UnlistenFn[]>([]);

  const executeScript = useCallback(
    async (params: ExecuteScriptParams & { projectName?: string }): Promise<string | null> => {
      try {
        const { projectName, ...invokeParams } = params;
        const response = await scriptAPI.executeScript(invokeParams);

        if (response.success && response.executionId) {
          const newScript: RunningScript = {
            executionId: response.executionId,
            scriptName: params.scriptName,
            projectName,
            projectPath: params.projectPath,
            status: 'running',
            output: '',
            startedAt: new Date().toISOString(),
          };

          setRunningScripts((prev) => {
            const newMap = new Map(prev);
            newMap.set(response.executionId!, newScript);
            return newMap;
          });

          setActiveExecutionId(response.executionId);

          return response.executionId;
        }

        console.error('Failed to execute script:', response.error);
        return null;
      } catch (err) {
        console.error('Error executing script:', err);
        return null;
      }
    },
    []
  );

  const cancelScript = useCallback(async (executionId: string): Promise<boolean> => {
    try {
      const response = await scriptAPI.cancelScript(executionId);

      if (response.success) {
        setRunningScripts((prev) => {
          const newMap = new Map(prev);
          const script = newMap.get(executionId);
          if (script) {
            newMap.set(executionId, {
              ...script,
              status: 'cancelled',
              finishedAt: new Date().toISOString(),
            });
          }
          return newMap;
        });
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error cancelling script:', err);
      return false;
    }
  }, []);

  const setActiveExecution = useCallback((executionId: string | null) => {
    setActiveExecutionId(executionId);
  }, []);

  const registerExternalExecution = useCallback(
    (executionId: string, scriptName: string, projectPath: string, projectName?: string) => {
      setRunningScripts((prev) => {
        if (prev.has(executionId)) return prev;
        const next = new Map(prev);
        next.set(executionId, {
          executionId,
          scriptName,
          projectName,
          projectPath,
          status: 'running',
          output: '',
          startedAt: new Date().toISOString(),
        });
        return next;
      });
      setActiveExecutionId(executionId);
    },
    []
  );

  const clearOutput = useCallback(async (executionId: string) => {
    try {
      const result = await scriptAPI.cancelScript(executionId);
      console.log('clearOutput: cancelScript result:', result);
    } catch (e) {
      console.log('clearOutput: cancelScript error (may already be terminated):', e);
    }

    setRunningScripts((prev) => {
      const newMap = new Map(prev);
      newMap.delete(executionId);

      setActiveExecutionId((currentActiveId) => {
        if (currentActiveId === executionId) {
          const remainingIds = Array.from(newMap.keys());
          return remainingIds.length > 0 ? remainingIds[remainingIds.length - 1] : null;
        }
        return currentActiveId;
      });

      return newMap;
    });
  }, []);

  const clearAllOutputs = useCallback(() => {
    setRunningScripts((prev) => {
      const newMap = new Map(prev);
      for (const [id, script] of newMap) {
        newMap.set(id, { ...script, output: '' });
      }
      return newMap;
    });
  }, []);

  const getScriptOutput = useCallback(
    (executionId: string): string => {
      return runningScripts.get(executionId)?.output || '';
    },
    [runningScripts]
  );

  const getActiveOutput = useCallback((): string => {
    if (!activeExecutionId) return '';
    return runningScripts.get(activeExecutionId)?.output || '';
  }, [activeExecutionId, runningScripts]);

  const isAnyRunning = useCallback((): boolean => {
    for (const script of runningScripts.values()) {
      if (script.status === 'running') return true;
    }
    return false;
  }, [runningScripts]);

  // Feature 008: Write input to stdin of a running script
  const writeToStdin = useCallback(async (executionId: string, input: string): Promise<boolean> => {
    try {
      const response = await scriptAPI.writeToScript(executionId, input);
      if (!response.success) {
        console.error('writeToStdin failed:', response.error);
      }
      return response.success;
    } catch (err) {
      console.error('Error writing to stdin:', err);
      return false;
    }
  }, []);

  // Feature 008: Send Ctrl+C (SIGINT) to a running script
  const sendInterrupt = useCallback(
    async (executionId: string): Promise<boolean> => {
      // ETX (End of Text) = Ctrl+C = ASCII 0x03
      return writeToStdin(executionId, '\x03');
    },
    [writeToStdin]
  );

  // Feature 008: PTY integration - register PTY sessions to track icon state and port detection
  const registerPtyExecution = useCallback(
    (sessionId: string, scriptName: string, projectPath: string, projectName?: string) => {
      setRunningScripts((prev) => {
        if (prev.has(sessionId)) return prev;
        const next = new Map(prev);
        next.set(sessionId, {
          executionId: sessionId,
          scriptName,
          projectName,
          projectPath,
          status: 'running',
          output: '',
          startedAt: new Date().toISOString(),
        });
        return next;
      });
      setActiveExecutionId(sessionId);
    },
    []
  );

  // Feature 008: Update PTY session output for port detection
  // Performance optimization: Only search new chunk + overlap for port detection
  // Performance optimization: Limit output memory to 512KB
  const updatePtyOutput = useCallback((sessionId: string, output: string) => {
    setRunningScripts((prev) => {
      const script = prev.get(sessionId);
      if (!script) return prev;

      // Performance optimization: Only search new chunk + overlap region
      const searchRegion = getPortSearchRegion(script.output, output);
      const port = extractPortFromOutput(searchRegion, script.port);

      // Performance optimization: Limit output size to 512KB
      const newOutput = appendOutputWithLimit(script.output, output);

      if (port && port !== script.port) {
        console.log('[useScriptExecution] Port detected:', port, 'for session:', sessionId);
      }

      const next = new Map(prev);
      next.set(sessionId, {
        ...script,
        output: newOutput,
        port,
      });
      return next;
    });
  }, []);

  // Feature 008: Update PTY session status when exited
  const updatePtyStatus = useCallback(
    (sessionId: string, status: 'running' | 'completed' | 'failed', exitCode?: number) => {
      setRunningScripts((prev) => {
        const script = prev.get(sessionId);
        if (!script) return prev;

        const next = new Map(prev);
        next.set(sessionId, {
          ...script,
          status,
          exitCode,
          finishedAt: status !== 'running' ? new Date().toISOString() : undefined,
        });
        return next;
      });
    },
    []
  );

  // Feature 008: Remove PTY session from tracking
  const removePtyExecution = useCallback((sessionId: string) => {
    setRunningScripts((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);

      setActiveExecutionId((currentActiveId) => {
        if (currentActiveId === sessionId) {
          const remainingIds = Array.from(next.keys());
          return remainingIds.length > 0 ? remainingIds[remainingIds.length - 1] : null;
        }
        return currentActiveId;
      });

      return next;
    });
  }, []);

  const triggerKillAllPty = useCallback(() => {
    setKillAllPtySignal((prev) => prev + 1);
  }, []);

  const registerKillAllPtyFn = useCallback((fn: () => void) => {
    killAllPtyFnRef.current = fn;
  }, []);

  const killAllPtyDirect = useCallback(() => {
    killAllPtyFnRef.current?.();
  }, []);

  useEffect(() => {
    const fetchRunningScripts = async () => {
      try {
        const runningList = await scriptAPI.getRunningScripts();
        if (runningList.length > 0) {
          const newMap = new Map<string, RunningScript>();

          for (const script of runningList) {
            let output = '';
            try {
              const outputResponse = await scriptAPI.getScriptOutput(script.executionId);
              if (outputResponse.success && outputResponse.output) {
                output = outputResponse.output;
                if (outputResponse.truncated) {
                  console.info(
                    `[useScriptExecution] Output for ${script.executionId} was truncated. ` +
                      `Buffer size: ${outputResponse.bufferSize} bytes`
                  );
                }
              }
            } catch (e) {
              console.warn('Failed to fetch output for', script.executionId, e);
            }

            newMap.set(script.executionId, {
              executionId: script.executionId,
              scriptName: script.scriptName,
              projectPath: script.projectPath,
              projectName: script.projectName,
              status: script.status,
              output,
              exitCode: script.exitCode,
              startedAt: script.startedAt,
              finishedAt: script.completedAt,
            });
          }

          setRunningScripts(newMap);

          const firstRunning = runningList.find((s) => s.status === 'running');
          if (firstRunning) {
            setActiveExecutionId(firstRunning.executionId);
          } else if (runningList.length > 0) {
            setActiveExecutionId(runningList[0].executionId);
          }
        }
      } catch (err) {
        console.error('Error fetching running scripts:', err);
      }
    };

    fetchRunningScripts();
  }, []);

  const isSubscribedRef = useRef(false);

  useEffect(() => {
    if (isSubscribedRef.current) {
      return;
    }

    let isCancelled = false;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenCompleted: UnlistenFn | undefined;

    const setup = async () => {
      isSubscribedRef.current = true;

      const outputUnsub = await tauriEvents.onScriptOutput((event: ScriptOutputPayload) => {
        if (isCancelled) return;
        setRunningScripts((prev) => {
          const newMap = new Map(prev);
          const script = newMap.get(event.executionId);
          if (script) {
            // Performance optimization: Only search new chunk + overlap region
            const searchRegion = getPortSearchRegion(script.output, event.output);
            const port = extractPortFromOutput(searchRegion, script.port);
            // Performance optimization: Limit output size to 512KB
            const newOutput = appendOutputWithLimit(script.output, event.output);
            newMap.set(event.executionId, {
              ...script,
              output: newOutput,
              port,
            });
          }
          return newMap;
        });
      });

      if (isCancelled) {
        outputUnsub();
        isSubscribedRef.current = false;
        return;
      }
      unlistenOutput = outputUnsub;

      const completedUnsub = await tauriEvents.onScriptCompleted(
        (event: ScriptCompletedPayload) => {
          if (isCancelled) return;
          setRunningScripts((prev) => {
            const newMap = new Map(prev);
            const script = newMap.get(event.executionId);
            if (script) {
              newMap.set(event.executionId, {
                ...script,
                status: event.exitCode === 0 ? 'completed' : 'failed',
                exitCode: event.exitCode,
                finishedAt: new Date().toISOString(),
              });
            }
            return newMap;
          });
        }
      );

      if (isCancelled) {
        outputUnsub();
        completedUnsub();
        isSubscribedRef.current = false;
        return;
      }
      unlistenCompleted = completedUnsub;

      cleanupFns.current = [unlistenOutput, unlistenCompleted].filter(
        (fn): fn is UnlistenFn => fn !== undefined
      );
    };

    setup();

    return () => {
      isCancelled = true;
      unlistenOutput?.();
      unlistenCompleted?.();
      cleanupFns.current.forEach((fn) => fn?.());
      cleanupFns.current = [];
      isSubscribedRef.current = false;
    };
  }, []);

  return {
    runningScripts,
    activeExecutionId,

    executeScript,
    cancelScript,
    setActiveExecution,
    clearOutput,
    clearAllOutputs,
    registerExternalExecution,

    // Feature 008: stdin interaction
    writeToStdin,
    sendInterrupt,

    // Feature 008: PTY integration
    registerPtyExecution,
    updatePtyOutput,
    updatePtyStatus,
    removePtyExecution,

    // Feature 008: Kill all PTY sessions
    killAllPtySignal,
    triggerKillAllPty,
    registerKillAllPtyFn,
    killAllPtyDirect,

    getScriptOutput,
    getActiveOutput,
    isAnyRunning,
  };
}
