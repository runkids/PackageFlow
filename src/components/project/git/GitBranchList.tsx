/**
 * Git Branch List - Shows local and remote branches with actions
 * @see specs/009-git-integration/tasks.md - T017
 */

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  Cloud,
  Laptop,
  Loader2,
  ChevronDown,
  ChevronRight,
  GitMerge,
  X,
  AlertTriangle,
} from 'lucide-react';
import { gitAPI } from '../../../lib/tauri-api';
import { Button } from '../../ui/Button';
import type { Branch } from '../../../types/git';

interface GitBranchListProps {
  /** Project path for Git operations */
  projectPath: string;
  /** Callback when branch changes */
  onBranchChange?: () => void;
  /** Whether this tab is currently active (for polling optimization) */
  isActive?: boolean;
}

export function GitBranchList({ projectPath, onBranchChange, isActive = true }: GitBranchListProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranchInput, setShowNewBranchInput] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    local: true,
    remote: true,
  });

  // Rebase state
  const [isRebasing, setIsRebasing] = useState(false);
  const [rebaseTarget, setRebaseTarget] = useState<string | null>(null);
  const [rebaseConflict, setRebaseConflict] = useState(false);

  // Load branches (silent refresh when data exists)
  const loadBranches = useCallback(
    async (silent = false) => {
      if (!projectPath) return;

      // Only show loading spinner on initial load (no existing data)
      if (!silent && branches.length === 0) {
        setIsLoading(true);
      }
      setOperationError(null);

      try {
        const response = await gitAPI.getBranches(projectPath);
        if (response.success && response.branches) {
          setBranches(response.branches);
          const current = response.branches.find((b) => b.isCurrent);
          if (current) {
            setCurrentBranch(current.name);
          }
        } else {
          setOperationError(response.error || 'Failed to load branches');
        }
      } catch (err) {
        setOperationError('Failed to connect to Git');
        console.error('Git branches error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath, branches.length]
  );

  // Initial load
  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // Auto-refresh every 30 seconds (silent background update) - only when tab is active
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      loadBranches(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadBranches, isActive]);

  // Handle checkout branch
  const handleCheckout = async (branchName: string) => {
    if (branchName === currentBranch) return;

    setOperationError(null);
    try {
      const response = await gitAPI.switchBranch(projectPath, branchName);
      if (response.success) {
        setCurrentBranch(branchName);
        await loadBranches();
        onBranchChange?.();
      } else {
        setOperationError(response.error || 'Failed to checkout branch');
      }
    } catch (err) {
      setOperationError('Failed to checkout branch');
      console.error('Checkout error:', err);
    }
  };

  // Handle create branch
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setIsCreating(true);
    setOperationError(null);

    try {
      const response = await gitAPI.createBranch(projectPath, newBranchName.trim());
      if (response.success) {
        setNewBranchName('');
        setShowNewBranchInput(false);
        await loadBranches();
        onBranchChange?.();
      } else {
        setOperationError(response.error || 'Failed to create branch');
      }
    } catch (err) {
      setOperationError('Failed to create branch');
      console.error('Create branch error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle delete branch
  const handleDeleteBranch = async (branchName: string) => {
    if (branchName === currentBranch) {
      setOperationError('Cannot delete the current branch');
      return;
    }

    setOperationError(null);
    try {
      const response = await gitAPI.deleteBranch(projectPath, branchName);
      if (response.success) {
        await loadBranches();
      } else {
        setOperationError(response.error || 'Failed to delete branch');
      }
    } catch (err) {
      setOperationError('Failed to delete branch');
      console.error('Delete branch error:', err);
    }
  };

  // Handle rebase
  const handleRebase = async (ontoBranch: string) => {
    if (ontoBranch === currentBranch) {
      setOperationError('Cannot rebase onto the current branch');
      return;
    }

    setIsRebasing(true);
    setRebaseTarget(ontoBranch);
    setOperationError(null);
    setRebaseConflict(false);

    try {
      const response = await gitAPI.rebase(projectPath, ontoBranch);
      if (response.success) {
        await loadBranches();
        onBranchChange?.();
        setRebaseTarget(null);
      } else {
        if (response.hasConflicts) {
          setRebaseConflict(true);
          setOperationError('Rebase conflict! Resolve conflicts manually, then continue or abort.');
        } else if (response.error === 'HAS_UNCOMMITTED_CHANGES') {
          setOperationError(
            'Cannot rebase: you have uncommitted changes. Commit or stash them first.'
          );
          setRebaseTarget(null);
        } else {
          setOperationError(response.error || 'Failed to rebase');
          setRebaseTarget(null);
        }
      }
    } catch (err) {
      setOperationError('Failed to rebase');
      setRebaseTarget(null);
      console.error('Rebase error:', err);
    } finally {
      setIsRebasing(false);
    }
  };

  // Handle rebase abort
  const handleRebaseAbort = async () => {
    setIsRebasing(true);
    setOperationError(null);

    try {
      const response = await gitAPI.rebaseAbort(projectPath);
      if (response.success) {
        setRebaseConflict(false);
        setRebaseTarget(null);
        await loadBranches();
        onBranchChange?.();
      } else {
        setOperationError(response.error || 'Failed to abort rebase');
      }
    } catch (err) {
      setOperationError('Failed to abort rebase');
      console.error('Rebase abort error:', err);
    } finally {
      setIsRebasing(false);
    }
  };

  // Handle rebase continue
  const handleRebaseContinue = async () => {
    setIsRebasing(true);
    setOperationError(null);

    try {
      const response = await gitAPI.rebaseContinue(projectPath);
      if (response.success) {
        setRebaseConflict(false);
        setRebaseTarget(null);
        await loadBranches();
        onBranchChange?.();
      } else {
        if (response.hasConflicts) {
          setOperationError('Still have conflicts. Resolve all conflicts before continuing.');
        } else {
          setOperationError(response.error || 'Failed to continue rebase');
        }
      }
    } catch (err) {
      setOperationError('Failed to continue rebase');
      console.error('Rebase continue error:', err);
    } finally {
      setIsRebasing(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateBranch();
    } else if (e.key === 'Escape') {
      setShowNewBranchInput(false);
      setNewBranchName('');
    }
  };

  const toggleSection = (section: 'local' | 'remote') => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Separate local and remote branches
  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  // Import Button component
  // (Button is already imported at the top)

  if (isLoading && branches.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Branches</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadBranches()}
            disabled={isLoading}
            className="h-8 w-8"
            title="Refresh branches"
          >
            <RefreshCw
              className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowNewBranchInput(true)}
            title="Create new branch"
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      {/* Rebase Conflict Panel */}
      {rebaseConflict && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Rebase in progress</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Rebasing onto <span className="font-mono text-yellow-400">{rebaseTarget}</span>. Resolve
            conflicts in your editor, then continue or abort.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleRebaseContinue}
              disabled={isRebasing}
              variant="success"
            >
              {isRebasing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-1.5" />
              )}
              Continue
            </Button>
            <Button
              size="sm"
              onClick={handleRebaseAbort}
              disabled={isRebasing}
              variant="destructive"
            >
              {isRebasing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <X className="w-4 h-4 mr-1.5" />
              )}
              Abort
            </Button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {operationError && !rebaseConflict && (
        <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">{operationError}</div>
      )}

      {/* New Branch Input */}
      {showNewBranchInput && (
        <div className="flex items-center gap-2 p-3 bg-card rounded-lg">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Branch name..."
            autoFocus
            className="flex-1 px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
          />
          <Button
            size="sm"
            onClick={handleCreateBranch}
            disabled={!newBranchName.trim() || isCreating}
            variant="success"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowNewBranchInput(false);
              setNewBranchName('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Local Branches */}
      <div className="space-y-1">
        <Button
          onClick={() => toggleSection('local')}
          variant="ghost"
          className="h-auto w-auto p-0 text-sm font-medium justify-start hover:bg-transparent"
        >
          {expandedSections.local ? (
            <ChevronDown className="w-4 h-4 mr-1" />
          ) : (
            <ChevronRight className="w-4 h-4 mr-1" />
          )}
          <Laptop className="w-4 h-4 text-muted-foreground mr-1" />
          Local ({localBranches.length})
        </Button>

        {expandedSections.local && (
          <div className="space-y-0.5 pl-6">
            {localBranches.map((branch) => (
              <BranchItem
                key={branch.name}
                branch={branch}
                isCurrent={branch.name === currentBranch}
                onCheckout={handleCheckout}
                onDelete={handleDeleteBranch}
                onRebase={handleRebase}
                isRebasing={isRebasing && rebaseTarget === branch.name}
                rebaseDisabled={rebaseConflict || isRebasing}
              />
            ))}
          </div>
        )}
      </div>

      {/* Remote Branches */}
      {remoteBranches.length > 0 && (
        <div className="space-y-1">
          <Button
            onClick={() => toggleSection('remote')}
            variant="ghost"
            className="h-auto w-auto p-0 text-sm font-medium justify-start hover:bg-transparent"
          >
            {expandedSections.remote ? (
              <ChevronDown className="w-4 h-4 mr-1" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-1" />
            )}
            <Cloud className="w-4 h-4 text-muted-foreground mr-1" />
            Remote ({remoteBranches.length})
          </Button>

          {expandedSections.remote && (
            <div className="space-y-0.5 pl-6">
              {remoteBranches.map((branch) => (
                <BranchItem
                  key={branch.name}
                  branch={branch}
                  isCurrent={false}
                  onCheckout={handleCheckout}
                  onDelete={handleDeleteBranch}
                  onRebase={handleRebase}
                  isRebasing={isRebasing && rebaseTarget === branch.name}
                  rebaseDisabled={rebaseConflict || isRebasing}
                  isRemote
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Branch Item Component
interface BranchItemProps {
  branch: Branch;
  isCurrent: boolean;
  onCheckout: (name: string) => void;
  onDelete: (name: string) => void;
  onRebase: (ontoBranch: string) => void;
  isRebasing?: boolean;
  rebaseDisabled?: boolean;
  isRemote?: boolean;
}

function BranchItem({
  branch,
  isCurrent,
  onCheckout,
  onDelete,
  onRebase,
  isRebasing = false,
  rebaseDisabled = false,
  isRemote = false,
}: BranchItemProps) {
  return (
    <div
      className={`group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent transition-colors ${
        isCurrent ? 'bg-blue-500/10' : ''
      }`}
    >
      {/* Current indicator */}
      {isCurrent ? (
        <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
      ) : (
        <GitBranch className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}

      {/* Branch name */}
      <Button
        onClick={() => onCheckout(branch.name)}
        variant="ghost"
        className={`h-auto flex-1 justify-start text-left text-sm truncate p-0 ${
          isCurrent ? 'text-green-400 font-medium' : 'text-muted-foreground hover:text-foreground'
        }`}
        title={branch.name}
      >
        {branch.name}
      </Button>

      {/* Commit SHA */}
      {branch.lastCommitHash && (
        <span className="text-xs text-muted-foreground font-mono">
          {branch.lastCommitHash.slice(0, 7)}
        </span>
      )}

      {/* Rebase button (rebase current branch onto this branch) */}
      {!isCurrent && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onRebase(branch.name);
          }}
          disabled={rebaseDisabled}
          variant="ghost"
          size="icon"
          className="h-auto w-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-purple-500/20"
          title={`Rebase current branch onto ${branch.name}`}
        >
          {isRebasing ? (
            <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
          ) : (
            <GitMerge className="w-3.5 h-3.5 text-purple-400" />
          )}
        </Button>
      )}

      {/* Delete button (only for local, non-current branches) */}
      {!isRemote && !isCurrent && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(branch.name);
          }}
          variant="ghost"
          size="icon"
          className="h-auto w-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20"
          title="Delete branch"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </Button>
      )}
    </div>
  );
}
