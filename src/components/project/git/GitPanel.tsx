/**
 * Git Panel - Main container for Git integration
 * @see specs/009-git-integration/tasks.md - T009
 *
 * Layout: Left sidebar navigation + Right content area (matching Workspaces tab style)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  History,
  Archive,
  RefreshCw,
  AlertCircle,
  FileCode,
  Settings,
  FolderGit2,
} from 'lucide-react';
import { gitAPI, type GitStatus } from '../../../lib/tauri-api';
import { GitStatusView } from './GitStatusView';
import { GitFileList } from './GitFileList';
import { GitCommitForm } from './GitCommitForm';
import { GitBranchList } from './GitBranchList';
import { GitHistoryList } from './GitHistoryList';
import { GitStashList } from './GitStashList';
import { GitSettingsPanel } from './GitSettingsPanel';
import { GitWorktreeList } from './GitWorktreeList';
import { GitDiffViewer } from './GitDiffViewer';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import type { GitFile } from '../../../types/git';
import type { Project } from '../../../types/project';
import type { Workflow } from '../../../types/workflow';
import type { SettingsSection } from '../../../types/settings';

type GitTab = 'status' | 'branches' | 'history' | 'stash' | 'worktrees' | 'settings';

interface GitPanelProps {
  project: Project;
  workflows?: Workflow[];
  onExecuteScript?: (scriptName: string, cwd?: string) => void;
  onUpdateProject?: (updater: (project: Project) => Project) => Promise<void>;
  /** Callback when worktrees list changes (add/remove) */
  onWorktreesChange?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Open the global settings page */
  onOpenSettings?: (section?: SettingsSection) => void;
}

