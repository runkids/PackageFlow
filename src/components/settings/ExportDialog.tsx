/**
 * Export Dialog Component
 * Provides a clean, desktop-native experience for exporting application data
 * Redesigned to follow UI design spec with gradient header and icon badge
 * @see specs/002-export-import-save/contracts/export-import-api.md
 */

import React, { useCallback } from 'react';
import {
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  FolderDown,
  Archive,
  Settings,
  GitBranch,
  Workflow,
  Zap,
  X,
  Bell,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { useExportImport } from '../../hooks/useExportImport';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import type { ExportResult } from '../../types/export-import';

// ============================================================================
// Types
// ============================================================================

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExportComplete?: (result: ExportResult) => void;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Information card showing what will be exported
 */
const ExportInfoCard: React.FC = () => (
  <div className="rounded-lg bg-card border border-border p-4">
    <h4 className="text-sm font-medium text-foreground mb-3">
      This export will include:
    </h4>
    <ul className="space-y-2.5">
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-500/20">
          <FolderDown className="h-4 w-4 text-blue-400" />
        </div>
        <span>All projects and their configurations</span>
      </li>
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-purple-500/20">
          <Workflow className="h-4 w-4 text-purple-400" />
        </div>
        <span>Workflows and automation rules</span>
      </li>
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-green-500/20">
          <GitBranch className="h-4 w-4 text-green-400" />
        </div>
        <span>Worktree templates</span>
      </li>
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-cyan-500/20">
          <Zap className="h-4 w-4 text-cyan-400" />
        </div>
        <span>Custom step templates</span>
      </li>
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-amber-500/20">
          <Bell className="h-4 w-4 text-amber-400" />
        </div>
        <span>Notification preferences</span>
      </li>
      <li className="flex items-center gap-3 text-sm text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-orange-500/20">
          <Settings className="h-4 w-4 text-orange-400" />
        </div>
        <span>Application settings</span>
      </li>
    </ul>
  </div>
);

/**
 * Loading state during export
 */
const ExportingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-10">
    <div className="relative">
      <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30">
        <Loader2 className="h-8 w-8 animate-spin text-green-400" />
      </div>
    </div>
    <p className="mt-4 text-sm text-foreground">Preparing your export...</p>
    <p className="mt-1 text-xs text-muted-foreground">
      This may take a moment for large data sets
    </p>
  </div>
);

/**
 * Success state after export completes
 */
interface ExportSuccessProps {
  result: ExportResult;
}

const ExportSuccess: React.FC<ExportSuccessProps> = ({ result }) => (
  <div className="space-y-4">
    <div className="flex flex-col items-center py-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30">
        <CheckCircle className="h-7 w-7 text-green-400" />
      </div>
      <h4 className="mt-3 text-base font-medium text-foreground">
        Export Successful
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Your data has been saved successfully
      </p>
    </div>

    <div className="rounded-lg bg-card border border-border p-4">
      <h5 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        Export Summary
      </h5>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">Projects</span>
          <span className="text-sm font-medium text-blue-400">
            {result.counts?.projects ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">Workflows</span>
          <span className="text-sm font-medium text-purple-400">
            {result.counts?.workflows ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">Templates</span>
          <span className="text-sm font-medium text-green-400">
            {result.counts?.templates ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">Step Templates</span>
          <span className="text-sm font-medium text-cyan-400">
            {result.counts?.stepTemplates ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">CLI Tools</span>
          <span className="text-sm font-medium text-purple-400">
            {result.counts?.cliTools ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2">
          <span className="text-sm text-foreground">MCP Actions</span>
          <span className="text-sm font-medium text-green-400">
            {result.counts?.mcpActions ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between rounded bg-muted px-3 py-2 col-span-2">
          <span className="text-sm text-foreground">Settings</span>
          <span className="text-sm font-medium text-orange-400">
            {result.counts?.hasSettings ? 'Included' : 'None'}
          </span>
        </div>
      </div>
    </div>

    {result.filePath && (
      <div className="rounded-lg bg-card border border-border p-3">
        <p className="text-xs text-muted-foreground mb-1">Saved to:</p>
        <p className="text-xs text-muted-foreground font-mono break-all">
          {result.filePath}
        </p>
      </div>
    )}
  </div>
);

/**
 * Error state when export fails
 */
interface ExportErrorProps {
  error: string;
}

const ExportError: React.FC<ExportErrorProps> = ({ error }) => (
  <div className="rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700/50 p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-200 dark:bg-red-500/20">
        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-red-700 dark:text-red-300">Export Failed</h4>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Please try again or check your disk space and permissions.
        </p>
      </div>
    </div>
  </div>
);

// ============================================================================
// ExportDialog Component
// ============================================================================

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  onExportComplete,
}) => {
  const modalId = React.useId();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { export: exportState } = useExportImport();

  // Register/unregister modal
  React.useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  // Handle ESC key
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

  // Focus content area when opened
  React.useEffect(() => {
    if (open && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleExport = useCallback(async () => {
    const result = await exportState.execute();
    if (result.success && onExportComplete) {
      onExportComplete(result);
    }
  }, [exportState, onExportComplete]);

  const handleClose = useCallback(() => {
    exportState.reset();
    onOpenChange(false);
  }, [exportState, onOpenChange]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const isInitialState =
    !exportState.isExporting && !exportState.result && !exportState.error;
  const showSuccess = exportState.result?.success;
  const showError =
    exportState.error || (exportState.result && !exportState.result.success);

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
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
            'border border-green-500/30',
            'shadow-2xl shadow-black/60',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5',
              'border-b border-border',
              'bg-gradient-to-r',
              'dark:from-green-500/20 dark:via-green-600/10 dark:to-transparent',
              'from-green-500/10 via-green-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="absolute right-4 top-4 h-auto p-2 hover:bg-accent/50"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Title area with icon badge */}
            <div className="flex items-start gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-green-500/20',
                  'bg-green-500/10',
                  'shadow-lg'
                )}
              >
                <Archive className={cn('w-6 h-6', 'text-green-400')} />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2
                  id="export-dialog-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  Export Data
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a backup of your PackageFlow configuration
                </p>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto min-h-0 focus:outline-none p-6"
            tabIndex={-1}
          >
            <div className="space-y-4">
              {/* Initial state - show info */}
              {isInitialState && (
                <>
                  <p className="text-sm text-muted-foreground">
                    You can restore this file on another device or use it to recover your settings.
                  </p>
                  <ExportInfoCard />
                </>
              )}

              {/* Exporting state */}
              {exportState.isExporting && <ExportingState />}

              {/* Success state */}
              {showSuccess && exportState.result && (
                <ExportSuccess result={exportState.result} />
              )}

              {/* Error state */}
              {showError && (
                <ExportError
                  error={
                    exportState.error ||
                    exportState.result?.error ||
                    'An unknown error occurred'
                  }
                />
              )}
            </div>
          </div>

          {/* Footer with actions */}
          <div
            className={cn(
              'px-6 py-4',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-end gap-3',
              'flex-shrink-0'
            )}
          >
            <Button
              variant="secondary"
              onClick={handleClose}
            >
              {showSuccess ? 'Done' : 'Cancel'}
            </Button>
            {!showSuccess && (
              <Button
                onClick={handleExport}
                disabled={exportState.isExporting}
                variant="success"
              >
                {exportState.isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : showError ? (
                  <>
                    <Download className="h-4 w-4" />
                    Try Again
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Choose Location & Export
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
