/**
 * Node Panel - Side Panel for Node Configuration
 * A slide-out panel for editing node properties with modern styling
 *
 * Features:
 * - Gradient header with icon badge
 * - Status badge with variant config
 * - Modal stack integration for proper ESC handling
 * - ConfirmDialog for delete operations
 * - Full accessibility support
 */

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import {
  X,
  Terminal,
  Play,
  FolderOpen,
  Clock,
  Save,
  Trash2,
  Settings2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WorkflowNode, ScriptNodeConfig, NodeStatus } from '../../types/workflow';
import { isScriptNodeConfig } from '../../types/workflow';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';

interface NodePanelProps {
  node: WorkflowNode | null;
  status?: NodeStatus;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, updates: { name: string; config: ScriptNodeConfig }) => void;
  onDelete: (nodeId: string) => void;
  disabled?: boolean;
}

/** Status variant config for consistent styling */
const statusVariantConfig = {
  running: {
    label: 'Running',
    icon: Play,
    gradient: 'from-blue-500/20 to-transparent',
    iconColor: 'text-blue-400',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  completed: {
    label: 'Completed',
    icon: Play,
    gradient: 'from-green-500/20 to-transparent',
    iconColor: 'text-green-400',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    gradient: 'from-red-500/20 to-transparent',
    iconColor: 'text-red-400',
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  skipped: {
    label: 'Skipped',
    icon: Play,
    gradient: 'from-muted/30 to-transparent',
    iconColor: 'text-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-muted',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    gradient: 'from-muted/30 to-transparent',
    iconColor: 'text-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-muted',
  },
} as const;

/** Check if command contains rm */
function containsRmCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return trimmed.startsWith('rm ') || trimmed === 'rm' || /\|\s*rm(\s|$)/.test(trimmed);
}

/**
 * Node Panel Component
 * Slide-out panel for editing node configuration
 */
export function NodePanel({
  node,
  status,
  isOpen,
  onClose,
  onSave,
  onDelete,
  disabled = false,
}: NodePanelProps) {
  const modalId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [timeout, setTimeout] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Register/unregister modal
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Sync form state with node prop
  useEffect(() => {
    if (node) {
      setName(node.name);
      // Only script nodes have command/cwd/timeout
      if (isScriptNodeConfig(node.config)) {
        setCommand(node.config.command);
        setCwd(node.config.cwd || '');
        setTimeout(node.config.timeout ? String(node.config.timeout / 1000) : '');
      } else {
        // For trigger-workflow nodes, clear the script-specific fields
        setCommand('');
        setCwd('');
        setTimeout('');
      }
      setHasChanges(false);
    }
  }, [node]);

  // Track changes
  useEffect(() => {
    if (!node) return;

    const nameChanged = name !== node.name;

    // Only track script-specific changes for script nodes
    if (isScriptNodeConfig(node.config)) {
      const commandChanged = command !== node.config.command;
      const cwdChanged = cwd !== (node.config.cwd || '');
      const timeoutChanged = timeout !== (node.config.timeout ? String(node.config.timeout / 1000) : '');
      setHasChanges(nameChanged || commandChanged || cwdChanged || timeoutChanged);
    } else {
      // For trigger-workflow nodes, only track name changes
      setHasChanges(nameChanged);
    }
  }, [name, command, cwd, timeout, node]);

  // Check if command contains rm
  const hasRmCommand = containsRmCommand(command);

  // Handle save
  const handleSave = useCallback(() => {
    if (!node || !name.trim() || !command.trim()) return;

    const config: ScriptNodeConfig = {
      command: command.trim(),
      cwd: cwd.trim() || undefined,
      timeout: timeout ? parseInt(timeout) * 1000 : undefined,
    };

    onSave(node.id, { name: name.trim(), config });
    setHasChanges(false);
  }, [node, name, command, cwd, timeout, onSave]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (!node) return;
    onDelete(node.id);
    setShowDeleteConfirm(false);
    onClose();
  }, [node, onDelete, onClose]);

  // Handle keyboard shortcuts with modal stack
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isTopModal(modalId)) return;
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !disabled) {
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalId, hasChanges, disabled, handleSave, onClose]);

  const statusConfig = status ? statusVariantConfig[status] : null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - only on mobile */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:bg-black/20 lg:backdrop-blur-none animate-in fade-in-0 duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-md',
          'bg-background',
          'border-l border-cyan-500/30',
          'z-50 flex flex-col',
          'animate-in slide-in-from-right duration-200',
          'shadow-2xl shadow-black/50'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-panel-title"
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4',
            'border-b border-border',
            'bg-gradient-to-r',
            'dark:from-cyan-500/15 dark:via-cyan-600/5 dark:to-transparent',
            'from-cyan-500/10 via-cyan-600/5 to-transparent'
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'absolute right-4 top-4',
              'p-2 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border border-cyan-500/20',
                'bg-cyan-500/10',
                'shadow-lg'
              )}
            >
              <Settings2 className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="node-panel-title"
                className="text-lg font-semibold text-foreground leading-tight"
              >
                {node ? 'Edit Step' : 'Node Details'}
              </h2>
              {node && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Step #{node.order + 1}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {node ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Status Badge */}
            {statusConfig && (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border',
                    statusConfig.badgeClass
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      status === 'running' && 'bg-blue-400 animate-pulse',
                      status === 'completed' && 'bg-green-400',
                      status === 'failed' && 'bg-red-400',
                      status === 'skipped' && 'bg-muted-foreground',
                      status === 'pending' && 'bg-muted-foreground'
                    )}
                  />
                  {statusConfig.label}
                </span>
              </div>
            )}

            {/* Name Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                Step Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Build Project"
                disabled={disabled}
                className="bg-background border-border text-foreground"
              />
            </div>

            {/* Command Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Play className="w-4 h-4 text-muted-foreground" />
                Shell Command
              </label>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g., npm run build"
                disabled={disabled}
                rows={4}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                className={cn(
                  'w-full px-3 py-2 rounded-lg border bg-background border-border',
                  'text-foreground placeholder-muted-foreground font-mono text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'resize-none'
                )}
              />
              {/* rm command warning */}
              {hasRmCommand && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Trash2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-medium">Safe Delete:</span> Files will be moved to Trash instead of being permanently deleted.
                  </p>
                </div>
              )}
              {!hasRmCommand && (
                <p className="text-xs text-muted-foreground">
                  Enter the shell command to execute. Supports multi-line commands.
                </p>
              )}
            </div>

            {/* Working Directory */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                Working Directory
                <span className="text-muted-foreground font-normal text-xs">(Optional)</span>
              </label>
              <Input
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="e.g., ~/Developer/project"
                disabled={disabled}
                className="bg-background border-border text-foreground font-mono text-sm"
              />
            </div>

            {/* Timeout */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Timeout
                <span className="text-muted-foreground font-normal text-xs">(seconds)</span>
              </label>
              <Input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(e.target.value)}
                placeholder="600 (default: 10 minutes)"
                disabled={disabled}
                min={1}
                className="bg-background border-border text-foreground"
              />
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border">
              <h4 className="text-sm font-medium text-foreground mb-2">Keyboard Shortcuts</h4>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">⌘S</kbd>
                  <span>Save changes</span>
                </li>
                <li className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">Esc</kbd>
                  <span>Close panel</span>
                </li>
                <li className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">Del</kbd>
                  <span>Delete selected node</span>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
            <Settings2 className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">Select a node to edit</p>
            <p className="text-xs mt-1">Double-click a node in the canvas</p>
          </div>
        )}

        {/* Footer */}
        {node && (
          <div className="px-5 py-4 border-t border-border bg-card/50 space-y-3">
            {/* Save Button */}
            <Button
              onClick={handleSave}
              disabled={disabled || !hasChanges || !name.trim() || !command.trim()}
              className={cn(
                'w-full',
                hasChanges
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Save className="w-4 h-4 mr-2" />
              {hasChanges ? 'Save Changes' : 'Saved'}
            </Button>

            {/* Delete Button */}
            <Button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={disabled}
              variant="ghost"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Step
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        variant="destructive"
        title="Delete Step"
        description="Are you sure you want to delete this step? This action cannot be undone."
        itemName={node?.name || ''}
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
