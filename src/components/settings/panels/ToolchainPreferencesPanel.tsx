/**
 * Toolchain Preferences Panel
 * Manage saved toolchain strategy preferences for projects
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import {
  Wrench,
  Trash2,
  FolderOpen,
  Clock,
  AlertTriangle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Terminal,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import type {
  ProjectPreference,
  ToolchainStrategy,
  PnpmHomeConflict,
  CorepackOperationResponse,
  EnvironmentDiagnostics,
} from '../../../types/toolchain';

// Strategy display config
const strategyConfig: Record<
  ToolchainStrategy,
  { label: string; color: string; bgColor: string }
> = {
  volta_priority: {
    label: 'Volta Priority',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/20',
  },
  corepack_priority: {
    label: 'Corepack Priority',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  hybrid: {
    label: 'Hybrid Mode',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
  },
  system_default: {
    label: 'System Default',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 border-border',
  },
};

export const ToolchainPreferencesPanel: React.FC = () => {
  const [preferences, setPreferences] = useState<ProjectPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'single' | 'all';
    projectPath?: string;
    projectName?: string;
  } | null>(null);

  // Health check state - use EnvironmentDiagnostics for system-level info
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [pnpmHomeConflict, setPnpmHomeConflict] = useState<PnpmHomeConflict | null>(null);
  const [isEnablingCorepack, setIsEnablingCorepack] = useState(false);
  const [isFixingConflict, setIsFixingConflict] = useState(false);
  const [operationMessage, setOperationMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load health check data using system-level diagnostics (no project path)
  const loadHealthCheck = async () => {
    try {
      // Get system-level environment diagnostics (no project_path = system level)
      const envDiagnostics = await invoke<EnvironmentDiagnostics>('get_environment_diagnostics', {
        projectPath: null,
      });
      setDiagnostics(envDiagnostics);

      // Check PNPM HOME conflict
      const conflictResult = await invoke<PnpmHomeConflict>('detect_pnpm_home_conflict_cmd');
      setPnpmHomeConflict(conflictResult);
    } catch (err) {
      console.error('Failed to load health check:', err);
    }
  };

  // Handle enable corepack
  const handleEnableCorepack = async () => {
    setIsEnablingCorepack(true);
    setOperationMessage(null);
    try {
      const result = await invoke<CorepackOperationResponse>('enable_corepack');
      if (result.success) {
        setOperationMessage({ type: 'success', text: result.message || 'Corepack enabled successfully' });
        // Reload health check
        await loadHealthCheck();
      } else {
        setOperationMessage({ type: 'error', text: result.error || 'Failed to enable corepack' });
      }
    } catch (err) {
      setOperationMessage({ type: 'error', text: `Error: ${err}` });
    } finally {
      setIsEnablingCorepack(false);
    }
  };

  // Handle fix PNPM HOME conflict
  const handleFixPnpmHomeConflict = async () => {
    setIsFixingConflict(true);
    setOperationMessage(null);
    try {
      const result = await invoke<CorepackOperationResponse>('fix_pnpm_home_conflict');
      if (result.success) {
        setOperationMessage({ type: 'success', text: result.message || 'PNPM HOME conflict fixed' });
        // Reload health check
        await loadHealthCheck();
      } else {
        setOperationMessage({ type: 'error', text: result.error || 'Failed to fix conflict' });
      }
    } catch (err) {
      setOperationMessage({ type: 'error', text: `Error: ${err}` });
    } finally {
      setIsFixingConflict(false);
    }
  };

  // Load preferences
  const loadPreferences = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get all preferences from the settings store
      const result = await invoke<Record<string, ProjectPreference>>(
        'get_all_toolchain_preferences'
      );
      setPreferences(Object.values(result || {}));
    } catch (err) {
      // Fallback: try to get from settings directly
      try {
        const settings = await invoke<{ toolchain_preferences?: Record<string, ProjectPreference> }>(
          'get_settings_value',
          { key: 'toolchain_preferences' }
        );
        setPreferences(Object.values(settings?.toolchain_preferences || {}));
      } catch {
        setError('Failed to load preferences');
        setPreferences([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
    loadHealthCheck();
  }, []);

  // Show confirm dialog for single preference
  const requestClearPreference = (projectPath: string) => {
    const projectName = getProjectName(projectPath);
    setDeleteTarget({ type: 'single', projectPath, projectName });
  };

  // Show confirm dialog for all preferences
  const requestClearAll = () => {
    if (preferences.length === 0) return;
    setDeleteTarget({ type: 'all' });
  };

  // Execute clear after confirmation
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    const clearedPaths: string[] = [];

    if (deleteTarget.type === 'single' && deleteTarget.projectPath) {
      setIsClearing(deleteTarget.projectPath);
      try {
        await invoke('clear_toolchain_preference', {
          projectPath: deleteTarget.projectPath,
        });
        clearedPaths.push(deleteTarget.projectPath);
        setPreferences((prev) =>
          prev.filter((p) => p.project_path !== deleteTarget.projectPath)
        );
      } catch (err) {
        setError(`Failed to clear preference: ${err}`);
      } finally {
        setIsClearing(null);
      }
    } else if (deleteTarget.type === 'all') {
      setIsClearing('all');
      try {
        await Promise.all(
          preferences.map((p) =>
            invoke('clear_toolchain_preference', { projectPath: p.project_path })
          )
        );
        clearedPaths.push(...preferences.map((p) => p.project_path));
        setPreferences([]);
      } catch (err) {
        setError(`Failed to clear preferences: ${err}`);
      } finally {
        setIsClearing(null);
      }
    }

    // Emit event to notify ProjectExplorer to re-detect version mismatch
    if (clearedPaths.length > 0) {
      await emit('toolchain-preference-cleared', { paths: clearedPaths });
    }

    setDeleteTarget(null);
  };

  // Format date
  const formatDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  // Extract project name from path
  const getProjectName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="flex items-start justify-between shrink-0 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Toolchain Preferences
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage saved version management preferences for your projects
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadPreferences}
          disabled={isLoading}
          title="Refresh"
        >
          <RefreshCw
            className={cn('w-4 h-4', isLoading && 'animate-spin')}
          />
        </Button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto space-y-6 min-h-0">

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && preferences.length === 0 && (
        <div className="p-8 rounded-lg border border-border bg-card text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            No Saved Preferences
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            When you choose "Remember this choice" in the Version Mismatch dialog,
            your preference will be saved here.
          </p>
        </div>
      )}

      {/* Preferences list */}
      {!isLoading && preferences.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {preferences.length} saved preference{preferences.length !== 1 ? 's' : ''}
            </span>
            <Button
              variant="outline-destructive"
              size="sm"
              onClick={requestClearAll}
              disabled={isClearing === 'all'}
            >
              {isClearing === 'all' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </>
              )}
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {preferences.map((pref) => {
              const config = strategyConfig[pref.strategy];
              return (
                <div
                  key={pref.project_path}
                  className={cn(
                    'p-4 rounded-lg border border-border bg-card',
                    'hover:border-border/80 transition-colors'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Project name */}
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {getProjectName(pref.project_path)}
                        </span>
                      </div>

                      {/* Path */}
                      <p className="text-xs text-muted-foreground mt-1 truncate pl-6">
                        {pref.project_path}
                      </p>

                      {/* Strategy and date */}
                      <div className="flex items-center gap-3 mt-2 pl-6">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium border',
                            config.bgColor,
                            config.color
                          )}
                        >
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(pref.updated_at)}
                        </span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestClearPreference(pref.project_path)}
                      disabled={isClearing === pref.project_path}
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      title="Remove preference"
                    >
                      {isClearing === pref.project_path ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Environment Diagnostics Section */}
      <div className="rounded-xl border border-cyan-500/20 bg-card">
        {/* Header with gradient */}
        <div className={cn(
          'px-5 py-4',
          'bg-gradient-to-r',
          'dark:from-cyan-500/10 dark:via-cyan-600/5 dark:to-transparent',
          'from-cyan-500/5 via-cyan-600/5 to-transparent',
          'border-b border-border'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Icon badge */}
              <div className={cn(
                'w-10 h-10 rounded-lg',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50',
                'border border-cyan-500/20',
                'bg-cyan-500/10'
              )}>
                <Terminal className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Environment Diagnostics
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Node.js toolchain environment analysis
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={loadHealthCheck}
              title="Refresh diagnostics"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">

        {/* Operation Message */}
        {operationMessage && (
          <div
            className={cn(
              'p-3 rounded-lg mb-4 text-sm flex items-center gap-2',
              operationMessage.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            )}
          >
            {operationMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {operationMessage.text}
          </div>
        )}

        {/* PNPM HOME Conflict Warning */}
        {pnpmHomeConflict?.hasConflict && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-400">PNPM HOME Conflict Detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pnpmHomeConflict.description}
                </p>
                {pnpmHomeConflict.problematicPath && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                    {pnpmHomeConflict.problematicPath}
                  </p>
                )}
                <Button
                  variant="warning"
                  size="sm"
                  onClick={handleFixPnpmHomeConflict}
                  disabled={isFixingConflict}
                  className="mt-2"
                >
                  {isFixingConflict ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-3 h-3" />
                      Fix Automatically
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Status Items */}
        <div className="space-y-3">
          {/* Volta Status */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              {diagnostics?.volta.available ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm text-foreground">Volta</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className={cn(
                'text-xs',
                diagnostics?.volta.available ? 'text-green-400' : 'text-muted-foreground'
              )}>
                {diagnostics?.volta.available
                  ? diagnostics.volta.version ? `v${diagnostics.volta.version}` : 'Installed'
                  : 'Not installed'}
              </span>
              {diagnostics?.volta.path && (
                <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[200px]">
                  {diagnostics.volta.path}
                </span>
              )}
            </div>
          </div>

          {/* Corepack Status */}
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              {diagnostics?.corepack.enabled ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : diagnostics?.corepack.available ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm text-foreground">Corepack</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end gap-0.5">
                <span className={cn(
                  'text-xs',
                  diagnostics?.corepack.enabled
                    ? 'text-green-400'
                    : diagnostics?.corepack.available
                    ? 'text-amber-400'
                    : 'text-muted-foreground'
                )}>
                  {diagnostics?.corepack.enabled
                    ? `Enabled${diagnostics.corepack.version ? ` (v${diagnostics.corepack.version})` : ''}`
                    : diagnostics?.corepack.available
                    ? 'Available but not enabled'
                    : 'Not available'}
                </span>
                {diagnostics?.corepack.path && (
                  <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[200px]">
                    {diagnostics.corepack.path}
                  </span>
                )}
              </div>
              {diagnostics?.corepack.available && !diagnostics?.corepack.enabled && (
                <Button
                  variant="info"
                  size="sm"
                  onClick={handleEnableCorepack}
                  disabled={isEnablingCorepack}
                >
                  {isEnablingCorepack ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Enable'
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* System Node.js Status */}
          {diagnostics?.system_node.version && (
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-sm text-foreground">Node.js</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-green-400">
                  {diagnostics.system_node.version}
                </span>
                {diagnostics.system_node.path && (
                  <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[200px]">
                    {diagnostics.system_node.path}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Package Managers */}
          {diagnostics && (
            <div className="py-2">
              <span className="text-xs text-muted-foreground mb-2 block">Package Managers:</span>
              <div className="flex flex-wrap gap-2">
                {diagnostics.package_managers.npm && (
                  <span className="px-2 py-1 rounded text-xs bg-muted text-foreground" title={diagnostics.package_managers.npm.path}>
                    npm {diagnostics.package_managers.npm.version}
                  </span>
                )}
                {diagnostics.package_managers.pnpm && (
                  <span className="px-2 py-1 rounded text-xs bg-muted text-foreground" title={diagnostics.package_managers.pnpm.path}>
                    pnpm {diagnostics.package_managers.pnpm.version}
                  </span>
                )}
                {diagnostics.package_managers.yarn && (
                  <span className="px-2 py-1 rounded text-xs bg-muted text-foreground" title={diagnostics.package_managers.yarn.path}>
                    yarn {diagnostics.package_managers.yarn.version}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-foreground mb-2">
          About Toolchain Preferences
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            - <strong>Volta Priority</strong>: Use Volta to manage Node.js and package manager versions
          </li>
          <li>
            - <strong>Corepack Priority</strong>: Use Corepack to manage package manager versions
          </li>
          <li>
            - <strong>Hybrid Mode</strong>: Volta manages Node.js, Corepack manages package managers
          </li>
          <li>
            - <strong>System Default</strong>: Use system-installed versions without switching
          </li>
        </ul>
      </div>
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        variant="destructive"
        title={
          deleteTarget?.type === 'all'
            ? 'Clear All Preferences'
            : 'Remove Preference'
        }
        description={
          deleteTarget?.type === 'all'
            ? `Are you sure you want to clear all ${preferences.length} saved preferences? This action cannot be undone.`
            : 'Are you sure you want to remove this preference? The version mismatch dialog will appear again for this project.'
        }
        itemName={deleteTarget?.projectName}
        confirmText={deleteTarget?.type === 'all' ? 'Clear All' : 'Remove'}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
