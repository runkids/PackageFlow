/**
 * MCP Settings Panel Component
 * Redesigned with improved UX: tab navigation, progressive disclosure, and better visual hierarchy
 * For integration with Claude Code, VS Code MCP, or Codex CLI
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Server,
  Copy,
  Check,
  AlertCircle,
  Wrench,
  FileJson,
  Terminal,
  Settings2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Shield,
  Eye,
  Pencil,
  Play,
  FileText,
  Trash2,
  Clock,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  mcpAPI,
  type McpServerInfo,
  type McpToolInfo,
  type McpServerConfig,
  type McpPermissionMode,
  type McpToolWithPermission,
  type McpToolCategory,
  type McpLogsResponse,
} from '../../lib/tauri-api';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/Dialog';
import { Skeleton } from '../ui/Skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Collapsible, CollapsibleCard } from '../ui/Collapsible';
import { Toggle } from '../ui/Toggle';
import { Checkbox } from '../ui/Checkbox';
import { MCPActionSettings, MCPActionHistory } from './mcp';

// ============================================================================
// Types
// ============================================================================

interface McpSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied';

type ClientType = 'claude-code' | 'vscode' | 'codex' | 'gemini';

interface ClientConfig {
  id: ClientType;
  name: string;
  icon: React.ReactNode;
  command?: string;
  commandLabel?: string;
  configFormat: 'json' | 'toml';
  steps: string[];
}

// ============================================================================
// Constants
// ============================================================================

const CLIENT_CONFIGS: ClientConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: <Terminal className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Run the command below in your terminal',
      'Restart Claude Code to apply changes',
    ],
  },
  {
    id: 'vscode',
    name: 'VS Code (Continue / Cline)',
    icon: <Settings2 className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Open your MCP extension settings',
      'Find the MCP servers configuration',
      'Paste the JSON configuration below',
      'Reload the window',
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: <Terminal className="w-4 h-4" />,
    configFormat: 'toml',
    steps: [
      'Run the command below in your terminal',
      'Or manually add to ~/.codex/config.toml',
      'Restart Codex to apply changes',
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    icon: <Terminal className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Run the command below in your terminal',
      'Or manually add to ~/.gemini/settings.json',
      'Restart Gemini CLI to apply changes',
    ],
  },
];

/** Permission mode configuration */
interface PermissionModeConfig {
  id: McpPermissionMode;
  name: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  bgActiveClass: string;
  checkClass: string;
  icon: React.ReactNode;
}

const PERMISSION_MODE_CONFIGS: PermissionModeConfig[] = [
  {
    id: 'read_only',
    name: 'Read Only',
    description: 'AI can only read project information. No modifications or executions allowed.',
    badgeClass: 'bg-blue-500/10 text-blue-500',
    borderClass: 'border-blue-500',
    bgActiveClass: 'bg-blue-500/5',
    checkClass: 'text-blue-500',
    icon: <Eye className="w-4 h-4" />,
  },
  {
    id: 'execute_with_confirm',
    name: 'Execute Only',
    description: 'AI can read and execute workflows, but cannot create or modify them.',
    badgeClass: 'bg-yellow-500/10 text-yellow-500',
    borderClass: 'border-yellow-500',
    bgActiveClass: 'bg-yellow-500/5',
    checkClass: 'text-yellow-500',
    icon: <Play className="w-4 h-4" />,
  },
  {
    id: 'full_access',
    name: 'Full Access',
    description: 'AI has full access to all tools including creating and modifying workflows.',
    badgeClass: 'bg-red-500/10 text-red-500',
    borderClass: 'border-red-500',
    bgActiveClass: 'bg-red-500/5',
    checkClass: 'text-red-500',
    icon: <Shield className="w-4 h-4" />,
  },
];

/** Tool category display configuration */
const TOOL_CATEGORY_CONFIGS: Record<McpToolCategory, { name: string; icon: React.ReactNode; badgeClass: string }> = {
  read: {
    name: 'Read',
    icon: <Eye className="w-3.5 h-3.5" />,
    badgeClass: 'bg-blue-500/10 text-blue-500',
  },
  write: {
    name: 'Write',
    icon: <Pencil className="w-3.5 h-3.5" />,
    badgeClass: 'bg-yellow-500/10 text-yellow-500',
  },
  execute: {
    name: 'Execute',
    icon: <Play className="w-3.5 h-3.5" />,
    badgeClass: 'bg-red-500/10 text-red-500',
  },
};

