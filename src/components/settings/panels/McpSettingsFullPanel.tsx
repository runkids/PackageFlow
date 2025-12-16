/**
 * MCP Settings Full Panel
 * Redesigned with tabbed navigation to reduce vertical scrolling
 * Features: Server status, tabbed content (Overview/Permissions/Setup/Logs)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  AlertCircle,
  FileText,
  Trash2,
  RefreshCw,
  Clock,
  Settings2,
  Terminal,
  Eye,
  Play,
  Shield,
  Wrench,
  Zap,
  History,
  FolderGit2,
  GitBranch,
  Workflow,
  FileCode,
  Package,
  Target,
  ChevronDown,
} from 'lucide-react';
import {
  mcpAPI,
  type McpServerInfo,
  type McpServerConfig,
  type McpLogsResponse,
} from '../../../lib/tauri-api';
import { cn } from '../../../lib/utils';
import { Skeleton } from '../../ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/Tabs';
import {
  ServerStatusCard,
  PermissionQuickModeSelector,
  QuickSetupSection,
  MCPActionSettings,
  MCPActionHistory,
} from '../mcp';
import {
  type PermissionQuickMode,
  type ToolPermissionMatrix as ToolPermissionMatrixType,
  type ToolPermissionEntry,
  type PermissionType,
  getDefaultPermissionMatrix,
  detectQuickMode,
  buildToolPermissionEntries,
  matrixToAllowedTools,
  TOOL_DEFINITIONS_WITH_PERMISSIONS,
} from '../../../types/mcp';
import { PermissionPill } from '../../ui/PermissionCheckbox';

// ============================================================================
// Loading & Error States
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <Skeleton className="w-full h-20 rounded-xl" />
    <Skeleton className="w-full h-10 rounded-lg" />
    <Skeleton className="w-full h-64 rounded-lg" />
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <AlertCircle className="w-12 h-12 text-destructive mb-4" />
    <p className="text-sm text-muted-foreground mb-4">{message}</p>
    <button
      onClick={onRetry}
      className={cn(
        'px-4 py-2 rounded-lg text-sm font-medium',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      Retry
    </button>
  </div>
);

// ============================================================================
// Tool Permission Row Component
// ============================================================================

interface ToolPermissionRowProps {
  entry: ToolPermissionEntry;
  onPermissionChange: (type: PermissionType, value: boolean) => void;
  disabled?: boolean;
}

const ToolPermissionRow: React.FC<ToolPermissionRowProps> = ({
  entry,
  onPermissionChange,
  disabled,
}) => {
  const categoryConfig = {
    read: { icon: <Eye className="w-3 h-3" />, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    execute: { icon: <Play className="w-3 h-3" />, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    write: { icon: <Shield className="w-3 h-3" />, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  }[entry.category];

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5 px-3',
        'border-b border-border/50 last:border-b-0',
        'transition-colors hover:bg-muted/30',
        disabled && 'opacity-50'
      )}
    >
      {/* Tool info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono font-medium text-foreground">{entry.name}</code>
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', categoryConfig.bg, categoryConfig.color)}>
            {categoryConfig.icon}
            <span className="hidden sm:inline">{entry.category}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>
      </div>

      {/* Permission toggles - R/E/W pills */}
      <div className="flex items-center gap-1 shrink-0">
        <PermissionPill
          label="R"
          variant="read"
          checked={entry.permissions.read}
          onChange={(v) => onPermissionChange('read', v)}
          disabled={disabled || !entry.applicablePermissions.includes('read')}
          size="md"
        />
        <PermissionPill
          label="E"
          variant="execute"
          checked={entry.permissions.execute}
          onChange={(v) => onPermissionChange('execute', v)}
          disabled={disabled || !entry.applicablePermissions.includes('execute')}
          size="md"
        />
        <PermissionPill
          label="W"
          variant="write"
          checked={entry.permissions.write}
          onChange={(v) => onPermissionChange('write', v)}
          disabled={disabled || !entry.applicablePermissions.includes('write')}
          size="md"
        />
      </div>
    </div>
  );
};

