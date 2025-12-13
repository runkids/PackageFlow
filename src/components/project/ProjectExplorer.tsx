/**
 * Project explorer main page component
 * @see specs/002-frontend-project-manager/spec.md - US1
 * @see specs/001-worktree-enhancements/tasks.md - T045-T046
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Folder, Package, GitBranch, RefreshCw, ExternalLink, Workflow as WorkflowIcon, FileBox, Code2, Shield, Terminal, Zap, Box, Layers, GitCommit, Hexagon, ChevronDown, Rocket, Search } from 'lucide-react';
import type { Project, WorkspacePackage, PackageManager, MonorepoTool } from '../../types/project';
import type { Workflow } from '../../types/workflow';
import { ipaAPI, apkAPI, worktreeAPI, type Worktree, type EditorDefinition } from '../../lib/tauri-api';
import { TerminalSelector } from './TerminalSelector';
import { ScriptCards } from './ScriptCards';
import { MonorepoView } from './MonorepoView';
import { DependencyGraphView } from './monorepo/DependencyGraphView';
import { ProjectWorkflows } from './ProjectWorkflows';
import { MobileBuildsInspector } from './MobileBuildsInspector';
import { WorktreeQuickSwitcher } from './WorktreeQuickSwitcher';
import { WorktreeSessionDialog } from './WorktreeSessionDialog';
import { SecurityTab } from '../security/SecurityTab';
import { useWorktreeSessions } from '../../hooks/useWorktreeSessions';
import type { MonorepoToolType } from '../../types/monorepo';
import { SecurityReminderBanner } from '../security/SecurityReminderBanner';
import { VersionBadge } from './VersionBadge';
import { GitPanel } from './git';
import { DeployPanel } from './deploy';
import { useWorktreeScripts } from '../../hooks/useWorktreeScripts';
import { useWorktreeStatuses } from '../../hooks/useWorktreeStatuses';
import { useSecurity } from '../../hooks/useSecurity';
import { useScanReminder } from '../../hooks/useScanReminder';
import { FRAMEWORK_CONFIG, UI_FRAMEWORK_CONFIG, shouldShowUIFrameworkBadge } from '../../lib/framework-detector';
import { useSettings } from '../../contexts/SettingsContext';

type TabType = 'scripts' | 'workspaces' | 'workflows' | 'builds' | 'security' | 'git' | 'deploy';

interface ProjectExplorerProps {
  project: Project | null;
  workspaces: WorkspacePackage[];
  /** Map of running scripts for tracking state per worktree */
  runningScriptsMap: Map<string, { scriptName: string; projectPath: string; status: string }>;
  runningCommands: Set<string>;
  isLoading: boolean;
  /** Available worktrees for this project */
  worktrees: Worktree[];
  /** Currently selected worktree path for script execution */
  selectedWorktreePath?: string;
  /** Callback when worktree selection changes */
  onWorktreeChange?: (worktreePath: string) => void;
  /** Callback when worktrees list changes (add/remove from Git panel) */
  onWorktreesChange?: () => void;
  onRefresh: () => void;
  onUpdateProject?: (updater: (project: Project) => Project) => Promise<void>;
  onExecuteScript: (scriptName: string, cwd?: string) => void;
  onCancelScript: (scriptName: string, cwd?: string) => void;
  onExecuteCommand: (command: string) => void;
  onCancelCommand: (commandId: string) => void;
  onOpenInFinder: () => void;
  onOpenInVSCode: () => void;
  onOpenTerminal?: () => void;
  onEditWorkflow?: (workflow: Workflow) => void;
  onNavigateToWorkflow?: (workflow: Workflow, projectPath: string) => void;
}

const packageManagerLabels: Record<PackageManager, string> = {
  npm: 'npm',
  yarn: 'Yarn',
  pnpm: 'pnpm',
  bun: 'Bun',
  unknown: 'Unknown',
};