export function GitPanel({
  project,
  workflows = [],
  onExecuteScript,
  onUpdateProject,
  onWorktreesChange,
  className = '',
  onOpenSettings,
}: GitPanelProps) {
  const projectPath = project.path;
  const [activeTab, setActiveTab] = useState<GitTab>('status');
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Diff viewer state
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<GitFile | null>(null);
  // Load Git status (with loading indicator)
  const loadStatus = useCallback(async (silent = false) => {
    if (!projectPath) return;

    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await gitAPI.getStatus(projectPath);
      if (response.success && response.status) {
        setStatus(response.status);
      } else if (response.error === 'NOT_GIT_REPO') {
        setError('This directory is not a Git repository');
      } else {
        setError(response.error || 'Failed to load Git status');
      }
    } catch (err) {
      setError('Failed to connect to Git');
      console.error('Git status error:', err);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [projectPath]);

  // Load status on mount and when project changes
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Auto-refresh status every 10 seconds when on status tab (silent refresh)
  useEffect(() => {
    if (activeTab !== 'status') return;

    const interval = setInterval(() => {
      loadStatus(true); // Silent refresh - no loading indicator
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab, loadStatus]);

  // Handle stage file
  const handleStageFile = async (filePath: string) => {
    try {
      const response = await gitAPI.stageFiles(projectPath, [filePath]);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to stage file:', err);
    }
  };

  // Handle unstage file
  const handleUnstageFile = async (filePath: string) => {
    try {
      const response = await gitAPI.unstageFiles(projectPath, [filePath]);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to unstage file:', err);
    }
  };

  // Handle stage all
  const handleStageAll = async () => {
    try {
      const response = await gitAPI.stageFiles(projectPath, []);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to stage all files:', err);
    }
  };

  // Handle unstage all
  const handleUnstageAll = async () => {
    try {
      const response = await gitAPI.unstageFiles(projectPath, []);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to unstage all files:', err);
    }
  };

  // Handle discard single file changes
  const handleDiscardFile = async (filePath: string) => {
    try {
      const response = await gitAPI.discardChanges(projectPath, [filePath]);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to discard file:', err);
    }
  };

  // Handle discard all changes
  const handleDiscardAll = async () => {
    try {
      const response = await gitAPI.discardChanges(projectPath, []);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to discard all changes:', err);
    }
  };

  // Handle delete single untracked file
  const handleDeleteUntracked = async (filePath: string) => {
    try {
      const response = await gitAPI.cleanUntracked(projectPath, [filePath]);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to delete untracked file:', err);
    }
  };

  // Handle delete all untracked files
  const handleDeleteAllUntracked = async () => {
    try {
      const response = await gitAPI.cleanUntracked(projectPath, [], true);
      if (response.success) {
        await loadStatus();
      }
    } catch (err) {
      console.error('Failed to delete untracked files:', err);
    }
  };

  // Handle commit
  const handleCommit = async (message: string) => {
    try {
      const response = await gitAPI.createCommit(projectPath, message);
      if (response.success) {
        await loadStatus();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to create commit:', err);
      return false;
    }
  };

  // Handle push
  const handlePush = async (options?: {
    remote?: string;
    branch?: string;
    setUpstream?: boolean;
    force?: boolean;
  }) => {
    try {
      const response = await gitAPI.push(projectPath, options);
      if (response.success) {
        await loadStatus();
        return { success: true };
      }
      return { success: false, error: response.error };
    } catch (err) {
      console.error('Failed to push:', err);
      return { success: false, error: 'Push failed' };
    }
  };

  // Handle pull
  const handlePull = async () => {
    try {
      const response = await gitAPI.pull(projectPath);
      if (response.success) {
        await loadStatus();
        return { success: true, hasConflicts: response.hasConflicts };
      }
      return { success: false, error: response.error };
    } catch (err) {
      console.error('Failed to pull:', err);
      return { success: false, error: 'Pull failed' };
    }
  };

  // Handle file click for diff viewer
  const handleFileClick = useCallback((file: GitFile) => {
    setSelectedFileForDiff(file);
  }, []);

  // Handle diff viewer close
  const handleDiffViewerClose = useCallback(() => {
    setSelectedFileForDiff(null);
  }, []);

  // Handle staging change from diff viewer
  const handleStagingChange = useCallback(() => {
    loadStatus();
  }, [loadStatus]);

  // Tab configuration - sidebar navigation items
  const tabs: { id: GitTab; label: string; description: string; icon: typeof GitBranch }[] = [
    { id: 'status', label: 'Changes', description: 'Stage, commit & sync', icon: FileCode },
    { id: 'branches', label: 'Branches', description: 'Switch & manage', icon: GitBranch },
    { id: 'history', label: 'History', description: 'View commit log', icon: History },
    { id: 'stash', label: 'Stash', description: 'Save work in progress', icon: Archive },
    { id: 'worktrees', label: 'Worktrees', description: 'Parallel workspaces', icon: FolderGit2 },
    { id: 'settings', label: 'Settings', description: 'Remotes & auth', icon: Settings },
  ];

  // Render error state
  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center flex-1 p-8">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{error}</p>
            <Button
              variant="secondary"
              onClick={() => loadStatus()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render loading state
  if (isLoading && !status) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex items-center justify-center flex-1">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  // Get change count for badge
  const changeCount = status ? status.stagedCount + status.modifiedCount + status.untrackedCount : 0;

  return (
    <div className={cn('flex h-full', className)}>
      {/* Left Sidebar Navigation */}
      <div className="w-56 flex-shrink-0 bg-card rounded-lg overflow-hidden m-4 mr-0 self-start">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground">Git</h3>
        </div>
        <ul>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'status' && changeCount > 0;

            return (
              <li key={tab.id}>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-left h-auto justify-start rounded-none border-l-2',
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border-blue-400'
                      : 'hover:bg-accent text-muted-foreground border-transparent'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tab.label}</div>
                    <div className="text-xs text-muted-foreground">{tab.description}</div>
                  </div>
                  {showBadge && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {changeCount}
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right Content Area - Keep all tabs mounted for state persistence */}
      <div className="flex-1 min-w-0 overflow-hidden p-4 flex flex-col">
        {/* Status Tab */}
        <div className={cn('flex flex-col h-full', activeTab !== 'status' && 'hidden')}>
          {status && (
            <>
              {/* Fixed Branch Status Header */}
              <div className="flex-shrink-0 pb-4 border-b border-border">
                <GitStatusView
                  branch={status.branch}
                  ahead={status.ahead}
                  behind={status.behind}
                  hasTrackingBranch={!!status.upstream}
                  projectPath={projectPath}
                  onPush={handlePush}
                  onPull={handlePull}
                  isLoading={isLoading}
                  onRemotesChange={loadStatus}
                />
              </div>

              {/* Scrollable File List */}
              <div className="flex-1 overflow-y-auto min-h-0 py-4">
                <GitFileList
                  stagedFiles={status.files.filter(f => f.staged)}
                  changedFiles={status.files.filter(f => !f.staged && f.status !== 'untracked')}
                  untrackedFiles={status.files.filter(f => f.status === 'untracked')}
                  onStageFile={handleStageFile}
                  onUnstageFile={handleUnstageFile}
                  onStageAll={handleStageAll}
                  onUnstageAll={handleUnstageAll}
                  onDiscardFile={handleDiscardFile}
                  onDiscardAll={handleDiscardAll}
                  onDeleteUntracked={handleDeleteUntracked}
                  onDeleteAllUntracked={handleDeleteAllUntracked}
                  onFileClick={handleFileClick}
                />
              </div>

              {/* Fixed Commit Form at bottom */}
              <div className="flex-shrink-0 pt-4 border-t border-border">
                <GitCommitForm
                  hasStagedChanges={status.stagedCount > 0}
                  onCommit={handleCommit}
                  projectPath={projectPath}
                  onOpenAISettings={() => onOpenSettings?.('ai-providers')}
                />
              </div>
            </>
          )}
        </div>

        {/* Branches Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'branches' && 'hidden')}>
          <GitBranchList
            projectPath={projectPath}
            onBranchChange={loadStatus}
          />
        </div>

        {/* History Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'history' && 'hidden')}>
          <GitHistoryList projectPath={projectPath} />
        </div>

        {/* Stash Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'stash' && 'hidden')}>
          <GitStashList
            projectPath={projectPath}
            onStashChange={loadStatus}
          />
        </div>

        {/* Worktrees Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'worktrees' && 'hidden')}>
          <GitWorktreeList
            project={project}
            workflows={workflows}
            onUpdateProject={onUpdateProject}
            onExecuteScript={onExecuteScript}
            onWorktreesChange={onWorktreesChange}
          />
        </div>

        {/* Settings Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'settings' && 'hidden')}>
          <GitSettingsPanel
            projectPath={projectPath}
            onRemotesChange={loadStatus}
          />
        </div>
      </div>

      {/* Diff Viewer Modal */}
      <GitDiffViewer
        isOpen={selectedFileForDiff !== null}
        onClose={handleDiffViewerClose}
        projectPath={projectPath}
        filePath={selectedFileForDiff?.path ?? ''}
        initialDiffType={selectedFileForDiff?.staged ? 'staged' : 'unstaged'}
        onStagingChange={handleStagingChange}
      />

    </div>
  );
}
