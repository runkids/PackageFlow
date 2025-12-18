/**
 * MCP Settings Full Panel
 * Redesigned with improved UX, better visual hierarchy, and reduced cognitive load
 * Features: Server status, tabbed content (Overview/Permissions/Actions/Setup)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  AlertCircle,
  FileText,
  Settings2,
  Terminal,
  Eye,
  Play,
  Shield,
  Wrench,
  Zap,
  FolderGit2,
  GitBranch,
  Workflow,
  FileCode,
  Package,
  Target,
  ChevronDown,
  Search,
  ChevronRight,
  Info,
  Sparkles,
  Lock,
} from 'lucide-react';
import { McpIcon } from '../../ui/McpIcon';
import {
  mcpAPI,
  type McpServerInfo,
  type McpServerConfig,
  type McpHealthCheckResult,
  type McpToolInfo,
} from '../../../lib/tauri-api';
import type { DevServerMode } from '../../../types/mcp';
import { cn } from '../../../lib/utils';
import { Skeleton } from '../../ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/Tabs';
import { Progress } from '../../ui/Progress';
import { GradientDivider } from '../../ui/GradientDivider';
import {
  ServerStatusCard,
  type HealthCheckStatus,
  PermissionQuickModeSelector,
  QuickSetupSection,
  MCPActionSettings,
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
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
              categoryConfig.bg,
              categoryConfig.color
            )}
          >
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
// Dev Server Mode Selector Component
// ============================================================================

interface DevServerModeSelectorProps {
  value: DevServerMode;
  onChange: (mode: DevServerMode) => void;
  disabled?: boolean;
}

const DevServerModeSelector: React.FC<DevServerModeSelectorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Dev Server Handling</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Choose how MCP handles long-running dev server commands (npm run dev, pnpm dev, etc.)
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* MCP Managed Option */}
        <button
          type="button"
          onClick={() => onChange('mcp_managed')}
          disabled={disabled}
          className={cn(
            'relative flex flex-col items-start gap-2 p-4 rounded-xl text-left',
            'border-2 transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === 'mcp_managed'
              ? 'bg-primary/5 border-primary/40 shadow-sm'
              : 'bg-card/50 border-border hover:border-primary/30 hover:bg-muted/30',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Selection indicator */}
          {value === 'mcp_managed' && (
            <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />
          )}

          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              value === 'mcp_managed'
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Sparkles className="w-5 h-5" />
          </div>

          <div>
            <span
              className={cn(
                'text-sm font-semibold',
                value === 'mcp_managed' ? 'text-primary' : 'text-foreground'
              )}
            >
              MCP Managed
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              MCP runs dev servers as background processes independently.
            </p>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium mt-1',
              value === 'mcp_managed'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Zap className="w-3 h-3" />
            Default
          </div>
        </button>

        {/* UI Integrated Option */}
        <button
          type="button"
          onClick={() => onChange('ui_integrated')}
          disabled={disabled}
          className={cn(
            'relative flex flex-col items-start gap-2 p-4 rounded-xl text-left',
            'border-2 transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === 'ui_integrated'
              ? 'bg-emerald-500/5 border-emerald-500/40 shadow-sm'
              : 'bg-card/50 border-border hover:border-emerald-500/30 hover:bg-muted/30',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Selection indicator */}
          {value === 'ui_integrated' && (
            <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-500" />
          )}

          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              value === 'ui_integrated'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Eye className="w-5 h-5" />
          </div>

          <div>
            <span
              className={cn(
                'text-sm font-semibold',
                value === 'ui_integrated'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-foreground'
              )}
            >
              UI Integrated
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Processes are tracked in PackageFlow UI for better visibility.
            </p>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium mt-1',
              value === 'ui_integrated'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Server className="w-3 h-3" />
            Recommended
          </div>
        </button>

        {/* Reject with Hint Option */}
        <button
          type="button"
          onClick={() => onChange('reject_with_hint')}
          disabled={disabled}
          className={cn(
            'relative flex flex-col items-start gap-2 p-4 rounded-xl text-left',
            'border-2 transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === 'reject_with_hint'
              ? 'bg-amber-500/5 border-amber-500/40 shadow-sm'
              : 'bg-card/50 border-border hover:border-amber-500/30 hover:bg-muted/30',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {/* Selection indicator */}
          {value === 'reject_with_hint' && (
            <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500" />
          )}

          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              value === 'reject_with_hint'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Lock className="w-5 h-5" />
          </div>

          <div>
            <span
              className={cn(
                'text-sm font-semibold',
                value === 'reject_with_hint'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-foreground'
              )}
            >
              Reject with Hint
            </span>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Reject dev server commands and suggest using UI instead.
            </p>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium mt-1',
              value === 'reject_with_hint'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Shield className="w-3 h-3" />
            Manual Only
          </div>
        </button>
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
  devServerMode: DevServerMode;
  onDevServerModeChange: (mode: DevServerMode) => void;
  isSaving: boolean;
  enabledToolCount: number;
  totalToolCount: number;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  quickMode,
  onQuickModeChange,
  devServerMode,
  onDevServerModeChange,
  isSaving,
  enabledToolCount,
  totalToolCount,
}) => {
  const readToolCount = TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(
    (t) => t.category === 'read'
  ).length;
  const executeToolCount = TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(
    (t) => t.category === 'execute'
  ).length;
  const writeToolCount = TOOL_DEFINITIONS_WITH_PERMISSIONS.filter(
    (t) => t.category === 'write'
  ).length;

  return (
    <div className="space-y-6">
      {/* Permission Mode Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Permission Mode</h3>
        </div>

        <PermissionQuickModeSelector
          value={quickMode}
          onChange={onQuickModeChange}
          disabled={isSaving}
        />
      </section>

      {/* Gradient Divider - R/E/W theme accent */}
      <GradientDivider opacity="medium" variant="normal" />

      {/* Dev Server Mode Section */}
      <section>
        <DevServerModeSelector
          value={devServerMode}
          onChange={onDevServerModeChange}
          disabled={isSaving}
        />
      </section>

      {/* Gradient Divider - R/E/W theme accent */}
      <GradientDivider opacity="medium" variant="normal" />

      {/* Tool Statistics Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Tool Overview</h3>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted">
            {enabledToolCount} / {totalToolCount} active
          </span>
        </div>

        {/* Progress bar - uses R/E/W gradient theme */}
        <Progress
          value={enabledToolCount}
          max={totalToolCount}
          variant="gradient"
          className="h-2"
        />

        {/* Category breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Eye className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">{readToolCount}</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Read</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Play className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">{executeToolCount}</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Execute</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/15">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">{writeToolCount}</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Write</p>
            </div>
          </div>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Fine-tune individual tool permissions in the{' '}
            <span className="font-medium text-foreground">Permissions</span> tab. Custom changes
            will switch the mode to "Custom".
          </p>
        </div>
      </section>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['read', 'execute', 'write'])
  );

  // Filter tools by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return toolEntries;
    const query = searchQuery.toLowerCase();
    return toolEntries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query)
    );
  }, [toolEntries, searchQuery]);

  // Group by category
  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolPermissionEntry[]> = { read: [], execute: [], write: [] };
    filteredEntries.forEach((entry) => {
      groups[entry.category].push(entry);
    });
    return groups;
  }, [filteredEntries]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const categoryConfigs = {
    read: {
      icon: <Eye className="w-4 h-4" />,
      color: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      label: 'Read Tools',
      description: 'Query and view information',
    },
    execute: {
      icon: <Play className="w-4 h-4" />,
      color: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      label: 'Execute Tools',
      description: 'Run workflows and scripts',
    },
    write: {
      icon: <Shield className="w-4 h-4" />,
      color: 'text-rose-500 dark:text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      label: 'Write Tools',
      description: 'Create and modify data',
    },
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools..."
          className={cn(
            'w-full pl-10 pr-4 py-2.5 text-sm rounded-lg',
            'bg-muted/50 border border-border',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
            'transition-colors'
          )}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="sr-only">Clear search</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {filteredEntries.length} tools {searchQuery && `matching "${searchQuery}"`}
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
              R
            </span>
            <span className="text-muted-foreground hidden sm:inline">Read</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
              E
            </span>
            <span className="text-muted-foreground hidden sm:inline">Execute</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-[10px] font-bold text-rose-600 dark:text-rose-400">
              W
            </span>
            <span className="text-muted-foreground hidden sm:inline">Write</span>
          </span>
        </div>
      </div>

      {/* Tools list - Collapsible categories */}
      <div className="space-y-3">
        {(['read', 'execute', 'write'] as const).map((category) => {
          const config = categoryConfigs[category];
          const tools = groupedTools[category];
          const isExpanded = expandedCategories.has(category);

          if (tools.length === 0) return null;

          return (
            <div
              key={category}
              className={cn('border rounded-lg overflow-hidden', config.borderColor, 'bg-card/30')}
            >
              {/* Category Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3',
                  'hover:bg-muted/50 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    config.bgColor
                  )}
                >
                  <span className={config.color}>{config.icon}</span>
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium text-foreground">{config.label}</span>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
                <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted">
                  {tools.length}
                </span>
                <ChevronRight
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform duration-200',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>

              {/* Tools List */}
              {isExpanded && (
                <div className="border-t border-border/50">
                  {tools.map((entry) => (
                    <ToolPermissionRow
                      key={entry.name}
                      entry={entry}
                      onPermissionChange={(type, value) =>
                        onPermissionChange(entry.name, type, value)
                      }
                      disabled={isSaving}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* No results */}
        {filteredEntries.length === 0 && (
          <div className="py-12 text-center">
            <Search className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tools found matching "{searchQuery}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Setup Tab Content
// ============================================================================

interface SetupTabProps {
  serverInfo: McpServerInfo;
  tools: McpToolInfo[];
}

/** MCP Tools data structure */
/** Category icon and color mapping */
const CATEGORY_ICON_MAP: Record<string, { icon: React.ReactNode; iconColor: string }> = {
  'Project Management': { icon: <FolderGit2 className="w-4 h-4" />, iconColor: 'text-blue-500' },
  'Git Worktree': { icon: <GitBranch className="w-4 h-4" />, iconColor: 'text-emerald-500' },
  Workflows: { icon: <Workflow className="w-4 h-4" />, iconColor: 'text-purple-500' },
  Templates: { icon: <FileCode className="w-4 h-4" />, iconColor: 'text-cyan-500' },
  'NPM/Package Scripts': { icon: <Package className="w-4 h-4" />, iconColor: 'text-orange-500' },
  'Background Processes': { icon: <Zap className="w-4 h-4" />, iconColor: 'text-yellow-500' },
  'MCP Actions': { icon: <Target className="w-4 h-4" />, iconColor: 'text-amber-500' },
  'AI Assistant': { icon: <Settings2 className="w-4 h-4" />, iconColor: 'text-violet-500' },
  Notifications: { icon: <AlertCircle className="w-4 h-4" />, iconColor: 'text-pink-500' },
  Security: { icon: <Shield className="w-4 h-4" />, iconColor: 'text-red-500' },
  Deployments: { icon: <Server className="w-4 h-4" />, iconColor: 'text-green-500' },
  'File Operations': { icon: <FileText className="w-4 h-4" />, iconColor: 'text-slate-500' },
  System: { icon: <Wrench className="w-4 h-4" />, iconColor: 'text-gray-500' },
};

/** Default icon for unknown categories */
const DEFAULT_CATEGORY_ICON = { icon: <Wrench className="w-4 h-4" />, iconColor: 'text-gray-500' };

/** Group tools by category */
function groupToolsByCategory(tools: McpToolInfo[]): { name: string; tools: McpToolInfo[] }[] {
  const groups: Record<string, McpToolInfo[]> = {};
  for (const tool of tools) {
    const category = tool.category || 'Uncategorized';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(tool);
  }
  // Sort categories in a logical order
  const orderedCategories = [
    'Project Management',
    'Git Worktree',
    'Workflows',
    'Templates',
    'NPM/Package Scripts',
    'Background Processes',
    'MCP Actions',
    'AI Assistant',
    'Notifications',
    'Security',
    'Deployments',
    'File Operations',
    'System',
  ];
  return orderedCategories
    .filter((cat) => groups[cat])
    .map((cat) => ({ name: cat, tools: groups[cat] }))
    .concat(
      Object.keys(groups)
        .filter((cat) => !orderedCategories.includes(cat))
        .map((cat) => ({ name: cat, tools: groups[cat] }))
    );
}

/** Available Tools Section - now uses dynamic tools from API */
interface AvailableToolsSectionProps {
  tools: McpToolInfo[];
}

const AvailableToolsSection: React.FC<AvailableToolsSectionProps> = ({ tools }) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Group tools by category dynamically
  const categories = useMemo(() => groupToolsByCategory(tools), [tools]);
  const totalTools = tools.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Available Tools</span>
        <span className="text-xs text-muted-foreground">
          ({totalTools} tools in {categories.length} categories)
        </span>
      </div>

      {/* Tip */}
      <p className="text-xs text-muted-foreground">
        Run <code className="px-1.5 py-0.5 bg-muted rounded font-mono">packageflow-mcp --help</code>{' '}
        for detailed documentation
      </p>

      {/* Categories */}
      <div className="space-y-2">
        {categories.map((category) => {
          const iconData = CATEGORY_ICON_MAP[category.name] || DEFAULT_CATEGORY_ICON;
          return (
            <div
              key={category.name}
              className="border border-border rounded-lg overflow-hidden bg-card/50"
            >
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
                <span className={iconData.iconColor}>{iconData.icon}</span>
                <span className="flex-1 text-left font-medium text-foreground text-sm">
                  {category.name}
                </span>
                <span className="text-xs text-muted-foreground">{category.tools.length} tools</span>
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
          );
        })}
      </div>
    </div>
  );
};

const SetupTab: React.FC<SetupTabProps> = ({ serverInfo, tools }) => {
  return (
    <div className="space-y-6 pb-8">
      <QuickSetupSection
        binaryPath={serverInfo.binary_path}
        configJson={serverInfo.config_json}
        configToml={serverInfo.config_toml}
      />

      {/* Gradient Divider - R/E/W theme accent */}
      <GradientDivider opacity="subtle" />

      {/* Available Tools Section */}
      <AvailableToolsSection tools={tools} />
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

  // Tools state - loaded dynamically from backend
  const [tools, setTools] = useState<McpToolInfo[]>([]);

  // Permission state
  const [permissionMatrix, setPermissionMatrix] = useState<ToolPermissionMatrixType>({});
  const [quickMode, setQuickMode] = useState<PermissionQuickMode>('read_only');
  const [devServerMode, setDevServerMode] = useState<DevServerMode>('mcp_managed');

  // Health check state
  const [healthCheckStatus, setHealthCheckStatus] = useState<HealthCheckStatus>('idle');
  const [healthCheckResult, setHealthCheckResult] = useState<McpHealthCheckResult | null>(null);

  // Build tool permission entries from matrix using dynamic tools
  const toolEntries = useMemo<ToolPermissionEntry[]>(() => {
    if (tools.length === 0) {
      // Fallback to static list if tools not loaded yet
      return buildToolPermissionEntries(permissionMatrix);
    }
    // Use dynamic tools from API
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      permissions: permissionMatrix[tool.name] || { read: false, execute: false, write: false },
      applicablePermissions: tool.applicablePermissions,
      category: tool.permissionCategory,
    }));
  }, [permissionMatrix, tools]);

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
      const [info, serverConfig, toolsList] = await Promise.all([
        mcpAPI.getServerInfo(),
        mcpAPI.getConfig(),
        mcpAPI.getTools(),
      ]);

      setServerInfo(info);
      setConfig(serverConfig);
      setTools(toolsList);

      // Initialize devServerMode from config
      setDevServerMode(serverConfig.devServerMode || 'mcp_managed');

      // Initialize permission matrix from config using dynamic tools
      const toolsToUse =
        toolsList.length > 0
          ? toolsList
          : TOOL_DEFINITIONS_WITH_PERMISSIONS.map((t) => ({
              name: t.name,
              description: t.description,
              category: '',
              permissionCategory: t.category as 'read' | 'execute' | 'write',
              applicablePermissions: t.applicablePermissions as ('read' | 'execute' | 'write')[],
            }));

      if (serverConfig.allowedTools.length === 0) {
        let mode: PermissionQuickMode = 'read_only';
        if (serverConfig.permissionMode === 'execute_with_confirm') {
          mode = 'standard';
        } else if (serverConfig.permissionMode === 'full_access') {
          mode = 'full_access';
        }
        setQuickMode(mode);
        // Use dynamic tools for matrix generation
        const matrix: ToolPermissionMatrixType = {};
        for (const tool of toolsToUse) {
          const flags = { read: false, execute: false, write: false };
          switch (mode) {
            case 'read_only':
              if (tool.applicablePermissions.includes('read')) flags.read = true;
              break;
            case 'standard':
              if (tool.applicablePermissions.includes('read')) flags.read = true;
              if (tool.applicablePermissions.includes('execute')) flags.execute = true;
              break;
            case 'full_access':
              if (tool.applicablePermissions.includes('read')) flags.read = true;
              if (tool.applicablePermissions.includes('execute')) flags.execute = true;
              if (tool.applicablePermissions.includes('write')) flags.write = true;
              break;
          }
          matrix[tool.name] = flags;
        }
        setPermissionMatrix(matrix);
      } else {
        const matrix: ToolPermissionMatrixType = {};
        for (const tool of toolsToUse) {
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
  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
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
    },
    [config, isSaving]
  );

  // Handle quick mode change
  const handleQuickModeChange = useCallback(
    async (mode: PermissionQuickMode) => {
      if (!config || isSaving) return;

      setQuickMode(mode);

      if (mode !== 'custom') {
        const newMatrix = getDefaultPermissionMatrix(mode);
        setPermissionMatrix(newMatrix);

        setIsSaving(true);
        try {
          const oldMode =
            mode === 'standard'
              ? 'execute_with_confirm'
              : mode === 'full_access'
                ? 'full_access'
                : 'read_only';
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
    },
    [config, isSaving]
  );

  // Handle dev server mode change
  const handleDevServerModeChange = useCallback(
    async (mode: DevServerMode) => {
      if (!config || isSaving) return;

      setDevServerMode(mode);
      setIsSaving(true);

      try {
        const updatedConfig = await mcpAPI.updateConfig({ devServerMode: mode });
        setConfig(updatedConfig);
      } catch (err) {
        console.error('Failed to update dev server mode:', err);
        // Revert on error
        setDevServerMode(config.devServerMode || 'mcp_managed');
      } finally {
        setIsSaving(false);
      }
    },
    [config, isSaving]
  );

  // Handle individual permission change
  const handlePermissionChange = useCallback(
    async (toolName: string, permissionType: PermissionType, value: boolean) => {
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
    },
    [config, isSaving, permissionMatrix]
  );

  // Test MCP connection
  const handleTestConnection = useCallback(async () => {
    setHealthCheckStatus('testing');
    setHealthCheckResult(null);

    try {
      const result = await mcpAPI.testConnection();
      setHealthCheckResult(result);
      setHealthCheckStatus(result.isHealthy ? 'success' : 'error');

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setHealthCheckStatus('idle');
      }, 5000);
    } catch (err) {
      console.error('Failed to test MCP connection:', err);
      setHealthCheckStatus('error');
      setHealthCheckResult({
        isHealthy: false,
        version: null,
        responseTimeMs: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
        binaryPath: serverInfo?.binary_path || '',
        envType: serverInfo?.env_type || '',
      });

      // Reset to idle after 5 seconds
      setTimeout(() => {
        setHealthCheckStatus('idle');
      }, 5000);
    }
  }, [serverInfo]);

  // Render header component for reuse
  const renderHeader = () => (
    <div>
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <McpIcon className="w-5 h-5" />
        MCP Integration
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Configure the Model Context Protocol server for AI tool integration
      </p>
    </div>
  );

  // Render
  if (isLoading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 pb-4">{renderHeader()}</div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 pb-4">{renderHeader()}</div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ErrorState message={error} onRetry={loadData} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky Header Section with Gradient Theme */}
      <div className="shrink-0 space-y-4 pb-4">
        {/* Header with gradient accent */}
        {renderHeader()}

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
            onTestConnection={handleTestConnection}
            healthCheckStatus={healthCheckStatus}
            healthCheckResult={healthCheckResult}
          />
        )}
      </div>

      {/* Tabbed Content - only show when enabled */}
      {config?.isEnabled && serverInfo && (
        <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
          {/* Sticky TabsList */}
          <div className="shrink-0 pb-4">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="permissions" className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Permissions</span>
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Actions</span>
              </TabsTrigger>
              <TabsTrigger value="setup" className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Setup</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable TabsContent Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                quickMode={quickMode}
                onQuickModeChange={handleQuickModeChange}
                devServerMode={devServerMode}
                onDevServerModeChange={handleDevServerModeChange}
                isSaving={isSaving}
                enabledToolCount={enabledToolCount}
                totalToolCount={toolEntries.length}
              />
            </TabsContent>

            <TabsContent value="permissions" className="mt-0">
              <PermissionsTab
                toolEntries={toolEntries}
                onPermissionChange={handlePermissionChange}
                isSaving={isSaving}
              />
            </TabsContent>

            <TabsContent value="actions" className="mt-0">
              <MCPActionSettings />
            </TabsContent>

            <TabsContent value="setup" className="mt-0">
              <SetupTab serverInfo={serverInfo} tools={tools} />
            </TabsContent>
          </div>
        </Tabs>
      )}

      {/* Disabled state message */}
      {config && !config.isEnabled && (
        <div className="relative p-6 rounded-xl text-center overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-amber-500/5 to-rose-500/5" />
          <div className="absolute inset-0 border border-border/50 rounded-xl" />

          <div className="relative">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500/10 via-amber-500/10 to-rose-500/10 flex items-center justify-center">
              <McpIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Enable the MCP server to configure permissions and set up AI assistant integrations.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default McpSettingsFullPanel;
