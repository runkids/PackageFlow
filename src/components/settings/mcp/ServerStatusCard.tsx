/**
 * ServerStatusCard Component
 * A compact status card showing MCP server status with enable/disable toggle
 *
 * Uses the R/E/W gradient theme (blue → amber → rose) for visual consistency
 */

import React from 'react';
import { CheckCircle2, XCircle, Loader2, Activity } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { McpIcon } from '../../ui/McpIcon';
import { Toggle } from '../../ui/Toggle';
import { useSettings } from '../../../contexts/SettingsContext';
import type { McpHealthCheckResult } from '../../../lib/tauri-api';

/** Health check status for display */
export type HealthCheckStatus = 'idle' | 'testing' | 'success' | 'error';

interface ServerStatusCardProps {
  /** Whether the server is enabled */
  isEnabled: boolean;
  /** Whether the server is available/running */
  isAvailable: boolean;
  /** Server name */
  serverName?: string;
  /** Server version */
  serverVersion?: string;
  /** Binary path (shown on hover) */
  binaryPath?: string;
  /** Called when enable state changes */
  onToggleEnabled: (enabled: boolean) => void;
  /** Whether a save operation is in progress */
  isSaving?: boolean;
  /** Called when test connection button is clicked */
  onTestConnection?: () => void;
  /** Health check status */
  healthCheckStatus?: HealthCheckStatus;
  /** Health check result (when status is success or error) */
  healthCheckResult?: McpHealthCheckResult | null;
  /** Additional class name */
  className?: string;
}

export const ServerStatusCard: React.FC<ServerStatusCardProps> = ({
  isEnabled,
  isAvailable,
  serverName = 'packageflow-mcp',
  serverVersion,
  binaryPath,
  onToggleEnabled,
  isSaving = false,
  onTestConnection,
  healthCheckStatus = 'idle',
  healthCheckResult,
  className,
}) => {
  // Use settings context for path formatting (respects Compact Paths setting)
  const { formatPath } = useSettings();

  return (
    <div className={cn('relative', className)}>
      {/* Gradient border wrapper */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl',
          'bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500',
          'transition-opacity duration-300',
          isEnabled ? 'opacity-100' : 'opacity-30'
        )}
      />

      {/* Inner content with background */}
      <div
        className={cn(
          'relative flex items-center gap-4 p-4 rounded-[11px] m-[1px]',
          'bg-card/95 dark:bg-card/90 backdrop-blur-sm',
          'transition-all duration-300'
        )}
      >
        {/* Icon with gradient background and R/E/W gradient icon */}
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
            'transition-all duration-300',
            isEnabled
              ? 'bg-gradient-to-br from-blue-500/15 via-amber-500/15 to-rose-500/15'
              : 'bg-muted'
          )}
        >
          <McpIcon
            className={cn('w-6 h-6', !isEnabled && 'text-muted-foreground')}
            rewGradient={isEnabled}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{serverName}</span>
            {serverVersion && (
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted/80 rounded">
                v{serverVersion}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Allow AI assistants to interact with PackageFlow
          </p>
          {binaryPath && (
            <div className="relative group mt-1">
              <p className="text-xs text-muted-foreground/70 truncate font-mono cursor-help">
                {formatPath(binaryPath)}
              </p>
              {/* Full path tooltip on hover */}
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-50',
                  'px-2.5 py-1.5 rounded-lg',
                  'bg-popover border border-border shadow-lg',
                  'text-xs font-mono text-foreground',
                  'whitespace-nowrap',
                  'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                  'transition-all duration-200',
                  'pointer-events-none'
                )}
              >
                {formatPath(binaryPath)}
              </div>
            </div>
          )}
        </div>

        {/* Status & Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Health Check Button */}
          {isEnabled && isAvailable && onTestConnection && (
            <button
              onClick={onTestConnection}
              disabled={healthCheckStatus === 'testing'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                'transition-all duration-200',
                'border',
                healthCheckStatus === 'testing' &&
                  'bg-muted border-border text-muted-foreground cursor-wait',
                healthCheckStatus === 'success' &&
                  'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
                healthCheckStatus === 'error' &&
                  'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',
                healthCheckStatus === 'idle' &&
                  'bg-muted/50 border-border hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-foreground',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
              )}
              title={
                healthCheckResult
                  ? healthCheckResult.isHealthy
                    ? `Healthy (${healthCheckResult.responseTimeMs}ms)`
                    : healthCheckResult.error || 'Health check failed'
                  : 'Test MCP server connection'
              }
            >
              {healthCheckStatus === 'testing' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : healthCheckStatus === 'success' ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{healthCheckResult?.responseTimeMs}ms</span>
                </>
              ) : healthCheckStatus === 'error' ? (
                <>
                  <XCircle className="w-3 h-3" />
                  <span>Failed</span>
                </>
              ) : (
                <>
                  <Activity className="w-3 h-3" />
                  <span>Test</span>
                </>
              )}
            </button>
          )}

          {/* Status badge */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'transition-all duration-300',
              isEnabled &&
                isAvailable &&
                'bg-gradient-to-r from-emerald-500/80 to-blue-500/80 text-white shadow-sm',
              isEnabled && !isAvailable && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              !isEnabled && 'bg-muted text-muted-foreground'
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Saving...</span>
              </>
            ) : isEnabled && isAvailable ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                <span>Ready</span>
              </>
            ) : isEnabled ? (
              <>
                <XCircle className="w-3 h-3" />
                <span>Unavailable</span>
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" />
                <span>Disabled</span>
              </>
            )}
          </div>

          {/* Toggle */}
          <Toggle
            checked={isEnabled}
            onChange={onToggleEnabled}
            disabled={isSaving}
            aria-label={isEnabled ? 'Disable MCP Server' : 'Enable MCP Server'}
          />
        </div>
      </div>
    </div>
  );
};

export default ServerStatusCard;
