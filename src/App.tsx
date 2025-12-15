import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Cable, Loader2, Check } from 'lucide-react';
import { WorkflowPage } from './components/workflow/WorkflowPage';
import { ProjectManagerPage } from './components/project/ProjectManagerPage';
import { useScriptExecutionContext } from './contexts/ScriptExecutionContext';
import { useShortcutsContext } from './contexts/ShortcutsContext';
import type { Workflow } from './types/workflow';
import { scriptAPI, confirm } from './lib/tauri-api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsButton } from './components/settings/SettingsButton';
import { SettingsPage } from './components/settings/SettingsPage';
import type { SettingsSection } from './types/settings';
import { useKeyboardShortcuts, type KeyboardShortcut } from './hooks/useKeyboardShortcuts';
import { ShortcutToast } from './components/ui/KeyboardShortcutsHint';
import {
  KeyboardShortcutsDialog,
  KeyboardShortcutsFloatingButton,
} from './components/ui/KeyboardShortcutsDialog';
import { ScriptPtyTerminal, type ScriptPtyTerminalRef } from './components/terminal';
import { useUpdater } from './hooks/useUpdater';
import { useMcpStatus } from './hooks/useMcpStatus';
import { McpIcon } from './components/ui/McpIcon';

type AppTab = 'workflow' | 'project-manager';

const DEFAULT_SHORTCUT_KEYS: Record<string, string> = {
  'refresh': 'cmd+r',
  'new': 'cmd+n',
  'save': 'cmd+s',
  'search': 'cmd+f',
  'export': 'cmd+e',
  'import': 'cmd+i',
  'tab-projects': 'cmd+1',
  'tab-workflows': 'cmd+2',
  'stop-all': 'cmd+shift+k',
  'deploy': 'cmd+shift+d',
  'help': 'cmd+/',
  'settings': 'cmd+,',
};

interface WorkflowNavState {
  workflow: Workflow;
  projectPath: string;
}

interface TerminalPortalProps {
  container: HTMLElement | null;
  children: React.ReactNode;
}

function TerminalPortal({ container, children }: TerminalPortalProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    if (container) {
      container.appendChild(wrapper);
      wrapper.style.display = '';
    } else {
      wrapper.style.display = 'none';
      document.body.appendChild(wrapper);
    }

    return () => {
      if (wrapper.parentNode) {
        wrapper.style.display = 'none';
      }
    };
  }, [container]);

  return (
    <div ref={wrapperRef} style={{ display: 'none' }}>
      {children}
    </div>
  );
}

