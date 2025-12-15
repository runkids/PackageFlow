/**
 * Package manager common commands component
 * Displays corresponding common commands based on project's package manager type
 * Supports automatic version switching (Volta) - Feature 006-node-package-manager
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, Download, RefreshCw, Plus, Trash2, X, Zap, FolderX, Loader2 } from 'lucide-react';
import type { PackageManager } from '../../types/project';
import type { VersionCompatibility } from '../../types/version';
import { versionAPI, projectAPI } from '../../lib/tauri-api';
import { useVersionCheck } from '../../hooks/useVersionCheck';
import { VersionWarningDialog } from './VersionWarningDialog';
import { Checkbox } from '../ui/Checkbox';

interface PackageManagerCommandsProps {
  packageManager: PackageManager;
  projectPath: string;
  runningCommands: Set<string>;
  /** Running scripts map from ScriptExecutionContext (for PTY integration) */
  runningScriptsMap?: Map<string, { scriptName: string; projectPath: string; status: string }>;
  onExecute: (command: string) => void;
  onCancel: (command: string) => void;
}

// Define command type
interface PackageManagerCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  needsPackageName: boolean;
  hasDevOption?: boolean;
  getCommand: (pm: PackageManager, packageName?: string, isDev?: boolean) => string;
}

// Package manager common commands definition
const packageManagerCommands: PackageManagerCommand[] = [
  {
    id: 'install',
    label: 'Install dependencies',
    description: 'Install all dependencies from package.json',
    icon: Download,
    needsPackageName: false,
    getCommand: (pm) => {
      switch (pm) {
        case 'pnpm': return 'pnpm install';
        case 'yarn': return 'yarn install';
        case 'bun': return 'bun install';
        case 'npm':
        default: return 'npm install';
      }
    },
  },
  {
    id: 'update',
    label: 'Update dependencies',
    description: 'Update all dependencies to the latest versions',
    icon: RefreshCw,
    needsPackageName: false,
    getCommand: (pm) => {
      switch (pm) {
        case 'pnpm': return 'pnpm update';
        case 'yarn': return 'yarn upgrade';
        case 'bun': return 'bun update';
        case 'npm':
        default: return 'npm update';
      }
    },
  },
  {
    id: 'ci',
    label: 'Clean install',
    description: 'Remove node_modules and reinstall (CI mode)',
    icon: Download,
    needsPackageName: false,
    getCommand: (pm) => {
      switch (pm) {
        case 'pnpm': return 'pnpm install --frozen-lockfile';
        case 'yarn': return 'yarn install --frozen-lockfile';
        case 'bun': return 'bun install --frozen-lockfile';
        case 'npm':
        default: return 'npm ci';
      }
    },
  },
  {
    id: 'add',
    label: 'Add package',
    description: 'Add a new package dependency',
    icon: Plus,
    needsPackageName: true,
    hasDevOption: true,
    getCommand: (pm, packageName, isDev) => {
      const pkg = packageName || '';
      const devFlag = isDev ? ' -D' : '';
      switch (pm) {
        case 'pnpm': return `pnpm add${devFlag} ${pkg}`.trim();
        case 'yarn': return `yarn add${devFlag} ${pkg}`.trim();
        case 'bun': return `bun add${devFlag} ${pkg}`.trim();
        case 'npm':
        default: return `npm install${devFlag} ${pkg}`.trim();
      }
    },
  },
  {
    id: 'remove',
    label: 'Remove package',
    description: 'Remove a package dependency',
    icon: Trash2,
    needsPackageName: true,
    getCommand: (pm, packageName) => {
      const pkg = packageName || '';
      switch (pm) {
        case 'pnpm': return `pnpm remove ${pkg}`.trim();
        case 'yarn': return `yarn remove ${pkg}`.trim();
        case 'bun': return `bun remove ${pkg}`.trim();
        case 'npm':
        default: return `npm uninstall ${pkg}`.trim();
      }
    },
  },
];

// Package manager display names
const packageManagerLabels: Record<PackageManager, string> = {
  npm: 'npm',
  yarn: 'Yarn',
  pnpm: 'pnpm',
  bun: 'Bun',
  unknown: 'Unknown',
};


