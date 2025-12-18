/**
 * ToolResultFormatter - Format MCP tool results for display
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Dual-Layer Response Schema
 *
 * This component renders tool results using the display layer when available,
 * or falls back to smart formatting for legacy responses.
 */

import { cn } from '../../lib/utils';
import {
  CheckCircle,
  AlertTriangle,
  Info,
  XCircle,
  ChevronRight,
  Folder,
  Activity,
  GitBranch,
  Terminal,
  Workflow,
  Zap,
  Package,
  Shield,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import type { DisplayLayer, DisplayItem, DisplayStatus } from '../../types/ai-assistant';
import { parseMCPToolResponse } from '../../types/ai-assistant';

interface ToolResultFormatterProps {
  /** Tool name that was executed */
  toolName: string;
  /** Raw output string from tool execution */
  output: string;
  /** Optional className */
  className?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

/** Map status to visual config */
const statusConfig: Record<DisplayStatus, { icon: LucideIcon; color: string; bg: string }> = {
  success: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
  },
  info: {
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
};

/** Map icon names to Lucide icons */
const iconMap: Record<string, LucideIcon> = {
  folder: Folder,
  activity: Activity,
  'git-branch': GitBranch,
  terminal: Terminal,
  workflow: Workflow,
  zap: Zap,
  package: Package,
  shield: Shield,
  file: FileText,
};

/**
 * Render a display item
 */
function DisplayItemRow({ item }: { item: DisplayItem }) {
  const Icon = item.icon ? iconMap[item.icon] || FileText : FileText;

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg',
        'bg-muted/30 hover:bg-muted/50 transition-colors',
        item.action && 'cursor-pointer'
      )}
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium truncate">{item.label}</span>
      <span className="text-xs text-muted-foreground truncate flex-1">{item.value}</span>
      {item.action && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
    </div>
  );
}

/**
 * Render display layer content
 */
function DisplayLayerContent({
  display,
  compact,
}: {
  display: DisplayLayer;
  compact?: boolean;
}) {
  const config = statusConfig[display.status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-2">
      {/* Summary with status icon */}
      <div className={cn('flex items-start gap-2', compact && 'items-center')}>
        <div className={cn('p-1 rounded-md shrink-0', config.bg)}>
          <StatusIcon className={cn('w-4 h-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium', compact ? 'text-sm' : 'text-sm')}>{display.summary}</p>
          {display.detail && !compact && (
            <p className="text-xs text-muted-foreground mt-0.5">{display.detail}</p>
          )}
        </div>
      </div>

      {/* Display items */}
      {display.items && display.items.length > 0 && !compact && (
        <div className="space-y-1 mt-2">
          {display.items.map((item, index) => (
            <DisplayItemRow key={`${item.label}-${index}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Smart formatter for legacy JSON responses (no display layer)
 */
function LegacyJsonFormatter({
  data,
  compact,
}: {
  data: Record<string, unknown>;
  compact?: boolean;
}) {
  // Try to extract meaningful information from common patterns
  const count = data.count ?? data.total ?? data.length;
  const items =
    (data.projects as unknown[]) ||
    (data.workflows as unknown[]) ||
    (data.processes as unknown[]) ||
    (data.scripts as unknown[]) ||
    (data.actions as unknown[]);
  const message = data.message as string | undefined;
  const success = data.success as boolean | undefined;

  // Determine status from data
  const status: DisplayStatus =
    success === false ? 'error' : success === true ? 'success' : items ? 'success' : 'info';

  // Generate summary
  let summary: string;
  if (message) {
    summary = message;
  } else if (count !== undefined) {
    summary = `Found ${count} items`;
  } else if (items) {
    summary = `Found ${items.length} items`;
  } else {
    summary = 'Operation completed';
  }

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-2">
      {/* Summary with status icon */}
      <div className={cn('flex items-start gap-2', compact && 'items-center')}>
        <div className={cn('p-1 rounded-md shrink-0', config.bg)}>
          <StatusIcon className={cn('w-4 h-4', config.color)} />
        </div>
        <p className={cn('font-medium', compact ? 'text-sm' : 'text-sm')}>{summary}</p>
      </div>

      {/* Show items if available and not compact */}
      {items && items.length > 0 && !compact && (
        <div className="space-y-1 mt-2">
          {(items as Array<Record<string, unknown>>).slice(0, 5).map((item, index) => {
            const name =
              (item.name as string) || (item.label as string) || (item.id as string) || `Item ${index + 1}`;
            const desc = (item.path as string) || (item.description as string) || '';
            return (
              <div
                key={String(item.id || index)}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{name}</span>
                {desc && (
                  <span className="text-xs text-muted-foreground truncate flex-1">{desc}</span>
                )}
              </div>
            );
          })}
          {items.length > 5 && (
            <p className="text-xs text-muted-foreground pl-2">+{items.length - 5} more items</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fallback for unparseable output
 */
function RawOutputFallback({ output, compact }: { output: string; compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-sm text-muted-foreground truncate">
        {output.slice(0, 100)}
        {output.length > 100 && '...'}
      </p>
    );
  }

  return (
    <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-40 bg-muted/30 p-2 rounded-lg">
      {output}
    </pre>
  );
}

/**
 * Main ToolResultFormatter component
 */
export function ToolResultFormatter({
  toolName: _toolName,
  output,
  className,
  compact = false,
}: ToolResultFormatterProps) {
  // Try to parse as MCPToolResponse
  const mcpResponse = parseMCPToolResponse(output);

  if (mcpResponse?.display) {
    return (
      <div className={className}>
        <DisplayLayerContent display={mcpResponse.display} compact={compact} />
      </div>
    );
  }

  // Try to parse as legacy JSON
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    return (
      <div className={className}>
        <LegacyJsonFormatter data={parsed} compact={compact} />
      </div>
    );
  } catch {
    // Fallback to raw output
    return (
      <div className={className}>
        <RawOutputFallback output={output} compact={compact} />
      </div>
    );
  }
}

/**
 * Get display summary from tool output (utility function)
 */
export function getToolResultSummary(output: string): string {
  const mcpResponse = parseMCPToolResponse(output);
  if (mcpResponse?.display) {
    return mcpResponse.display.summary;
  }

  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (parsed.message) return parsed.message as string;
    if (parsed.count !== undefined) return `Found ${parsed.count} items`;
    if (parsed.success === true) return 'Operation completed successfully';
    if (parsed.success === false) return 'Operation failed';
  } catch {
    // ignore
  }

  return 'Operation completed';
}
