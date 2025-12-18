// Replay Dialog
// Dialog for preparing and executing snapshot replays with mismatch handling

import React, { useEffect, useState } from 'react';
import {
  Play,
  XCircle,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FileCode,
  GitCompare,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Package,
  Plus,
  Minus,
} from 'lucide-react';
import type { ReplayPreparation, ReplayOption } from '../../types/snapshot';
import { useReplay } from '../../hooks/useReplay';

interface Props {
  snapshotId: string;
  isOpen: boolean;
  onClose: () => void;
  onViewDiff?: () => void;
  /** Callback when replay is successful - Feature 025: changed to project-based */
  onReplaySuccess?: (projectPath: string) => void;
}

export function ReplayDialog({
  snapshotId,
  isOpen,
  onClose,
  onViewDiff,
  onReplaySuccess,
}: Props) {
  const {
    isPreparing,
    isExecuting,
    preparation,
    result,
    error,
    prepareReplay,
    executeReplay,
    reset,
  } = useReplay();

  const [selectedOption, setSelectedOption] = useState<ReplayOption | null>(null);

  useEffect(() => {
    if (isOpen && snapshotId) {
      prepareReplay(snapshotId);
    }
    return () => {
      reset();
      setSelectedOption(null);
    };
  }, [isOpen, snapshotId, prepareReplay, reset]);

  const handleExecute = async (option: ReplayOption) => {
    if (option === 'view_diff' && onViewDiff) {
      onViewDiff();
      return;
    }

    if (option === 'abort') {
      onClose();
      return;
    }

    setSelectedOption(option);
    const result = await executeReplay(snapshotId, option);

    if (result?.success && result.isVerifiedReplay && preparation && onReplaySuccess) {
      // Replay successful - Feature 025: use projectPath instead of workflowId
      onReplaySuccess(preparation.projectPath);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <Play className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-zinc-100">Safe Execution Replay</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Loading State */}
          {isPreparing && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mb-4" />
              <p className="text-zinc-400">Verifying dependencies...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="font-medium text-red-300">Verification Failed</p>
                  <p className="text-sm text-zinc-400 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Preparation Result */}
          {preparation && !isPreparing && !result && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div
                className={`rounded-lg border p-4 ${
                  preparation.readyToReplay
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-orange-500/30 bg-orange-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {preparation.readyToReplay ? (
                    <ShieldCheck className="h-6 w-6 text-green-400" />
                  ) : (
                    <ShieldAlert className="h-6 w-6 text-orange-400" />
                  )}
                  <div>
                    <p
                      className={`font-medium ${
                        preparation.readyToReplay ? 'text-green-300' : 'text-orange-300'
                      }`}
                    >
                      {preparation.readyToReplay
                        ? 'Ready for Verified Replay'
                        : 'Dependency Mismatch Detected'}
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">
                      {preparation.readyToReplay
                        ? 'Current dependencies match the snapshot exactly'
                        : 'Current dependencies differ from the snapshot'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mismatch Details */}
              {preparation.hasMismatch && preparation.mismatchDetails && (
                <MismatchDetails mismatch={preparation.mismatchDetails} />
              )}

              {/* Options */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-300">Available Actions:</p>
                {preparation.availableOptions.map((option) => (
                  <OptionButton
                    key={option}
                    option={option}
                    selected={selectedOption === option}
                    disabled={isExecuting}
                    onClick={() => handleExecute(option)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Execution Result */}
          {result && (
            <div className="space-y-4">
              <div
                className={`rounded-lg border p-4 ${
                  result.success
                    ? 'border-green-500/30 bg-green-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {result.success ? (
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-400" />
                  )}
                  <div>
                    <p
                      className={`font-medium ${
                        result.success ? 'text-green-300' : 'text-red-300'
                      }`}
                    >
                      {result.success ? 'Ready to Execute' : 'Replay Cancelled'}
                    </p>
                    {result.lockfileRestored && (
                      <p className="text-sm text-zinc-400 mt-1">
                        Lockfile restored from snapshot
                      </p>
                    )}
                    {result.isVerifiedReplay && (
                      <p className="text-sm text-green-400 mt-1">
                        This will be a verified replay
                      </p>
                    )}
                    {result.error && (
                      <p className="text-sm text-zinc-400 mt-1">{result.error}</p>
                    )}
                  </div>
                </div>
              </div>

              {result.success && (
                <button
                  onClick={() => {
                    if (preparation && onReplaySuccess) {
                      onReplaySuccess(preparation.projectPath);
                    }
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  Close
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-700 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components

interface MismatchDetailsProps {
  mismatch: NonNullable<ReplayPreparation['mismatchDetails']>;
}

function MismatchDetails({ mismatch }: MismatchDetailsProps) {
  const [expanded, setExpanded] = useState(false);

  const totalChanges =
    mismatch.addedPackages.length +
    mismatch.removedPackages.length +
    mismatch.changedPackages.length;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">
            {totalChanges} package {totalChanges === 1 ? 'change' : 'changes'}
          </span>
        </div>
        <ArrowRight
          className={`h-4 w-4 text-zinc-400 transition-transform ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-700 px-4 py-3 space-y-3">
          {mismatch.addedPackages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-green-400 mb-1">
                <Plus className="h-3 w-3" />
                <span>Added ({mismatch.addedPackages.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {mismatch.addedPackages.slice(0, 5).map((pkg) => (
                  <span
                    key={pkg}
                    className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-300"
                  >
                    {pkg}
                  </span>
                ))}
                {mismatch.addedPackages.length > 5 && (
                  <span className="text-xs text-zinc-400">
                    +{mismatch.addedPackages.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {mismatch.removedPackages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-red-400 mb-1">
                <Minus className="h-3 w-3" />
                <span>Removed ({mismatch.removedPackages.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {mismatch.removedPackages.slice(0, 5).map((pkg) => (
                  <span
                    key={pkg}
                    className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-300"
                  >
                    {pkg}
                  </span>
                ))}
                {mismatch.removedPackages.length > 5 && (
                  <span className="text-xs text-zinc-400">
                    +{mismatch.removedPackages.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {mismatch.changedPackages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm text-blue-400 mb-1">
                <RefreshCw className="h-3 w-3" />
                <span>Changed ({mismatch.changedPackages.length})</span>
              </div>
              <div className="space-y-1">
                {mismatch.changedPackages.slice(0, 5).map((pkg) => (
                  <div key={pkg.name} className="text-xs flex items-center gap-2">
                    <Package className="h-3 w-3 text-zinc-400" />
                    <span className="text-zinc-300">{pkg.name}</span>
                    <span className="text-red-400">{pkg.snapshotVersion}</span>
                    <ArrowRight className="h-3 w-3 text-zinc-500" />
                    <span className="text-green-400">{pkg.currentVersion}</span>
                  </div>
                ))}
                {mismatch.changedPackages.length > 5 && (
                  <span className="text-xs text-zinc-400">
                    +{mismatch.changedPackages.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface OptionButtonProps {
  option: ReplayOption;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}

function OptionButton({ option, selected, disabled, onClick }: OptionButtonProps) {
  const config: Record<
    ReplayOption,
    {
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      description: string;
      color: string;
    }
  > = {
    abort: {
      icon: XCircle,
      label: 'Cancel',
      description: 'Abort the replay',
      color: 'text-zinc-400',
    },
    view_diff: {
      icon: GitCompare,
      label: 'View Diff',
      description: 'Compare snapshot with current state',
      color: 'text-blue-400',
    },
    restore_lockfile: {
      icon: FileCode,
      label: 'Restore Lockfile',
      description: 'Restore exact dependencies from snapshot',
      color: 'text-orange-400',
    },
    proceed_with_current: {
      icon: Play,
      label: 'Proceed Anyway',
      description: 'Run with current dependencies',
      color: 'text-green-400',
    },
  };

  const { icon: Icon, label, description, color } = config[option];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        selected
          ? 'border-cyan-500 bg-cyan-500/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Icon className={`h-5 w-5 ${color}`} />
      <div className="text-left">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
      {selected && disabled && (
        <Loader2 className="h-4 w-4 text-cyan-400 animate-spin ml-auto" />
      )}
    </button>
  );
}

export default ReplayDialog;
