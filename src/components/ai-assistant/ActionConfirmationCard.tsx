/**
 * ActionConfirmationCard - Card for approving/denying MCP actions
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 *
 * Enhanced design:
 * - More prominent visual styling with gradient accents
 * - Better button styling with shadows
 * - Animated progress bar during execution
 * - Collapsible output for long results
 */

import { useState, useCallback, useEffect, useRef, useId } from 'react';
import {
  Play,
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  Globe,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Clock,
  Zap,
  Maximize2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';
import type { ToolCall, ToolResult } from '../../types/ai-assistant';

interface ActionConfirmationCardProps {
  /** Tool call to confirm */
  toolCall: ToolCall;
  /** Handler for approval */
  onApprove: (toolCallId: string) => Promise<void>;
  /** Handler for denial */
  onDeny: (toolCallId: string, reason?: string) => Promise<void>;
  /** Handler to cancel/stop ongoing execution */
  onStop?: (toolCallId: string) => Promise<void>;
  /** Tool result (if execution completed) */
  result?: ToolResult;
  /** Whether the action is currently executing */
  isExecuting?: boolean;
}

/** Status configuration for visual styling */
const statusConfig = {
  pending: {
    border: 'border-amber-500/40',
    bg: 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent',
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500 dark:text-amber-400',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-600 dark:text-amber-400',
    badgeBorder: 'border-amber-500/30',
    label: 'Requires Approval',
  },
  completed: {
    border: 'border-green-500/40',
    bg: 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent',
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-500 dark:text-green-400',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-600 dark:text-green-400',
    badgeBorder: 'border-green-500/30',
    label: 'Completed',
  },
  failed: {
    border: 'border-red-500/40',
    bg: 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500 dark:text-red-400',
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-600 dark:text-red-400',
    badgeBorder: 'border-red-500/30',
    label: 'Failed',
  },
  denied: {
    border: 'border-zinc-500/40',
    bg: 'bg-gradient-to-br from-zinc-500/10 via-zinc-500/5 to-transparent',
    iconBg: 'bg-zinc-500/15',
    iconColor: 'text-zinc-500 dark:text-zinc-400',
    badgeBg: 'bg-zinc-500/15',
    badgeText: 'text-zinc-600 dark:text-zinc-400',
    badgeBorder: 'border-zinc-500/30',
    label: 'Denied',
  },
} as const;

/** Get icon for tool type */
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'run_script':
      return Terminal;
    case 'trigger_webhook':
      return Globe;
    case 'run_workflow':
      return GitBranch;
    default:
      return Terminal;
  }
}

/** Get display name for tool */
function getToolDisplayName(toolName: string): string {
  switch (toolName) {
    case 'run_script':
      return 'Run Script';
    case 'run_workflow':
      return 'Run Workflow';
    case 'trigger_webhook':
      return 'Trigger Webhook';
    case 'get_git_status':
      return 'Get Git Status';
    case 'get_staged_diff':
      return 'Get Staged Changes';
    case 'list_project_scripts':
      return 'List Scripts';
    default:
      return toolName;
  }
}

/** Format tool arguments for display */
function formatArguments(args: Record<string, unknown>): { key: string; value: string }[] {
  const formatted: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      formatted.push({ key, value });
    } else {
      formatted.push({ key, value: JSON.stringify(value) });
    }
  }
  return formatted;
}

/** Tool Output Dialog - displays full output in a modal */
interface ToolOutputDialogProps {
  toolName: string;
  displayName: string;
  output: string;
  success: boolean;
  durationMs?: number;
  onClose: () => void;
}

