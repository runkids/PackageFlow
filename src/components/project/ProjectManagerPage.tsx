/**
 * Project manager page (integrates all components)
 * @see specs/002-frontend-project-manager/spec.md
 */

import { useState, useMemo, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useProject } from '../../hooks/useProject';
import { useScriptExecutionContext } from '../../contexts/ScriptExecutionContext';
import {
  open as openDialog,
  scriptAPI,
  worktreeAPI,
  fileWatcherAPI,
  tauriEvents,
  type Worktree,
} from '../../lib/tauri-api';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { ProjectSidebar } from './ProjectSidebar';
import { ProjectExplorer } from './ProjectExplorer';
import type { ScriptPtyTerminalRef } from '../terminal';
import type { Workflow } from '../../types/workflow';
import type { Project } from '../../types/project';
import type { SettingsSection } from '../../types/settings';

interface ProjectManagerPageProps {
  onNavigateToWorkflow?: (workflow: Workflow, projectPath: string) => void;
  /** Data version (for triggering reload, e.g., after import) */
  dataVersion?: number;
  /** PTY Terminal ref - passed from App level */
  ptyTerminalRef?: RefObject<ScriptPtyTerminalRef | null>;
  /** Whether terminal is collapsed */
  isTerminalCollapsed?: boolean;
  /** Toggle terminal collapse state */
  onToggleTerminalCollapse?: () => void;
  /** Callback to open the global settings page */
  onOpenSettings?: (section?: SettingsSection) => void;
  /** Feature 024: Callback to open AI Assistant with project context */
  onOpenAIAssistant?: (projectPath: string) => void;
  /** Feature: Open AI conversation in AI Assistant page */
  onOpenAIConversation?: (conversationId: string, projectPath: string) => void;
}