/** Monorepo tool badge config */
const MONOREPO_TOOL_CONFIG: Record<NonNullable<Exclude<MonorepoTool, null>>, {
  label: string;
  color: string;
  icon: typeof Zap
}> = {
  turbo: { label: 'Turbo', color: 'bg-purple-500/20 text-purple-400', icon: Zap },
  nx: { label: 'Nx', color: 'bg-blue-500/20 text-blue-400', icon: Box },
  lerna: { label: 'Lerna', color: 'bg-amber-500/20 text-amber-400', icon: Layers },
  workspaces: { label: 'Workspaces', color: 'bg-muted text-muted-foreground', icon: Layers },
};

export function ProjectExplorer({
  project,
  workspaces,
  runningScriptsMap,
  runningCommands,
  isLoading,
  worktrees: externalWorktrees,
  selectedWorktreePath,
  onWorktreeChange,
  onWorktreesChange,
  onRefresh,
  onUpdateProject,
  onExecuteScript,
  onCancelScript,
  onExecuteCommand,
  onCancelCommand,
  onOpenInFinder,
  onOpenInVSCode,
  onOpenTerminal,
  onEditWorkflow,
  onNavigateToWorkflow,
}: ProjectExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('scripts');
  const [hasIpaFiles, setHasIpaFiles] = useState(false);
  const [ipaCount, setIpaCount] = useState(0);
  const [hasApkFiles, setHasApkFiles] = useState(false);
  const [apkCount, setApkCount] = useState(0);
  const [versionRefreshKey, setVersionRefreshKey] = useState(0);

  // Quick Switcher state
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [availableEditors, setAvailableEditors] = useState<EditorDefinition[]>([]);

  // Session Dialog state (for Quick Switcher integration)
  const [sessionDialogWorktreePath, setSessionDialogWorktreePath] = useState<string | null>(null);

  // Dependency Graph state (008-monorepo-support)
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [selectedMonorepoTool, setSelectedMonorepoTool] = useState<MonorepoToolType | null>(null);

  // Editor dropdown state
  const [isEditorDropdownOpen, setIsEditorDropdownOpen] = useState(false);


  // Get all worktrees (prefer external if provided)
  const allWorktrees = useMemo(() => {
    return externalWorktrees.length > 0 ? externalWorktrees : worktrees;
  }, [externalWorktrees, worktrees]);

  // Current worktree info
  const currentWorktree = useMemo(() => {
    if (!selectedWorktreePath) {
      return allWorktrees.find(w => w.isMain) || null;
    }
    return allWorktrees.find(w => w.path === selectedWorktreePath) || null;
  }, [allWorktrees, selectedWorktreePath]);

  // Display path (show selected worktree path if different from project path)
  const displayPath = useMemo(() => {
    if (selectedWorktreePath && selectedWorktreePath !== project?.path) {
      return selectedWorktreePath;
    }
    return project?.path || '';
  }, [selectedWorktreePath, project?.path]);

  // Settings context for path formatting
  const { formatPath } = useSettings();

  // Worktree scripts hook
  const { executeScriptInWorktree, getCategorizedScripts } = useWorktreeScripts();
  const categorizedScripts = project ? getCategorizedScripts(project.scripts) : [];

  // Worktree statuses hook for the selector
  const {
    statuses: worktreeStatuses,
    isLoading: isLoadingStatuses,
  } = useWorktreeStatuses({
    projectPath: project?.path || '',
    autoRefresh: true,
    refreshInterval: 30000,
  });

  // Worktree sessions hook (for Quick Switcher integration)
  const { sessions: worktreeSessions } = useWorktreeSessions({
    project,
    onUpdateProject: onUpdateProject || (async () => {}),
  });

  // Security audit hook
  const {
    scanResult,
    isScanning,
    error: securityError,
    scanData,
    runScan,
    loadScan,
  } = useSecurity(project?.id || null);

  // Security scan reminder hook
  const {
    shouldShowReminder,
    daysSinceLastScan,
    reminderIntervalDays,
    snoozeReminder,
    dismissReminder,
    isUpdating: isReminderUpdating,
  } = useScanReminder(project?.id || null, scanData);

  const checkMobileBuilds = useCallback(async () => {
    if (!project) return;
    try {
      const [ipaResponse, apkResponse] = await Promise.all([
        ipaAPI.checkHasIpaFiles(project.path),
        apkAPI.checkHasApkFiles(project.path),
      ]);

      if (ipaResponse.success) {
        setHasIpaFiles(ipaResponse.hasIpaFiles);
        setIpaCount(ipaResponse.count);
      }
      if (apkResponse.success) {
        setHasApkFiles(apkResponse.hasApkFiles);
        setApkCount(apkResponse.count);
      }

      const hasAnyBuilds = (ipaResponse.success && ipaResponse.hasIpaFiles) ||
                           (apkResponse.success && apkResponse.hasApkFiles);
      if (!hasAnyBuilds && activeTab === 'builds') {
        setActiveTab('scripts');
      }
    } catch (err) {
      console.error('Failed to check mobile build files:', err);
    }
  }, [project, activeTab]);

  const showWorkspacesTab = project?.isMonorepo && workspaces.length > 0;

  useEffect(() => {
    if (project) {
      setHasIpaFiles(false);
      setIpaCount(0);
      setHasApkFiles(false);
      setApkCount(0);
      if (activeTab === 'builds') {
        setActiveTab('scripts');
      }
    }
  }, [project?.id]);

  useEffect(() => {
    if (activeTab === 'workspaces' && !showWorkspacesTab) {
      setActiveTab('scripts');
    }
  }, [activeTab, showWorkspacesTab]);

  useEffect(() => {
    checkMobileBuilds();
  }, [checkMobileBuilds]);

  // Load worktrees for Quick Switcher
  const loadWorktrees = useCallback(async () => {
    if (!project) return;
    try {
      const isGit = await worktreeAPI.isGitRepo(project.path);
      if (isGit) {
        const response = await worktreeAPI.listWorktrees(project.path);
        if (response.success && response.worktrees) {
          setWorktrees(response.worktrees);
        }
      }
    } catch (err) {
      console.error('Failed to load worktrees:', err);
    }
  }, [project]);

  // Load available editors
  const loadEditors = useCallback(async () => {
    try {
      const response = await worktreeAPI.getAvailableEditors();
      if (response.success && response.editors) {
        setAvailableEditors(response.editors.filter(e => e.isAvailable));
      }
    } catch (err) {
      console.error('Failed to load editors:', err);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
    loadEditors();
  }, [loadWorktrees, loadEditors]);

  // Global keyboard shortcut for Quick Switcher (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickSwitcherOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle open in editor from Quick Switcher
  const handleQuickSwitcherOpenInEditor = useCallback(async (worktreePath: string, editorId?: string) => {
    try {
      await worktreeAPI.openInEditor(worktreePath, editorId);
    } catch (err) {
      console.error('Failed to open in editor:', err);
    }
  }, []);

  // Handle open in editor from header dropdown
  const handleOpenInEditor = useCallback(async (editorId: string) => {
    if (!project) return;
    try {
      await worktreeAPI.openInEditor(project.path, editorId);
      setIsEditorDropdownOpen(false);
    } catch (err) {
      console.error('Failed to open in editor:', err);
    }
  }, [project]);

  // Handle run script from Quick Switcher
  const handleQuickSwitcherRunScript = useCallback(async (worktreePath: string, scriptName: string) => {
    if (!project) return;
    try {
      await executeScriptInWorktree(worktreePath, scriptName, project.packageManager, project.name);
    } catch (err) {
      console.error('Failed to run script:', err);
    }
  }, [project, executeScriptInWorktree]);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Select or add a project</p>
          <p className="text-sm mt-2">Pick a project on the left or click + to add one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Project info header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {project.name}
              </h1>
              {project.isMonorepo && (
                (() => {
                  const tool = project.monorepoTool;
                  if (tool && MONOREPO_TOOL_CONFIG[tool]) {
                    const config = MONOREPO_TOOL_CONFIG[tool];
                    const Icon = config.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${config.color}`}>
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    );
                  }
                  return (
                    <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                      Monorepo
                    </span>
                  );
                })()
              )}
              {project.framework && FRAMEWORK_CONFIG[project.framework] ? (
                (() => {
                  const config = FRAMEWORK_CONFIG[project.framework];
                  const FrameworkIcon = config.icon;
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${config.color}`}>
                      <FrameworkIcon className="w-3 h-3" />
                      {config.label}
                    </span>
                  );
                })()
              ) : (
                /* Default to Node.js if no framework detected */
                !project.isMonorepo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-[#339933]/20 text-[#339933]">
                    <Hexagon className="w-3 h-3" />
                    Node
                  </span>
                )
              )}
              {/* UI Framework Badge - for single projects */}
              {!project.isMonorepo && project.uiFramework && shouldShowUIFrameworkBadge(project.framework ?? null, project.uiFramework) && UI_FRAMEWORK_CONFIG[project.uiFramework] && (
                (() => {
                  const uiConfig = UI_FRAMEWORK_CONFIG[project.uiFramework!];
                  const UIIcon = uiConfig.icon;
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${uiConfig.color}`}>
                      <UIIcon className="w-3 h-3" />
                      {uiConfig.label}
                    </span>
                  );
                })()
              )}
              {/* UI Framework Badges - for monorepo, collect unique frameworks from all workspaces */}
              {project.isMonorepo && workspaces.length > 0 && (
                (() => {
                  // Collect unique UI frameworks from all workspaces
                  const uniqueFrameworks = [...new Set(
                    workspaces
                      .map(ws => ws.uiFramework)
                      .filter((fw): fw is NonNullable<typeof fw> => fw != null)
                  )];

                  if (uniqueFrameworks.length === 0) return null;

                  return uniqueFrameworks.map(fw => {
                    const config = UI_FRAMEWORK_CONFIG[fw];
                    if (!config) return null;
                    const Icon = config.icon;
                    return (
                      <span
                        key={fw}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${config.color}`}
                        title={`${config.label} (used in workspaces)`}
                      >
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    );
                  });
                })()
              )}
            </div>
            {/* Path and Worktree Indicator */}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-muted-foreground truncate" title={displayPath}>
                {formatPath(displayPath)}
              </p>
              {/* Worktree badge (read-only indicator) */}
              {allWorktrees.length > 1 && currentWorktree && (
                <span
                  className={`flex items-center gap-1.5 px-2 py-0.5 text-xs rounded border ${
                    currentWorktree.isMain
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  }`}
                  title={`Current worktree: ${currentWorktree.path}`}
                >
                  <GitBranch className="w-3 h-3" />
                  <span className="max-w-[120px] truncate">
                    {currentWorktree.branch || 'detached'}
                  </span>
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-2">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-px">
            {/* Quick Switcher Button */}
            <button
              onClick={() => setIsQuickSwitcherOpen(true)}
              className="p-2 rounded hover:bg-accent transition-colors"
              title="Quick Switcher (⌘K)"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Open in Editor Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsEditorDropdownOpen(!isEditorDropdownOpen)}
                className="flex items-center gap-1.5 p-2 rounded hover:bg-accent transition-colors"
                title="Open in Editor"
              >
                <Code2 className="w-4 h-4 text-muted-foreground" />
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              {isEditorDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsEditorDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px] whitespace-nowrap">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Open In
                    </div>
                    {availableEditors.map(editor => (
                      <button
                        key={editor.id}
                        onClick={() => handleOpenInEditor(editor.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                      >
                        <Code2 className="w-4 h-4" />
                        {editor.name}
                      </button>
                    ))}
                    {availableEditors.length === 0 && (
                      onOpenInVSCode ? (
                        <button
                          onClick={onOpenInVSCode}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                        >
                          <Code2 className="w-4 h-4" />
                          Open in VS Code
                        </button>
                      ) : (
                        <div className="px-3 py-1.5 text-sm text-muted-foreground">
                          No editors available
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
            {onOpenTerminal && (
              <TerminalSelector
                path={displayPath}
                onOpenBuiltinTerminal={onOpenTerminal}
              />
            )}
            <button
              onClick={() => {
                onRefresh();
                setVersionRefreshKey(prev => prev + 1);
              }}
              disabled={isLoading}
              className="p-2 rounded hover:bg-accent transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onOpenInFinder}
              className="p-2 rounded hover:bg-accent transition-colors"
              title="Open in Finder"
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Project details */}
        <div className="flex items-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="w-4 h-4" />
            <span>{project.version}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-muted-foreground">Package manager:</span>
            <span>{packageManagerLabels[project.packageManager]}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-muted-foreground">Scripts:</span>
            <span>{Object.keys(project.scripts).length}</span>
          </div>
          {showWorkspacesTab && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-4 h-4" />
              <span>{workspaces.length} packages</span>
            </div>
          )}
        </div>

        {/* Version Requirements Badge */}
        <div className="mt-3">
          <VersionBadge projectPath={project.path} showVoltaPrompt refreshKey={versionRefreshKey} />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 border-b border-border overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'scripts'
                ? 'text-blue-400 border-blue-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Scripts
          </button>
          {showWorkspacesTab && (
            <button
              onClick={() => setActiveTab('workspaces')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'workspaces'
                  ? 'text-blue-400 border-blue-400'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              Workspaces ({workspaces.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab('workflows')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'workflows'
                ? 'text-blue-400 border-blue-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <WorkflowIcon className="w-4 h-4" />
            Workflows
          </button>
          <button
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'git'
                ? 'text-blue-400 border-blue-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <GitCommit className="w-4 h-4" />
            Git
          </button>
          {(hasIpaFiles || hasApkFiles) && (
            <button
              onClick={() => setActiveTab('builds')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'builds'
                  ? 'text-blue-400 border-blue-400'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              <FileBox className="w-4 h-4" />
              Builds ({ipaCount + apkCount})
            </button>
          )}
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'security'
                ? 'text-blue-400 border-blue-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <Shield className="w-4 h-4" />
            Security
            {scanResult && scanResult.summary.total > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                scanResult.summary.critical > 0 ? 'bg-red-500/20 text-red-400' :
                scanResult.summary.high > 0 ? 'bg-orange-500/20 text-orange-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {scanResult.summary.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('deploy')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'deploy'
                ? 'text-blue-400 border-blue-400'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <Rocket className="w-4 h-4" />
            Deploy
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'scripts' && (
          <ScriptCards
            scripts={project.scripts}
            runningScriptsMap={runningScriptsMap}
            runningCommands={runningCommands}
            packageManager={project.packageManager}
            projectPath={project.path}
            worktrees={allWorktrees}
            selectedWorktreePath={selectedWorktreePath}
            worktreeStatuses={worktreeStatuses}
            isLoadingStatuses={isLoadingStatuses}
            availableEditors={availableEditors}
            onWorktreeChange={onWorktreeChange}
            onExecute={onExecuteScript}
            onCancel={onCancelScript}
            onExecuteCommand={onExecuteCommand}
            onCancelCommand={onCancelCommand}
          />
        )}
        {activeTab === 'workspaces' && (
          <MonorepoView
            key={project.path}
            workspaces={workspaces}
            runningScriptsMap={runningScriptsMap}
            runningCommands={runningCommands}
            packageManager={project.packageManager}
            projectPath={project.path}
            onExecuteScript={onExecuteScript}
            onCancelScript={onCancelScript}
            onExecuteCommand={onExecuteCommand}
            onCancelCommand={onCancelCommand}
            onShowDependencyGraph={() => {
              setSelectedMonorepoTool('turbo'); // Default to turbo since gorilla uses it
              setShowDependencyGraph(true);
            }}
          />
        )}
        {activeTab === 'workflows' && (
          <ProjectWorkflows
            projectId={project.id}
            projectPath={project.path}
            scripts={project.scripts}
            onEditWorkflow={onEditWorkflow}
            onNavigateToWorkflow={onNavigateToWorkflow}
          />
        )}
        {activeTab === 'builds' && (
          <MobileBuildsInspector
            projectPath={project.path}
          />
        )}
        {activeTab === 'security' && (
          <>
            {/* Security Reminder Banner - only shown when scanned before but overdue */}
            {shouldShowReminder && !isScanning && scanResult && (
              <SecurityReminderBanner
                projectName={project.name}
                daysSinceLastScan={daysSinceLastScan}
                reminderIntervalDays={reminderIntervalDays}
                isScanning={isScanning}
                onScanNow={() => runScan(project.path)}
                onSnoozeLater={async () => {
                  await snoozeReminder();
                  // Reload scan data to update snoozeUntil
                  await loadScan();
                }}
                onDismiss={dismissReminder}
                isUpdating={isReminderUpdating}
              />
            )}
            {/* Security Tab - always shown except when reminder banner is displayed */}
            {!(shouldShowReminder && !isScanning && scanResult) && (
              <SecurityTab
                projectId={project.id}
                projectPath={project.path}
                projectName={project.name}
                scanResult={scanResult}
                isScanning={isScanning}
                error={securityError}
                onScan={() => runScan(project.path)}
                onNavigateToScripts={() => setActiveTab('scripts')}
              />
            )}
          </>
        )}
        {activeTab === 'git' && (
          <GitPanel
            project={project}
            onExecuteScript={onExecuteScript}
            onUpdateProject={onUpdateProject}
            onWorktreesChange={onWorktreesChange}
            className="h-full -m-4 -mb-4"
          />
        )}
        {activeTab === 'deploy' && (
          <DeployPanel
            projectId={project.id}
            projectName={project.name}
            projectPath={project.path}
          />
        )}
      </div>

      {/* Worktree Quick Switcher (Cmd+K) */}
      <WorktreeQuickSwitcher
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        worktrees={worktrees}
        availableEditors={availableEditors}
        scripts={categorizedScripts}
        sessions={worktreeSessions}
        onOpenInEditor={handleQuickSwitcherOpenInEditor}
        onRunScript={handleQuickSwitcherRunScript}
        onOpenSession={(worktreePath) => {
          setIsQuickSwitcherOpen(false);
          setSessionDialogWorktreePath(worktreePath);
        }}
      />

      {/* Session Dialog (for Quick Switcher) */}
      {project && (
        <WorktreeSessionDialog
          isOpen={sessionDialogWorktreePath !== null}
          onClose={() => setSessionDialogWorktreePath(null)}
          project={project}
          worktrees={allWorktrees}
          availableEditors={availableEditors}
          workflows={[]}
          worktreePath={sessionDialogWorktreePath}
          onUpdateProject={onUpdateProject || (async () => {})}
          onExecuteScript={onExecuteScript}
        />
      )}

      {/* Dependency Graph Modal (008-monorepo-support) */}
      {showDependencyGraph && project && selectedMonorepoTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[90vw] h-[80vh] bg-card rounded-lg shadow-xl overflow-hidden">
            <DependencyGraphView
              projectPath={project.path}
              tool={selectedMonorepoTool}
              onClose={() => setShowDependencyGraph(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
