/**
 * QuickActionResultCard - Display results from Instant mode Quick Actions
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Smart Hybrid Quick Actions (023-enhanced-ai-chat)
 *
 * This component displays tool execution results as a card in the chat area,
 * separate from AI conversation messages. Used for "instant" mode actions
 * that don't require AI interpretation.
 */

import { useState } from 'react';
import { cn } from '../../lib/utils';
import {
  X,
  Copy,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings,
  Bell,
  Package,
  GitFork,
  Terminal,
  FolderOpen,
  Workflow,
  Zap,
} from 'lucide-react';
import { ToolResultFormatter } from './ToolResultFormatter';
import { parseMCPToolResponse } from '../../types/ai-assistant';

interface QuickActionResultCardProps {
  /** Tool name that was executed */
  toolName: string;
  /** Display label for the action */
  label: string;
  /** Raw result data (JSON) */
  result: unknown;
  /** Timestamp when action was executed */
  timestamp: Date;
  /** Handler to ask AI about the result */
  onAskAI?: (context: string) => void;
  /** Handler to dismiss the card */
  onDismiss?: () => void;
  /** Optional className */
  className?: string;
}

/** Map tool names to icons */
const TOOL_ICONS: Record<string, React.ElementType> = {
  list_background_processes: Activity,
  get_environment_info: Settings,
  get_notifications: Bell,
  get_project_dependencies: Package,
  list_worktrees: GitFork,
  list_project_scripts: Terminal,
  list_projects: FolderOpen,
  list_workflows: Workflow,
  list_actions: Zap,
};

/**
 * Format tool result for display
 */
function formatResult(toolName: string, result: unknown): React.ReactNode {
  if (!result || typeof result !== 'object') {
    return <pre className="text-xs whitespace-pre-wrap">{String(result)}</pre>;
  }

  const rawData = result as Record<string, unknown>;

  // Handle MCPToolResponse format - extract actual data from data.data
  // MCPToolResponse has: { data: {...}, display: {...}, meta?: {...} }
  const data =
    rawData.display && rawData.data && typeof rawData.data === 'object'
      ? (rawData.data as Record<string, unknown>)
      : rawData;

  // Handle common patterns
  switch (toolName) {
    case 'list_background_processes': {
      const processes = (data.processes as Array<Record<string, unknown>>) || [];
      if (processes.length === 0) {
        return <p className="text-sm text-muted-foreground">No background processes running</p>;
      }
      return (
        <div className="space-y-2">
          {processes.map((proc, i) => (
            <div
              key={(proc.execution_id as string) || i}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">
                  {(proc.script_name as string) || (proc.execution_id as string)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {proc.port != null ? <span>Port: {String(proc.port)}</span> : null}
                {proc.status != null ? (
                  <span className="capitalize">{String(proc.status)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      );
    }

    case 'get_environment_info': {
      const volta = data.volta as Record<string, unknown> | undefined;
      const corepack = data.corepack as Record<string, unknown> | undefined;
      const systemNode = data.system_node as Record<string, unknown> | undefined;
      const packageManagers = data.package_managers as
        | Record<string, Record<string, string>>
        | undefined;

      return (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {volta && (
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-muted-foreground">Volta:</span>{' '}
              <span className="font-medium">{volta.available ? '✓' : '✗'}</span>
            </div>
          )}
          {corepack && (
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-muted-foreground">Corepack:</span>{' '}
              <span className="font-medium">{corepack.enabled ? '✓ enabled' : 'available'}</span>
            </div>
          )}
          {systemNode?.version != null ? (
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-muted-foreground">Node:</span>{' '}
              <span className="font-medium">{String(systemNode.version)}</span>
            </div>
          ) : null}
          {packageManagers && (
            <>
              {packageManagers.npm && (
                <div className="p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">npm:</span>{' '}
                  <span className="font-medium">{packageManagers.npm.version}</span>
                </div>
              )}
              {packageManagers.pnpm && (
                <div className="p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">pnpm:</span>{' '}
                  <span className="font-medium">{packageManagers.pnpm.version}</span>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    case 'list_project_scripts': {
      const scripts = (data.scripts as Array<Record<string, string>>) || [];
      if (scripts.length === 0) {
        return <p className="text-sm text-muted-foreground">No scripts found</p>;
      }
      return (
        <div className="space-y-1">
          {scripts.map((script) => (
            <div
              key={script.name}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
            >
              <span className="text-sm font-mono">{script.name}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {script.command}
              </span>
            </div>
          ))}
        </div>
      );
    }

    case 'get_project_dependencies': {
      const deps = (data.dependencies as Record<string, string>) || {};
      const devDeps = (data.devDependencies as Record<string, string>) || {};
      const depCount = Object.keys(deps).length;
      const devDepCount = Object.keys(devDeps).length;

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Dependencies:</span>
            <span className="font-medium">{depCount}</span>
            <span className="text-muted-foreground">Dev:</span>
            <span className="font-medium">{devDepCount}</span>
          </div>
          {depCount > 0 && (
            <div className="text-xs text-muted-foreground">
              {Object.keys(deps).slice(0, 5).join(', ')}
              {depCount > 5 && ` +${depCount - 5} more`}
            </div>
          )}
        </div>
      );
    }

    case 'list_projects': {
      const projects = (data.projects as Array<Record<string, string>>) || [];
      if (projects.length === 0) {
        return <p className="text-sm text-muted-foreground">No projects registered</p>;
      }
      return (
        <div className="space-y-1">
          {projects.slice(0, 5).map((proj) => (
            <div
              key={proj.id || proj.path}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
            >
              <span className="text-sm font-medium">{proj.name}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {proj.path}
              </span>
            </div>
          ))}
          {projects.length > 5 && (
            <p className="text-xs text-muted-foreground">+{projects.length - 5} more projects</p>
          )}
        </div>
      );
    }

    default: {
      // Try to use MCPToolResponse display layer first
      const output = JSON.stringify(result);
      const mcpResponse = parseMCPToolResponse(output);

      if (mcpResponse?.display) {
        // Use ToolResultFormatter for MCPToolResponse format
        return <ToolResultFormatter toolName={toolName} output={output} />;
      }

      // Legacy format - try to show message or use smart formatter
      if (data.message) {
        return <p className="text-sm">{data.message as string}</p>;
      }

      // Use ToolResultFormatter for smart fallback
      return <ToolResultFormatter toolName={toolName} output={output} />;
    }
  }
}

/**
 * QuickActionResultCard component
 * Displays instant action results in a card format
 */
export function QuickActionResultCard({
  toolName,
  label,
  result,
  timestamp,
  onAskAI,
  onDismiss,
  className,
}: QuickActionResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const Icon = TOOL_ICONS[toolName] || Zap;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAskAI = () => {
    if (onAskAI) {
      const context = `Based on this ${label} result:\n${JSON.stringify(result, null, 2)}`;
      onAskAI(context);
      // Close the card after sending to AI
      onDismiss?.();
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-muted/20',
        'shadow-sm transition-all duration-200',
        'hover:border-border/70 hover:shadow-md',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium">{label}</h3>
            <p className="text-xs text-muted-foreground">{timestamp.toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <>
          <div className="px-4 py-3">{formatResult(toolName, result)}</div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30 bg-muted/10">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                'transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onAskAI && (
              <button
                onClick={handleAskAI}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                  'transition-colors',
                  'bg-primary/10 text-primary hover:bg-primary/20'
                )}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ask AI
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