// ============================================================================
// Sub-components
// ============================================================================

/** Status badge for server availability */
const StatusBadge: React.FC<{ isAvailable: boolean }> = ({ isAvailable }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
      isAvailable
        ? 'bg-green-500/10 text-green-500'
        : 'bg-red-500/10 text-red-500'
    )}
  >
    {isAvailable ? (
      <>
        <CheckCircle2 className="w-3 h-3" />
        <span>Ready</span>
      </>
    ) : (
      <>
        <XCircle className="w-3 h-3" />
        <span>Not Available</span>
      </>
    )}
  </span>
);

/** Copy button with success feedback */
const CopyButton: React.FC<{
  text: string;
  label?: string;
  variant?: 'icon' | 'button';
}> = ({ text, label, variant = 'icon' }) => {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text]);

  if (variant === 'button') {
    return (
      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
          'text-xs font-medium',
          'bg-primary/10 text-primary',
          'hover:bg-primary/20 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          copyState === 'copied' && 'bg-green-500/10 text-green-500'
        )}
      >
        {copyState === 'copied' ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>{label || 'Copy'}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        'text-muted-foreground hover:text-foreground',
        'hover:bg-accent',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        copyState === 'copied' && 'text-green-500 hover:text-green-500'
      )}
      title={copyState === 'copied' ? 'Copied!' : label || 'Copy'}
      aria-label={label || 'Copy to clipboard'}
    >
      {copyState === 'copied' ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
};

/** Code block with copy button */
const CodeBlock: React.FC<{
  code: string;
  copyLabel?: string;
  maxHeight?: string;
}> = ({ code, copyLabel, maxHeight = 'max-h-48' }) => (
  <div className="relative group">
    <pre
      className={cn(
        'text-xs font-mono p-3 rounded-lg overflow-x-auto',
        'bg-muted/50 border border-border',
        maxHeight
      )}
    >
      <code className="text-foreground whitespace-pre">{code}</code>
    </pre>
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <CopyButton text={code} label={copyLabel} variant="button" />
    </div>
  </div>
);

/** Command line with copy button */
const CommandLine: React.FC<{
  command: string;
  label?: string;
}> = ({ command, label }) => (
  <div className="flex items-center gap-2 p-2 bg-muted/50 border border-border rounded-lg">
    <code className="flex-1 text-xs font-mono text-foreground truncate">
      $ {command}
    </code>
    <CopyButton text={command} label={label || 'Copy command'} />
  </div>
);

/** Quick setup card for a specific client */
const ClientSetupCard: React.FC<{
  client: ClientConfig;
  serverInfo: McpServerInfo;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ client, serverInfo, isExpanded, onToggle }) => {
  const command = client.id === 'claude-code'
    ? `claude mcp add packageflow ${serverInfo.binary_path}`
    : client.id === 'codex'
    ? `codex mcp add packageflow ${serverInfo.binary_path}`
    : client.id === 'gemini'
    ? `gemini mcp add packageflow ${serverInfo.binary_path}`
    : undefined;

  const config = client.configFormat === 'json'
    ? serverInfo.config_json
    : serverInfo.config_toml;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 p-3',
          'hover:bg-accent/50 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        )}
      >
        <span className="text-muted-foreground">{client.icon}</span>
        <span className="flex-1 text-left font-medium text-foreground">
          {client.name}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-border bg-muted/20">
          {/* Steps */}
          <ol className="space-y-1.5 text-xs text-muted-foreground pt-4">
            {client.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Command (if available) */}
          {command && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Quick Command</label>
              <CommandLine command={command} />
            </div>
          )}

          {/* Configuration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {client.configFormat === 'json' ? 'JSON Configuration' : 'TOML Configuration'}
            </label>
            <CodeBlock
              code={config}
              copyLabel={`Copy ${client.configFormat.toUpperCase()} config`}
              maxHeight="max-h-32"
            />
          </div>
        </div>
      )}
    </div>
  );
};

/** Tool category group */
const ToolCategoryGroup: React.FC<{
  category: string;
  tools: McpToolInfo[];
}> = ({ category, tools }) => (
  <Collapsible
    trigger={
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-sm font-medium text-foreground capitalize">{category}</span>
        <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">
          {tools.length}
        </span>
      </div>
    }
    defaultOpen={false}
    contentClassName="pl-4 space-y-1"
  >
    {tools.map((tool) => (
      <div
        key={tool.name}
        className="py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
      >
        <code className="text-xs font-mono text-primary">{tool.name}</code>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {tool.description}
        </p>
      </div>
    ))}
  </Collapsible>
);

/** Loading skeleton */
const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-lg" />
      <div className="flex-1">
        <Skeleton className="w-32 h-5 mb-1" />
        <Skeleton className="w-48 h-4" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full" />
    </div>
    <Skeleton className="w-full h-24 rounded-lg" />
    <Skeleton className="w-full h-24 rounded-lg" />
  </div>
);