// Single command item component
function CommandItem({
  cmd,
  packageManager,
  isRunning,
  usingVolta,
  onExecuteWithVersionManager,
  onCancel,
}: {
  cmd: PackageManagerCommand;
  packageManager: PackageManager;
  isRunning: boolean;
  usingVolta: boolean;
  onExecuteWithVersionManager: (command: string, args: string[]) => void;
  onCancel: (commandId: string) => void;
}) {
  const [isInputMode, setIsInputMode] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [isDev, setIsDev] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = cmd.icon;

  // Auto-focus input when entering input mode
  useEffect(() => {
    if (isInputMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInputMode]);

  const handleExecute = () => {
    if (cmd.needsPackageName) {
      setIsInputMode(true);
    } else {
      // Parse command to get base command and args
      const fullCommand = cmd.getCommand(packageManager);
      const parts = fullCommand.split(' ');
      const baseCommand = parts[0];
      const args = parts.slice(1);
      onExecuteWithVersionManager(baseCommand, args);
    }
  };

  const handleSubmit = () => {
    if (packageName.trim()) {
      const fullCommand = cmd.getCommand(packageManager, packageName.trim(), isDev);
      const parts = fullCommand.split(' ');
      const baseCommand = parts[0];
      const args = parts.slice(1);
      onExecuteWithVersionManager(baseCommand, args);
      setPackageName('');
      setIsDev(false);
      setIsInputMode(false);
    }
  };

  const handleCancel = () => {
    setPackageName('');
    setIsDev(false);
    setIsInputMode(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Input mode UI
  if (isInputMode) {
    return (
      <li>
        <div className="p-2 rounded bg-card/50">
          <div className="flex items-center gap-2 mb-2">
            <Icon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span className="text-sm font-medium text-foreground">{cmd.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a package name, e.g. lodash or react@18"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 px-2 py-1.5 text-sm bg-background border border-border rounded focus:border-cyan-500 focus:outline-none text-foreground placeholder-muted-foreground"
            />
            <button
              onClick={handleSubmit}
              disabled={!packageName.trim()}
              className="p-1.5 rounded bg-cyan-600 text-white hover:bg-cyan-500 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
              title="Run"
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded bg-muted text-foreground hover:bg-accent transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* devDependencies option */}
          {cmd.hasDevOption && (
            <div className="mt-2">
              <Checkbox
                checked={isDev}
                onCheckedChange={setIsDev}
                label="Install as dev dependency (devDependencies)"
              />
            </div>
          )}
          <div className="mt-1.5 text-xs text-muted-foreground">
            {cmd.getCommand(packageManager, packageName || '<package>', isDev)}
          </div>
        </div>
      </li>
    );
  }

  // Normal display mode
  const command = cmd.getCommand(packageManager);
  const displayCommand = usingVolta ? `volta run ${command}` : command;

  return (
    <li>
      <div className="flex items-center justify-between gap-2 p-2 rounded bg-card/50 hover:bg-card transition-colors">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {cmd.label}
            </div>
            <div className="text-xs text-muted-foreground truncate" title={displayCommand}>
              {cmd.needsPackageName ? `${command} <package>` : command}
            </div>
          </div>
        </div>
        <button
          onClick={() => isRunning ? onCancel(cmd.id) : handleExecute()}
          className={`p-1.5 rounded transition-colors flex-shrink-0 ${
            isRunning
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-muted text-foreground hover:bg-accent'
          }`}
          title={isRunning ? 'Stop' : cmd.needsPackageName ? 'Enter package name' : 'Run'}
        >
          {isRunning ? (
            <Square className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
      </div>
    </li>
  );
}

export function PackageManagerCommands({
  packageManager,
  projectPath,
  runningCommands,
  runningScriptsMap,
  onExecute,
  onCancel,
}: PackageManagerCommandsProps) {
  const [usingVolta, setUsingVolta] = useState(false);

  // Check if a command is running (from either runningCommands or runningScriptsMap)
  const isCommandRunning = useCallback((commandId: string): boolean => {
    // Check legacy runningCommands Set
    if (runningCommands.has(commandId)) {
      return true;
    }
    // Check runningScriptsMap (for PTY integration)
    if (runningScriptsMap) {
      for (const script of runningScriptsMap.values()) {
        if (
          script.scriptName === commandId &&
          script.projectPath === projectPath &&
          script.status === 'running'
        ) {
          return true;
        }
      }
    }
    return false;
  }, [runningCommands, runningScriptsMap, projectPath]);

  // Version check state
  const { checkCompatibility } = useVersionCheck();
  const [showVersionWarning, setShowVersionWarning] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<{ command: string; args: string[] } | null>(null);
  const [currentCompatibility, setCurrentCompatibility] = useState<VersionCompatibility | null>(null);

  // Check if project uses Volta
  useEffect(() => {
    const checkVolta = async () => {
      try {
        // Use a simple command to check if Volta would be used
        const response = await versionAPI.getWrappedCommand(projectPath, packageManager, ['--version']);
        setUsingVolta(response.usingVersionManager && response.versionManager === 'volta');
      } catch (err) {
        console.error('Failed to check Volta status:', err);
        setUsingVolta(false);
      }
    };

    if (projectPath && packageManager !== 'unknown') {
      checkVolta();
    }
  }, [projectPath, packageManager]);

  // Execute command (after version check passed or user chose to continue)
  const executeCommand = useCallback(async (command: string, args: string[]) => {
    try {
      // Get wrapped command (might use Volta)
      const wrapped = await versionAPI.getWrappedCommand(projectPath, command, args);

      if (wrapped.success && wrapped.command) {
        // Execute the wrapped command
        const fullCommand = `${wrapped.command} ${wrapped.args?.join(' ') || ''}`.trim();
        onExecute(fullCommand);
      } else {
        // Fallback to original command
        const fullCommand = `${command} ${args.join(' ')}`.trim();
        onExecute(fullCommand);
      }
    } catch (err) {
      console.error('Failed to execute command with version manager:', err);
      // Fallback to original command
      const fullCommand = `${command} ${args.join(' ')}`.trim();
      onExecute(fullCommand);
    }
  }, [projectPath, onExecute]);

  // Execute command with version check
  const handleExecuteWithVersionManager = useCallback(async (command: string, args: string[]) => {
    // Check version compatibility before execution
    const compatibility = await checkCompatibility(projectPath);

    if (compatibility && !compatibility.isCompatible) {
      // Show warning dialog
      setCurrentCompatibility(compatibility);
      setPendingCommand({ command, args });
      setShowVersionWarning(true);
    } else {
      // Version compatible or no requirements - execute directly
      executeCommand(command, args);
    }
  }, [projectPath, checkCompatibility, executeCommand]);

  // Handle continue despite version mismatch
  const handleContinueAnyway = useCallback(() => {
    if (pendingCommand) {
      executeCommand(pendingCommand.command, pendingCommand.args);
      setPendingCommand(null);
      setCurrentCompatibility(null);
    }
  }, [pendingCommand, executeCommand]);

  // Handle cancel execution
  const handleCancelExecution = useCallback(() => {
    setPendingCommand(null);
    setCurrentCompatibility(null);
  }, []);

  // Handle use Volta
  const handleUseVolta = useCallback(() => {
    // Volta should already be wrapping the command if available
    if (pendingCommand) {
      executeCommand(pendingCommand.command, pendingCommand.args);
      setPendingCommand(null);
      setCurrentCompatibility(null);
    }
  }, [pendingCommand, executeCommand]);

  // Handle use Corepack (future implementation)
  const handleUseCorepack = useCallback(() => {
    // TODO: Implement Corepack version switching
    if (pendingCommand) {
      executeCommand(pendingCommand.command, pendingCommand.args);
      setPendingCommand(null);
      setCurrentCompatibility(null);
    }
  }, [pendingCommand, executeCommand]);

  // If unknown package manager, show message
  if (packageManager === 'unknown') {
    return (
      <div className="rounded-lg border border-border bg-card p-4 bg-gradient-to-br from-muted/20 via-muted/10 to-transparent">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-muted-foreground" />
          Package manager commands
        </h3>
        <p className="text-sm text-muted-foreground">
          Unable to detect the package manager. Make sure the project directory has a lockfile.
        </p>
      </div>
    );
  }

  // State for trash node_modules
  const [isTrashingNodeModules, setIsTrashingNodeModules] = useState(false);

  // Handle trash node_modules
  const handleTrashNodeModules = useCallback(async () => {
    setIsTrashingNodeModules(true);
    try {
      const response = await projectAPI.trashNodeModules(projectPath);
      if (!response.success && response.error) {
        console.error('Failed to trash node_modules:', response.error);
      }
      // Minimum display time for loading state so user can see feedback
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error('Failed to trash node_modules:', err);
    } finally {
      setIsTrashingNodeModules(false);
    }
  }, [projectPath]);

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-cyan-500 dark:text-cyan-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            {packageManagerLabels[packageManager]} Commands
          </h3>
          {usingVolta && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded" title="Volta will manage Node.js and package manager versions">
              <Zap className="w-3 h-3" />
              Volta enabled
            </span>
          )}
        </div>
        <ul className="space-y-2">
          {packageManagerCommands.map((cmd) => (
            <CommandItem
              key={cmd.id}
              cmd={cmd}
              packageManager={packageManager}
              isRunning={isCommandRunning(cmd.id)}
              usingVolta={usingVolta}
              onExecuteWithVersionManager={handleExecuteWithVersionManager}
              onCancel={onCancel}
            />
          ))}

          {/* Remove node_modules - special command that uses trash */}
          <li>
            <div className="flex items-center justify-between gap-2 p-2 rounded bg-card/50 hover:bg-card transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FolderX className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    Remove node_modules
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Move to Trash (safe delete)
                  </div>
                </div>
              </div>
              <button
                onClick={handleTrashNodeModules}
                disabled={isTrashingNodeModules}
                className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                  isTrashingNodeModules
                    ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
                    : 'bg-muted text-foreground hover:bg-accent'
                }`}
                title="Move node_modules to Trash"
              >
                {isTrashingNodeModules ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>
          </li>
        </ul>
      </div>

      {/* Version Warning Dialog */}
      {currentCompatibility && pendingCommand && (
        <VersionWarningDialog
          open={showVersionWarning}
          onOpenChange={setShowVersionWarning}
          compatibility={currentCompatibility}
          scriptName={`${pendingCommand.command} ${pendingCommand.args.join(' ')}`}
          onContinue={handleContinueAnyway}
          onCancel={handleCancelExecution}
          onUseVolta={handleUseVolta}
          onUseCorepack={handleUseCorepack}
        />
      )}
    </>
  );
}
