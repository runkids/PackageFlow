import React, { useState, useRef, useEffect } from 'react';
import { X, Settings, Shield, ShieldCheck, ShieldAlert, Eye, Zap, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { McpIcon } from '../ui/McpIcon';
import { cn } from '../../lib/utils';
import type { McpServerConfig, McpPermissionMode } from '../../lib/tauri-api';

interface McpStatusButtonProps {
  config: McpServerConfig | null;
  isLoading: boolean;
  onOpenSettings: () => void;
}

// Permission mode display info
const getPermissionInfo = (mode: McpPermissionMode) => {
  switch (mode) {
    case 'read_only':
      return {
        label: 'Read Only',
        description: 'AI can only read data',
        icon: Eye,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
      };
    case 'execute_with_confirm':
      return {
        label: 'Execute with Confirm',
        description: 'AI actions require confirmation',
        icon: ShieldCheck,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
      };
    case 'full_access':
      return {
        label: 'Full Access',
        description: 'AI has full access to all tools',
        icon: ShieldAlert,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
      };
    default:
      return {
        label: 'Unknown',
        description: '',
        icon: Shield,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
  }
};

export const McpStatusButton: React.FC<McpStatusButtonProps> = ({
  config,
  isLoading,
  onOpenSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isEnabled = config?.isEnabled ?? false;
  const permissionInfo = config ? getPermissionInfo(config.permissionMode) : null;

  // Close panel on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close panel on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpenSettings = () => {
    setIsOpen(false);
    onOpenSettings();
  };

  return (
    <div className="relative">
      {/* Button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-8 relative"
        aria-label="MCP Server Status"
        aria-expanded={isOpen}
      >
        <McpIcon
          className={cn('w-4 h-4', !isEnabled && 'text-muted-foreground')}
          rewGradient={isEnabled}
        />
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full mt-2',
            'w-[280px]',
            'bg-card border border-border rounded-xl shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150',
            'flex flex-col overflow-hidden',
            'z-50'
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-foreground">MCP Server</h3>
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  isEnabled ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
                )}
              >
                {isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
            ) : !isEnabled ? (
              <div className="text-center py-2">
                <Lock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-1">MCP Server is disabled</p>
                <p className="text-xs text-muted-foreground/60">
                  Enable to allow AI tools to access PackageFlow
                </p>
              </div>
            ) : config && permissionInfo ? (
              <div className="space-y-3">
                {/* Permission Mode */}
                <div className="flex items-start gap-3">
                  <div className={cn('p-2 rounded-lg', permissionInfo.bgColor)}>
                    <permissionInfo.icon className={cn('w-4 h-4', permissionInfo.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {permissionInfo.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {permissionInfo.description}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {config.allowedTools.length > 0
                        ? `${config.allowedTools.length} custom tools`
                        : 'Default tools'}
                    </span>
                  </div>
                  {config.logRequests && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                      <span className="text-xs text-muted-foreground">Logging</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border flex-shrink-0">
            <Button variant="outline" size="sm" onClick={handleOpenSettings} className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              Configure MCP
            </Button>
          </div>

          {/* Footer pointer */}
          <div className="absolute -top-1 right-4 w-2 h-2 bg-card border-l border-t border-border transform rotate-45" />
        </div>
      )}
    </div>
  );
};

export default McpStatusButton;