/** Error state */
const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <AlertCircle className="w-10 h-10 text-destructive mb-3" />
    <p className="text-sm text-muted-foreground mb-4">{message}</p>
    <button
      onClick={onRetry}
      className={cn(
        'px-4 py-2 rounded-lg text-sm',
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
// Settings Tab Components
// ============================================================================

/** Permission mode selector card */
const PermissionModeCard: React.FC<{
  mode: PermissionModeConfig;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}> = ({ mode, isSelected, onSelect, disabled }) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled}
    className={cn(
      'w-full p-3 rounded-lg text-left transition-all duration-150',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      isSelected
        ? cn('border-2', mode.borderClass, mode.bgActiveClass)
        : 'border border-border hover:border-muted-foreground/50 hover:bg-accent/30'
    )}
  >
    <div className="flex items-start gap-3">
      <span className={cn('p-2 rounded-md', mode.badgeClass)}>{mode.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{mode.name}</span>
          {isSelected && (
            <CheckCircle2 className={cn('w-4 h-4', mode.checkClass)} />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {mode.description}
        </p>
      </div>
    </div>
  </button>
);

/** Tool permission item in the permission matrix */
const ToolPermissionItem: React.FC<{
  tool: McpToolWithPermission;
  isCustomMode: boolean;
  isChecked: boolean;
  onToggle: (toolName: string, checked: boolean) => void;
  disabled?: boolean;
}> = ({ tool, isCustomMode, isChecked, onToggle, disabled }) => {
  const categoryConfig = TOOL_CATEGORY_CONFIGS[tool.category];

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md',
        'transition-colors',
        isCustomMode ? 'hover:bg-muted/50' : 'opacity-75'
      )}
    >
      {isCustomMode ? (
        <Checkbox
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(tool.name, checked)}
          disabled={disabled}
          size="sm"
        />
      ) : (
        <span
          className={cn(
            'w-3.5 h-3.5 rounded-full flex items-center justify-center',
            tool.isAllowed ? 'bg-green-500' : 'bg-muted-foreground/30'
          )}
        >
          {tool.isAllowed && <Check className="w-2 h-2 text-white" />}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-foreground">{tool.name}</code>
          <span
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-medium rounded-full',
              categoryConfig.badgeClass
            )}
          >
            {categoryConfig.name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {tool.description}
        </p>
      </div>
    </div>
  );
};

