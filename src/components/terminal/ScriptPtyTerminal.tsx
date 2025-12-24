/**
 * Script PTY Terminal Component - Multi-tab PTY terminal manager
 * Feature 008: Interactive terminal with full PTY support
 *
 * Replaces ScriptTerminal with xterm.js + tauri-plugin-pty for full interactive support
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { spawn, type IPty } from 'tauri-pty';
import {
  X,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Copy,
  Check,
  Search,
  Trash2,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { scriptAPI } from '../../lib/tauri-api';
import { useSettings } from '../../contexts/SettingsContext';
import { Button } from '../ui/Button';
import '@xterm/xterm/css/xterm.css';

// PTY session info
interface PtySession {
  id: string;
  name: string;
  projectPath: string;
  projectName?: string;
  pty: IPty | null;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  searchAddon: SearchAddon | null;
  webglAddon: WebglAddon | null;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

interface ScriptPtyTerminalProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  // Feature 008: PTY integration with ScriptExecutionContext
  onRegisterPtyExecution?: (
    sessionId: string,
    scriptName: string,
    projectPath: string,
    projectName?: string
  ) => void;
  onUpdatePtyOutput?: (sessionId: string, output: string) => void;
  onUpdatePtyStatus?: (
    sessionId: string,
    status: 'running' | 'completed' | 'failed',
    exitCode?: number
  ) => void;
  onRemovePtyExecution?: (sessionId: string) => void;
  // Feature 008: Kill all PTY sessions signal
  killAllPtySignal?: number;
  // Feature 008: Port info from ScriptExecutionContext for tab display
  sessionPorts?: Map<string, number | undefined>;
  // Direct kill function registration (for beforeunload sync call)
  onRegisterKillAllFn?: (fn: () => void) => void;
}

// Ref methods exposed to parent
export interface ScriptPtyTerminalRef {
  spawnSession: (
    command: string,
    args: string[],
    cwd: string,
    name: string,
    projectName?: string
  ) => Promise<string | null>;
  killSession: (sessionId: string) => void;
  killAllSessions: () => void;
  sessions: Map<string, PtySession>;
  activeSessionId: string | null;
}

// Terminal theme matching the existing design
const terminalTheme = {
  background: '#030712', // gray-950
  foreground: '#e5e7eb', // gray-200 (improved contrast)
  cursor: '#e5e7eb',
  cursorAccent: '#030712',
  selectionBackground: 'rgba(59, 130, 246, 0.4)', // blue-500 with opacity
  selectionForeground: '#ffffff',
  black: '#374151',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e7eb', // gray-200
  brightBlack: '#9ca3af', // gray-400 (brighter for better visibility)
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f9fafb', // gray-50
};

// Terminal configuration for better readability
const terminalOptions = {
  cursorBlink: true,
  cursorStyle: 'block' as const,
  fontSize: 14, // Slightly larger for better readability
  fontFamily:
    '"SF Mono", Menlo, Monaco, "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
  fontWeight: '400' as const,
  fontWeightBold: '600' as const,
  lineHeight: 1.5, // More breathing room between lines (increased from 1.35)
  letterSpacing: 0.5, // Slight letter spacing for clarity
  theme: terminalTheme,
  scrollback: 5000, // Reduced for better performance
  // smoothScrollDuration removed for better scroll performance
  allowProposedApi: true,
  // Rendering options for crisp text
  allowTransparency: false,
  minimumContrastRatio: 4.5, // WCAG AA compliance
};

// Throttle function to limit execution rate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let pendingArgs: Parameters<T> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else {
      // Store latest args and schedule execution
      pendingArgs = args;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          if (pendingArgs) {
            lastCall = Date.now();
            fn(...pendingArgs);
            pendingArgs = null;
          }
          timeoutId = null;
        }, delay - timeSinceLastCall);
      }
    }
  };
}

// Status display configuration
const statusConfig: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: 'text-yellow-400' },
  completed: { label: 'Succeeded', color: 'text-green-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
};

export const ScriptPtyTerminal = forwardRef<ScriptPtyTerminalRef, ScriptPtyTerminalProps>(
  function ScriptPtyTerminal(
    {
      isCollapsed,
      onToggleCollapse,
      onRegisterPtyExecution,
      onUpdatePtyOutput,
      onUpdatePtyStatus,
      onRemovePtyExecution,
      killAllPtySignal,
      sessionPorts,
      onRegisterKillAllFn,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [sessions, setSessions] = useState<Map<string, PtySession>>(new Map());
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Settings context for path formatting and terminal height
    const { formatPath, terminalHeight: savedHeight, setTerminalHeight } = useSettings();
    const MIN_HEIGHT = 100;
    const MAX_HEIGHT = 600;

    // Local height state for smooth dragging - only used during resize
    const [localHeight, setLocalHeight] = useState<number | null>(null);

    // Use local height during resize for instant feedback, otherwise use saved height
    const height = localHeight ?? savedHeight;

    // Feature 008: Store callback refs to avoid stale closures in useEffect
    const onUpdatePtyOutputRef = useRef(onUpdatePtyOutput);
    const onUpdatePtyStatusRef = useRef(onUpdatePtyStatus);
    useEffect(() => {
      onUpdatePtyOutputRef.current = onUpdatePtyOutput;
      onUpdatePtyStatusRef.current = onUpdatePtyStatus;
    }, [onUpdatePtyOutput, onUpdatePtyStatus]);

    // Get active session
    const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

    // Track pending spawns that need PTY initialization after terminal mount
    const pendingSpawnsRef = useRef<Map<string, { command: string; args: string[]; cwd: string }>>(
      new Map()
    );

    // Track last activity time for each session (for scrollback cleanup)
    const lastActivityRef = useRef<Map<string, number>>(new Map());

    // Auto-cleanup scrollback buffer after inactivity (5 minutes)
    const SCROLLBACK_CLEANUP_INTERVAL = 60_000; // Check every 1 minute
    const SCROLLBACK_CLEANUP_THRESHOLD = 5 * 60_000; // 5 minutes of inactivity

    useEffect(() => {
      const cleanupInterval = setInterval(() => {
        const now = Date.now();
        sessions.forEach((session) => {
          const lastActivity = lastActivityRef.current.get(session.id) || 0;
          const idleTime = now - lastActivity;

          // Only clean running sessions that have been idle
          if (session.status === 'running' && idleTime > SCROLLBACK_CLEANUP_THRESHOLD) {
            if (session.terminal) {
              // Clear scrollback buffer but keep current screen content
              session.terminal.clear();
              console.log(`[PTY] Cleared scrollback for idle session: ${session.name}`);
              // Reset activity timer after cleanup
              lastActivityRef.current.set(session.id, now);
            }
          }
        });
      }, SCROLLBACK_CLEANUP_INTERVAL);

      return () => clearInterval(cleanupInterval);
    }, [sessions]);

    // Spawn a new PTY session
    const spawnSession = useCallback(
      async (
        command: string,
        args: string[],
        cwd: string,
        name: string,
        projectName?: string
      ): Promise<string | null> => {
        console.log('[PTY] spawnSession called:', { command, args, cwd, name, projectName });
        const sessionId = crypto.randomUUID();

        // Create terminal instance with improved readability settings
        const term = new Terminal(terminalOptions);

        const fitAddon = new FitAddon();
        // SearchAddon with yellow highlight for better visibility
        const searchAddon = new SearchAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        // WebGL addon will be loaded after terminal is opened (requires DOM)

        // Create initial session
        const session: PtySession = {
          id: sessionId,
          name,
          projectPath: cwd,
          projectName,
          pty: null,
          terminal: term,
          fitAddon,
          searchAddon,
          webglAddon: null, // Will be initialized after terminal is opened
          status: 'running',
        };

        // Store spawn info for later initialization
        pendingSpawnsRef.current.set(sessionId, { command, args, cwd });

        setSessions((prev) => {
          const next = new Map(prev);
          next.set(sessionId, session);
          return next;
        });
        setActiveSessionId(sessionId);

        // Feature 008: Register with ScriptExecutionContext for icon state and port detection
        onRegisterPtyExecution?.(sessionId, name, cwd, projectName);

        return sessionId;
      },
      [onRegisterPtyExecution]
    );

    // Kill a session
    const killSession = useCallback(
      (sessionId: string) => {
        const session = sessions.get(sessionId);
        if (session) {
          session.pty?.kill();
          session.webglAddon?.dispose();
          session.terminal?.dispose();
          // Clean up activity tracking
          lastActivityRef.current.delete(sessionId);
          setSessions((prev) => {
            const next = new Map(prev);
            next.delete(sessionId);
            // Select another session if active was removed
            if (activeSessionId === sessionId) {
              const remaining = Array.from(next.keys());
              setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
            }
            return next;
          });
          // Feature 008: Remove from ScriptExecutionContext
          onRemovePtyExecution?.(sessionId);
        }
      },
      [sessions, activeSessionId, onRemovePtyExecution]
    );

    // Kill all running sessions (for "Stop All Processes")
    const killAllSessions = useCallback(() => {
      sessions.forEach((session) => {
        if (session.status === 'running') {
          session.pty?.kill();
          session.webglAddon?.dispose();
          session.terminal?.dispose();
          // Feature 008: Remove from ScriptExecutionContext
          onRemovePtyExecution?.(session.id);
        }
      });
      // Clear all activity tracking
      lastActivityRef.current.clear();
      setSessions(new Map());
      setActiveSessionId(null);
    }, [sessions, onRemovePtyExecution]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        spawnSession,
        killSession,
        killAllSessions,
        sessions,
        activeSessionId,
      }),
      [spawnSession, killSession, killAllSessions, sessions, activeSessionId]
    );

    // Feature 008: Listen to kill all PTY signal from "Stop All Processes"
    const prevKillSignalRef = useRef(killAllPtySignal);
    useEffect(() => {
      // Only trigger if signal changed (not on initial mount)
      if (killAllPtySignal !== undefined && prevKillSignalRef.current !== killAllPtySignal) {
        prevKillSignalRef.current = killAllPtySignal;
        killAllSessions();
      }
    }, [killAllPtySignal, killAllSessions]);

    // Register killAllSessions for direct call (beforeunload sync call)
    useEffect(() => {
      onRegisterKillAllFn?.(killAllSessions);
    }, [killAllSessions, onRegisterKillAllFn]);

    // Mount terminal to DOM when active session changes or when expanding
    useEffect(() => {
      if (!terminalContainerRef.current || !activeSession?.terminal || isCollapsed) return;

      const container = terminalContainerRef.current;
      const term = activeSession.terminal;
      const sessionId = activeSession.id;

      // Check if terminal is already mounted somewhere (has been opened before)
      const termElement = term.element;

      if (termElement) {
        // Terminal has been opened before
        if (container.contains(termElement)) {
          // Already in this container, just fit
          requestAnimationFrame(() => {
            activeSession.fitAddon?.fit();
            term.focus();
            if (activeSession.pty) {
              activeSession.pty.resize(term.cols, term.rows);
            }
          });
          return;
        } else {
          // Terminal was opened but in a different/old container
          // We need to move it to the new container
          container.innerHTML = '';
          container.appendChild(termElement);
          requestAnimationFrame(() => {
            activeSession.fitAddon?.fit();
            term.focus();
            if (activeSession.pty) {
              activeSession.pty.resize(term.cols, term.rows);
            }
          });
          return;
        }
      }

      // Fresh terminal - clear container and open
      container.innerHTML = '';
      term.open(container);

      // Load WebGL addon for better rendering performance (must be after terminal is opened)
      if (!activeSession.webglAddon) {
        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            // If WebGL context is lost, dispose and fall back to canvas
            webglAddon.dispose();
          });
          term.loadAddon(webglAddon);
          // Update session with webglAddon
          setSessions((prev) => {
            const next = new Map(prev);
            const s = next.get(sessionId);
            if (s) {
              next.set(sessionId, { ...s, webglAddon });
            }
            return next;
          });
        } catch (e) {
          console.warn('WebGL addon failed to load, using canvas renderer:', e);
        }
      }

      // Fit and focus
      requestAnimationFrame(() => {
        activeSession.fitAddon?.fit();
        term.focus();

        // Check if there's a pending spawn for this session
        const pendingSpawn = pendingSpawnsRef.current.get(sessionId);
        if (pendingSpawn && !activeSession.pty) {
          // Remove from pending
          pendingSpawnsRef.current.delete(sessionId);

          // Now spawn PTY with correct terminal dimensions
          const { command, args, cwd } = pendingSpawn;

          (async () => {
            try {
              // Get environment variables for proper PATH, VOLTA_HOME, etc.
              const env = await scriptAPI.getPtyEnv();

              const pty = await spawn(command, args, {
                cols: term.cols || 80,
                rows: term.rows || 24,
                cwd,
                env,
              });

              // PTY -> Terminal with batched writes to prevent backpressure
              // Buffer to collect PTY output
              let outputBuffer = '';
              let flushScheduled = false;

              // Throttled callback for port detection (100ms interval)
              const throttledOutputCallback = throttle((output: string) => {
                onUpdatePtyOutputRef.current?.(sessionId, output);
              }, 100);

              // Flush buffer to terminal using requestAnimationFrame for smooth rendering
              const flushBuffer = () => {
                if (outputBuffer) {
                  term.write(outputBuffer);
                  throttledOutputCallback(outputBuffer);
                  outputBuffer = '';
                }
                flushScheduled = false;
              };

              pty.onData((data: string) => {
                // Accumulate output in buffer
                outputBuffer += data;

                // Update last activity time for scrollback cleanup tracking
                lastActivityRef.current.set(sessionId, Date.now());

                // Schedule flush on next animation frame (batches rapid outputs)
                if (!flushScheduled) {
                  flushScheduled = true;
                  requestAnimationFrame(flushBuffer);
                }
              });

              // PTY exit
              pty.onExit(({ exitCode }: { exitCode: number }) => {
                // Flush any remaining buffered output
                if (outputBuffer) {
                  term.write(outputBuffer);
                  outputBuffer = '';
                }
                term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
                const newStatus = exitCode === 0 ? 'completed' : 'failed';
                setSessions((prev) => {
                  const next = new Map(prev);
                  const s = next.get(sessionId);
                  if (s) {
                    next.set(sessionId, {
                      ...s,
                      status: newStatus,
                      exitCode,
                    });
                  }
                  return next;
                });
                // Feature 008: Update status in ScriptExecutionContext for icon state
                onUpdatePtyStatusRef.current?.(sessionId, newStatus, exitCode);
              });

              // Terminal -> PTY
              term.onData((data: string) => {
                pty.write(data);
              });

              // Update session with PTY
              setSessions((prev) => {
                const next = new Map(prev);
                const s = next.get(sessionId);
                if (s) {
                  next.set(sessionId, { ...s, pty });
                }
                return next;
              });
            } catch (err) {
              console.error('Failed to spawn PTY:', err);
              term.write(`\x1b[31mFailed to start: ${err}\x1b[0m\r\n`);
              setSessions((prev) => {
                const next = new Map(prev);
                const s = next.get(sessionId);
                if (s) {
                  next.set(sessionId, { ...s, status: 'failed' });
                }
                return next;
              });
              // Feature 008: Update status in ScriptExecutionContext
              onUpdatePtyStatusRef.current?.(sessionId, 'failed');
            }
          })();
        } else if (activeSession.pty) {
          // PTY already exists, just resize
          activeSession.pty.resize(term.cols, term.rows);
        }
      });
    }, [activeSession, activeSessionId, isCollapsed]);

    // Auto-resize terminal when container size changes
    useEffect(() => {
      if (!terminalContainerRef.current || !activeSession?.terminal || isCollapsed) return;

      const container = terminalContainerRef.current;
      const fitAddon = activeSession.fitAddon;
      const pty = activeSession.pty;
      const term = activeSession.terminal;

      // Debounced fit function to avoid excessive resizing
      let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
      const debouncedFit = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (fitAddon && term.element) {
            fitAddon.fit();
            if (pty) {
              pty.resize(term.cols, term.rows);
            }
          }
        }, 50);
      };

      const resizeObserver = new ResizeObserver(debouncedFit);
      resizeObserver.observe(container);

      return () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeObserver.disconnect();
      };
    }, [activeSession, isCollapsed]);

    // Handle resize drag
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        startYRef.current = e.clientY;
        startHeightRef.current = height;
        // Initialize local height for smooth dragging
        setLocalHeight(height);
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
        // Update local height immediately for smooth visual feedback
        setLocalHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        // Save final height to context (persists to DB)
        if (localHeight !== null) {
          setTerminalHeight(localHeight);
          // Clear local height - will now use saved height
          setLocalHeight(null);
        }
        // Fit terminal after resize
        if (activeSession?.fitAddon && activeSession?.pty) {
          activeSession.fitAddon.fit();
          activeSession.pty.resize(
            activeSession.terminal?.cols || 80,
            activeSession.terminal?.rows || 24
          );
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isResizing, localHeight, setTerminalHeight, activeSession]);

    // Copy terminal content
    const handleCopy = useCallback(async () => {
      if (!activeSession?.terminal) return;

      // Get selection or all content
      const selection = activeSession.terminal.getSelection();

      // For full content, we need to read all lines
      let fullText = '';
      if (!selection) {
        const buffer = activeSession.terminal.buffer.active;
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            fullText += line.translateToString(true) + '\n';
          }
        }
      }

      try {
        await navigator.clipboard.writeText(selection || fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }, [activeSession]);

    // Search decoration options - semi-transparent yellow highlight
    const searchDecorations = {
      matchBackground: 'rgba(234, 179, 8, 0.35)', // yellow-500 with 35% opacity
      matchBorder: 'rgba(202, 138, 4, 0.5)', // yellow-600 with 50% opacity
      matchOverviewRuler: 'rgba(234, 179, 8, 0.6)',
      activeMatchBackground: 'rgba(250, 204, 21, 0.5)', // yellow-400 with 50% opacity (current match)
      activeMatchBorder: 'rgba(234, 179, 8, 0.7)',
      activeMatchColorOverviewRuler: 'rgba(250, 204, 21, 0.8)',
    };

    // Search functions
    const handleSearch = useCallback(
      (query: string) => {
        setSearchQuery(query);
        if (activeSession?.searchAddon && query) {
          activeSession.searchAddon.findNext(query, { decorations: searchDecorations });
        }
      },
      [activeSession]
    );

    const handleSearchNext = useCallback(() => {
      if (activeSession?.searchAddon && searchQuery) {
        activeSession.searchAddon.findNext(searchQuery, { decorations: searchDecorations });
      }
    }, [activeSession, searchQuery]);

    const handleSearchPrev = useCallback(() => {
      if (activeSession?.searchAddon && searchQuery) {
        activeSession.searchAddon.findPrevious(searchQuery, { decorations: searchDecorations });
      }
    }, [activeSession, searchQuery]);

    const handleCloseSearch = useCallback(() => {
      setIsSearchOpen(false);
      setSearchQuery('');
      activeSession?.terminal?.focus();
    }, [activeSession]);

    // Close active session (kill process and remove tab)
    const handleCloseActiveSession = useCallback(() => {
      if (!activeSessionId) return;
      killSession(activeSessionId);
    }, [activeSessionId, killSession]);

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Only respond when terminal container has focus
        if (
          !containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body
        ) {
          return;
        }

        // Cmd/Ctrl + F to open search
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault();
          setIsSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }

        // Cmd/Ctrl + Shift + C to copy
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
          e.preventDefault();
          handleCopy();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleCopy]);

    // Session tabs
    const sessionList = useMemo(() => Array.from(sessions.values()), [sessions]);

    // If no sessions, hide terminal completely
    if (sessions.size === 0) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        className={`flex flex-col border-t border-border bg-card ${isResizing ? 'select-none' : ''}`}
        style={{ height: isCollapsed ? 32 : height }}
      >
        {/* Resize Handle - only show when expanded */}
        {!isCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className={`h-1.5 cursor-ns-resize bg-secondary hover:bg-blue-500/50 transition-colors flex items-center justify-center group ${
              isResizing ? 'bg-blue-500/50' : ''
            }`}
          >
            <div className="w-10 h-0.5 bg-muted-foreground group-hover:bg-blue-400 rounded-full" />
          </div>
        )}
        {/* Header */}
        <div className="h-8 flex items-center px-3 bg-card select-none">
          {isCollapsed ? (
            /* Collapsed state: minimal UI with just expand button */
            <>
              <TerminalIcon className="w-4 h-4 text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground flex-1">
                Terminal ({sessions.size})
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-auto p-1.5"
                title="Expand"
              >
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              </Button>
            </>
          ) : (
            /* Expanded state: full UI */
            <>
              <GripHorizontal className="w-4 h-4 text-muted-foreground mr-2" />

              {/* Tabs */}
              <div className="flex-1 flex items-center gap-1 overflow-x-auto">
                {sessionList.map((session) => {
                  const port = sessionPorts?.get(session.id);
                  return (
                    <div
                      key={session.id}
                      onClick={() => setActiveSessionId(session.id)}
                      className={`group flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer ${
                        activeSessionId === session.id
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          session.status === 'running'
                            ? 'bg-yellow-400'
                            : session.status === 'completed'
                              ? 'bg-green-400'
                              : 'bg-red-400'
                        }`}
                      />
                      <span className="truncate max-w-[150px]">
                        {(() => {
                          const projectLabel =
                            session.projectName ||
                            session.projectPath.split(/[\\/]/).filter(Boolean).pop();
                          return projectLabel ? `${projectLabel}: ${session.name}` : session.name;
                        })()}
                      </span>
                      {port && (
                        <span className="text-yellow-400 text-[10px] flex-shrink-0">:{port}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          killSession(session.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 h-auto p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Toolbar buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Search button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsSearchOpen(!isSearchOpen);
                    if (!isSearchOpen) {
                      setTimeout(() => searchInputRef.current?.focus(), 0);
                    }
                  }}
                  className={`h-auto p-1.5 ${isSearchOpen ? 'bg-secondary' : ''}`}
                  title="Search (Cmd+F)"
                >
                  <Search className="w-4 h-4 text-muted-foreground" />
                </Button>
                {/* Copy button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  disabled={!activeSession}
                  className="h-auto p-1.5"
                  title="Copy output (Cmd+Shift+C)"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
                {/* Close session button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseActiveSession}
                  disabled={!activeSession}
                  className="h-auto p-1.5 hover:text-red-400"
                  title="Close session (kill process)"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
                {/* Collapse button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  className="h-auto p-1.5"
                  title="Collapse"
                >
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Search bar */}
        {!isCollapsed && isSearchOpen && (
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    handleSearchPrev();
                  } else {
                    handleSearchNext();
                  }
                } else if (e.key === 'Escape') {
                  handleCloseSearch();
                }
              }}
              placeholder="Search in terminal..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none min-w-0"
            />
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSearchPrev}
                disabled={!searchQuery}
                className="h-auto p-1"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSearchNext}
                disabled={!searchQuery}
                className="h-auto p-1"
                title="Next match (Enter)"
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseSearch}
              className="h-auto p-1 flex-shrink-0"
              title="Close (Esc)"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        )}

        {/* Terminal content - always render container but hide when collapsed */}
        {!isCollapsed && (
          <div
            ref={terminalContainerRef}
            className="flex-1 overflow-hidden terminal-container"
            style={{
              minHeight: 100,
              // Add padding around the terminal content for better visual spacing
              padding: '8px 16px 8px 16px',
              // Use terminal background color to avoid light mode "bleeding" on padding edges
              backgroundColor: terminalTheme.background,
            }}
          />
        )}

        {/* Status bar */}
        {!isCollapsed && activeSession && (
          <div className="h-6 flex items-center px-3 text-xs border-t border-border bg-card">
            <span className={statusConfig[activeSession.status].color}>
              {statusConfig[activeSession.status].label}
            </span>
            {activeSession.exitCode !== undefined && (
              <span className="ml-2 text-muted-foreground">
                Exit code: {activeSession.exitCode}
              </span>
            )}
            <span
              className="ml-auto text-muted-foreground"
              title={formatPath(activeSession.projectPath)}
            >
              {formatPath(activeSession.projectPath)}
            </span>
          </div>
        )}
      </div>
    );
  }
);

// Export spawn function for external use
export { type PtySession };
export default ScriptPtyTerminal;
