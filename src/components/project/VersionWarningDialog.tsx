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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import type { VersionCompatibility } from '../../types/version';

interface VersionWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compatibility: VersionCompatibility;
  scriptName: string;
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

  const hasVolta = availableTools.includes('volta');
  const hasCorepack = availableTools.includes('corepack');
  const hasConflict = voltaCorepackConflict?.hasConflict ?? false;

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

  const handleClose = () => {
    onCancel();
    onOpenChange(false);
  };

  const handleContinue = () => {
    onContinue();
    onOpenChange(false);
  };

  const handleUseCorepack = () => {
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
            'relative w-full max-w-lg max-h-[85vh]',
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
            <button
              onClick={handleClose}
              className={cn(
                'absolute right-4 top-4',
                'p-2 rounded-lg',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

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
                      <button
                        onClick={handleCopyFixCommand}
                        className={cn(
                          'p-2 rounded-lg flex-shrink-0',
                          'hover:bg-muted',
                          'text-muted-foreground hover:text-foreground',
                          'transition-colors'
                        )}
                        title="Copy command"
                      >
                        {copiedFix ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
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
              'flex items-center justify-end gap-3'
            )}
          >
            {/* When Volta will auto-handle and no conflict */}
            {recommendedAction === 'useVolta' && hasVolta && !hasConflict ? (
              <button
                onClick={handleContinue}
                className={cn(
                  'px-4 py-2 rounded-lg',
                  'text-sm font-medium',
                  'bg-green-600 hover:bg-green-500 text-white',
                  'shadow-sm',
                  'transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-green-500/50'
                )}
              >
                Run with Volta
              </button>
            ) : (
              <>
                {/* Corepack button */}
                {recommendedAction === 'useCorepack' &&
                  hasCorepack &&
                  onUseCorepack && (
                    <button
                      onClick={handleUseCorepack}
                      className={cn(
                        'px-4 py-2 rounded-lg',
                        'text-sm font-medium',
                        'bg-blue-600 hover:bg-blue-500 text-white',
                        'shadow-sm',
                        'transition-colors duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                      )}
                    >
                      Use Corepack
                    </button>
                  )}

                {/* Continue button */}
                <button
                  onClick={handleContinue}
                  className={cn(
                    'px-4 py-2 rounded-lg',
                    'text-sm font-medium',
                    'transition-colors duration-150',
                    hasConflict
                      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30',
                    'focus:outline-none focus:ring-2',
                    hasConflict
                      ? 'focus:ring-red-500/50'
                      : 'focus:ring-amber-500/50'
                  )}
                >
                  {hasConflict ? 'Continue (Not Recommended)' : 'Continue Anyway'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