/** Tool permission section by category */
const ToolCategorySection: React.FC<{
  category: McpToolCategory;
  tools: McpToolWithPermission[];
  isCustomMode: boolean;
  customAllowedTools: string[];
  onToggleTool: (toolName: string, checked: boolean) => void;
  disabled?: boolean;
}> = ({ category, tools, isCustomMode, customAllowedTools, onToggleTool, disabled }) => {
  const config = TOOL_CATEGORY_CONFIGS[category];
  const allowedCount = tools.filter((t) =>
    isCustomMode ? customAllowedTools.includes(t.name) : t.isAllowed
  ).length;

  return (
    <Collapsible
      trigger={
        <div className="flex items-center gap-2 py-2">
          <span className={cn('p-1 rounded', config.badgeClass)}>{config.icon}</span>
          <span className="text-sm font-medium text-foreground">{config.name}</span>
          <span className="text-xs text-muted-foreground">
            ({allowedCount}/{tools.length})
          </span>
        </div>
      }
      defaultOpen={category === 'read'}
      contentClassName="space-y-1 pb-2"
    >
      {tools.map((tool) => (
        <ToolPermissionItem
          key={tool.name}
          tool={tool}
          isCustomMode={isCustomMode}
          isChecked={
            isCustomMode ? customAllowedTools.includes(tool.name) : tool.isAllowed
          }
          onToggle={onToggleTool}
          disabled={disabled}
        />
      ))}
    </Collapsible>
  );
};

