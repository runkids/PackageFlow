/**
 * Git Worktree List - Manages Git worktrees with consistent Git panel styling
 * @see specs/009-git-integration/tasks.md
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { GitBranch, Plus, Trash2, FolderOpen, AlertCircle, RefreshCw, Code2, ChevronDown, Layers, List, LayoutGrid, ArrowDownToLine, Loader2, Archive, Search, X, Bookmark } from 'lucide-react';
import { worktreeAPI, scriptAPI, gitAPI, settingsAPI, type Worktree, type EditorDefinition } from '../../../lib/tauri-api';
import type { Project } from '../../../types/project';
import type { Workflow } from '../../../types/workflow';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownSection, DropdownSeparator } from '../../ui/Dropdown';
import { Select, type SelectOption } from '../../ui/Select';
import { useWorktreeStatuses } from '../../../hooks/useWorktreeStatuses';
import { useWorktreeSessions } from '../../../hooks/useWorktreeSessions';
import { WorktreeStatusBadge } from '../WorktreeStatusBadge';
import { WorktreeTemplateDialog } from '../WorktreeTemplateDialog';
import { WorktreeCard } from '../WorktreeCard';
import { WorktreeHealthCheck } from '../WorktreeHealthCheck';
import { WorktreeBatchActions } from '../WorktreeBatchActions';
import { WorktreeSyncDialog } from '../WorktreeSyncDialog';
import { WorktreeStashDialog } from '../WorktreeStashDialog';
import { WorktreeSessionDialog } from '../WorktreeSessionDialog';
import { WorktreeSessionListDialog } from '../WorktreeSessionListDialog';
import { cn } from '../../../lib/utils';
import { useSettings } from '../../../contexts/SettingsContext';
import path from 'path-browserify';

type ViewMode = 'list' | 'grid';
const VIEW_MODE_STORAGE_KEY = 'packageflow-worktree-view-mode';

interface GitWorktreeListProps {
  project: Project;
  workflows?: Workflow[];
  onUpdateProject?: (updater: (project: Project) => Project) => Promise<void>;
  onExecuteScript?: (scriptName: string, cwd?: string) => void;
  /** Callback when switching working directory (for worktrees) */
  onSwitchWorkingDirectory?: (path: string) => void;
  /** Callback when worktrees list changes (add/remove) */
  onWorktreesChange?: () => void;
}

// Sub-component: Branch Select for worktree creation
interface BranchSelectProps {
  branches: string[];
  value: string;
  onValueChange: (value: string) => void;
}

function BranchSelect({ branches, value, onValueChange }: BranchSelectProps) {
  const options = useMemo<SelectOption[]>(
    () => branches.map((branch) => ({ value: branch, label: branch })),
    [branches]
  );

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder="Select branch..."
      aria-label="Select branch"
    />
  );
}

