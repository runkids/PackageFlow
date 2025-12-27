/**
 * Git Stash List - Shows stashes with apply/drop actions
 * @see specs/009-git-integration/tasks.md - T019
 */

import { useState, useEffect, useCallback } from 'react';
import { Archive, Plus, Play, Trash2, RefreshCw, Calendar, Loader2 } from 'lucide-react';
import { gitAPI } from '../../../lib/tauri-api';
import type { Stash } from '../../../types/git';
import { Button } from '../../ui/Button';

interface GitStashListProps {
  /** Project path for Git operations */
  projectPath: string;
  /** Callback when stash changes */
  onStashChange?: () => void;
  /** Whether this tab is currently active (for polling optimization) */
  isActive?: boolean;
}

export function GitStashList({ projectPath, onStashChange, isActive = true }: GitStashListProps) {
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operatingStash, setOperatingStash] = useState<number | null>(null);

  // Load stashes (silent refresh when data exists)
  const loadStashes = useCallback(
    async (silent = false) => {
      if (!projectPath) return;

      // Only show loading spinner on initial load (no existing data)
      if (!silent && stashes.length === 0) {
        setIsLoading(true);
      }
      setOperationError(null);

      try {
        const response = await gitAPI.listStashes(projectPath);
        if (response.success && response.stashes) {
          setStashes(response.stashes);
        } else {
          setOperationError(response.error || 'Failed to load stashes');
        }
      } catch (err) {
        setOperationError('Failed to connect to Git');
        console.error('Git stash error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath, stashes.length]
  );

  // Initial load
  useEffect(() => {
    loadStashes();
  }, [loadStashes]);

  // Auto-refresh every 30 seconds (silent background update) - only when tab is active
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      loadStashes(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadStashes, isActive]);

  // Create new stash
  const handleCreateStash = async () => {
    setIsCreating(true);
    setOperationError(null);

    try {
      const response = await gitAPI.createStash(projectPath, stashMessage.trim() || undefined);
      if (response.success) {
        setStashMessage('');
        setShowCreateInput(false);
        await loadStashes();
        onStashChange?.();
      } else {
        setOperationError(response.error || 'Failed to create stash');
      }
    } catch (err) {
      setOperationError('Failed to create stash');
      console.error('Create stash error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Apply stash
  const handleApplyStash = async (stashIndex: number) => {
    setOperatingStash(stashIndex);
    setOperationError(null);

    try {
      const response = await gitAPI.applyStash(projectPath, stashIndex);
      if (response.success) {
        await loadStashes();
        onStashChange?.();
        if (response.hasConflicts) {
          setOperationError('Stash applied with conflicts. Please resolve them manually.');
        }
      } else {
        setOperationError(response.error || 'Failed to apply stash');
      }
    } catch (err) {
      setOperationError('Failed to apply stash');
      console.error('Apply stash error:', err);
    } finally {
      setOperatingStash(null);
    }
  };

  // Drop stash
  const handleDropStash = async (stashIndex: number) => {
    setOperatingStash(stashIndex);
    setOperationError(null);

    try {
      const response = await gitAPI.dropStash(projectPath, stashIndex);
      if (response.success) {
        await loadStashes();
      } else {
        setOperationError(response.error || 'Failed to drop stash');
      }
    } catch (err) {
      setOperationError('Failed to drop stash');
      console.error('Drop stash error:', err);
    } finally {
      setOperatingStash(null);
    }
  };

  // Pop stash (apply + drop)
  const handlePopStash = async (stashIndex: number) => {
    setOperatingStash(stashIndex);
    setOperationError(null);

    try {
      // Use applyStash with pop=true to pop the stash
      const response = await gitAPI.applyStash(projectPath, stashIndex, true);
      if (response.success) {
        await loadStashes();
        onStashChange?.();
        if (response.hasConflicts) {
          setOperationError('Stash popped with conflicts. Please resolve them manually.');
        }
      } else {
        setOperationError(response.error || 'Failed to pop stash');
      }
    } catch (err) {
      setOperationError('Failed to pop stash');
      console.error('Pop stash error:', err);
    } finally {
      setOperatingStash(null);
    }
  };

  // Format date from ISO string
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateStash();
    } else if (e.key === 'Escape') {
      setShowCreateInput(false);
      setStashMessage('');
    }
  };

  if (isLoading && stashes.length === 0) {
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
        <h3 className="text-sm font-medium text-muted-foreground">Stashes</h3>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => loadStashes()}
            disabled={isLoading}
            variant="ghost"
            size="icon"
            className="h-auto w-auto p-1.5"
            title="Refresh stashes"
          >
            <RefreshCw
              className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreateInput(true)}
            title="Create new stash"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Stash
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {operationError && (
        <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">{operationError}</div>
      )}

      {/* Create Stash Input */}
      {showCreateInput && (
        <div className="p-3 bg-card rounded-lg space-y-2">
          <input
            type="text"
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stash message (optional)..."
            autoFocus
            className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCreateStash}
              disabled={isCreating}
              variant="success"
              className="flex-1"
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Stash'
              )}
            </Button>
            <Button
              onClick={() => {
                setShowCreateInput(false);
                setStashMessage('');
              }}
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Stash List */}
      {stashes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Archive className="w-12 h-12 mb-2" />
          <p>No stashes</p>
          <p className="text-sm">Create a stash to save your changes temporarily</p>
        </div>
      ) : (
        <div className="space-y-2">
          {stashes.map((stash) => {
            const isOperating = operatingStash === stash.index;

            return (
              <div
                key={stash.index}
                className="p-3 bg-card rounded-lg hover:bg-accent transition-colors"
              >
                {/* Stash Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Message */}
                    <p className="text-sm text-foreground break-words">
                      {stash.message || 'No message'}
                    </p>

                    {/* Metadata */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">stash@{`{${stash.index}}`}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(stash.date)}
                      </span>
                      <span>{stash.branch}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => handlePopStash(stash.index)}
                      disabled={isOperating}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400"
                      title="Pop stash (apply and remove)"
                    >
                      {isOperating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleApplyStash(stash.index)}
                      disabled={isOperating}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-1.5"
                      title="Apply stash (keep in list)"
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => handleDropStash(stash.index)}
                      disabled={isOperating}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-1.5 hover:bg-red-500/20 hover:text-red-400"
                      title="Drop stash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