/** Current permissions summary badge */
const PermissionSummaryBadge: React.FC<{
  config: McpServerConfig;
}> = ({ config }) => {
  const modeConfig = PERMISSION_MODE_CONFIGS.find((m) => m.id === config.permissionMode);

  if (!config.isEnabled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        <XCircle className="w-3 h-3" />
        <span>Disabled</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
        modeConfig?.badgeClass
      )}
    >
      {modeConfig?.icon}
      <span>{modeConfig?.name}</span>
    </span>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function McpSettingsPanel({ isOpen, onClose }: McpSettingsPanelProps) {
  const [serverInfo, setServerInfo] = useState<McpServerInfo | null>(null);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<ClientType>('claude-code');

  // Settings tab state
  const [config, setConfig] = useState<McpServerConfig | null>(null);
  const [toolsWithPermissions, setToolsWithPermissions] = useState<McpToolWithPermission[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [customAllowedTools, setCustomAllowedTools] = useState<string[]>([]);
  const [useCustomTools, setUseCustomTools] = useState(false);

  // Logs state
  const [logsResponse, setLogsResponse] = useState<McpLogsResponse | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Load MCP server info and tools
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [info, toolsList, serverConfig, toolsPerms] = await Promise.all([
        mcpAPI.getServerInfo(),
        mcpAPI.getTools(),
        mcpAPI.getConfig(),
        mcpAPI.getToolsWithPermissions(),
      ]);
      setServerInfo(info);
      setTools(toolsList);
      setConfig(serverConfig);
      setToolsWithPermissions(toolsPerms);
      // Initialize custom tools if there are any in config
      if (serverConfig.allowedTools.length > 0) {
        setCustomAllowedTools(serverConfig.allowedTools);
        setUseCustomTools(true);
      } else {
        setUseCustomTools(false);
        // Initialize from current permissions
        setCustomAllowedTools(toolsPerms.filter((t) => t.isAllowed).map((t) => t.name));
      }
    } catch (err) {
      console.error('Failed to load MCP info:', err);
      setError('Failed to load MCP server information');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle permission mode change
  const handlePermissionModeChange = useCallback(async (mode: McpPermissionMode) => {
    if (!config || isSaving) return;

    setIsSaving(true);
    try {
      const updatedConfig = await mcpAPI.updateConfig({
        permissionMode: mode,
        allowedTools: [], // Clear custom tools when changing mode
      });
      setConfig(updatedConfig);
      setUseCustomTools(false);
      // Refresh tools with permissions
      const toolsPerms = await mcpAPI.getToolsWithPermissions();
      setToolsWithPermissions(toolsPerms);
      setCustomAllowedTools(toolsPerms.filter((t) => t.isAllowed).map((t) => t.name));
    } catch (err) {
      console.error('Failed to update permission mode:', err);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving]);

  // Handle server enable/disable toggle
  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    if (!config || isSaving) return;

    setIsSaving(true);
    try {
      const updatedConfig = await mcpAPI.updateConfig({ isEnabled: enabled });
      setConfig(updatedConfig);
      // Refresh tools with permissions
      const toolsPerms = await mcpAPI.getToolsWithPermissions();
      setToolsWithPermissions(toolsPerms);
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving]);

  // Handle individual tool permission toggle (custom mode)
  const handleToggleTool = useCallback(async (toolName: string, checked: boolean) => {
    if (!config || isSaving) return;

    const newAllowedTools = checked
      ? [...customAllowedTools, toolName]
      : customAllowedTools.filter((t) => t !== toolName);

    setCustomAllowedTools(newAllowedTools);
    setUseCustomTools(true);

    setIsSaving(true);
    try {
      const updatedConfig = await mcpAPI.updateConfig({ allowedTools: newAllowedTools });
      setConfig(updatedConfig);
      // Refresh tools with permissions
      const toolsPerms = await mcpAPI.getToolsWithPermissions();
      setToolsWithPermissions(toolsPerms);
    } catch (err) {
      console.error('Failed to update tool permissions:', err);
      // Revert on error
      setCustomAllowedTools(customAllowedTools);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving, customAllowedTools]);

  // Reset to permission mode defaults
  const handleResetToDefaults = useCallback(async () => {
    if (!config || isSaving) return;

    setIsSaving(true);
    try {
      const updatedConfig = await mcpAPI.updateConfig({ allowedTools: [] });
      setConfig(updatedConfig);
      setUseCustomTools(false);
      // Refresh tools with permissions
      const toolsPerms = await mcpAPI.getToolsWithPermissions();
      setToolsWithPermissions(toolsPerms);
      setCustomAllowedTools(toolsPerms.filter((t) => t.isAllowed).map((t) => t.name));
    } catch (err) {
      console.error('Failed to reset permissions:', err);
    } finally {
      setIsSaving(false);
    }
  }, [config, isSaving]);

  // Load logs
  const handleLoadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const response = await mcpAPI.getLogs(50);
      setLogsResponse(response);
      setShowLogs(true);
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

  // Format timestamp for display
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-TW', {
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

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped = new Map<string, McpToolInfo[]>();
    tools.forEach((tool) => {
      const category = tool.category || 'other';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(tool);
    });
    return grouped;
  }, [tools]);

  // Group tools with permissions by category for settings tab
  const toolsWithPermsByCategory = useMemo(() => {
    const grouped = new Map<McpToolCategory, McpToolWithPermission[]>();
    const categories: McpToolCategory[] = ['read', 'write', 'execute'];
    categories.forEach((cat) => grouped.set(cat, []));

    toolsWithPermissions.forEach((tool) => {
      grouped.get(tool.category)?.push(tool);
    });
    return grouped;
  }, [toolsWithPermissions]);

  const formatPath = (path: string): string => {
    const homeMatch = path.match(/^\/Users\/[^/]+/) || path.match(/^\/home\/[^/]+/);
    if (homeMatch) {
      return path.replace(homeMatch[0], '~');
    }
    return path;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <span>MCP Integration</span>
          </DialogTitle>
          <DialogClose onClick={onClose} />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 pr-2 -mr-2">
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={loadData} />
          ) : serverInfo ? (
            <Tabs defaultValue="setup" className="space-y-4">
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="setup">
                  Setup
                </TabsTrigger>
                <TabsTrigger value="settings">
                  Settings
                </TabsTrigger>
                <TabsTrigger value="actions">
                  Actions
                </TabsTrigger>
                <TabsTrigger value="history">
                  History
                </TabsTrigger>
                <TabsTrigger value="details">
                  Details
                </TabsTrigger>
              </TabsList>

              {/* Quick Setup Tab */}
              <TabsContent value="setup" className="space-y-4">
                {/* Server Status Header */}
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10">
                    <Server className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {serverInfo.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        v{serverInfo.version}
                      </span>
                    </div>
                    <p
                      className="text-xs text-muted-foreground truncate"
                      title={serverInfo.binary_path}
                    >
                      {formatPath(serverInfo.binary_path)}
                    </p>
                  </div>
                  <StatusBadge isAvailable={serverInfo.is_available} />
                </div>

                {/* Client Setup Cards */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">
                    Choose your AI assistant
                  </h4>
                  <div className="space-y-2">
                  {CLIENT_CONFIGS.map((client) => (
                    <ClientSetupCard
                      key={client.id}
                      client={client}
                      serverInfo={serverInfo}
                      isExpanded={expandedClient === client.id}
                      onToggle={() =>
                        setExpandedClient(
                          expandedClient === client.id ? (null as unknown as ClientType) : client.id
                        )
                      }
                    />
                  ))}
                  </div>
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4">
                {config && (
                  <>
                    {/* Server Enable Toggle */}
                    <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10">
                          <Server className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">MCP Server</span>
                          <p className="text-xs text-muted-foreground truncate">
                            Allow AI assistants to interact with PackageFlow
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {config && <PermissionSummaryBadge config={config} />}
                        <Toggle
                          checked={config.isEnabled}
                          onChange={handleToggleEnabled}
                          disabled={isSaving}
                          aria-label="Enable MCP Server"
                        />
                      </div>
                    </div>

                    {/* Permission Mode Selection */}
                    <div className={cn('space-y-3', !config.isEnabled && 'opacity-50 pointer-events-none')}>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">Permission Mode</h4>
                        {useCustomTools && (
                          <button
                            onClick={handleResetToDefaults}
                            disabled={isSaving}
                            className={cn(
                              'text-xs text-primary hover:text-primary/80',
                              'focus:outline-none focus-visible:underline',
                              'disabled:opacity-50'
                            )}
                          >
                            Reset to defaults
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {PERMISSION_MODE_CONFIGS.map((mode) => (
                          <PermissionModeCard
                            key={mode.id}
                            mode={mode}
                            isSelected={config.permissionMode === mode.id && !useCustomTools}
                            onSelect={() => handlePermissionModeChange(mode.id)}
                            disabled={isSaving || !config.isEnabled}
                          />
                        ))}
                      </div>
                      {useCustomTools && (
                        <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            Custom permissions are in use. Click &quot;Reset to defaults&quot; to return to a preset mode.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Tool Permissions */}
                    <CollapsibleCard
                      icon={<Wrench className="w-4 h-4" />}
                      title="Tool Permissions"
                      subtitle={useCustomTools ? 'Custom' : config.permissionMode.replace('_', ' ')}
                      badge={
                        <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">
                          {toolsWithPermissions.filter((t) =>
                            useCustomTools ? customAllowedTools.includes(t.name) : t.isAllowed
                          ).length}/{toolsWithPermissions.length}
                        </span>
                      }
                      defaultOpen={false}
                    >
                      <div className={cn('mt-2 space-y-2', !config.isEnabled && 'opacity-50 pointer-events-none')}>
                        <p className="text-xs text-muted-foreground mb-3">
                          {useCustomTools
                            ? 'Customize which tools AI can access. Changes are saved automatically.'
                            : 'Toggle individual tools to customize permissions (this will override the preset mode).'}
                        </p>
                        {(['read', 'write', 'execute'] as McpToolCategory[]).map((category) => {
                          const categoryTools = toolsWithPermsByCategory.get(category) || [];
                          if (categoryTools.length === 0) return null;
                          return (
                            <ToolCategorySection
                              key={category}
                              category={category}
                              tools={categoryTools}
                              isCustomMode={useCustomTools}
                              customAllowedTools={customAllowedTools}
                              onToggleTool={handleToggleTool}
                              disabled={isSaving || !config.isEnabled}
                            />
                          );
                        })}
                      </div>
                    </CollapsibleCard>

                    {/* Request Logs */}
                    <div className={cn('space-y-3', !config.isEnabled && 'opacity-50 pointer-events-none')}>
                      <h4 className="text-sm font-medium text-foreground">Request Logs</h4>
                      <div className="p-3 border border-border rounded-lg space-y-3">
                        {/* View Logs Button */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm text-foreground">MCP Tool Call History</span>
                              <p className="text-xs text-muted-foreground">
                                View write and execute operation logs
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleLoadLogs}
                            disabled={isLoadingLogs || !config.isEnabled}
                            className={cn(
                              'flex items-center gap-2 text-sm text-primary hover:text-primary/80',
                              'focus:outline-none focus-visible:underline',
                              'disabled:opacity-50'
                            )}
                          >
                            {isLoadingLogs ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ExternalLink className="w-3.5 h-3.5" />
                            )}
                            <span>{showLogs ? 'Refresh Logs' : 'View Logs'}</span>
                          </button>
                        </div>

                        {/* Logs Viewer */}
                        {showLogs && logsResponse && (
                          <div className="pt-2 border-t border-border space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Showing {logsResponse.entries.length} of {logsResponse.totalCount} entries
                              </span>
                              <button
                                onClick={handleClearLogs}
                                className={cn(
                                  'flex items-center gap-1 text-xs text-destructive hover:text-destructive/80',
                                  'focus:outline-none focus-visible:underline'
                                )}
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Clear</span>
                              </button>
                            </div>

                            {logsResponse.entries.length === 0 ? (
                              <div className="py-4 text-center text-sm text-muted-foreground">
                                No logs yet
                              </div>
                            ) : (
                              <div className="max-h-48 overflow-y-auto space-y-1.5">
                                {logsResponse.entries.map((entry, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      'p-2 rounded-md text-xs',
                                      entry.result === 'success'
                                        ? 'bg-green-500/5 border border-green-500/20'
                                        : entry.result === 'permission_denied'
                                        ? 'bg-yellow-500/5 border border-yellow-500/20'
                                        : 'bg-red-500/5 border border-red-500/20'
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <code className="font-mono font-medium text-foreground">
                                        {entry.tool}
                                      </code>
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {entry.durationMs}ms
                                        </span>
                                        <span>{formatTimestamp(entry.timestamp)}</span>
                                      </div>
                                    </div>
                                    {entry.error && (
                                      <p className="mt-1 text-destructive truncate" title={entry.error}>
                                        {entry.error}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Actions Tab - MCP Action Permissions (021-mcp-actions) */}
              <TabsContent value="actions" className="space-y-4">
                <MCPActionSettings />
              </TabsContent>

              {/* History Tab - Execution History (021-mcp-actions) */}
              <TabsContent value="history" className="space-y-4">
                <MCPActionHistory maxHeight="350px" />
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4">
                {/* Server Information */}
                <CollapsibleCard
                  icon={<Server className="w-4 h-4" />}
                  title="Server Information"
                  badge={<StatusBadge isAvailable={serverInfo.is_available} />}
                  defaultOpen
                >
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-mono text-foreground">{serverInfo.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-foreground">{serverInfo.version}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Binary Path</span>
                      <div className="mt-1 flex items-center gap-2">
                        <code
                          className="flex-1 text-xs font-mono text-foreground bg-muted/50 px-2 py-1.5 rounded truncate"
                          title={serverInfo.binary_path}
                        >
                          {formatPath(serverInfo.binary_path)}
                        </code>
                        <CopyButton text={serverInfo.binary_path} label="Copy path" />
                      </div>
                    </div>
                  </div>
                </CollapsibleCard>

                {/* Configuration Files */}
                <CollapsibleCard
                  icon={<FileJson className="w-4 h-4" />}
                  title="Configuration Files"
                  subtitle="JSON and TOML formats"
                  defaultOpen={false}
                >
                  <div className="space-y-3 mt-2">
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1.5 block">
                        JSON (Claude Code / VS Code)
                      </label>
                      <CodeBlock code={serverInfo.config_json} copyLabel="Copy JSON" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground mb-1.5 block">
                        TOML (Codex)
                      </label>
                      <CodeBlock code={serverInfo.config_toml} copyLabel="Copy TOML" />
                    </div>
                  </div>
                </CollapsibleCard>

                {/* Available Tools */}
                <CollapsibleCard
                  icon={<Wrench className="w-4 h-4" />}
                  title="Available Tools"
                  badge={
                    <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">
                      {tools.length}
                    </span>
                  }
                  defaultOpen={false}
                >
                  <div className="mt-2 space-y-1">
                    {toolsByCategory.size > 0 ? (
                      Array.from(toolsByCategory.entries()).map(([category, categoryTools]) => (
                        <ToolCategoryGroup
                          key={category}
                          category={category}
                          tools={categoryTools}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No tools available
                      </p>
                    )}
                  </div>
                </CollapsibleCard>
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