export function ProjectManagerPage({
  onNavigateToWorkflow,
  dataVersion,
  ptyTerminalRef,
  isTerminalCollapsed = false,
  onToggleTerminalCollapse,
  onOpenSettings,
  onOpenAIAssistant,
  onOpenAIConversation,
}: ProjectManagerPageProps) {
  // Project state
  const {
    projects,
    activeProjectId,
    isLoading: isProjectLoading,
    error: projectError,
    sortMode,
    projectOrder,
    loadProjects,
    addProject,
    removeProject,
    setActiveProject,
    refreshProject,
    updateProject,
    setSortMode,
    updateProjectOrder,
    getActiveProject,
    getProjectWorkspaces,
  } = useProject();

  // Reload when dataVersion changes (e.g., after import)
  useEffect(() => {
    if (dataVersion !== undefined && dataVersion > 0) {
      loadProjects();
    }
  }, [dataVersion, loadProjects]);

  // Script execution state - using shared Context
  const { runningScripts } = useScriptExecutionContext();

  // UI state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Get active project
  const activeProject = getActiveProject();

  // Get active project's workspaces
  const activeWorkspaces = activeProjectId ? getProjectWorkspaces(activeProjectId) : [];

  // Worktrees state
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState<string | undefined>(undefined);

  // Create running scripts map (for tracking execution state in each worktree/workspace)
  const runningScriptsMap = useMemo(() => {
    const map = new Map<string, { scriptName: string; projectPath: string; status: string }>();
    for (const [id, script] of runningScripts) {
      map.set(id, {
        scriptName: script.scriptName,
        projectPath: script.projectPath,
        status: script.status,
      });
    }
    return map;
  }, [runningScripts]);

  // Calculate running commands (extracted from runningScripts)
  const currentProjectRunningCommands = useMemo(() => {
    if (!activeProject) return new Set<string>();
    const result = new Set<string>();
    for (const [, script] of runningScripts) {
      if (script.projectPath === activeProject.path && script.status === 'running') {
        result.add(script.scriptName);
      }
    }
    return result;
  }, [activeProject, runningScripts]);

  // Load worktrees
  const loadWorktrees = useCallback(async () => {
    if (!activeProject) {
      setWorktrees([]);
      setSelectedWorktreePath(undefined);
      return;
    }

    try {
      const isGit = await worktreeAPI.isGitRepo(activeProject.path);
      if (isGit) {
        const response = await worktreeAPI.listWorktrees(activeProject.path);
        if (response.success && response.worktrees) {
          setWorktrees(response.worktrees);
          // Default select main worktree (project path)
          if (
            !selectedWorktreePath ||
            !response.worktrees.some((w) => w.path === selectedWorktreePath)
          ) {
            setSelectedWorktreePath(activeProject.path);
          }
        }
      } else {
        setWorktrees([]);
        setSelectedWorktreePath(activeProject.path);
      }
    } catch (err) {
      console.error('Failed to load worktrees:', err);
      setWorktrees([]);
      setSelectedWorktreePath(activeProject?.path);
    }
  }, [activeProject, selectedWorktreePath]);

  // Load worktrees and auto-refresh project data when project changes
  useEffect(() => {
    loadWorktrees();
    // Auto-refresh selected project data
    if (activeProjectId) {
      refreshProject(activeProjectId);
    }
  }, [activeProjectId]);

  // Track previous running scripts state to detect completion
  const prevRunningScriptsRef = useRef<Map<string, string>>(new Map());

  // Auto-refresh project when scripts complete (to update package.json changes)
  useEffect(() => {
    if (!activeProjectId) return;

    const prevStates = prevRunningScriptsRef.current;
    let shouldRefresh = false;

    // Check if any script transitioned from 'running' to 'completed' or 'failed'
    for (const [id, script] of runningScripts) {
      const prevStatus = prevStates.get(id);
      if (
        prevStatus === 'running' &&
        (script.status === 'completed' || script.status === 'failed')
      ) {
        // Script just completed - check if it's related to current project
        if (
          script.projectPath === activeProject?.path ||
          script.projectPath === selectedWorktreePath ||
          worktrees.some((w) => w.path === script.projectPath)
        ) {
          shouldRefresh = true;
          break;
        }
      }
    }

    // Update prev states ref
    const newStates = new Map<string, string>();
    for (const [id, script] of runningScripts) {
      newStates.set(id, script.status);
    }
    prevRunningScriptsRef.current = newStates;

    // Debounce refresh to avoid rapid successive calls
    if (shouldRefresh) {
      const timeoutId = setTimeout(() => {
        refreshProject(activeProjectId);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [
    runningScripts,
    activeProjectId,
    activeProject?.path,
    selectedWorktreePath,
    worktrees,
    refreshProject,
  ]);

  // Watch package.json for changes (file watcher)
  useEffect(() => {
    if (!activeProject?.path) return;

    // Start watching the project's package.json
    fileWatcherAPI.watchProject(activeProject.path).then((response) => {
      if (!response.success) {
        console.warn('[FileWatcher] Failed to watch project:', response.error);
      }
    });

    // Also watch worktrees
    for (const worktree of worktrees) {
      if (worktree.path !== activeProject.path) {
        fileWatcherAPI.watchProject(worktree.path).catch((err) => {
          console.warn('[FileWatcher] Failed to watch worktree:', err);
        });
      }
    }

    // Cleanup: unwatch when project changes
    return () => {
      fileWatcherAPI.unwatchProject(activeProject.path).catch(() => {});
      for (const worktree of worktrees) {
        if (worktree.path !== activeProject.path) {
          fileWatcherAPI.unwatchProject(worktree.path).catch(() => {});
        }
      }
    };
  }, [activeProject?.path, worktrees]);

  // Listen for package.json changes and refresh project
  useEffect(() => {
    if (!activeProjectId) return;

    let unlistenFn: (() => void) | null = null;

    tauriEvents
      .onPackageJsonChanged((payload) => {
        // Check if the changed file belongs to current project or its worktrees
        if (
          payload.project_path === activeProject?.path ||
          worktrees.some((w) => w.path === payload.project_path)
        ) {
          console.log(
            '[FileWatcher] package.json changed, refreshing project:',
            payload.project_path
          );
          refreshProject(activeProjectId);
        }
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      });

    return () => {
      unlistenFn?.();
    };
  }, [activeProjectId, activeProject?.path, worktrees, refreshProject]);

  // Handle add project
  const handleAddProject = useCallback(async () => {
    // Use Tauri's directory selection dialog
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select project directory',
    });
    if (!selected || typeof selected !== 'string') return;

    const result = await addProject(selected);
    if (!result.success && result.error) {
      console.error('Failed to add project:', result.error);
    }
  }, [addProject]);

  // Listen for Cmd+N shortcut event to create new project
  useEffect(() => {
    const handleShortcutNewProject = () => {
      handleAddProject();
    };

    window.addEventListener('shortcut-new-project', handleShortcutNewProject);
    return () => window.removeEventListener('shortcut-new-project', handleShortcutNewProject);
  }, [handleAddProject]);

  // Handle execute script
  const handleExecuteScript = useCallback(
    async (scriptName: string, cwd?: string) => {
      if (!activeProject || !ptyTerminalRef?.current) return;

      const projectPath = cwd || activeProject.path;
      const pm = activeProject.packageManager;
      const baseCommand = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm';
      const baseArgs = pm === 'npm' ? ['run', scriptName] : [scriptName];

      // Get Volta-wrapped command if project has volta config
      const wrapped = await scriptAPI.getVoltaWrappedCommand(baseCommand, baseArgs, projectPath);

      await ptyTerminalRef.current.spawnSession(
        wrapped.command,
        wrapped.args,
        projectPath,
        scriptName,
        activeProject.name
      );
      // Expand terminal if collapsed
      if (isTerminalCollapsed) {
        onToggleTerminalCollapse?.();
      }
    },
    [activeProject, ptyTerminalRef, isTerminalCollapsed, onToggleTerminalCollapse]
  );

  // Handle cancel script (using PTY terminal)
  const handleCancelScript = useCallback(
    async (scriptName: string, cwd?: string) => {
      // Find corresponding sessionId (must match both scriptName and projectPath)
      for (const [id, script] of runningScripts) {
        if (
          script.scriptName === scriptName &&
          script.status === 'running' &&
          (!cwd || script.projectPath === cwd)
        ) {
          // Use PTY terminal's killSession to terminate process
          ptyTerminalRef?.current?.killSession(id);
          break;
        }
      }
    },
    [runningScripts, ptyTerminalRef]
  );

  // Handle cancel command (same logic as cancel script, both use PTY)
  const handleCancelCommand = useCallback(
    async (commandId: string) => {
      if (!activeProject) return;
      // Find corresponding sessionId (match commandId and projectPath)
      for (const [id, script] of runningScripts) {
        if (
          script.scriptName === commandId &&
          script.status === 'running' &&
          script.projectPath === activeProject.path
        ) {
          // Use PTY terminal's killSession to terminate process
          ptyTerminalRef?.current?.killSession(id);
          break;
        }
      }
    },
    [activeProject, runningScripts, ptyTerminalRef]
  );

  // Handle execute package manager command
  const handleExecuteCommand = useCallback(
    async (command: string) => {
      if (!activeProject || !ptyTerminalRef?.current) return;

      // Extract ID from command (e.g., 'install', 'update', etc.)
      // Handle volta wrapped case: "/path/to/volta run yarn install" -> "install"
      // Or general case: "yarn install" -> "install"
      const parts = command.trim().split(/\s+/);
      let commandId: string;

      // Check if it's a volta run wrapped command
      const voltaRunIndex = parts.findIndex(
        (p, i) => p === 'run' && i > 0 && parts[i - 1].endsWith('volta')
      );

      if (voltaRunIndex !== -1 && parts.length > voltaRunIndex + 2) {
        // volta run <pm> <action> -> take <action>
        commandId = parts[voltaRunIndex + 2] || parts[voltaRunIndex + 1];
      } else {
        // General case: <pm> <action> -> take <action>
        commandId = parts[1] || parts[0];
      }

      // Parse command: first part is command, rest are arguments
      const cmd = parts[0];
      const args = parts.slice(1);

      await ptyTerminalRef.current.spawnSession(
        cmd,
        args,
        selectedWorktreePath || activeProject.path,
        commandId,
        activeProject.name
      );
      // Expand terminal if collapsed
      if (isTerminalCollapsed) {
        onToggleTerminalCollapse?.();
      }
    },
    [
      activeProject,
      selectedWorktreePath,
      ptyTerminalRef,
      isTerminalCollapsed,
      onToggleTerminalCollapse,
    ]
  );

  // Handle refresh project
  const handleRefreshProject = useCallback(async () => {
    if (!activeProjectId) return;
    await refreshProject(activeProjectId);
  }, [activeProjectId, refreshProject]);

  const handleUpdateActiveProject = useCallback(
    async (updater: (project: Project) => Project) => {
      if (!activeProjectId) return;
      await updateProject(activeProjectId, updater);
    },
    [activeProjectId, updateProject]
  );

  // Handle open in Finder
  const handleOpenInFinder = useCallback(async () => {
    if (!activeProject) return;
    try {
      await revealItemInDir(activeProject.path);
    } catch (error) {
      console.error('Failed to open in Finder:', error);
    }
  }, [activeProject]);

  // Handle open in VS Code
  const handleOpenInVSCode = useCallback(async () => {
    if (!activeProject) return;
    try {
      const result = await scriptAPI.executeCommand({
        command: 'open',
        args: ['-a', 'Visual Studio Code', activeProject.path],
        cwd: activeProject.path,
      });
      if (!result.success) {
        console.error('Failed to open in VS Code:', result.error);
      }
    } catch (error) {
      console.error('Failed to open in VS Code:', error);
    }
  }, [activeProject]);

  // Handle open interactive terminal
  const handleOpenTerminal = useCallback(async () => {
    if (!activeProject || !ptyTerminalRef?.current) return;

    // macOS defaults to zsh
    await ptyTerminalRef.current.spawnSession(
      'zsh',
      [],
      selectedWorktreePath || activeProject.path,
      'shell',
      activeProject.name
    );
    // Expand terminal if collapsed
    if (isTerminalCollapsed) {
      onToggleTerminalCollapse?.();
    }
  }, [
    activeProject,
    selectedWorktreePath,
    ptyTerminalRef,
    isTerminalCollapsed,
    onToggleTerminalCollapse,
  ]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Error message */}
      {projectError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-sm text-red-400">
          {projectError}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          isLoading={isProjectLoading}
          isCollapsed={isSidebarCollapsed}
          sortMode={sortMode}
          projectOrder={projectOrder}
          onSelectProject={setActiveProject}
          onAddProject={handleAddProject}
          onRemoveProject={removeProject}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onSortModeChange={setSortMode}
          onProjectOrderChange={updateProjectOrder}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Project explorer */}
          <ProjectExplorer
            project={activeProject}
            workspaces={activeWorkspaces}
            runningScriptsMap={runningScriptsMap}
            runningCommands={currentProjectRunningCommands}
            isLoading={isProjectLoading}
            worktrees={worktrees}
            selectedWorktreePath={selectedWorktreePath}
            onWorktreeChange={setSelectedWorktreePath}
            onWorktreesChange={loadWorktrees}
            onRefresh={handleRefreshProject}
            onUpdateProject={handleUpdateActiveProject}
            onExecuteScript={handleExecuteScript}
            onCancelScript={handleCancelScript}
            onExecuteCommand={handleExecuteCommand}
            onCancelCommand={handleCancelCommand}
            onOpenInFinder={handleOpenInFinder}
            onOpenInVSCode={handleOpenInVSCode}
            onOpenTerminal={handleOpenTerminal}
            onOpenSettings={onOpenSettings}
            onNavigateToWorkflow={onNavigateToWorkflow}
            onOpenAIAssistant={onOpenAIAssistant}
            onOpenAIConversation={onOpenAIConversation}
          />
          {/* PTY Terminal Portal container - Terminal renders here via Portal */}
          <div id="terminal-portal-container" />
        </div>
      </div>
    </div>
  );
}
