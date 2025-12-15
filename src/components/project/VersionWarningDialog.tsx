/**
 * Version Warning Dialog
 * Shows version mismatch warning before script execution
 * Feature: 006-node-package-manager
 *
 * Redesigned following ui-design-spec.md guidelines:
 * - Gradient header with icon badge (amber theme)
 * - Better visual hierarchy
 * - Modal stack integration
 * - Improved card styling
 */

import * as React from 'react';
import {
  AlertTriangle,
  Zap,
  Package,
  CheckCircle2,
  AlertOctagon,
  Copy,
  Check,
  X,
  Loader2,
  Settings,
  Wrench,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import type { VersionCompatibility } from '../../types/version';
import type {
  CorepackStatus,
  PnpmHomeConflict,
  CorepackOperationResponse,
  ToolchainStrategy,
} from '../../types/toolchain';
import { toolchainAPI } from '../../lib/tauri-api';
import { Checkbox } from '../ui/Checkbox';
import { Button } from '../ui/Button';

interface VersionWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compatibility: VersionCompatibility;
  scriptName: string;
  /** Project path for saving preferences */
  projectPath: string;
  onContinue: () => void;
  onCancel: () => void;
  onUseVolta?: () => void;
  onUseCorepack?: () => void;
}

export function VersionWarningDialog({
  open,
  onOpenChange,
  compatibility,
  scriptName,
  projectPath,
  onContinue,
  onCancel,
  onUseCorepack,
}: VersionWarningDialogProps) {
  const modalId = React.useId();
  const {
    node,
    packageManager,
    recommendedAction,
    availableTools,
    voltaCorepackConflict,
  } = compatibility;
  const [copiedFix, setCopiedFix] = React.useState(false);

  // Remember this choice state
  const [rememberChoice, setRememberChoice] = React.useState(false);
  const [isSavingPreference, setIsSavingPreference] = React.useState(false);

  // Corepack and PNPM HOME conflict state
  const [corepackStatus, setCorepackStatus] =
    React.useState<CorepackStatus | null>(null);
  const [pnpmHomeConflict, setPnpmHomeConflict] =
    React.useState<PnpmHomeConflict | null>(null);
  const [isEnablingCorepack, setIsEnablingCorepack] = React.useState(false);
  const [isFixingConflict, setIsFixingConflict] = React.useState(false);
  const [operationMessage, setOperationMessage] = React.useState<string | null>(
    null
  );

  const hasVolta = availableTools.includes('volta');
  const hasCorepack = availableTools.includes('corepack');
  const hasConflict = voltaCorepackConflict?.hasConflict ?? false;

  // Check if corepack is truly enabled (shims installed)
  const isCorepackEnabled = corepackStatus?.enabled ?? false;
  // Check if there's a PNPM HOME conflict
  const hasPnpmHomeConflict = pnpmHomeConflict?.hasConflict ?? false;

  // Fetch corepack status and PNPM HOME conflict on open
  React.useEffect(() => {
    if (!open) return;

    const fetchStatus = async () => {
      try {
        const [status, conflict] = await Promise.all([
          invoke<CorepackStatus>('get_corepack_status_cmd'),
          invoke<PnpmHomeConflict>('detect_pnpm_home_conflict_cmd'),
        ]);
        setCorepackStatus(status);
        setPnpmHomeConflict(conflict);
      } catch (error) {
        console.error('Failed to fetch corepack status:', error);
      }
    };

    fetchStatus();
  }, [open]);

  // Handle enable corepack
  const handleEnableCorepack = async () => {
    setIsEnablingCorepack(true);
    setOperationMessage(null);
    try {
      const result = await invoke<CorepackOperationResponse>('enable_corepack');
      if (result.success) {
        setOperationMessage(result.message || 'Corepack enabled successfully');
        // Refresh status
        const status = await invoke<CorepackStatus>('get_corepack_status_cmd');
        setCorepackStatus(status);
      } else {
        setOperationMessage(result.error || 'Failed to enable corepack');
      }
    } catch (error) {
      setOperationMessage(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsEnablingCorepack(false);
    }
  };

  // Handle fix PNPM HOME conflict
  const handleFixPnpmHomeConflict = async () => {
    setIsFixingConflict(true);
    setOperationMessage(null);
    try {
      const result =
        await invoke<CorepackOperationResponse>('fix_pnpm_home_conflict');
      if (result.success) {
        setOperationMessage(result.message || 'Conflict fixed successfully');
        // Refresh conflict status
        const conflict = await invoke<PnpmHomeConflict>(
          'detect_pnpm_home_conflict_cmd'
        );
        setPnpmHomeConflict(conflict);
      } else {
        setOperationMessage(result.error || 'Failed to fix conflict');
      }
    } catch (error) {
      setOperationMessage(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsFixingConflict(false);
    }
  };

  // Register/unregister modal
  React.useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  // Handle ESC key with modal stack
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      handleClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, open]);

  const handleCopyFixCommand = async () => {
    if (voltaCorepackConflict?.fixCommand) {
      await navigator.clipboard.writeText(voltaCorepackConflict.fixCommand);
      setCopiedFix(true);
      setTimeout(() => setCopiedFix(false), 2000);
    }
  };

  // Save preference helper
  const savePreference = async (strategy: ToolchainStrategy) => {
    if (!rememberChoice || !projectPath) return;

    setIsSavingPreference(true);
    try {
      await toolchainAPI.setPreference(projectPath, strategy, true);
    } catch (error) {
      console.error('Failed to save preference:', error);
    } finally {
      setIsSavingPreference(false);
    }
  };

  const handleClose = () => {
    setRememberChoice(false);
    onCancel();
    onOpenChange(false);
  };

  const handleContinue = async () => {
    // system_default means continue without version management
    await savePreference('system_default');
    setRememberChoice(false);
    onContinue();
    onOpenChange(false);
  };

  const handleUseCorepack = async () => {
    await savePreference('corepack_priority');
    setRememberChoice(false);
    onUseCorepack?.();
    onOpenChange(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-xl max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-amber-500/30',
            'shadow-2xl shadow-black/60',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="version-warning-title"
          aria-describedby="version-warning-description"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5 flex-shrink-0',
              'border-b border-border',
              'bg-gradient-to-r',
              'dark:from-amber-500/15 dark:via-amber-600/5 dark:to-transparent',
              'from-amber-500/10 via-amber-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="absolute right-4 top-4"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Title area with icon badge */}
            <div className="flex items-center gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-amber-500/20',
                  'bg-amber-500/10',
                  'shadow-lg'
                )}
              >
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  id="version-warning-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  Version Mismatch
                </h2>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
            {/* Description */}
            <p
              id="version-warning-description"
              className="text-sm text-muted-foreground"
            >
              {recommendedAction === 'useVolta' && hasVolta ? (
                <>
                  The project requires different versions than your current
                  environment.
                  <span className="text-green-400 font-medium">
                    {' '}
                    Volta will automatically switch versions
                  </span>{' '}
                  when running{' '}
                  <code className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-xs">
                    {scriptName}
                  </code>
                  .
                </>
              ) : (
                <>
                  The project requires different versions than your current
                  environment. Running{' '}
                  <code className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono text-xs">
                    {scriptName}
                  </code>{' '}
                  may cause issues.
                </>
              )}
            </p>

            {/* Version Details */}
            <div className="space-y-3">
              {/* Node.js Version */}
              {!node.isCompatible && node.required && (
                <div
                  className={cn(
                    'p-4 rounded-xl',
                    'bg-card/50 border border-border',
                    'transition-colors'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg',
                        'bg-amber-500/10 border border-amber-500/20'
                      )}
                    >
                      <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          Node.js
                        </span>
                        {recommendedAction === 'useVolta' && hasVolta && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                            Volta will handle
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">
                            Required
                          </span>
                          <div className="font-mono text-amber-400 mt-0.5">
                            {node.required}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">Current</span>
                          <div className="font-mono text-foreground mt-0.5">
                            {node.current || 'Not installed'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Package Manager Version */}
              {!packageManager.isCompatible && packageManager.required && (
                <div
                  className={cn(
                    'p-4 rounded-xl',
                    'bg-card/50 border border-border',
                    'transition-colors'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg',
                        'bg-amber-500/10 border border-amber-500/20'
                      )}
                    >
                      <Package className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {packageManager.name
                            ? packageManager.name.charAt(0).toUpperCase() +
                              packageManager.name.slice(1)
                            : 'Package Manager'}
                        </span>
                        {recommendedAction === 'useVolta' &&
                          hasVolta &&
                          packageManager.name !== 'pnpm' && (
                            <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                              Volta will handle
                            </span>
                          )}
                        {packageManager.name === 'pnpm' && (
                          <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                            Manual action needed
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">
                            Required
                          </span>
                          <div className="font-mono text-amber-400 mt-0.5">
                            {packageManager.required}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">Current</span>
                          <div className="font-mono text-foreground mt-0.5">
                            {packageManager.current || 'Not installed'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Volta/Corepack Conflict Warning */}
            {hasConflict && voltaCorepackConflict && (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-red-500/5 border border-red-500/30'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertOctagon className="w-4 h-4" />
                  <span className="font-semibold">
                    Volta/Corepack Conflict Detected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {voltaCorepackConflict.description}
                </p>
                {voltaCorepackConflict.fixCommand && (
                  <div className="mt-3">
                    <div className="text-xs text-foreground font-medium mb-2">
                      Run this to fix:
                    </div>
                    <div className="flex items-start gap-2">
                      <code
                        className={cn(
                          'flex-1 px-3 py-2 rounded-lg',
                          'bg-background border border-border',
                          'text-[11px] font-mono text-cyan-400',
                          'overflow-x-auto whitespace-pre-wrap break-all'
                        )}
                      >
                        {voltaCorepackConflict.fixCommand}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCopyFixCommand}
                        className="flex-shrink-0"
                        title="Copy command"
                      >
                        {copiedFix ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PNPM HOME Conflict Warning */}
            {hasPnpmHomeConflict && pnpmHomeConflict && (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-orange-500/5 border border-orange-500/30'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-orange-400">
                  <Wrench className="w-4 h-4" />
                  <span className="font-semibold">
                    PNPM Path Conflict Detected
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {pnpmHomeConflict.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={handleFixPnpmHomeConflict}
                    disabled={isFixingConflict}
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
                  {pnpmHomeConflict.fixCommand && (
                    <span className="text-[10px] text-muted-foreground break-all">
                      or run:{' '}
                      <code className="px-1 py-0.5 bg-muted rounded text-[10px] break-all">
                        {pnpmHomeConflict.fixCommand}
                      </code>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Corepack Not Enabled Warning */}
            {recommendedAction === 'useCorepack' &&
              hasCorepack &&
              corepackStatus &&
              !isCorepackEnabled && (
                <div
                  className={cn(
                    'p-4 rounded-xl',
                    'bg-purple-500/5 border border-purple-500/30'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm text-purple-400">
                    <Settings className="w-4 h-4" />
                    <span className="font-semibold">Corepack Not Enabled</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Corepack is installed but not enabled. Enable it to
                    automatically manage package manager versions.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="info"
                      size="sm"
                      onClick={handleEnableCorepack}
                      disabled={isEnablingCorepack}
                    >
                      {isEnablingCorepack ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Enabling...
                        </>
                      ) : (
                        <>
                          <Settings className="w-3 h-3" />
                          Enable Corepack
                        </>
                      )}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      or run:{' '}
                      <code className="px-1 py-0.5 bg-muted rounded text-[10px]">
                        corepack enable
                      </code>
                    </span>
                  </div>
                </div>
              )}

            {/* Operation Message */}
            {operationMessage && (
              <div
                className={cn(
                  'p-3 rounded-lg text-xs',
                  operationMessage.toLowerCase().includes('error') ||
                    operationMessage.toLowerCase().includes('failed')
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-green-500/10 border border-green-500/30 text-green-400'
                )}
              >
                <pre className="whitespace-pre-wrap font-mono">
                  {operationMessage}
                </pre>
              </div>
            )}

            {/* Recommended Action */}
            {recommendedAction === 'useVolta' && hasVolta && !hasConflict ? (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-green-500/5 border border-green-500/20'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">Auto Version Switching</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This project has Volta configured. The correct Node.js
                  {packageManager.name && packageManager.name !== 'pnpm'
                    ? ` and ${packageManager.name}`
                    : ''}{' '}
                  version will be used automatically.
                </p>
              </div>
            ) : recommendedAction === 'useCorepack' && hasCorepack ? (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-blue-500/5 border border-blue-500/20'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-blue-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">Recommendation</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use Corepack to manage the package manager version.
                </p>
              </div>
            ) : recommendedAction === 'warnAndAsk' &&
              !packageManager.isCompatible ? (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-amber-500/5 border border-amber-500/20'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-semibold">Manual Action Required</span>
                </div>
                <div className="text-xs text-muted-foreground mt-3 space-y-3">
                  <div>
                    <span className="text-foreground font-medium">
                      Option 1:
                    </span>{' '}
                    Install the required version globally
                    <code
                      className={cn(
                        'block mt-2 px-3 py-2 rounded-lg',
                        'bg-background border border-border',
                        'text-foreground font-mono text-[11px]'
                      )}
                    >
                      npm install -g {packageManager.name || 'pnpm'}@
                      {packageManager.required?.replace(/[\^~>=<]/g, '') || '9'}
                    </code>
                  </div>
                  <div>
                    <span className="text-foreground font-medium">
                      Option 2:
                    </span>{' '}
                    Add{' '}
                    <code className="px-1.5 py-0.5 bg-muted rounded text-cyan-400 text-[11px]">
                      packageManager
                    </code>{' '}
                    field to package.json, then use Corepack
                    <code
                      className={cn(
                        'block mt-2 px-3 py-2 rounded-lg',
                        'bg-background border border-border',
                        'text-foreground font-mono text-[11px]'
                      )}
                    >
                      "packageManager": "{packageManager.name || 'pnpm'}@
                      {packageManager.required?.replace(/[\^~>=<]/g, '') ||
                        '10.0.0'}
                      "
                    </code>
                  </div>
                </div>
              </div>
            ) : recommendedAction === 'warnAndAsk' &&
              packageManager.isCompatible &&
              !node.isCompatible ? (
              <div
                className={cn(
                  'p-4 rounded-xl',
                  'bg-amber-500/5 border border-amber-500/20'
                )}
              >
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-semibold">Warning</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  You can continue anyway, but the script may not work as
                  expected.
                </p>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4 flex-shrink-0',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-between gap-3'
            )}
          >
            {/* Remember this choice checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-choice"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                disabled={isSavingPreference}
              />
              <label
                htmlFor="remember-choice"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Remember this choice
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {/* When Volta will auto-handle and no conflict */}
              {recommendedAction === 'useVolta' && hasVolta && !hasConflict ? (
                <Button variant="success" onClick={handleContinue}>
                  Run with Volta
                </Button>
              ) : (
                <>
                  {/* Corepack button */}
                  {recommendedAction === 'useCorepack' &&
                    hasCorepack &&
                    onUseCorepack && (
                      <Button variant="info" onClick={handleUseCorepack}>
                        Use Corepack
                      </Button>
                    )}

                  {/* Continue button */}
                  <Button
                    variant={hasConflict ? 'outline-destructive' : 'outline-warning'}
                    onClick={handleContinue}
                  >
                    {hasConflict ? 'Continue (Not Recommended)' : 'Continue Anyway'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
