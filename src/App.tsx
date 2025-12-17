import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { WorkflowPage } from './components/workflow/WorkflowPage';
import { ProjectManagerPage } from './components/project/ProjectManagerPage';
import { useScriptExecutionContext } from './contexts/ScriptExecutionContext';
import { useShortcutsContext } from './contexts/ShortcutsContext';
import type { Workflow } from './types/workflow';
import { scriptAPI, confirm } from './lib/tauri-api';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsButton } from './components/settings/SettingsButton';
import { SettingsPage } from './components/settings/SettingsPage';
import { Button } from './components/ui/Button';
import type { SettingsSection } from './types/settings';
import { useKeyboardShortcuts, type KeyboardShortcut } from './hooks/useKeyboardShortcuts';
import { ShortcutToast } from './components/ui/KeyboardShortcutsHint';
import {
  KeyboardShortcutsDialog,
  KeyboardShortcutsFloatingButton,
} from './components/ui/KeyboardShortcutsDialog';
import { ScriptPtyTerminal, type ScriptPtyTerminalRef } from './components/terminal';
import { useUpdater } from './hooks/useUpdater';
import { UpdateDialog } from './components/ui/UpdateDialog';
import { useMcpStatus } from './hooks/useMcpStatus';
import {
  NotificationButton,
  BackgroundTasksButton,
  StopProcessesButton,
  McpStatusButton,
} from './components/status-bar';
import { ActionConfirmationDialog } from './components/settings/mcp';
import { AIAssistantPage } from './components/ai-assistant';
import type { AIProjectContext } from './types/ai-assistant';

type AppTab = 'workflow' | 'project-manager' | 'ai-assistant';

