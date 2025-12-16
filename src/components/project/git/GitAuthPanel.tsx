/**
 * Git Authentication Panel - Shows auth status and test connection
 * @see specs/009-git-integration/tasks.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Key,
  User,
  Mail,
  Shield,
  Check,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { gitAPI, openUrl } from '../../../lib/tauri-api';
import type { GitAuthStatus, GitRemote } from '../../../types/git';
import { Button } from '../../ui/Button';

interface GitAuthPanelProps {
  /** Project path for Git operations */
  projectPath: string;
  /** Remotes to test connection */
  remotes: GitRemote[];
}

export function GitAuthPanel({ projectPath, remotes }: GitAuthPanelProps) {
  const [authStatus, setAuthStatus] = useState<GitAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testingRemote, setTestingRemote] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<
    Record<string, { success: boolean; error?: string }>
  >({});

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load auth status
  const loadAuthStatus = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await gitAPI.getAuthStatus(projectPath);
      if (!isMountedRef.current) return;

      if (response.success && response.authStatus) {
        setAuthStatus(response.authStatus);
      } else {
        setLoadError(response.error || 'Failed to load auth status');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to load auth status:', err);
      setLoadError('Failed to load auth status');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectPath]);

  useEffect(() => {
    loadAuthStatus();
  }, [loadAuthStatus]);

  // Test connection to remote
  const testConnection = async (remoteName: string) => {
    setTestingRemote(remoteName);
    try {
      const response = await gitAPI.testRemoteConnection(projectPath, remoteName);
      if (!isMountedRef.current) return;

      setConnectionResults((prev) => ({
        ...prev,
        [remoteName]: {
          success: response.canConnect,
          error: response.error,
        },
      }));
    } catch (err) {
      if (!isMountedRef.current) return;

      setConnectionResults((prev) => ({
        ...prev,
        [remoteName]: {
          success: false,
          error: 'Failed to test connection',
        },
      }));
    } finally {
      if (isMountedRef.current) {
        setTestingRemote(null);
      }
    }
  };

  // Test all remotes
  const testAllConnections = async () => {
    for (const remote of remotes) {
      if (!isMountedRef.current) return;
      await testConnection(remote.name);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">Loading authentication status...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-4 space-y-2">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">{loadError}</span>
        </div>
        <Button
          onClick={loadAuthStatus}
          variant="ghost"
          size="sm"
          className="h-auto"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Git User Info */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <User className="w-4 h-4" />
          Git Identity
        </h4>
        <div className="pl-6 space-y-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span>{authStatus?.userName || <span className="text-yellow-400">Not configured</span>}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-3.5 h-3.5" />
            <span>{authStatus?.userEmail || <span className="text-yellow-400">Not configured</span>}</span>
          </div>
        </div>
      </div>

      {/* SSH Status */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Key className="w-4 h-4" />
          SSH Authentication
        </h4>
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {authStatus?.sshAgentAvailable ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-foreground">SSH Agent running</span>
              </>
            ) : (
              <>
                <X className="w-4 h-4 text-red-400" />
                <span className="text-muted-foreground">SSH Agent not running</span>
              </>
            )}
          </div>

          {authStatus?.sshIdentities && authStatus.sshIdentities.length > 0 ? (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Loaded keys:</span>
              {authStatus.sshIdentities.map((identity, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-xs text-muted-foreground pl-2"
                >
                  <Key className="w-3 h-3" />
                  <span className="truncate">{identity}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              No SSH keys loaded. Run `ssh-add` to add keys.
            </div>
          )}
        </div>
      </div>

      {/* Credential Helper */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Credential Helper (HTTPS)
        </h4>
        <div className="pl-6">
          {authStatus?.credentialHelper ? (
            <div className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-foreground font-mono">{authStatus.credentialHelper}</span>
            </div>
          ) : (
            <div className="text-sm text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              <span>Not configured</span>
            </div>
          )}
        </div>
      </div>

      {/* Connection Test */}
      {remotes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">Connection Test</h4>
            <Button
              onClick={testAllConnections}
              disabled={testingRemote !== null}
              variant="ghost"
              size="sm"
              className="h-auto text-xs"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${testingRemote ? 'animate-spin' : ''}`} />
              Test All
            </Button>
          </div>

          <div className="space-y-1">
            {remotes.map((remote) => {
              const result = connectionResults[remote.name];
              const isTesting = testingRemote === remote.name;

              return (
                <div
                  key={remote.name}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground">{remote.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{remote.url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result && !isTesting && (
                      result.success ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <span className="text-xs text-red-400" title={result.error}>
                          {result.error === 'AUTH_FAILED' ? 'Auth failed' :
                           result.error === 'NETWORK_ERROR' ? 'Network error' :
                           result.error === 'TIMEOUT' ? 'Timeout' :
                           'Failed'}
                        </span>
                      )
                    )}
                    <Button
                      onClick={() => testConnection(remote.name)}
                      disabled={isTesting}
                      variant="ghost"
                      size="icon"
                      className="h-auto w-auto p-1"
                      title="Test connection"
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Help Links */}
      <div className="pt-3 border-t border-border space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-2">SSH Setup Guides</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openUrl('https://docs.github.com/en/authentication/connecting-to-github-with-ssh')}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-card hover:bg-accent text-foreground rounded transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </button>
            <button
              onClick={() => openUrl('https://support.atlassian.com/bitbucket-cloud/docs/configure-ssh-and-two-step-verification/')}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-card hover:bg-accent text-foreground rounded transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Bitbucket
            </button>
            <button
              onClick={() => openUrl('https://docs.gitlab.com/ee/user/ssh.html')}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-card hover:bg-accent text-foreground rounded transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              GitLab
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">HTTPS Credential Storage</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openUrl('https://git-scm.com/book/en/v2/Git-Tools-Credential-Storage')}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-card hover:bg-accent text-foreground rounded transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Git Credential Helper
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
