/**
 * ServerStatusCard Component
 * A compact status card showing MCP server status with enable/disable toggle
 *
 * Uses the R/E/W gradient theme (blue → amber → rose) for visual consistency
 */

import React from 'react';
import { Server, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Toggle } from '../../ui/Toggle';

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
  className,
}) => {
  // Format path for display (truncate home directory)
  const formatPath = (path: string): string => {
    const homeMatch = path.match(/^\/Users\/[^/]+/) || path.match(/^\/home\/[^/]+/);
    if (homeMatch) {
      return path.replace(homeMatch[0], '~');
    }
    return path;
  };

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
          {isEnabled ? (
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#rew-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <defs>
                <linearGradient id="rew-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
              <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
              <line x1="6" x2="6.01" y1="6" y2="6" />
              <line x1="6" x2="6.01" y1="18" y2="18" />
            </svg>
          ) : (
            <Server className="w-6 h-6 text-muted-foreground" />
          )}
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
            <p
              className="text-xs text-muted-foreground/70 mt-1 truncate font-mono"
              title={binaryPath}
            >
              {formatPath(binaryPath)}
            </p>
          )}
        </div>

        {/* Status & Toggle */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Status badge */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'transition-all duration-300',
              isEnabled && isAvailable &&
                'bg-gradient-to-r from-emerald-500/80 to-blue-500/80 text-white shadow-sm',
              isEnabled && !isAvailable &&
                'bg-amber-500/15 text-amber-600 dark:text-amber-400',
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
