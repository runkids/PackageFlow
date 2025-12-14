/**
 * Version Warning Dialog
 * Shows version mismatch warning before script execution
 * Feature: 006-node-package-manager
 */

import { AlertTriangle, Zap, Package, CheckCircle2, AlertOctagon, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../ui/Dialog';
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
  const { node, packageManager, recommendedAction, availableTools, voltaCorepackConflict } = compatibility;
  const [copiedFix, setCopiedFix] = useState(false);

  const hasVolta = availableTools.includes('volta');
  const hasCorepack = availableTools.includes('corepack');
  const hasConflict = voltaCorepackConflict?.hasConflict ?? false;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogClose onClick={handleClose} />
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <DialogTitle>Version Mismatch</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Show different message based on whether Volta will auto-handle */}
          {recommendedAction === 'useVolta' && hasVolta ? (
            <p className="text-sm text-muted-foreground">
              The project requires different versions than your current environment.
              <span className="text-green-400 font-medium"> Volta will automatically switch versions</span> when running{' '}
              <span className="font-mono text-foreground">{scriptName}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The project requires different versions than your current environment.
              Running <span className="font-mono text-foreground">{scriptName}</span> may cause issues.
            </p>
          )}

          {/* Version Details */}
          <div className="space-y-2">
            {!node.isCompatible && node.required && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                <Zap className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">Node.js</span>
                    {recommendedAction === 'useVolta' && hasVolta && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">
                        Volta will handle
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Required: <span className="font-mono text-yellow-400">{node.required}</span>
                    <br />
                    Current: <span className="font-mono text-foreground">{node.current || 'Not installed'}</span>
                  </div>
                </div>
              </div>
            )}

            {!packageManager.isCompatible && packageManager.required && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                <Package className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {packageManager.name ? packageManager.name.charAt(0).toUpperCase() + packageManager.name.slice(1) : 'Package Manager'}
                    </span>
                    {/* Volta can handle npm/yarn but NOT pnpm */}
                    {recommendedAction === 'useVolta' && hasVolta && packageManager.name !== 'pnpm' && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">
                        Volta will handle
                      </span>
                    )}
                    {packageManager.name === 'pnpm' && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">
                        Manual action needed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Required: <span className="font-mono text-yellow-400">{packageManager.required}</span>
                    <br />
                    Current: <span className="font-mono text-foreground">{packageManager.current || 'Not installed'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Volta/Corepack Conflict Warning */}
          {hasConflict && voltaCorepackConflict && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertOctagon className="w-4 h-4" />
                <span className="font-medium">Volta/Corepack Conflict Detected</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {voltaCorepackConflict.description}
              </p>
              {voltaCorepackConflict.fixCommand && (
                <div className="mt-2">
                  <div className="text-xs text-foreground mb-1">Run this to fix:</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2 py-1.5 bg-background rounded text-[11px] font-mono text-cyan-400 overflow-x-auto">
                      {voltaCorepackConflict.fixCommand}
                    </code>
                    <button
                      onClick={handleCopyFixCommand}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      title="Copy command"
                    >
                      {copiedFix ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommended Action - only show when manual action is needed */}
          {recommendedAction === 'useVolta' && hasVolta && !hasConflict ? (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">Auto Version Switching</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This project has Volta configured. The correct Node.js{packageManager.name && packageManager.name !== 'pnpm' ? ` and ${packageManager.name}` : ''} version will be used automatically.
              </p>
            </div>
          ) : recommendedAction === 'useCorepack' && hasCorepack ? (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">Recommendation</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use Corepack to manage the package manager version.
              </p>
            </div>
          ) : recommendedAction === 'warnAndAsk' && !packageManager.isCompatible ? (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Manual Action Required</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-2">
                <div>
                  <span className="text-foreground">Option 1:</span> Install the required version globally
                  <code className="block mt-1 px-2 py-1 bg-background rounded text-foreground font-mono text-[11px]">
                    npm install -g {packageManager.name || 'pnpm'}@{packageManager.required?.replace(/[\^~>=<]/g, '') || '9'}
                  </code>
                </div>
                <div>
                  <span className="text-foreground">Option 2:</span> Add <code className="px-1 py-0.5 bg-background rounded text-cyan-400">packageManager</code> field to package.json, then use Corepack
                  <code className="block mt-1 px-2 py-1 bg-background rounded text-foreground font-mono text-[11px]">
                    "packageManager": "{packageManager.name || 'pnpm'}@{packageManager.required?.replace(/[\^~>=<]/g, '') || '10.0.0'}"
                  </code>
                </div>
              </div>
            </div>
          ) : recommendedAction === 'warnAndAsk' && packageManager.isCompatible && !node.isCompatible ? (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Warning</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                You can continue anyway, but the script may not work as expected.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-shrink-0">
          {/* When Volta will auto-handle and no conflict, show "Run with Volta" button */}
          {recommendedAction === 'useVolta' && hasVolta && !hasConflict ? (
            <button
              onClick={handleContinue}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
            >
              Run with Volta
            </button>
          ) : (
            <>
              {/* Show Corepack button only when recommended */}
              {recommendedAction === 'useCorepack' && hasCorepack && onUseCorepack && (
                <button
                  onClick={handleUseCorepack}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  Use Corepack
                </button>
              )}

              <button
                onClick={handleContinue}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  hasConflict
                    ? 'text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20'
                }`}
              >
                {hasConflict ? 'Continue (Not Recommended)' : 'Continue Anyway'}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
