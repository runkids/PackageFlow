/**
 * ToolchainConflictDialog Component
 * Feature: 017-toolchain-conflict-detection
 *
 * Displays toolchain conflict information and allows user to select a resolution strategy
 */

import * as React from 'react';
import {
  AlertTriangle,
  Wrench,
  Info,
  CheckCircle2,
  Activity,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toolchainAPI } from '../../lib/tauri-api';
import { ToolchainDiagnostics } from './ToolchainDiagnostics';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import type {
  ToolchainStrategy,
  ToolchainConflictDialogProps,
  EnvironmentDiagnostics,
} from '../../types/toolchain';
import { STRATEGY_LABELS, STRATEGY_DESCRIPTIONS } from '../../types/toolchain';
import { Button } from '../ui/Button';

interface StrategyOptionProps {
  strategy: ToolchainStrategy;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}

const StrategyOption: React.FC<StrategyOptionProps> = ({
  strategy,
  isSelected,
  isRecommended,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border text-left transition-all duration-150',
        'hover:border-amber-500/50 hover:bg-accent/50',
        'focus:outline-none focus:ring-2 focus:ring-amber-500/50',
        isSelected
          ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
          : 'border-border bg-background'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {STRATEGY_LABELS[strategy]}
            </span>
            {isRecommended && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                Recommended
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {STRATEGY_DESCRIPTIONS[strategy]}
          </p>
        </div>
        <div
          className={cn(
            'flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors',
            'flex items-center justify-center',
            isSelected
              ? 'border-amber-500 bg-amber-500'
              : 'border-muted-foreground/30'
          )}
        >
          {isSelected && (
            <CheckCircle2 className="w-full h-full text-white" />
          )}
        </div>
      </div>
    </button>
  );
};

export const ToolchainConflictDialog: React.FC<ToolchainConflictDialogProps> = ({
  isOpen,
  onClose,
  projectPath,
  conflict,
  onStrategySelect,
}) => {
  const modalId = React.useId();
  const [selectedStrategy, setSelectedStrategy] =
    React.useState<ToolchainStrategy>(
      conflict?.recommended_strategy || 'system_default'
    );
  const [rememberChoice, setRememberChoice] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [diagnostics, setDiagnostics] =
    React.useState<EnvironmentDiagnostics | null>(null);
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = React.useState(false);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  // Update selected strategy when conflict changes
  React.useEffect(() => {
    if (conflict?.recommended_strategy) {
      setSelectedStrategy(conflict.recommended_strategy);
    }
  }, [conflict?.recommended_strategy]);

  // Register/unregister modal
  React.useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen, onClose]);

  // Focus cancel button when opened
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fetch diagnostics when dialog opens
  const handleViewDiagnostics = async () => {
    setShowDiagnostics(true);
    setIsDiagnosticsLoading(true);
    try {
      const result = await toolchainAPI.getDiagnostics(projectPath);
      setDiagnostics(result);
    } catch (err) {
      console.error('Failed to get diagnostics:', err);
    } finally {
      setIsDiagnosticsLoading(false);
    }
  };

  const handleConfirm = () => {
    onStrategySelect(selectedStrategy, rememberChoice);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !conflict) {
    return null;
  }

  const projectName = projectPath.split('/').pop() || projectPath;

  return (
    <>
      <div
        className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="toolchain-conflict-dialog-title"
        aria-describedby="toolchain-conflict-dialog-description"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
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
              'shadow-2xl shadow-black/50',
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
                'dark:from-amber-500/15 dark:via-amber-600/5 dark:to-transparent',
                'from-amber-500/10 via-amber-600/5 to-transparent'
              )}
            >
              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute right-4 top-4"
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
                    'border border-amber-500/20',
                    'bg-amber-500/10',
                    'shadow-lg'
                  )}
                >
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2
                    id="toolchain-conflict-dialog-title"
                    className="text-lg font-semibold text-foreground leading-tight"
                  >
                    Node.js Toolchain Conflict
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    <span className="truncate">Project: {projectName}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
              {/* Conflict description */}
              {conflict.description && (
                <div
                  id="toolchain-conflict-dialog-description"
                  className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20"
                >
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-200 whitespace-pre-line leading-relaxed">
                      {conflict.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Strategy selection */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  Select a toolchain execution strategy:
                </h4>
                <div className="space-y-2">
                  {conflict.suggested_strategies.map((strategy) => (
                    <StrategyOption
                      key={strategy}
                      strategy={strategy}
                      isSelected={selectedStrategy === strategy}
                      isRecommended={strategy === conflict.recommended_strategy}
                      onSelect={() => setSelectedStrategy(strategy)}
                    />
                  ))}
                </div>
              </div>

              {/* Remember choice checkbox and diagnostics button */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberChoice}
                      onChange={(e) => setRememberChoice(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div
                      className={cn(
                        'w-4 h-4 rounded border-2 transition-all duration-150',
                        'flex items-center justify-center',
                        rememberChoice
                          ? 'bg-amber-500 border-amber-500'
                          : 'border-muted-foreground/40 group-hover:border-muted-foreground/60'
                      )}
                    >
                      {rememberChoice && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    Remember this choice
                  </span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleViewDiagnostics}
                  className="gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5" />
                  View Diagnostics
                </Button>
              </div>
            </div>

            {/* Footer */}
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
                ref={cancelButtonRef}
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button variant="warning" onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics Dialog */}
      <ToolchainDiagnostics
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        diagnostics={diagnostics}
        isLoading={isDiagnosticsLoading}
      />
    </>
  );
};

export default ToolchainConflictDialog;