export function GitWorktreeList({
  project,
  workflows = [],
  onUpdateProject,
  onExecuteScript,
  onSwitchWorkingDirectory,
  onWorktreesChange,
}: GitWorktreeListProps) {
  const projectPath = project.path;
  const projectName = project.name;
  const packageManager = project.packageManager;

  // Settings for path display format
  const { formatPath } = useSettings();

  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode state - default to grid
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'grid';
  });

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Health check collapsed state
  const [isHealthCheckCollapsed, setIsHealthCheckCollapsed] = useState(false);

  // Pull state - track which worktree is being pulled
  const [pullingWorktreePath, setPullingWorktreePath] = useState<string | null>(null);

  // Sync dialog state
  const [syncWorktree, setSyncWorktree] = useState<Worktree | null>(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  // Stash dialog state
  const [stashWorktree, setStashWorktree] = useState<Worktree | null>(null);
  const [showStashDialog, setShowStashDialog] = useState(false);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const sessionsEnabled = !!onUpdateProject;
  const [sessionDialogWorktreePath, setSessionDialogWorktreePath] = useState<string | null>(null);
  const [showSessionListDialog, setShowSessionListDialog] = useState(false);

  // Workflows state for session dialog - load if workflows prop is empty
  const [loadedWorkflows, setLoadedWorkflows] = useState<Workflow[]>([]);
  const effectiveWorkflows = workflows.length > 0 ? workflows : loadedWorkflows;

  // Load workflows on mount if not provided via props
  useEffect(() => {
    if (workflows.length === 0 && sessionsEnabled) {
      settingsAPI.loadWorkflows().then(setLoadedWorkflows).catch(console.error);
    }
  }, [workflows.length, sessionsEnabled]);

  const { sessions: worktreeSessions, syncBrokenSessions } = useWorktreeSessions({
    project,
    onUpdateProject: onUpdateProject ?? (async () => {}),
  });

  const sessionsByWorktreePath = useMemo(() => {
    return new Map(worktreeSessions.map((s) => [s.worktreePath, s]));
  }, [worktreeSessions]);

  useEffect(() => {
    if (!sessionsEnabled) return;
    void syncBrokenSessions(worktrees);
  }, [sessionsEnabled, syncBrokenSessions, worktrees]);

  // Worktree statuses hook
  const {
    statuses: worktreeStatuses,
    isLoading: isLoadingStatuses,
    refresh: refreshStatuses,
  } = useWorktreeStatuses({
    projectPath,
    autoRefresh: true,
    refreshInterval: 30000, // 30 seconds
  });

  // Available editors state
  const [availableEditors, setAvailableEditors] = useState<EditorDefinition[]>([]);

  // Load available editors on mount
  useEffect(() => {
    const loadEditors = async () => {
      try {
        const response = await worktreeAPI.getAvailableEditors();
        if (response.success && response.editors) {
          setAvailableEditors(response.editors.filter(e => e.isAvailable));
        }
      } catch (err) {
        console.error('Failed to load available editors:', err);
      }
    };
    loadEditors();
  }, []);

  // Open worktree in editor
  const handleOpenInEditor = useCallback(async (worktreePath: string, editorId?: string) => {
    try {
      const response = await worktreeAPI.openInEditor(worktreePath, editorId);
      if (!response.success) {
        const errorMessages: Record<string, string> = {
          PATH_NOT_FOUND: 'Worktree path not found',
          EDITOR_NOT_FOUND: `${response.editor || 'Editor'} is not installed`,
          UNKNOWN_EDITOR: 'Unknown editor',
        };
        setError(errorMessages[response.error || ''] || response.error || 'Failed to open editor');
      }
    } catch (err) {
      console.error('Failed to open in editor:', err);
      setError('Failed to open editor');
    }
  }, []);

  // Pull a single worktree
  const handlePull = useCallback(async (worktree: Worktree) => {
    if (pullingWorktreePath) return; // Already pulling

    setPullingWorktreePath(worktree.path);
    setError(null);

    try {
      const result = await gitAPI.pull(worktree.path);
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          MERGE_CONFLICT: 'Conflicts detected, resolve manually',
          NO_UPSTREAM: 'No upstream branch configured',
          AUTH_FAILED: 'Authentication failed',
          NETWORK_ERROR: 'Network error',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Pull failed');
      }
      // Refresh statuses after pull
      refreshStatuses();
    } catch (err) {
      console.error('Failed to pull:', err);
      setError('Failed to pull');
    } finally {
      setPullingWorktreePath(null);
    }
  }, [pullingWorktreePath, refreshStatuses]);

  // Sync a single worktree
  const handleSync = useCallback((worktree: Worktree) => {
    setSyncWorktree(worktree);
    setShowSyncDialog(true);
  }, []);

  // Open stash dialog for a worktree
  const handleStash = useCallback((worktree: Worktree) => {
    setStashWorktree(worktree);
    setShowStashDialog(true);
  }, []);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newWorktreePath, setNewWorktreePath] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Template dialog state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  // Remove worktree dialog state
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [worktreeToRemove, setWorktreeToRemove] = useState<Worktree | null>(null);
  const [deleteBranchOnRemove, setDeleteBranchOnRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Gitignore dialog state
  const [showGitignoreDialog, setShowGitignoreDialog] = useState(false);
  const [gitignoreChecked, setGitignoreChecked] = useState(false);
  const [isAddingToGitignore, setIsAddingToGitignore] = useState(false);

  // Force delete confirmation dialog state
  const [showForceDeleteDialog, setShowForceDeleteDialog] = useState(false);

  const fullWorktreePath = useMemo(() => {
    if (!newWorktreePath.trim()) return '';
    if (newWorktreePath.startsWith('/')) return newWorktreePath;
    return path.join(projectPath, newWorktreePath);
  }, [projectPath, newWorktreePath]);

  const availableBranches = useMemo(() => {
    const usedBranches = new Set(worktrees.map(w => w.branch).filter(Boolean));
    return branches.filter(b => !usedBranches.has(b));
  }, [branches, worktrees]);

  // Filtered worktrees based on search query
  const filteredWorktrees = useMemo(() => {
    if (!searchQuery.trim()) return worktrees;
    const query = searchQuery.toLowerCase();
    return worktrees.filter((w) => {
      const branchMatch = w.branch?.toLowerCase().includes(query);
      const pathMatch = w.path.toLowerCase().includes(query);
      const session = sessionsByWorktreePath.get(w.path);
      const sessionMatch = session
        ? session.title.toLowerCase().includes(query) ||
          session.tags.some((t) => t.toLowerCase().includes(query))
        : false;
      return branchMatch || pathMatch || sessionMatch;
    });
  }, [worktrees, searchQuery, sessionsByWorktreePath]);

  const loadWorktrees = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const gitRepoCheck = await worktreeAPI.isGitRepo(projectPath);
      if (!gitRepoCheck) {
        setIsGitRepo(false);
        setIsLoading(false);
        setIsInitialLoad(false);
        return;
      }
      setIsGitRepo(true);

      const result = await worktreeAPI.listWorktrees(projectPath);
      if (result.success && result.worktrees) {
        setWorktrees(result.worktrees);
      } else {
        setError(result.error || 'Failed to load worktrees');
      }

      const branchResult = await worktreeAPI.listBranches(projectPath);
      if (branchResult.success && branchResult.branches) {
        setBranches(branchResult.branches);
      }
    } catch (err) {
      console.error('Failed to load worktrees:', err);
      setError('Load failed');
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadWorktrees(false);
  }, [loadWorktrees]);

  const handleOpenAddDialog = () => {
    setShowAddDialog(true);
    setNewWorktreePath('.worktrees/');
    setCreateNewBranch(false);
    setNewBranch(availableBranches[0] || branches[0] || '');
    setAddError(null);
  };

  const handleAddWorktree = async () => {
    if (!newWorktreePath.trim() || !newBranch.trim()) return;

    setIsAdding(true);
    setAddError(null);

    try {
      const result = await worktreeAPI.addWorktree({
        projectPath,
        worktreePath: fullWorktreePath,
        branch: newBranch.trim(),
        createBranch: createNewBranch,
      });

      if (result.success) {
        setShowAddDialog(false);
        await loadWorktrees();
        // Notify parent component to refresh worktrees list
        onWorktreesChange?.();
        // Check gitignore after successful creation
        await checkAndPromptGitignore(fullWorktreePath);
      } else {
        const errorMessages: Record<string, string> = {
          PATH_EXISTS: 'Path already exists',
          BRANCH_NOT_FOUND: 'Branch not found',
          BRANCH_EXISTS: 'Branch already exists (enable "Create new branch")',
          GIT_ERROR: 'Git error',
        };
        setAddError(errorMessages[result.error || ''] || result.error || 'Failed to add worktree');
      }
    } catch (err) {
      console.error('Failed to add worktree:', err);
      setAddError('Failed to add worktree');
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenRemoveDialog = (worktree: Worktree) => {
    setWorktreeToRemove(worktree);
    setDeleteBranchOnRemove(false);
    setShowRemoveDialog(true);
  };

  // Check gitignore for .worktrees/ and prompt user if needed
  const checkAndPromptGitignore = useCallback(async (worktreePath: string) => {
    // Only check if the worktree path contains .worktrees/
    if (!worktreePath.includes('.worktrees/') && !worktreePath.includes('.worktrees\\')) {
      return;
    }

    // Don't prompt if already checked this session
    if (gitignoreChecked) {
      return;
    }

    try {
      const result = await worktreeAPI.checkGitignoreHasWorktrees(projectPath);
      if (result.success && !result.hasWorktreesEntry) {
        setShowGitignoreDialog(true);
      }
      setGitignoreChecked(true);
    } catch (err) {
      console.error('Failed to check gitignore:', err);
    }
  }, [projectPath, gitignoreChecked]);

  // Add .worktrees/ to gitignore
  const handleAddToGitignore = async () => {
    setIsAddingToGitignore(true);
    try {
      const result = await worktreeAPI.addWorktreesToGitignore(projectPath);
      if (result.success) {
        setShowGitignoreDialog(false);
      } else {
        setError(result.error || 'Failed to update .gitignore');
      }
    } catch (err) {
      console.error('Failed to add to gitignore:', err);
      setError('Failed to update .gitignore');
    } finally {
      setIsAddingToGitignore(false);
    }
  };

  // Execute post-create script in worktree
  const handleRunPostCreateScript = useCallback(async (worktreePath: string, scriptName: string) => {
    if (packageManager === 'unknown') {
      console.warn('Cannot run post-create script: unknown package manager');
      return;
    }

    try {
      console.log(`Running post-create script "${scriptName}" in ${worktreePath}`);
      const result = await scriptAPI.executeScript({
        projectPath: worktreePath,
        scriptName,
        packageManager,
        cwd: worktreePath,
      });

      if (!result.success) {
        console.error(`Failed to run post-create script "${scriptName}":`, result.error);
      }
    } catch (err) {
      console.error(`Error running post-create script "${scriptName}":`, err);
    }
  }, [packageManager]);

  const handleRemoveWorktree = async (force = false) => {
    if (!worktreeToRemove) return;

    setIsRemoving(true);
    try {
      const result = await worktreeAPI.removeWorktree({
        projectPath,
        worktreePath: worktreeToRemove.path,
        force,
        deleteBranch: deleteBranchOnRemove,
      });

      if (result.success) {
        setShowRemoveDialog(false);
        setShowForceDeleteDialog(false);
        setWorktreeToRemove(null);
        await loadWorktrees();
        // Notify parent component to refresh worktrees list
        onWorktreesChange?.();
      } else if (result.error === 'HAS_UNCOMMITTED_CHANGES') {
        setShowForceDeleteDialog(true);
      } else {
        const errorMessages: Record<string, string> = {
          WORKTREE_NOT_FOUND: 'Worktree not found',
          CANNOT_REMOVE_MAIN: 'Cannot remove main worktree',
          GIT_ERROR: 'Git error',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Failed to remove worktree');
      }
    } catch (err) {
      console.error('Failed to remove worktree:', err);
      setError('Failed to remove worktree');
    } finally {
      setIsRemoving(false);
    }
  };

  if (isGitRepo === false) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">This project is not a Git repository</p>
        <p className="text-sm text-muted-foreground mt-2">
          Git worktree features require a Git repository
        </p>
      </div>
    );
  }

  if (isInitialLoad && worktrees.length === 0 && isGitRepo === null) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header with actions - matching Git panel style */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground flex-shrink-0">Worktrees</h3>
          {/* Search input - show when expanded or has query */}
          {(isSearchExpanded || searchQuery) && (
            <div className="relative flex items-center">
              <Search className="absolute left-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                autoFocus
                className="w-32 pl-7 pr-7 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchExpanded(false);
                  }}
                  className="absolute right-1.5 p-0.5 rounded hover:bg-accent"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          {/* Search count */}
          {searchQuery && filteredWorktrees.length !== worktrees.length && (
            <span className="text-xs text-muted-foreground">
              {filteredWorktrees.length}/{worktrees.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Search toggle */}
          {!isSearchExpanded && !searchQuery && (
            <button
              onClick={() => setIsSearchExpanded(true)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Search worktrees"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {sessionsEnabled && (
            <button
              onClick={() => setShowSessionListDialog(true)}
              className="flex items-center gap-1.5 p-1.5 rounded hover:bg-accent transition-colors"
              title="Sessions"
            >
              <Bookmark className="w-4 h-4 text-muted-foreground" />
              {worktreeSessions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {worktreeSessions.length}
                </span>
              )}
            </button>
          )}
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {/* Batch Actions */}
          {worktrees.length > 1 && (
            <WorktreeBatchActions
              worktrees={worktrees}
              projectPath={projectPath}
              onComplete={() => {
                loadWorktrees(true);
                refreshStatuses();
              }}
            />
          )}
          <button
            onClick={() => {
              loadWorktrees(true);
              refreshStatuses();
            }}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading || isLoadingStatuses ? 'animate-spin' : ''}`} />
          </button>
          <Dropdown
            trigger={
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                <Plus className="w-4 h-4 mr-1.5" />
                New
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            }
            align="right"
          >
            <DropdownItem
              onClick={() => setShowTemplateDialog(true)}
              icon={<Layers className="w-4 h-4" />}
            >
              From Template
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              onClick={handleOpenAddDialog}
              icon={<Plus className="w-4 h-4" />}
            >
              Manual Setup
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Health Check Warnings */}
      {worktrees.length > 0 && (
        <WorktreeHealthCheck
          worktrees={worktrees}
          statuses={worktreeStatuses}
          isCollapsed={isHealthCheckCollapsed}
          onToggleCollapse={() => setIsHealthCheckCollapsed(!isHealthCheckCollapsed)}
        />
      )}

      {/* Worktree List/Grid */}
      {worktrees.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No worktrees</p>
          <p className="text-xs mt-1">Click "New" to create a worktree</p>
        </div>
      ) : filteredWorktrees.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No matches for "{searchQuery}"</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setIsSearchExpanded(false);
            }}
            className="text-xs text-blue-400 hover:underline mt-2"
          >
            Clear search
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          role="list"
          aria-label="Worktrees"
        >
          {filteredWorktrees.map((worktree) => {
            const session = sessionsByWorktreePath.get(worktree.path);
            return (
              <WorktreeCard
                key={worktree.path}
                worktree={worktree}
                status={worktreeStatuses[worktree.path]}
                sessionStatus={session?.status}
                isLoadingStatus={isLoadingStatuses}
                availableEditors={availableEditors}
                onOpenInEditor={handleOpenInEditor}
                onOpenSession={
                  sessionsEnabled ? (wt) => setSessionDialogWorktreePath(wt.path) : undefined
                }
                onSwitchWorkingDirectory={onSwitchWorkingDirectory}
                onRemove={handleOpenRemoveDialog}
                onPull={handlePull}
                onSync={handleSync}
                onStash={handleStash}
              />
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="space-y-1">
          {filteredWorktrees.map((worktree) => {
            const session = sessionsByWorktreePath.get(worktree.path);
            const sessionBadgeClass = session?.status === 'broken'
              ? 'bg-red-500/20 text-red-400'
              : session?.status === 'archived'
                ? 'bg-muted text-muted-foreground'
                : 'bg-green-500/20 text-green-400';
            const sessionIconClass = session?.status === 'broken'
              ? 'text-red-400'
              : session?.status === 'archived'
                ? 'text-muted-foreground'
                : session
                  ? 'text-green-400'
                  : 'text-muted-foreground';

            return (
              <div
                key={worktree.path}
                className={`group flex items-center gap-2 py-2 px-2 rounded transition-colors ${
                  worktree.isMain
                    ? 'bg-blue-500/10 hover:bg-blue-500/15'
                    : 'hover:bg-accent'
                }`}
              >
                {/* Icon */}
                <GitBranch className={`w-4 h-4 flex-shrink-0 ${
                  worktree.isMain ? 'text-blue-400' : 'text-muted-foreground'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${worktree.isMain ? 'text-blue-400 font-medium' : 'text-foreground'}`}>
                      {worktree.branch || '(detached HEAD)'}
                    </span>
                    {worktree.isMain && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                        Main
                      </span>
                    )}
                    {worktree.isDetached && (
                      <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                        Detached
                      </span>
                    )}
                    {session && (
                      <span className={cn('px-1.5 py-0.5 text-xs rounded', sessionBadgeClass)}>
                        {session.status === 'active'
                          ? 'Session'
                          : session.status === 'archived'
                            ? 'Session (Archived)'
                            : 'Session (Broken)'}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs text-muted-foreground mt-0.5 truncate"
                    title={worktree.path}
                  >
                    {formatPath(worktree.path)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">
                      {worktree.head?.substring(0, 7)}
                    </span>
                    <WorktreeStatusBadge
                      status={worktreeStatuses[worktree.path]}
                      isLoading={isLoadingStatuses}
                      compact
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {sessionsEnabled && (
                    <button
                      onClick={() => setSessionDialogWorktreePath(worktree.path)}
                      className="p-1.5 rounded hover:bg-accent"
                      title={session ? 'Open session' : 'Create session'}
                    >
                      <Bookmark className={cn('w-3.5 h-3.5', sessionIconClass)} />
                    </button>
                  )}
                  {/* Open in Editor */}
                  {availableEditors.length > 0 && (
                    availableEditors.length === 1 ? (
                      <button
                        onClick={() => handleOpenInEditor(worktree.path, availableEditors[0].id)}
                        className="p-1.5 rounded hover:bg-accent"
                        title={`Open in ${availableEditors[0].name}`}
                      >
                        <Code2 className="w-3.5 h-3.5 text-blue-400" />
                      </button>
                    ) : (
                      <Dropdown
                        trigger={
                          <button
                            className="flex items-center gap-1.5 p-1.5 rounded hover:bg-accent"
                            title="Open in Editor"
                          >
                            <Code2 className="w-3.5 h-3.5 text-blue-400" />
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </button>
                        }
                        align="right"
                      >
                        <DropdownSection title="Open in">
                          {availableEditors.map((editor) => (
                            <DropdownItem
                              key={editor.id}
                              onClick={() => handleOpenInEditor(worktree.path, editor.id)}
                              icon={<Code2 className="w-4 h-4" />}
                            >
                              {editor.name}
                            </DropdownItem>
                          ))}
                        </DropdownSection>
                      </Dropdown>
                    )
                  )}
                  {/* Pull button */}
                  {!worktree.isDetached && (
                    <button
                      onClick={() => handlePull(worktree)}
                      disabled={pullingWorktreePath === worktree.path}
                      className="p-1.5 rounded hover:bg-accent disabled:opacity-50"
                      title="Pull"
                    >
                      {pullingWorktreePath === worktree.path ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      ) : (
                        <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
                      )}
                    </button>
                  )}
                  {/* Sync button */}
                  {!worktree.isMain && !worktree.isDetached && (
                    <button
                      onClick={() => handleSync(worktree)}
                      className="p-1.5 rounded hover:bg-accent"
                      title="Sync with main"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                    </button>
                  )}
                  {/* Stash button */}
                  <button
                    onClick={() => handleStash(worktree)}
                    className="p-1.5 rounded hover:bg-accent"
                    title="Stash"
                  >
                    <Archive className="w-3.5 h-3.5 text-purple-400" />
                  </button>
                  {onSwitchWorkingDirectory && !worktree.isMain && (
                    <button
                      onClick={() => onSwitchWorkingDirectory(worktree.path)}
                      className="p-1.5 rounded hover:bg-accent"
                      title="Switch working directory"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  {!worktree.isMain && (
                    <button
                      onClick={() => handleOpenRemoveDialog(worktree)}
                      className="p-1.5 rounded hover:bg-red-500/20"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sessionsEnabled && (
        <WorktreeSessionListDialog
          isOpen={showSessionListDialog}
          onClose={() => setShowSessionListDialog(false)}
          sessions={worktreeSessions}
          onOpenSession={(path) => setSessionDialogWorktreePath(path)}
        />
      )}

      {sessionsEnabled && sessionDialogWorktreePath && onUpdateProject && (
        <WorktreeSessionDialog
          isOpen={!!sessionDialogWorktreePath}
          onClose={() => setSessionDialogWorktreePath(null)}
          project={project}
          worktrees={worktrees}
          availableEditors={availableEditors}
          workflows={effectiveWorkflows}
          worktreePath={sessionDialogWorktreePath}
          onUpdateProject={onUpdateProject}
          onExecuteScript={onExecuteScript}
          onSwitchWorkingDirectory={onSwitchWorkingDirectory}
        />
      )}

      {/* Add worktree dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Worktree</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Branch selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {createNewBranch ? 'New branch name' : 'Select branch'}
                </label>
                <Checkbox
                  size="sm"
                  checked={createNewBranch}
                  onCheckedChange={(checked) => {
                    setCreateNewBranch(checked);
                    if (checked) {
                      setNewBranch('');
                    } else {
                      setNewBranch(availableBranches[0] || branches[0] || '');
                    }
                  }}
                  label="Create new branch"
                />
              </div>

              {createNewBranch ? (
                <input
                  type="text"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="feature/new-feature"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              ) : (
                <>
                  {availableBranches.length > 0 ? (
                    <BranchSelect
                      branches={availableBranches}
                      value={newBranch}
                      onValueChange={setNewBranch}
                    />
                  ) : (
                    <div className="px-3 py-2 bg-muted border border-border rounded text-sm text-muted-foreground">
                      All branches already have worktrees. Create a new branch.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Path input - relative path */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Directory name
              </label>
              <input
                type="text"
                value={newWorktreePath}
                onChange={(e) => setNewWorktreePath(e.target.value)}
                placeholder=".worktrees/feature-name"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 font-mono"
              />
              {fullWorktreePath && (
                <p className="mt-1.5 text-xs text-muted-foreground truncate" title={fullWorktreePath}>
                  Full path: {fullWorktreePath}
                </p>
              )}
            </div>

            {/* Error message */}
            {addError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                {addError}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowAddDialog(false)}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddWorktree}
                disabled={isAdding || !newWorktreePath.trim() || !newBranch.trim() || (!createNewBranch && availableBranches.length === 0)}
                className="bg-blue-600 hover:bg-blue-500"
              >
                {isAdding ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Worktree Template Dialog */}
      <WorktreeTemplateDialog
        isOpen={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        projectPath={projectPath}
        projectName={projectName || projectPath.split('/').pop() || 'project'}
        branches={branches}
        onWorktreeCreated={async (worktreePath) => {
          await loadWorktrees();
          // Notify parent component to refresh worktrees list
          onWorktreesChange?.();
          if (worktreePath) {
            await checkAndPromptGitignore(worktreePath);
          }
        }}
        onRunPostCreateScript={handleRunPostCreateScript}
      />

      {/* Remove Worktree Confirmation Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={(open) => !open && setShowRemoveDialog(false)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Remove Worktree
            </DialogTitle>
          </DialogHeader>

          {worktreeToRemove && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to remove this worktree?
              </p>

              <div className="p-3 bg-muted border border-border rounded-lg">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-foreground">
                    {worktreeToRemove.branch || '(detached HEAD)'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate" title={worktreeToRemove.path}>
                  {formatPath(worktreeToRemove.path)}
                </p>
              </div>

              {worktreeToRemove.branch && (
                <Checkbox
                  variant="destructive"
                  checked={deleteBranchOnRemove}
                  onCheckedChange={setDeleteBranchOnRemove}
                  label={`Also delete branch "${worktreeToRemove.branch}"`}
                />
              )}

              {deleteBranchOnRemove && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                  Warning: This will permanently delete the branch. This action cannot be undone.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowRemoveDialog(false);
                    setWorktreeToRemove(null);
                  }}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleRemoveWorktree(false)}
                  disabled={isRemoving}
                  className="bg-red-600 hover:bg-red-500"
                >
                  {isRemoving ? 'Removing...' : 'Remove'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gitignore Dialog */}
      <Dialog open={showGitignoreDialog} onOpenChange={(open) => !open && setShowGitignoreDialog(false)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              Add .worktrees/ to .gitignore?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              The <code className="px-1.5 py-0.5 bg-background rounded text-blue-400">.worktrees/</code> directory
              is not in your <code className="px-1.5 py-0.5 bg-background rounded text-blue-400">.gitignore</code> file.
            </p>
            <p className="text-sm text-muted-foreground">
              It's recommended to ignore this directory to avoid accidentally committing worktree paths.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowGitignoreDialog(false)}
                className="text-muted-foreground"
              >
                Skip
              </Button>
              <Button
                onClick={handleAddToGitignore}
                disabled={isAddingToGitignore}
                className="bg-blue-600 hover:bg-blue-500"
              >
                {isAddingToGitignore ? 'Adding...' : 'Add to .gitignore'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Force Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showForceDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowForceDeleteDialog(false);
          }
        }}
        variant="warning"
        title="Uncommitted Changes Detected"
        description="This worktree has uncommitted changes that will be lost. Are you sure you want to force delete?"
        itemName={worktreeToRemove?.branch || worktreeToRemove?.path}
        confirmText="Force Delete"
        cancelText="Cancel"
        onConfirm={() => handleRemoveWorktree(true)}
        isLoading={isRemoving}
      />

      {/* Sync Dialog */}
      <WorktreeSyncDialog
        worktree={syncWorktree}
        isOpen={showSyncDialog}
        onClose={() => {
          setShowSyncDialog(false);
          setSyncWorktree(null);
        }}
        onComplete={() => {
          loadWorktrees(true);
          refreshStatuses();
        }}
      />

      {/* Stash Dialog */}
      <WorktreeStashDialog
        worktree={stashWorktree}
        isOpen={showStashDialog}
        onClose={() => {
          setShowStashDialog(false);
          setStashWorktree(null);
        }}
        onComplete={() => {
          refreshStatuses();
        }}
      />
    </div>
  );
}
