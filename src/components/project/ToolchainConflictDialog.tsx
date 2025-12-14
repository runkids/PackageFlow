/**
 * ToolchainConflictDialog Component
 * Feature: 017-toolchain-conflict-detection
 *
 * Displays toolchain conflict information and allows user to select a resolution strategy
 */

import * as React from 'react';
import { AlertTriangle, Wrench, Info, CheckCircle2, Activity } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../ui/Dialog';
import { cn } from '../../lib/utils';
import { toolchainAPI } from '../../lib/tauri-api';
import { ToolchainDiagnostics } from './ToolchainDiagnostics';
import type {
  ToolchainStrategy,
  ToolchainConflictDialogProps,
  EnvironmentDiagnostics,
} from '../../types/toolchain';
import {
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
} from '../../types/toolchain';

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
        'hover:border-primary/50 hover:bg-accent/50',
        isSelected
          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
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
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                推薦
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
            isSelected
              ? 'border-primary bg-primary'
              : 'border-muted-foreground/30'
          )}
        >
          {isSelected && (
            <CheckCircle2 className="w-full h-full text-primary-foreground" />
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
  const [selectedStrategy, setSelectedStrategy] = React.useState<ToolchainStrategy>(
    conflict?.recommended_strategy || 'system_default'
  );
  const [rememberChoice, setRememberChoice] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [diagnostics, setDiagnostics] = React.useState<EnvironmentDiagnostics | null>(null);
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = React.useState(false);

  // Update selected strategy when conflict changes
  React.useEffect(() => {
    if (conflict?.recommended_strategy) {
      setSelectedStrategy(conflict.recommended_strategy);
    }
  }, [conflict?.recommended_strategy]);

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

  if (!conflict) {
    return null;
  }

  const projectName = projectPath.split('/').pop() || projectPath;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogClose onClick={onClose} />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Node.js Toolchain 配置衝突
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="w-4 h-4" />
            <span>專案：{projectName}</span>
          </div>

          {/* Conflict description */}
          {conflict.description && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200 whitespace-pre-line">
                  {conflict.description}
                </p>
              </div>
            </div>
          )}

          {/* Strategy selection */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              請選擇工具鏈執行策略：
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
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/30"
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                記住此選擇
              </span>
            </label>
            <button
              type="button"
              onClick={handleViewDiagnostics}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded',
                'text-xs text-muted-foreground',
                'hover:text-foreground hover:bg-accent',
                'transition-colors duration-150'
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              查看診斷
            </button>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg',
              'text-sm font-medium',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent',
              'transition-colors duration-150'
            )}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              'px-4 py-2 rounded-lg',
              'text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'transition-colors duration-150'
            )}
          >
            確認
          </button>
        </DialogFooter>
      </DialogContent>

      {/* Diagnostics Dialog */}
      <ToolchainDiagnostics
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        diagnostics={diagnostics}
        isLoading={isDiagnosticsLoading}
      />
    </Dialog>
  );
};

export default ToolchainConflictDialog;