const DEFAULT_SHORTCUT_KEYS: Record<string, string> = {
  refresh: 'cmd+r',
  new: 'cmd+n',
  save: 'cmd+s',
  search: 'cmd+f',
  export: 'cmd+e',
  import: 'cmd+i',
  'tab-projects': 'cmd+1',
  'tab-workflows': 'cmd+2',
  'tab-ai-assistant': 'cmd+3',
  'stop-all': 'cmd+shift+k',
  deploy: 'cmd+shift+d',
  help: 'cmd+/',
  settings: 'cmd+,',
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
  // Update dialog state
  const {
    dialogOpen: updateDialogOpen,
    setDialogOpen: setUpdateDialogOpen,
    state: updateState,
    currentVersion,
    newVersion,
    releaseNotes,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    error: updateError,
    startUpdate,
    dismissUpdate,
    restartApp,
    retryUpdate,
  } = useUpdater();

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

  // AI Assistant project context state (Feature 024: Context-Aware AI)
  const [aiProjectContext, setAiProjectContext] = useState<AIProjectContext>({
    projectPath: null,
    source: null,
  });

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
    const running = Array.from(runningScripts.values()).filter((s) => s.status === 'running');
    const allPorts = running
      .map((s) => s.port)
      .filter((port): port is number => port !== undefined);
    return {
      count: running.length,
      scripts: running
        .map((s) => ({
          scriptName: s.scriptName,
          projectName: s.projectName,
          port: s.port,
        }))
        .slice(0, 5),
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
          const scriptsList = info.scripts
            .map((s) => {
              let line = s.projectName ? `${s.projectName}: ${s.scriptName}` : s.scriptName;
              if (s.port) line += ` :${s.port}`;
              return line;
            })
            .join('\n');
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

  // Feature 024: Open AI Assistant with optional project context
  // Will be used in Stage 4 (Navigation Integration)
  const handleOpenAIAssistant = useCallback((projectPath?: string) => {
    if (projectPath) {
      setAiProjectContext({ projectPath, source: 'navigation' });
    }
    setActiveTab('ai-assistant');
  }, []);

  // Feature 024: Clear AI project context
  const handleClearAIProjectContext = useCallback(() => {
    setAiProjectContext({ projectPath: null, source: null });
  }, []);

  // Feature 024: Update AI project context manually
  const handleSetAIProjectContext = useCallback((projectPath: string | null) => {
    setAiProjectContext({
      projectPath,
      source: projectPath ? 'manual' : null,
    });
  }, []);

  const handleKillAllNodeProcesses = useCallback(async () => {
    if (isKilling) return;

    console.log('handleKillAllNodeProcesses: starting, runningScripts count:', runningScripts.size);
    console.log(
      'handleKillAllNodeProcesses: running scripts:',
      Array.from(runningScripts.entries()).map(([id, s]) => ({
        id,
        name: s.scriptName,
        status: s.status,
      }))
    );

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

  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        id: 'refresh',
        key: getEffectiveKey('refresh', DEFAULT_SHORTCUT_KEYS['refresh']),
        description: 'Reload projects & workflows',
        category: 'General',
        enabled: isShortcutEnabled('refresh'),
        action: () => {
          setDataVersion((prev) => prev + 1);
          showShortcutToast(
            'Reloaded',
            getEffectiveKey('refresh', DEFAULT_SHORTCUT_KEYS['refresh'])
          );
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
          showShortcutToast(
            'Projects',
            getEffectiveKey('tab-projects', DEFAULT_SHORTCUT_KEYS['tab-projects'])
          );
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
          showShortcutToast(
            'Workflows',
            getEffectiveKey('tab-workflows', DEFAULT_SHORTCUT_KEYS['tab-workflows'])
          );
        },
      },
      {
        id: 'tab-ai-assistant',
        key: getEffectiveKey('tab-ai-assistant', DEFAULT_SHORTCUT_KEYS['tab-ai-assistant']),
        description: 'Switch to AI Assistant tab',
        category: 'Navigation',
        enabled: isShortcutEnabled('tab-ai-assistant'),
        action: () => {
          setActiveTab('ai-assistant');
          showShortcutToast(
            'AI Assistant',
            getEffectiveKey('tab-ai-assistant', DEFAULT_SHORTCUT_KEYS['tab-ai-assistant'])
          );
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
          showShortcutToast(
            'Settings',
            getEffectiveKey('settings', DEFAULT_SHORTCUT_KEYS['settings'])
          );
        },
      },
    ],
    [
      activeTab,
      showShortcutToast,
      runningProcessInfo.count,
      handleKillAllNodeProcesses,
      getEffectiveKey,
      isShortcutEnabled,
      openSettings,
    ]
  );

  const displayShortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        id: 'refresh',
        key: DEFAULT_SHORTCUT_KEYS['refresh'],
        description: 'Reload projects & workflows',
        category: 'General',
        action: () => {},
      },
      {
        id: 'new',
        key: DEFAULT_SHORTCUT_KEYS['new'],
        description: 'New item (context-aware)',
        category: 'General',
        action: () => {},
      },
      {
        id: 'save',
        key: DEFAULT_SHORTCUT_KEYS['save'],
        description: 'Save current workflow',
        category: 'General',
        action: () => {},
      },
      {
        id: 'search',
        key: DEFAULT_SHORTCUT_KEYS['search'],
        description: 'Focus search',
        category: 'General',
        action: () => {},
      },
      {
        id: 'settings',
        key: DEFAULT_SHORTCUT_KEYS['settings'],
        description: 'Open Settings',
        category: 'General',
        action: () => {},
      },
      {
        id: 'export',
        key: DEFAULT_SHORTCUT_KEYS['export'],
        description: 'Export data',
        category: 'Data',
        action: () => {},
      },
      {
        id: 'import',
        key: DEFAULT_SHORTCUT_KEYS['import'],
        description: 'Import data',
        category: 'Data',
        action: () => {},
      },
      {
        id: 'tab-projects',
        key: DEFAULT_SHORTCUT_KEYS['tab-projects'],
        description: 'Switch to Projects tab',
        category: 'Navigation',
        action: () => {},
      },
      {
        id: 'tab-workflows',
        key: DEFAULT_SHORTCUT_KEYS['tab-workflows'],
        description: 'Switch to Workflows tab',
        category: 'Navigation',
        action: () => {},
      },
      {
        id: 'tab-ai-assistant',
        key: DEFAULT_SHORTCUT_KEYS['tab-ai-assistant'],
        description: 'Switch to AI Assistant tab',
        category: 'Navigation',
        action: () => {},
      },
      {
        id: 'stop-all',
        key: DEFAULT_SHORTCUT_KEYS['stop-all'],
        description: 'Stop all running processes',
        category: 'Execution',
        action: () => {},
      },
      {
        id: 'deploy',
        key: DEFAULT_SHORTCUT_KEYS['deploy'],
        description: 'Quick deploy current project',
        category: 'Execution',
        action: () => {},
      },
      {
        id: 'help',
        key: DEFAULT_SHORTCUT_KEYS['help'],
        description: 'Show keyboard shortcuts',
        category: 'Help',
        action: () => {},
      },
    ],
    []
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen flex flex-col bg-background rounded-lg overflow-hidden select-none">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between border-b border-border bg-card h-12 flex-shrink-0"
      >
        <div data-tauri-drag-region className="flex-1 h-full pl-20" />
        <div className="flex items-center gap-1 px-2">
          {/* Background Tasks */}
          <BackgroundTasksButton />
          {/* Stop All Processes */}
          <StopProcessesButton
            runningProcessInfo={runningProcessInfo}
            onStopAll={handleKillAllNodeProcesses}
            isKilling={isKilling}
            killSuccess={killSuccess}
          />
          <McpStatusButton
            config={mcpStatus.config}
            isLoading={mcpStatus.isLoading}
            onOpenSettings={() => openSettings('mcp')}
          />
          {/* Notification Center */}
          <NotificationButton />
          <div className="w-px h-5 bg-border mx-1" />
          <SettingsButton onClick={() => openSettings()} />
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <nav className="flex items-center gap-6 px-4 border-b border-border bg-card">
          <Button
            variant="ghost"
            onClick={() => setActiveTab('project-manager')}
            className={`relative py-2.5 text-sm font-medium h-auto rounded-none ${
              activeTab === 'project-manager'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Projects
            {activeTab === 'project-manager' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('workflow')}
            className={`relative py-2.5 text-sm font-medium h-auto rounded-none ${
              activeTab === 'workflow'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Workflows
            {activeTab === 'workflow' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('ai-assistant')}
            className={`relative py-2.5 text-sm font-medium h-auto rounded-none ${
              activeTab === 'ai-assistant'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            AI Assistant
            {activeTab === 'ai-assistant' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </Button>
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
              onOpenAIAssistant={handleOpenAIAssistant}
            />
          </div>
        )}

        {activeTab === 'ai-assistant' && (
          <div className="flex-1 overflow-hidden">
            <AIAssistantPage
              onOpenSettings={() => openSettings('ai-providers')}
              initialProjectPath={aiProjectContext.projectPath ?? undefined}
              onProjectContextChange={handleSetAIProjectContext}
              onClearProjectContext={handleClearAIProjectContext}
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
        bottomOffset={activeTab === 'ai-assistant' ? 150 : activeTab === 'workflow' ? 250 : 64}
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

      {/* Update Dialog */}
      {(updateState === 'available' ||
        updateState === 'downloading' ||
        updateState === 'installing' ||
        updateState === 'complete' ||
        updateState === 'error') && (
        <UpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          state={updateState}
          currentVersion={currentVersion}
          newVersion={newVersion || ''}
          releaseNotes={releaseNotes}
          downloadProgress={downloadProgress}
          downloadedBytes={downloadedBytes}
          totalBytes={totalBytes}
          errorMessage={updateError}
          onUpdate={startUpdate}
          onLater={dismissUpdate}
          onRestart={restartApp}
          onRetry={retryUpdate}
        />
      )}

      {/* MCP Action Confirmation Dialog - floating approval UI */}
      <ActionConfirmationDialog position="bottom-right" />
    </div>
  );
}

export default App;
