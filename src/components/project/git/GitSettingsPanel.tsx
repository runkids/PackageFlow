/**
 * Git Settings Panel - Remote configuration and authentication
 * @see specs/009-git-integration/tasks.md
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { gitAPI } from '../../../lib/tauri-api';
import type { GitRemote } from '../../../types/git';
import { GitAuthPanel } from './GitAuthPanel';
import { Button } from '../../ui/Button';

interface GitSettingsPanelProps {
  /** Project path for Git operations */
  projectPath: string;
  /** Callback when remotes change */
  onRemotesChange?: () => void;
}

export function GitSettingsPanel({ projectPath, onRemotesChange }: GitSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'remotes' | 'auth'>('remotes');
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(true);
  const [showAddRemote, setShowAddRemote] = useState(false);
  const [newRemoteName, setNewRemoteName] = useState('origin');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  const [isAddingRemote, setIsAddingRemote] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Load remotes (silent refresh when data exists)
  const loadRemotes = useCallback(async (silent = false) => {
    if (!projectPath) return;

    // Only show loading spinner on initial load (no existing data)
    if (!silent && remotes.length === 0) {
      setIsLoadingRemotes(true);
    }
    try {
      const response = await gitAPI.getRemotes(projectPath);
      if (response.success && response.remotes) {
        setRemotes(response.remotes);
      }
    } catch (err) {
      console.error('Failed to load remotes:', err);
    } finally {
      setIsLoadingRemotes(false);
    }
  }, [projectPath, remotes.length]);

  // Initial load
  useEffect(() => {
    loadRemotes();
  }, [loadRemotes]);

  // Auto-refresh every 30 seconds (silent background update)
  useEffect(() => {
    const interval = setInterval(() => {
      loadRemotes(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadRemotes]);

  // Fetch from remote
  const handleFetch = async (remoteName?: string) => {
    setIsFetching(true);
    setOperationError(null);

    try {
      const response = await gitAPI.fetch(projectPath, {
        remote: remoteName,
        allRemotes: !remoteName,
      });
      if (response.success) {
        onRemotesChange?.();
      } else {
        if (response.error === 'NETWORK_ERROR') {
          setOperationError('Network error. Check your internet connection.');
        } else if (response.error === 'AUTH_FAILED') {
          setOperationError('Authentication failed. Check your credentials.');
        } else {
          setOperationError(response.error || 'Failed to fetch');
        }
      }
    } catch (err) {
      setOperationError('Failed to fetch');
      console.error('Fetch error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  // Add remote
  const handleAddRemote = async () => {
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return;

    setIsAddingRemote(true);
    setOperationError(null);

    try {
      const response = await gitAPI.addRemote(projectPath, newRemoteName.trim(), newRemoteUrl.trim());
      if (response.success) {
        const addedRemoteName = newRemoteName.trim();
        setNewRemoteName('origin');
        setNewRemoteUrl('');
        setShowAddRemote(false);
        await loadRemotes();
        // Auto fetch after adding remote
        await handleFetch(addedRemoteName);
        onRemotesChange?.();
      } else {
        if (response.error === 'REMOTE_EXISTS') {
          setOperationError(`Remote '${newRemoteName}' already exists`);
        } else {
          setOperationError(response.error || 'Failed to add remote');
        }
      }
    } catch (err) {
      setOperationError('Failed to add remote');
      console.error('Add remote error:', err);
    } finally {
      setIsAddingRemote(false);
    }
  };

  // Remove remote
  const handleRemoveRemote = async (name: string) => {
    setOperationError(null);

    try {
      const response = await gitAPI.removeRemote(projectPath, name);
      if (response.success) {
        await loadRemotes();
        onRemotesChange?.();
      } else {
        setOperationError(response.error || 'Failed to remove remote');
      }
    } catch (err) {
      setOperationError('Failed to remove remote');
      console.error('Remove remote error:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('remotes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'remotes'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Remotes
        </button>
        <button
          onClick={() => setActiveTab('auth')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'auth'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Authentication
        </button>
      </div>

      {/* Remotes Tab */}
      {activeTab === 'remotes' && (
        <div className="space-y-4">
          {/* Header with actions */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">Remote Repositories</h4>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleFetch()}
                disabled={isFetching || remotes.length === 0}
                title="Fetch from all remotes"
              >
                {isFetching ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                )}
                Fetch All
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowAddRemote(!showAddRemote)}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Remote
              </Button>
            </div>
          </div>

          {/* Add Remote Form */}
          {showAddRemote && (
            <div className="p-4 bg-card rounded-lg space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRemoteName}
                  onChange={(e) => setNewRemoteName(e.target.value)}
                  placeholder="Name (e.g., origin)"
                  className="w-32 px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={newRemoteUrl}
                  onChange={(e) => setNewRemoteUrl(e.target.value)}
                  placeholder="URL (https://github.com/user/repo.git)"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddRemote}
                  disabled={!newRemoteName.trim() || !newRemoteUrl.trim() || isAddingRemote}
                  variant="success"
                >
                  {isAddingRemote ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Add
                </Button>
                <button
                  onClick={() => {
                    setShowAddRemote(false);
                    setNewRemoteName('origin');
                    setNewRemoteUrl('');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-muted hover:bg-accent rounded text-sm transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Remote List */}
          {isLoadingRemotes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : remotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CloudOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No remotes configured</p>
              <p className="text-xs mt-1">Add a remote to enable push/pull</p>
            </div>
          ) : (
            <div className="space-y-2">
              {remotes.map((remote) => (
                <div
                  key={remote.name}
                  className="flex items-center justify-between p-3 bg-card rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="font-medium text-foreground">{remote.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1" title={remote.url}>
                      {remote.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleFetch(remote.name)}
                      disabled={isFetching}
                      className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="Fetch from this remote"
                    >
                      <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleRemoveRemote(remote.name)}
                      className="p-2 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove remote"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {operationError && (
            <div className="text-sm text-red-400 bg-red-500/10 px-4 py-3 rounded-lg">
              {operationError}
            </div>
          )}
        </div>
      )}

      {/* Authentication Tab */}
      {activeTab === 'auth' && (
        <GitAuthPanel projectPath={projectPath} remotes={remotes} />
      )}
    </div>
  );
}
