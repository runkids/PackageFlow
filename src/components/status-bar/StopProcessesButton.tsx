import React, { useState, useRef, useEffect } from 'react';
import { Cable, X, Loader2, Check, Square, CircleDot } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

export interface RunningScript {
  scriptName: string;
  projectName?: string;
  port?: number | string;
}

export interface RunningProcessInfo {
  count: number;
  scripts: RunningScript[];
  hasMore: boolean;
}

interface StopProcessesButtonProps {
  runningProcessInfo: RunningProcessInfo;
  onStopAll: () => void;
  isKilling: boolean;
  killSuccess: boolean;
}

interface ProcessItemProps {
  script: RunningScript;
}

const ProcessItem: React.FC<ProcessItemProps> = ({ script }) => {
  return (
    <div className="px-4 py-2.5 hover:bg-accent/50 transition-colors flex items-center gap-3">
      <div className="relative">
        <CircleDot className="w-3.5 h-3.5 text-green-400" />
        <span className="absolute inset-0 animate-ping rounded-full bg-green-400/30" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {script.projectName && (
            <span className="text-xs text-blue-400 truncate max-w-[100px]">
              {script.projectName}
            </span>
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {script.scriptName}
          </span>
          {script.port && (
            <span className="text-xs text-yellow-400 ml-auto flex-shrink-0 font-mono">
              :{script.port}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const StopProcessesButton: React.FC<StopProcessesButtonProps> = ({
  runningProcessInfo,
  onStopAll,
  isKilling,
  killSuccess,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasRunningProcesses = runningProcessInfo.count > 0;

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

  // Close panel after successful kill
  useEffect(() => {
    if (killSuccess) {
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [killSuccess]);

  const handleStopAll = () => {
    onStopAll();
  };

  return (
    <div className="relative">
      {/* Button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'h-8 w-8 relative',
          killSuccess && 'bg-gradient-to-r from-green-500/20 to-blue-500/20',
          isKilling && 'bg-amber-500/20 cursor-wait',
          hasRunningProcesses && !isKilling && !killSuccess && 'hover:bg-red-500/20'
        )}
        aria-label="Stop all running processes"
        aria-expanded={isOpen}
      >
        {killSuccess ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : isKilling ? (
          <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
        ) : (
          <Cable
            className={cn(
              'w-4 h-4',
              hasRunningProcesses ? 'text-blue-400' : 'text-muted-foreground'
            )}
          />
        )}
        {hasRunningProcesses && !killSuccess && !isKilling && (
          <span className="absolute top-0 right-0 min-w-[14px] h-[14px] px-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] leading-[14px] rounded-full flex items-center justify-center shadow-sm border border-card">
            {runningProcessInfo.count}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full mt-2',
            'w-[300px] max-h-[360px]',
            'bg-card border border-border rounded-xl shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150',
            'flex flex-col overflow-hidden',
            'z-50'
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-foreground">Running Processes</h3>
              {hasRunningProcesses && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  'bg-green-500/20 text-green-400'
                )}>
                  {runningProcessInfo.count} active
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Process list */}
          <div className="flex-1 overflow-y-auto">
            {!hasRunningProcesses ? (
              <div className="px-4 py-8 text-center">
                <Cable className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No processes running</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {runningProcessInfo.scripts.map((script, index) => (
                  <ProcessItem key={index} script={script} />
                ))}
                {runningProcessInfo.hasMore && (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                    ...and {runningProcessInfo.count - runningProcessInfo.scripts.length} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with Stop All button */}
          {hasRunningProcesses && (
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopAll}
                disabled={isKilling}
                className={cn(
                  'w-full',
                  'border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300',
                  'disabled:opacity-50'
                )}
              >
                {isKilling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Stopping...
                  </>
                ) : killSuccess ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    All Stopped
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop All Processes
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Footer pointer */}
          <div className="absolute -top-1 right-4 w-2 h-2 bg-card border-l border-t border-border transform rotate-45" />
        </div>
      )}
    </div>
  );
};

export default StopProcessesButton;