function ToolOutputDialog({
  toolName,
  displayName,
  output,
  success,
  durationMs,
  onClose,
}: ToolOutputDialogProps) {
  const modalId = useId();
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const ToolIcon = getToolIcon(toolName);

  // Register/unregister modal
  useEffect(() => {
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId]);

  // Handle ESC key with modal stack
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, onClose]);

  // Focus trap
  useEffect(() => {
    if (contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, []);

  // Copy all output to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const statusConfig = success
    ? {
        borderColor: 'border-green-500/30',
        bgColor: 'bg-green-500/5',
        iconBg: 'bg-green-500/10',
        iconColor: 'text-green-400',
        label: 'Success',
      }
    : {
        borderColor: 'border-red-500/30',
        bgColor: 'bg-red-500/5',
        iconBg: 'bg-red-500/10',
        iconColor: 'text-red-400',
        label: 'Failed',
      };

  return (
    <div
      className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-output-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={contentRef}
        className={cn(
          'fixed inset-4 md:inset-8 lg:inset-12 flex flex-col',
          'bg-background rounded-xl',
          'border',
          statusConfig.borderColor,
          'shadow-2xl shadow-black/60',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          'focus:outline-none'
        )}
        tabIndex={-1}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4 border-b border-border',
            'bg-gradient-to-r',
            success
              ? 'dark:from-green-500/15 dark:via-green-600/5 dark:to-transparent from-green-500/10 via-green-600/5 to-transparent'
              : 'dark:from-red-500/15 dark:via-red-600/5 dark:to-transparent from-red-500/10 via-red-600/5 to-transparent'
          )}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-4 top-4 h-auto w-auto p-2"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-11 h-11 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border',
                statusConfig.borderColor,
                statusConfig.iconBg,
                'shadow-lg'
              )}
            >
              <ToolIcon className={cn('w-5 h-5', statusConfig.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="tool-output-title"
                className="text-base font-semibold text-foreground leading-tight"
              >
                {displayName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm text-muted-foreground">{statusConfig.label}</span>
                {durationMs && (
                  <>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">{durationMs}ms</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-hidden p-4 bg-card/30">
          <pre
            className={cn(
              'h-full overflow-auto',
              'text-sm text-foreground/90 whitespace-pre-wrap break-all',
              'font-mono bg-background/80 rounded-lg p-4',
              'border border-border'
            )}
          >
            {output || 'No output'}
          </pre>
        </div>

        {/* Footer */}
        <div
          className={cn(
            'px-5 py-3 border-t flex items-center justify-between',
            statusConfig.borderColor,
            statusConfig.bgColor
          )}
        >
          {/* Left: line count */}
          <div className="text-xs text-muted-foreground">
            {output.split('\n').length} lines
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!output}
              className="h-auto px-3 py-1.5 text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  <span>Copy</span>
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={onClose} className="h-auto px-4 py-1.5 text-sm">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionConfirmationCard({
  toolCall,
  onApprove,
  onDeny,
  onStop,
  result,
  isExecuting = false,
}: ActionConfirmationCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isDenying, setIsDenying] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOutputDialog, setShowOutputDialog] = useState(false);

  const ToolIcon = getToolIcon(toolCall.name);
  const displayName = getToolDisplayName(toolCall.name);
  const formattedArgs = formatArguments(toolCall.arguments as Record<string, unknown>);

  const isPending = toolCall.status === 'pending';
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';
  const isDenied = toolCall.status === 'denied';

  const status = isPending ? 'pending' : isCompleted ? 'completed' : isFailed ? 'failed' : 'denied';
  const config = statusConfig[status];

  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      await onApprove(toolCall.id);
    } finally {
      setIsApproving(false);
    }
  }, [onApprove, toolCall.id]);

  const handleDeny = useCallback(async () => {
    setIsDenying(true);
    try {
      await onDeny(toolCall.id);
    } finally {
      setIsDenying(false);
    }
  }, [onDeny, toolCall.id]);

  const handleStop = useCallback(async () => {
    if (!onStop) return;
    setIsStopping(true);
    try {
      await onStop(toolCall.id);
    } finally {
      setIsStopping(false);
    }
  }, [onStop, toolCall.id]);

  const handleCopyOutput = useCallback(async () => {
    if (!result?.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [result?.output]);

  // Determine if output should be collapsible (more than 4 lines)
  const outputLines = result?.output?.split('\n').length ?? 0;
  const isOutputCollapsible = outputLines > 4;

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4',
        'transition-all duration-200',
        'shadow-sm',
        config.border,
        config.bg
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'p-2.5 rounded-xl',
            'border',
            config.iconBg,
            config.iconColor,
            config.border
          )}
        >
          <ToolIcon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{displayName}</span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border',
                'font-medium',
                config.badgeBg,
                config.badgeText,
                config.badgeBorder
              )}
            >
              {config.label}
            </span>
          </div>

          {/* Arguments as key-value pairs */}
          {formattedArgs.length > 0 && (
            <div className="mt-2 space-y-1">
              {formattedArgs.map(({ key, value }) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-medium min-w-[60px]">{key}:</span>
                  <code className="font-mono text-foreground/80 break-all bg-background/50 px-1.5 py-0.5 rounded">
                    {value}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (only show when pending) */}
      {isPending && !isExecuting && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
          <Button
            variant="default"
            size="sm"
            onClick={handleApprove}
            disabled={isApproving || isDenying}
            className={cn(
              'flex-1',
              'bg-green-600 hover:bg-green-500 text-white',
              'shadow-sm shadow-green-500/20'
            )}
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            Approve & Run
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDeny}
            disabled={isApproving || isDenying}
            className={cn(
              'flex-1',
              'border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
            )}
          >
            {isDenying ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <X className="w-4 h-4 mr-1.5" />
            )}
            Deny
          </Button>
        </div>
      )}

      {/* Executing state with animated indicator */}
      {isExecuting && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="absolute inset-0 animate-ping">
                <Zap className="w-5 h-5 text-primary/30" />
              </div>
            </div>
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground">Executing...</span>
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary/60 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
            {/* Stop button */}
            {onStop && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={isStopping}
                className={cn(
                  'shrink-0',
                  'border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                )}
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <X className="w-4 h-4 mr-1.5" />
                )}
                Stop
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Result display */}
      {result && (
        <div className="mt-4 pt-4 border-t border-border/50">
          {result.success ? (
            <div className="space-y-2">
              {/* Success header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Success
                  </span>
                </div>
                {result.durationMs && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {result.durationMs}ms
                  </span>
                )}
              </div>

              {/* Output */}
              {result.output && (
                <div className="relative">
                  <pre
                    className={cn(
                      'text-xs text-foreground/80 whitespace-pre-wrap break-all',
                      'font-mono bg-background/80 rounded-lg p-3',
                      'border border-border',
                      isOutputCollapsible && !outputExpanded && 'max-h-24 overflow-hidden'
                    )}
                  >
                    {result.output}
                  </pre>

                  {/* Fade overlay for collapsed state */}
                  {isOutputCollapsible && !outputExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/90 to-transparent rounded-b-lg pointer-events-none" />
                  )}

                  {/* Actions row */}
                  <div className="flex items-center justify-between mt-2">
                    {isOutputCollapsible && (
                      <button
                        onClick={() => setOutputExpanded(!outputExpanded)}
                        className={cn(
                          'flex items-center gap-1 text-xs text-muted-foreground',
                          'hover:text-foreground transition-colors'
                        )}
                      >
                        {outputExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Show more ({outputLines} lines)
                          </>
                        )}
                      </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                      <button
                        onClick={() => setShowOutputDialog(true)}
                        className={cn(
                          'flex items-center gap-1 text-xs text-muted-foreground',
                          'hover:text-foreground transition-colors'
                        )}
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        View Full
                      </button>
                      <button
                        onClick={handleCopyOutput}
                        className={cn(
                          'flex items-center gap-1 text-xs text-muted-foreground',
                          'hover:text-foreground transition-colors'
                        )}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {result.error || 'Action failed'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Denied state message */}
      {isDenied && !result && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-zinc-400" />
          <span>Action was denied by user</span>
        </div>
      )}

      {/* Tool Output Dialog */}
      {showOutputDialog && result?.output && (
        <ToolOutputDialog
          toolName={toolCall.name}
          displayName={displayName}
          output={result.output}
          success={result.success}
          durationMs={result.durationMs}
          onClose={() => setShowOutputDialog(false)}
        />
      )}
    </div>
  );
}