function App() {
  // Check for updates on app start
  useUpdater();

  const [activeTab, setActiveTab] = useState<AppTab>('project-manager');
  const [workflowNavState, setWorkflowNavState] = useState<WorkflowNavState | null>(null);
  const [isKilling, setIsKilling] = useState(false);
  const [killSuccess, setKillSuccess] = useState(false);
  const [settingsPageOpen, setSettingsPageOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('storage');
  const [dataVersion, setDataVersion] = useState(0);
  const [shortcutToast, setShortcutToast] = useState<{ message: string; key: string } | null>(null);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const mcpStatus = useMcpStatus();

  const showShortcutToast = useCallback((message: string, key: string) => {
    setShortcutToast({ message, key });
  }, []);

  const handleImportComplete = useCallback(() => {
    setDataVersion((prev) => prev + 1);
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    if (section) {
      setSettingsInitialSection(section);
    }
    setSettingsPageOpen(true);
  }, []);

  const {
    runningScripts,
    triggerKillAllPty,
    killAllPtyDirect,
    registerPtyExecution,
    updatePtyOutput,
    updatePtyStatus,
    removePtyExecution,
    killAllPtySignal,
    registerKillAllPtyFn,
  } = useScriptExecutionContext();

  const ptyTerminalRef = useRef<ScriptPtyTerminalRef>(null);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [terminalPortalContainer, setTerminalPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (activeTab === 'project-manager') {
      const checkContainer = () => {
        const container = document.getElementById('terminal-portal-container');
        if (container) {
          setTerminalPortalContainer(container);
        } else {
          requestAnimationFrame(checkContainer);
        }
      };
      requestAnimationFrame(checkContainer);
    } else {
      setTerminalPortalContainer(null);
    }
  }, [activeTab]);

  const sessionPorts = useMemo(() => {
    const map = new Map<string, number | undefined>();
    for (const [id, script] of runningScripts) {
      map.set(id, script.port);
    }
    return map;
  }, [runningScripts]);

  const { getEffectiveKey, isShortcutEnabled } = useShortcutsContext();

  const runningProcessInfo = useMemo(() => {
    const running = Array.from(runningScripts.values()).filter(
      s => s.status === 'running'
    );
    const allPorts = running
      .map(s => s.port)
      .filter((port): port is number => port !== undefined);
    return {
      count: running.length,
      scripts: running.map(s => ({
        scriptName: s.scriptName,
        projectName: s.projectName,
        port: s.port,
      })).slice(0, 5),
      hasMore: running.length > 5,
      ports: allPorts,
    };
  }, [runningScripts]);

  const runningProcessInfoRef = useRef(runningProcessInfo);
  runningProcessInfoRef.current = runningProcessInfo;

  const killAllPtyDirectRef = useRef(killAllPtyDirect);
  killAllPtyDirectRef.current = killAllPtyDirect;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCloseHandler = async () => {
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onCloseRequested(async (event) => {
        const info = runningProcessInfoRef.current;
        if (info.count > 0) {
          const scriptsList = info.scripts.map(s => {
            let line = s.projectName ? `${s.projectName}: ${s.scriptName}` : s.scriptName;
            if (s.port) line += ` :${s.port}`;
            return line;
          }).join('\n');
          const confirmed = await confirm(
            `${info.count} process${info.count > 1 ? 'es are' : ' is'} currently running:\n\n${scriptsList}${info.hasMore ? `\n...and ${info.count - 5} more` : ''}\n\nClosing the app will terminate these processes. Are you sure you want to close?`,
            {
              title: 'Confirm Close',
              kind: 'warning',
            }
          );

          if (!confirmed) {
            event.preventDefault();
            return;
          }

          try {
            killAllPtyDirectRef.current();
            if (info.ports.length > 0) {
              await scriptAPI.killPorts(info.ports);
            }
            await scriptAPI.killAllNodeProcesses();
          } catch (e) {
            console.error('Failed to kill processes on close:', e);
          }
        }
      });
    };

    setupCloseHandler();

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const cleanupOrphanedPorts = async () => {
      const savedPorts = localStorage.getItem('PACKAGE_FLOW_RUNNING_PORTS');
      if (savedPorts) {
        try {
          const ports = JSON.parse(savedPorts) as number[];
          if (ports.length > 0) {
            console.log('[App] Cleaning up orphaned ports:', ports);
            await scriptAPI.killPorts(ports);
          }
        } catch (err) {
          console.error('[App] Failed to cleanup orphaned ports:', err);
        }
        localStorage.removeItem('PACKAGE_FLOW_RUNNING_PORTS');
      }
    };

    cleanupOrphanedPorts();
  }, []);

  useEffect(() => {
    const saveRunningPorts = () => {
      const info = runningProcessInfoRef.current;
      if (info.ports.length > 0) {
        localStorage.setItem('PACKAGE_FLOW_RUNNING_PORTS', JSON.stringify(info.ports));
      } else {
        localStorage.removeItem('PACKAGE_FLOW_RUNNING_PORTS');
      }
    };

    saveRunningPorts();
    const interval = setInterval(saveRunningPorts, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToWorkflow = useCallback((workflow: Workflow, projectPath: string) => {
    setWorkflowNavState({ workflow, projectPath });
    setActiveTab('workflow');
  }, []);

  const handleClearWorkflowNavState = useCallback(() => {
    setWorkflowNavState(null);
  }, []);

  const handleKillAllNodeProcesses = useCallback(async () => {
    if (isKilling) return;

    console.log('handleKillAllNodeProcesses: starting, runningScripts count:', runningScripts.size);
    console.log('handleKillAllNodeProcesses: running scripts:', Array.from(runningScripts.entries()).map(([id, s]) => ({ id, name: s.scriptName, status: s.status })));

    setIsKilling(true);
    try {
      triggerKillAllPty();

      const result = await scriptAPI.killAllNodeProcesses();
      console.log('handleKillAllNodeProcesses: result:', result);
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      setKillSuccess(true);
      setTimeout(() => setKillSuccess(false), 1500);
    } catch (error) {
      console.error('Failed to kill all node processes:', error);
      alert(`Failed to stop processes: ${(error as Error).message}`);
    } finally {
      setIsKilling(false);
    }
  }, [isKilling, runningScripts, triggerKillAllPty]);

  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    {
      id: 'refresh',
      key: getEffectiveKey('refresh', DEFAULT_SHORTCUT_KEYS['refresh']),
      description: 'Reload projects & workflows',
      category: 'General',
      enabled: isShortcutEnabled('refresh'),
      action: () => {
        setDataVersion((prev) => prev + 1);
        showShortcutToast('Reloaded', getEffectiveKey('refresh', DEFAULT_SHORTCUT_KEYS['refresh']));
      },
    },
    {
      id: 'new',
      key: getEffectiveKey('new', DEFAULT_SHORTCUT_KEYS['new']),
      description: 'New item (context-aware)',
      category: 'General',
      enabled: isShortcutEnabled('new'),
      action: () => {
        const effectiveKey = getEffectiveKey('new', DEFAULT_SHORTCUT_KEYS['new']);
        if (activeTab === 'project-manager') {
          window.dispatchEvent(new CustomEvent('shortcut-new-project'));
          showShortcutToast('New Project', effectiveKey);
        } else if (activeTab === 'workflow') {
          window.dispatchEvent(new CustomEvent('shortcut-new-workflow'));
          showShortcutToast('New Workflow', effectiveKey);
        }
      },
    },
    {
      id: 'save',
      key: getEffectiveKey('save', DEFAULT_SHORTCUT_KEYS['save']),
      description: 'Save current workflow',
      category: 'General',
      enabled: isShortcutEnabled('save'),
      action: () => {
        if (activeTab === 'workflow') {
          window.dispatchEvent(new CustomEvent('shortcut-save-workflow'));
          showShortcutToast('Saved', getEffectiveKey('save', DEFAULT_SHORTCUT_KEYS['save']));
        }
      },
    },
    {
      id: 'search',
      key: getEffectiveKey('search', DEFAULT_SHORTCUT_KEYS['search']),
      description: 'Focus search',
      category: 'General',
      enabled: isShortcutEnabled('search'),
      action: () => {
        window.dispatchEvent(new CustomEvent('shortcut-focus-search'));
      },
    },
    {
      id: 'export',
      key: getEffectiveKey('export', DEFAULT_SHORTCUT_KEYS['export']),
      description: 'Export data',
      category: 'Data',
      enabled: isShortcutEnabled('export'),
      action: () => {
        // Open settings to data section and trigger export dialog
        openSettings('data');
        // Dispatch event to open export dialog after settings page opens
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('settings-open-export'));
        }, 100);
      },
    },
    {
      id: 'import',
      key: getEffectiveKey('import', DEFAULT_SHORTCUT_KEYS['import']),
      description: 'Import data',
      category: 'Data',
      enabled: isShortcutEnabled('import'),
      action: () => {
        // Open settings to data section and trigger import dialog
        openSettings('data');
        // Dispatch event to open import dialog after settings page opens
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('settings-open-import'));
        }, 100);
      },
    },
    {
      id: 'tab-projects',
      key: getEffectiveKey('tab-projects', DEFAULT_SHORTCUT_KEYS['tab-projects']),
      description: 'Switch to Projects tab',
      category: 'Navigation',
      enabled: isShortcutEnabled('tab-projects'),
      action: () => {
        setActiveTab('project-manager');
        showShortcutToast('Projects', getEffectiveKey('tab-projects', DEFAULT_SHORTCUT_KEYS['tab-projects']));
      },
    },
    {
      id: 'tab-workflows',
      key: getEffectiveKey('tab-workflows', DEFAULT_SHORTCUT_KEYS['tab-workflows']),
      description: 'Switch to Workflows tab',
      category: 'Navigation',
      enabled: isShortcutEnabled('tab-workflows'),
      action: () => {
        setActiveTab('workflow');
        showShortcutToast('Workflows', getEffectiveKey('tab-workflows', DEFAULT_SHORTCUT_KEYS['tab-workflows']));
      },
    },
    {
      id: 'stop-all',
      key: getEffectiveKey('stop-all', DEFAULT_SHORTCUT_KEYS['stop-all']),
      description: 'Stop all running processes',
      category: 'Execution',
      enabled: isShortcutEnabled('stop-all'),
      action: () => {
        if (runningProcessInfo.count > 0) {
          handleKillAllNodeProcesses();
        }
      },
    },
    {
      id: 'deploy',
      key: getEffectiveKey('deploy', DEFAULT_SHORTCUT_KEYS['deploy']),
      description: 'Quick deploy current project',
      category: 'Execution',
      enabled: isShortcutEnabled('deploy'),
      action: () => {
        if (activeTab === 'project-manager') {
          window.dispatchEvent(new CustomEvent('shortcut-deploy'));
          showShortcutToast('Deploy', getEffectiveKey('deploy', DEFAULT_SHORTCUT_KEYS['deploy']));
        }
      },
    },
    {
      id: 'help',
      key: getEffectiveKey('help', DEFAULT_SHORTCUT_KEYS['help']),
      description: 'Show keyboard shortcuts',
      category: 'Help',
      enabled: isShortcutEnabled('help'),
      action: () => {
        setShortcutsDialogOpen(true);
      },
    },
    {
      id: 'settings',
      key: getEffectiveKey('settings', DEFAULT_SHORTCUT_KEYS['settings']),
      description: 'Open Settings',
      category: 'General',
      enabled: isShortcutEnabled('settings'),
      action: () => {
        openSettings();
        showShortcutToast('Settings', getEffectiveKey('settings', DEFAULT_SHORTCUT_KEYS['settings']));
      },
    },
  ], [activeTab, showShortcutToast, runningProcessInfo.count, handleKillAllNodeProcesses, getEffectiveKey, isShortcutEnabled, openSettings]);

  const displayShortcuts: KeyboardShortcut[] = useMemo(() => [
    { id: 'refresh', key: DEFAULT_SHORTCUT_KEYS['refresh'], description: 'Reload projects & workflows', category: 'General', action: () => {} },
    { id: 'new', key: DEFAULT_SHORTCUT_KEYS['new'], description: 'New item (context-aware)', category: 'General', action: () => {} },
    { id: 'save', key: DEFAULT_SHORTCUT_KEYS['save'], description: 'Save current workflow', category: 'General', action: () => {} },
    { id: 'search', key: DEFAULT_SHORTCUT_KEYS['search'], description: 'Focus search', category: 'General', action: () => {} },
    { id: 'settings', key: DEFAULT_SHORTCUT_KEYS['settings'], description: 'Open Settings', category: 'General', action: () => {} },
    { id: 'export', key: DEFAULT_SHORTCUT_KEYS['export'], description: 'Export data', category: 'Data', action: () => {} },
    { id: 'import', key: DEFAULT_SHORTCUT_KEYS['import'], description: 'Import data', category: 'Data', action: () => {} },
    { id: 'tab-projects', key: DEFAULT_SHORTCUT_KEYS['tab-projects'], description: 'Switch to Projects tab', category: 'Navigation', action: () => {} },
    { id: 'tab-workflows', key: DEFAULT_SHORTCUT_KEYS['tab-workflows'], description: 'Switch to Workflows tab', category: 'Navigation', action: () => {} },
    { id: 'stop-all', key: DEFAULT_SHORTCUT_KEYS['stop-all'], description: 'Stop all running processes', category: 'Execution', action: () => {} },
    { id: 'deploy', key: DEFAULT_SHORTCUT_KEYS['deploy'], description: 'Quick deploy current project', category: 'Execution', action: () => {} },
    { id: 'help', key: DEFAULT_SHORTCUT_KEYS['help'], description: 'Show keyboard shortcuts', category: 'Help', action: () => {} },
  ], []);

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen flex flex-col bg-background rounded-lg overflow-hidden select-none">
      <header data-tauri-drag-region className="flex items-center justify-between border-b border-border bg-card h-10 flex-shrink-0">
        <div data-tauri-drag-region className="flex-1 h-full pl-20" />
        <div className="flex items-center gap-1 px-2">
          <div className="relative group">
            <button
              onClick={handleKillAllNodeProcesses}
              disabled={isKilling || runningProcessInfo.count === 0}
              className={`p-1.5 rounded transition-colors relative ${
                killSuccess
                  ? 'bg-gradient-to-r from-green-500/20 to-blue-500/20'
                  : isKilling
                  ? 'bg-amber-500/20 cursor-wait'
                  : runningProcessInfo.count > 0
                  ? 'hover:bg-red-500/20'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              aria-label="Stop all running processes"
            >
              {killSuccess ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : isKilling ? (
                <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              ) : (
                <Cable className={`w-4 h-4 ${runningProcessInfo.count > 0 ? 'text-blue-400' : 'text-muted-foreground'}`} />
              )}
              {runningProcessInfo.count > 0 && !killSuccess && !isKilling && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] leading-[14px] rounded-full flex items-center justify-center shadow-sm">
                  {runningProcessInfo.count}
                </span>
              )}
            </button>
            {!isKilling && !killSuccess && (
              <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-background border border-border rounded-lg shadow-lg text-sm text-foreground whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[200px]">
                <div className="font-medium text-red-400 mb-1">Stop All Processes</div>
                {runningProcessInfo.count > 0 ? (
                  <>
                    <div className="text-xs text-muted-foreground mb-2">
                      {runningProcessInfo.count} running process{runningProcessInfo.count > 1 ? 'es' : ''}:
                    </div>
                    <div className="text-xs space-y-1">
                      {runningProcessInfo.scripts.map((script, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse mt-1 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              {script.projectName && (
                                <span className="text-blue-400 text-[10px] truncate">
                                  {script.projectName}:
                                </span>
                              )}
                              <span className="text-green-400 truncate">
                                {script.scriptName}
                              </span>
                              {script.port && (
                                <span className="text-yellow-400 text-[10px] ml-auto flex-shrink-0">
                                  :{script.port}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {runningProcessInfo.hasMore && (
                        <div className="text-muted-foreground pl-3">
                          ...and {runningProcessInfo.count - 5} more
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No processes running
                  </div>
                )}
                <div className="absolute -top-1 right-4 w-2 h-2 bg-background border-l border-t border-border transform rotate-45" />
              </div>
            )}
          </div>
          <button
            onClick={() => openSettings('mcp')}
            className="relative group mr-1 p-1 rounded hover:bg-muted transition-colors"
          >
            <McpIcon
              className={`w-4 h-4 ${!mcpStatus.isEnabled ? 'text-muted-foreground' : ''}`}
              gradient={mcpStatus.isEnabled}
              gradientColors={['#22c55e', '#3b82f6']}
            />
            <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-background border border-border rounded-lg shadow-lg text-sm text-foreground whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              {mcpStatus.isEnabled ? (
                <>
                  <div className="font-medium text-green-400 mb-1">MCP Server Enabled</div>
                  <div className="text-xs text-muted-foreground">
                    AI tools can access PackageFlow
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-muted-foreground mb-1">MCP Server Disabled</div>
                  <div className="text-xs text-muted-foreground">
                    Click to configure
                  </div>
                </>
              )}
              <div className="absolute -top-1 right-4 w-2 h-2 bg-background border-l border-t border-border transform rotate-45" />
            </div>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <SettingsButton onClick={() => openSettings()} />
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <nav className="flex items-center gap-6 px-4 border-b border-border bg-card">
          <button
            onClick={() => setActiveTab('project-manager')}
            className={`relative py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'project-manager'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Projects
            {activeTab === 'project-manager' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('workflow')}
            className={`relative py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'workflow'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Workflows
            {activeTab === 'workflow' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        </nav>

        {activeTab === 'workflow' && (
          <div className="flex-1 overflow-hidden">
            <WorkflowPage
              initialWorkflow={workflowNavState?.workflow}
              defaultCwd={workflowNavState?.projectPath}
              onClearNavState={handleClearWorkflowNavState}
              dataVersion={dataVersion}
            />
          </div>
        )}

        {activeTab === 'project-manager' && (
          <div className="flex-1 overflow-hidden">
            <ProjectManagerPage
              onNavigateToWorkflow={handleNavigateToWorkflow}
              dataVersion={dataVersion}
              ptyTerminalRef={ptyTerminalRef}
              isTerminalCollapsed={isTerminalCollapsed}
              onToggleTerminalCollapse={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
              onOpenSettings={openSettings}
            />
          </div>
        )}
      </main>


      <TerminalPortal container={terminalPortalContainer}>
        <ScriptPtyTerminal
          ref={ptyTerminalRef}
          isCollapsed={isTerminalCollapsed}
          onToggleCollapse={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
          onRegisterPtyExecution={registerPtyExecution}
          onUpdatePtyOutput={updatePtyOutput}
          onUpdatePtyStatus={updatePtyStatus}
          onRemovePtyExecution={removePtyExecution}
          killAllPtySignal={killAllPtySignal}
          sessionPorts={sessionPorts}
          onRegisterKillAllFn={registerKillAllPtyFn}
        />
      </TerminalPortal>

      <SettingsPage
        isOpen={settingsPageOpen}
        onClose={() => setSettingsPageOpen(false)}
        initialSection={settingsInitialSection}
        onImportComplete={handleImportComplete}
      />

      <KeyboardShortcutsFloatingButton
        onClick={() => setShortcutsDialogOpen(true)}
        position="bottom-right"
        bottomOffset={64}
      />

      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
        shortcuts={displayShortcuts}
        onCustomize={() => openSettings('shortcuts')}
      />

      <ShortcutToast
        message={shortcutToast?.message || ''}
        shortcutKey={shortcutToast?.key || ''}
        visible={!!shortcutToast}
        onHide={() => setShortcutToast(null)}
      />
    </div>
  );
}

export default App;