// ============================================================================
// Overview Tab Content
// ============================================================================

interface OverviewTabProps {
  quickMode: PermissionQuickMode;
  onQuickModeChange: (mode: PermissionQuickMode) => void;
  isSaving: boolean;
  enabledToolCount: number;
  totalToolCount: number;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  quickMode,
  onQuickModeChange,
  isSaving,
  enabledToolCount,
  totalToolCount,
}) => {
  return (
    <div className="space-y-4">
      {/* Quick Mode Selector */}
      <PermissionQuickModeSelector
        value={quickMode}
        onChange={onQuickModeChange}
        disabled={isSaving}
      />

      {/* Stats Card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-xs font-medium">Read Tools</span>
          </div>
          <span className="text-lg font-semibold text-foreground">
            {TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(t => t.category === 'read').length}
          </span>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
            <Play className="w-4 h-4" />
            <span className="text-xs font-medium">Execute Tools</span>
          </div>
          <span className="text-lg font-semibold text-foreground">
            {TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(t => t.category === 'execute').length}
          </span>
        </div>
        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 mb-1">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-medium">Write Tools</span>
          </div>
          <span className="text-lg font-semibold text-foreground">
            {TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(t => t.category === 'write').length}
          </span>
        </div>
      </div>

      {/* Permission Summary */}
      <div className="p-4 rounded-lg border border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Active Tools</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {enabledToolCount} of {totalToolCount} enabled
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-300"
            style={{ width: `${(enabledToolCount / totalToolCount) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Permissions Tab Content
// ============================================================================

interface PermissionsTabProps {
  toolEntries: ToolPermissionEntry[];
  onPermissionChange: (toolName: string, type: PermissionType, value: boolean) => void;
  isSaving: boolean;
}

const PermissionsTab: React.FC<PermissionsTabProps> = ({
  toolEntries,
  onPermissionChange,
  isSaving,
}) => {
  // Group by category
  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolPermissionEntry[]> = { read: [], execute: [], write: [] };
    toolEntries.forEach((entry) => {
      groups[entry.category].push(entry);
    });
    return groups;
  }, [toolEntries]);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          Click permission badges to toggle
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">R</span>
            <span className="text-muted-foreground">Read</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">E</span>
            <span className="text-muted-foreground">Execute</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-[10px] font-bold text-rose-600 dark:text-rose-400">W</span>
            <span className="text-muted-foreground">Write</span>
          </span>
        </div>
      </div>

      {/* Tools list - Fixed height with internal scroll */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="max-h-[calc(80vh-200px)] overflow-y-auto">
          {/* Read Tools */}
          {groupedTools.read.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 px-3 py-2 bg-muted/80 dark:bg-muted/50 border-b border-border backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Read Tools ({groupedTools.read.length})
                  </span>
                </div>
              </div>
              {groupedTools.read.map((entry) => (
                <ToolPermissionRow
                  key={entry.name}
                  entry={entry}
                  onPermissionChange={(type, value) => onPermissionChange(entry.name, type, value)}
                  disabled={isSaving}
                />
              ))}
            </div>
          )}

          {/* Execute Tools */}
          {groupedTools.execute.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 px-3 py-2 bg-muted/80 dark:bg-muted/50 border-b border-border backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Execute Tools ({groupedTools.execute.length})
                  </span>
                </div>
              </div>
              {groupedTools.execute.map((entry) => (
                <ToolPermissionRow
                  key={entry.name}
                  entry={entry}
                  onPermissionChange={(type, value) => onPermissionChange(entry.name, type, value)}
                  disabled={isSaving}
                />
              ))}
            </div>
          )}

          {/* Write Tools */}
          {groupedTools.write.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 px-3 py-2 bg-muted/80 dark:bg-muted/50 border-b border-border backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                  <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Write Tools ({groupedTools.write.length})
                  </span>
                </div>
              </div>
              {groupedTools.write.map((entry) => (
                <ToolPermissionRow
                  key={entry.name}
                  entry={entry}
                  onPermissionChange={(type, value) => onPermissionChange(entry.name, type, value)}
                  disabled={isSaving}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Setup Tab Content
// ============================================================================

interface SetupTabProps {
  serverInfo: McpServerInfo;
}

/** MCP Tools data structure */
interface MCPToolCategory {
  name: string;
  icon: React.ReactNode;
  iconColor: string;
  tools: { name: string; description: string }[];
}

const MCP_TOOL_CATEGORIES: MCPToolCategory[] = [
  {
    name: 'Project Management',
    icon: <FolderGit2 className="w-4 h-4" />,
    iconColor: 'text-blue-500',
    tools: [
      { name: 'list_projects', description: 'List all registered projects with detailed info' },
      { name: 'get_project', description: 'Get project details (scripts, workflows, git info)' },
    ],
  },
  {
    name: 'Git Worktree',
    icon: <GitBranch className="w-4 h-4" />,
    iconColor: 'text-emerald-500',
    tools: [
      { name: 'list_worktrees', description: 'List all git worktrees for a project' },
      { name: 'get_worktree_status', description: 'Get git status (branch, staged, modified, untracked)' },
      { name: 'get_git_diff', description: 'Get staged changes diff for commit messages' },
    ],
  },
  {
    name: 'Workflows',
    icon: <Workflow className="w-4 h-4" />,
    iconColor: 'text-purple-500',
    tools: [
      { name: 'list_workflows', description: 'List all workflows, filter by project' },
      { name: 'get_workflow', description: 'Get detailed workflow info with all steps' },
      { name: 'create_workflow', description: 'Create a new workflow' },
      { name: 'add_workflow_step', description: 'Add a script step to a workflow' },
      { name: 'run_workflow', description: 'Execute a workflow synchronously' },
    ],
  },
  {
    name: 'Templates',
    icon: <FileCode className="w-4 h-4" />,
    iconColor: 'text-cyan-500',
    tools: [
      { name: 'list_step_templates', description: 'List available step templates' },
      { name: 'create_step_template', description: 'Create a reusable step template' },
    ],
  },
  {
    name: 'NPM/Package Scripts',
    icon: <Package className="w-4 h-4" />,
    iconColor: 'text-orange-500',
    tools: [
      { name: 'run_npm_script', description: 'Run npm/yarn/pnpm scripts (volta/corepack support)' },
    ],
  },
  {
    name: 'MCP Actions',
    icon: <Target className="w-4 h-4" />,
    iconColor: 'text-amber-500',
    tools: [
      { name: 'list_actions', description: 'List all MCP actions' },
      { name: 'get_action', description: 'Get action details by ID' },
      { name: 'run_script', description: 'Execute a script action' },
      { name: 'trigger_webhook', description: 'Trigger a webhook action' },
      { name: 'get_execution_status', description: 'Get action execution status' },
      { name: 'list_action_executions', description: 'List recent executions' },
      { name: 'get_action_permissions', description: 'Get permission configuration' },
    ],
  },
];

/** Available Tools Section */
const AvailableToolsSection: React.FC = () => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const totalTools = MCP_TOOL_CATEGORIES.reduce((sum, cat) => sum + cat.tools.length, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Available Tools</span>
        <span className="text-xs text-muted-foreground">
          ({totalTools} tools in {MCP_TOOL_CATEGORIES.length} categories)
        </span>
      </div>

      {/* Tip */}
      <p className="text-xs text-muted-foreground">
        Run <code className="px-1.5 py-0.5 bg-muted rounded font-mono">packageflow-mcp --help</code> for detailed documentation
      </p>

      {/* Categories */}
      <div className="space-y-2">
        {MCP_TOOL_CATEGORIES.map((category) => (
          <div key={category.name} className="border border-border rounded-lg overflow-hidden bg-card/50">
            <button
              type="button"
              onClick={() =>
                setExpandedCategory(expandedCategory === category.name ? null : category.name)
              }
              className={cn(
                'w-full flex items-center gap-3 p-3',
                'hover:bg-muted/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
              )}
            >
              <span className={category.iconColor}>{category.icon}</span>
              <span className="flex-1 text-left font-medium text-foreground text-sm">
                {category.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {category.tools.length} tools
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform duration-200',
                  expandedCategory === category.name && 'rotate-180'
                )}
              />
            </button>

            {expandedCategory === category.name && (
              <div className="border-t border-border bg-muted/20">
                <div className="p-2 space-y-0.5">
                  {category.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-start gap-3 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                    >
                      <code className="text-xs font-mono text-primary shrink-0 min-w-[160px]">
                        {tool.name}
                      </code>
                      <span className="text-xs text-muted-foreground">{tool.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const SetupTab: React.FC<SetupTabProps> = ({ serverInfo }) => {
  return (
    <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto pr-1 pb-8">
      <QuickSetupSection
        binaryPath={serverInfo.binary_path}
        configJson={serverInfo.config_json}
        configToml={serverInfo.config_toml}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Available Tools Section */}
      <AvailableToolsSection />
    </div>
  );
};

// ============================================================================
// Activity Tab Content (Combined History + Logs)
// ============================================================================

interface ActivityTabProps {
  logsResponse: McpLogsResponse | null;
  isLoadingLogs: boolean;
  onLoadLogs: () => void;
  onClearLogs: () => void;
}

/** Status configuration for log entries */
const LOG_STATUS_CONFIG = {
  success: {
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/5 dark:bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    label: 'Success',
  },
  permission_denied: {
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-500/5 dark:bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    label: 'Denied',
  },
  error: {
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-500/5 dark:bg-red-500/10',
    borderColor: 'border-red-500/20',
    label: 'Error',
  },
} as const;

/** Server Logs Panel Component */
const ServerLogsPanel: React.FC<{
  logsResponse: McpLogsResponse | null;
  isLoadingLogs: boolean;
  onLoadLogs: () => void;
  onClearLogs: () => void;
}> = ({ logsResponse, isLoadingLogs, onLoadLogs, onClearLogs }) => {
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-3">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Server Logs</span>
          {logsResponse && (
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {logsResponse.entries.length} / {logsResponse.totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onLoadLogs}
            disabled={isLoadingLogs}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium',
              'bg-primary/10 text-primary border border-primary/20',
              'hover:bg-primary/20 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', isLoadingLogs && 'animate-spin')} />
            <span>{isLoadingLogs ? 'Loading...' : 'Refresh'}</span>
          </button>
          <button
            onClick={onClearLogs}
            disabled={!logsResponse || logsResponse.entries.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium',
              'text-destructive border border-destructive/20',
              'hover:bg-destructive/10 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Logs container */}
      <div className="border border-border rounded-lg overflow-hidden bg-card/30">
        {!logsResponse ? (
          <div className="py-12 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Click Refresh to load server logs</p>
          </div>
        ) : logsResponse.entries.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No logs recorded yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Logs will appear here when MCP tools are executed
            </p>
          </div>
        ) : (
          <div className="max-h-[350px] overflow-y-auto">
            {logsResponse.entries.map((entry, idx) => {
              const statusConfig = LOG_STATUS_CONFIG[entry.result as keyof typeof LOG_STATUS_CONFIG] || LOG_STATUS_CONFIG.error;
              return (
                <div
                  key={idx}
                  className={cn(
                    'px-3 py-2.5 border-b border-border/50 last:border-b-0',
                    'transition-colors hover:bg-muted/30',
                    statusConfig.bgColor
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: Status indicator + Tool name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          statusConfig.dotColor
                        )}
                        title={statusConfig.label}
                      />
                      <code className="text-xs font-mono font-medium text-foreground truncate">
                        {entry.tool}
                      </code>
                    </div>

                    {/* Right: Duration + Timestamp */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDuration(entry.durationMs)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Error message if present */}
                  {entry.error && (
                    <div className="mt-1.5 ml-4.5 pl-2 border-l-2 border-destructive/30">
                      <p
                        className="text-xs text-destructive truncate"
                        title={entry.error}
                      >
                        {entry.error}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary stats */}
      {logsResponse && logsResponse.entries.length > 0 && (
        <div className="flex items-center justify-center gap-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', LOG_STATUS_CONFIG.success.dotColor)} />
            {logsResponse.entries.filter(e => e.result === 'success').length} success
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', LOG_STATUS_CONFIG.permission_denied.dotColor)} />
            {logsResponse.entries.filter(e => e.result === 'permission_denied').length} denied
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', LOG_STATUS_CONFIG.error.dotColor)} />
            {logsResponse.entries.filter(e => e.result === 'error').length} errors
          </span>
        </div>
      )}
    </div>
  );
};

const ActivityTab: React.FC<ActivityTabProps> = ({
  logsResponse,
  isLoadingLogs,
  onLoadLogs,
  onClearLogs,
}) => {
  const [hasLoadedLogs, setHasLoadedLogs] = useState(false);

  // Handle tab change - auto-load logs when logs tab is first selected
  const handleTabChange = useCallback((value: string) => {
    if (value === 'logs' && !hasLoadedLogs && !isLoadingLogs) {
      setHasLoadedLogs(true);
      onLoadLogs();
    }
  }, [hasLoadedLogs, isLoadingLogs, onLoadLogs]);

  return (
    <div className="space-y-4">
      {/* Nested tabs for History and Logs */}
      <Tabs defaultValue="history" className="space-y-4" onValueChange={handleTabChange}>
        <TabsList className="w-fit">
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            <span>Action History</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>Server Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <MCPActionHistory maxHeight="400px" />
        </TabsContent>

        <TabsContent value="logs">
          <ServerLogsPanel
            logsResponse={logsResponse}
            isLoadingLogs={isLoadingLogs}
            onLoadLogs={onLoadLogs}
            onClearLogs={onClearLogs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function McpSettingsFullPanel() {
  // Data state
  const [serverInfo, setServerInfo] = useState<McpServerInfo | null>(null);
  const [config, setConfig] = useState<McpServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Permission state
  const [permissionMatrix, setPermissionMatrix] = useState<ToolPermissionMatrixType>({});
  const [quickMode, setQuickMode] = useState<PermissionQuickMode>('read_only');

  // Logs state
  const [logsResponse, setLogsResponse] = useState<McpLogsResponse | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Build tool permission entries from matrix
  const toolEntries = useMemo<ToolPermissionEntry[]>(() => {
    return buildToolPermissionEntries(permissionMatrix);
  }, [permissionMatrix]);

  // Count enabled tools
  const enabledToolCount = useMemo(() => {
    return toolEntries.filter(
      (e) => e.permissions.read || e.permissions.execute || e.permissions.write
    ).length;
  }, [toolEntries]);

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [info, serverConfig] = await Promise.all([
        mcpAPI.getServerInfo(),
        mcpAPI.getConfig(),
      ]);

      setServerInfo(info);
      setConfig(serverConfig);

      // Initialize permission matrix from config
      if (serverConfig.allowedTools.length === 0) {
        let mode: PermissionQuickMode = 'read_only';
        if (serverConfig.permissionMode === 'execute_with_confirm') {
          mode = 'standard';
        } else if (serverConfig.permissionMode === 'full_access') {
          mode = 'full_access';
        }
        setQuickMode(mode);
        setPermissionMatrix(getDefaultPermissionMatrix(mode));
      } else {
        const matrix: ToolPermissionMatrixType = {};
        for (const tool of TOOL_DEFINITIONS_WITH_PERMISSIONS) {
          const isAllowed = serverConfig.allowedTools.includes(tool.name);
          matrix[tool.name] = {
            read: isAllowed && tool.applicablePermissions.includes('read'),
            execute: isAllowed && tool.applicablePermissions.includes('execute'),
            write: isAllowed && tool.applicablePermissions.includes('write'),
          };
        }
        setPermissionMatrix(matrix);
        setQuickMode(detectQuickMode(matrix));
      }
    } catch (err) {
      console.error('Failed to load MCP info:', err);
      setError('Failed to load MCP server information');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle server enable/disable
  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    if (!config || isSaving) return;

    setIsSaving(true);
    try {
      const updatedConfig = await mcpAPI.updateConfig({ isEnabled: enabled });
      setConfig(updatedConfig);
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving]);

  // Handle quick mode change
  const handleQuickModeChange = useCallback(async (mode: PermissionQuickMode) => {
    if (!config || isSaving) return;

    setQuickMode(mode);

    if (mode !== 'custom') {
      const newMatrix = getDefaultPermissionMatrix(mode);
      setPermissionMatrix(newMatrix);

      setIsSaving(true);
      try {
        const oldMode = mode === 'standard' ? 'execute_with_confirm' : mode === 'full_access' ? 'full_access' : 'read_only';
        await mcpAPI.updateConfig({
          permissionMode: oldMode,
          allowedTools: [],
        });
      } catch (err) {
        console.error('Failed to update permission mode:', err);
      } finally {
        setIsSaving(false);
      }
    }
  }, [config, isSaving]);

  // Handle individual permission change
  const handlePermissionChange = useCallback(async (
    toolName: string,
    permissionType: PermissionType,
    value: boolean
  ) => {
    if (!config || isSaving) return;

    const newMatrix = {
      ...permissionMatrix,
      [toolName]: {
        ...permissionMatrix[toolName],
        [permissionType]: value,
      },
    };
    setPermissionMatrix(newMatrix);

    const detectedMode = detectQuickMode(newMatrix);
    setQuickMode(detectedMode);

    setIsSaving(true);
    try {
      const allowedTools = matrixToAllowedTools(newMatrix);
      await mcpAPI.updateConfig({ allowedTools });
    } catch (err) {
      console.error('Failed to update tool permissions:', err);
      setPermissionMatrix(permissionMatrix);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving, permissionMatrix]);

  // Load logs
  const handleLoadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const response = await mcpAPI.getLogs(50);
      setLogsResponse(response);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  // Clear logs
  const handleClearLogs = useCallback(async () => {
    try {
      await mcpAPI.clearLogs();
      setLogsResponse((prev) => prev ? { ...prev, entries: [], totalCount: 0 } : null);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  }, []);

  // Render
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Server className="w-5 h-5" />
            MCP Integration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the Model Context Protocol server for AI tool integration
          </p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Server className="w-5 h-5" />
            MCP Integration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the Model Context Protocol server for AI tool integration
          </p>
        </div>
        <ErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Server className="w-5 h-5" />
          MCP Integration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the Model Context Protocol server for AI tool integration
        </p>
      </div>

      {/* Server Status Card */}
      {serverInfo && config && (
        <ServerStatusCard
          isEnabled={config.isEnabled}
          isAvailable={serverInfo.is_available}
          serverName={serverInfo.name}
          serverVersion={serverInfo.version}
          binaryPath={serverInfo.binary_path}
          onToggleEnabled={handleToggleEnabled}
          isSaving={isSaving}
        />
      )}

      {/* Tabbed Content - only show when enabled */}
      {config?.isEnabled && serverInfo && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Permissions</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Actions</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Activity</span>
            </TabsTrigger>
            <TabsTrigger value="setup" className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>Setup</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              quickMode={quickMode}
              onQuickModeChange={handleQuickModeChange}
              isSaving={isSaving}
              enabledToolCount={enabledToolCount}
              totalToolCount={toolEntries.length}
            />
          </TabsContent>

          <TabsContent value="permissions">
            <PermissionsTab
              toolEntries={toolEntries}
              onPermissionChange={handlePermissionChange}
              isSaving={isSaving}
            />
          </TabsContent>

          <TabsContent value="actions">
            <MCPActionSettings />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab
              logsResponse={logsResponse}
              isLoadingLogs={isLoadingLogs}
              onLoadLogs={handleLoadLogs}
              onClearLogs={handleClearLogs}
            />
          </TabsContent>

          <TabsContent value="setup">
            <SetupTab serverInfo={serverInfo} />
          </TabsContent>
        </Tabs>
      )}

      {/* Disabled state message */}
      {config && !config.isEnabled && (
        <div className="p-6 border border-border rounded-lg bg-muted/20 text-center">
          <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Enable the MCP server to configure permissions and set up AI assistant integrations.
          </p>
        </div>
      )}
    </div>
  );
}

export default McpSettingsFullPanel;
