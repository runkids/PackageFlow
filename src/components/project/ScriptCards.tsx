/**
 * Script category cards component
 * @see specs/002-frontend-project-manager/spec.md - US2
 * @see specs/006-node-package-manager/spec.md - US2 (version check before execution)
 */

import { useState, useCallback, useEffect } from 'react';
import { Play, Square } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import type { ScriptCategory, PackageManager } from '../../types/project';
import type { Worktree, WorktreeStatus, EditorDefinition } from '../../lib/tauri-api';
import type { VersionCompatibility } from '../../types/version';
import { PackageManagerCommands } from './PackageManagerCommands';
import { WorkingDirectorySelector } from './WorkingDirectorySelector';
import { VersionWarningDialog } from './VersionWarningDialog';
import { useVersionCheck } from '../../hooks/useVersionCheck';
import { toolchainAPI as toolchainAPIImport } from '../../lib/tauri-api';
import { Button } from '../ui/Button';

interface ScriptCardsProps {
  scripts: Record<string, string>;
  /** Map of running scripts, keyed by executionId */
  runningScriptsMap: Map<string, { scriptName: string; projectPath: string; status: string }>;
  runningCommands: Set<string>;
  packageManager: PackageManager;
  /** Current project path (main worktree) */
  projectPath: string;
  /** Available worktrees for this project */
  worktrees?: Worktree[];
  /** Currently selected worktree path */
  selectedWorktreePath?: string;
  /** Map of worktree statuses keyed by path */
  worktreeStatuses?: Record<string, WorktreeStatus>;
  /** Whether worktree statuses are loading */
  isLoadingStatuses?: boolean;
  /** Available editors for "Open in" action */
  availableEditors?: EditorDefinition[];
  /** Callback when worktree selection changes */
  onWorktreeChange?: (worktreePath: string) => void;
  onExecute: (scriptName: string, cwd?: string) => void;
  onCancel: (scriptName: string, cwd?: string) => void;
  onExecuteCommand: (command: string) => void;
  onCancelCommand: (commandId: string) => void;
}

interface CategorizedScript {
  name: string;
  command: string;
  category: ScriptCategory;
}

// Script categorization logic
function categorizeScript(name: string): ScriptCategory {
  const lowerName = name.toLowerCase();

  if (/^(dev|start|serve|watch)/.test(lowerName)) {
    return 'development';
  }
  if (/^(build|compile|bundle|dist)/.test(lowerName)) {
    return 'build';
  }
  if (/^(test|e2e|spec|coverage|jest|vitest|mocha)/.test(lowerName)) {
    return 'test';
  }
  if (/^(lint|format|prettier|eslint|stylelint|check|typecheck|tsc)/.test(lowerName)) {
    return 'lint';
  }
  return 'other';
}

// Category configuration - Subtle unified style with colored titles and gradient
const categoryConfig: Record<ScriptCategory, { label: string; color: string; dotColor: string; gradient: string }> = {
  development: {
    label: 'Development',
    color: 'text-green-500 dark:text-green-400',
    dotColor: 'bg-green-500',
    gradient: 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent',
  },
  build: {
    label: 'Build',
    color: 'text-amber-500 dark:text-amber-400',
    dotColor: 'bg-amber-500',
    gradient: 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent',
  },
  test: {
    label: 'Test',
    color: 'text-purple-500 dark:text-purple-400',
    dotColor: 'bg-purple-500',
    gradient: 'bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent',
  },
  lint: {
    label: 'Lint & Format',
    color: 'text-violet-500 dark:text-violet-400',
    dotColor: 'bg-violet-500',
    gradient: 'bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent',
  },
  other: {
    label: 'Other',
    color: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground',
    gradient: 'bg-gradient-to-br from-muted/20 via-muted/10 to-transparent',
  },
};

// Category display order
const categoryOrder: ScriptCategory[] = ['development', 'build', 'test', 'lint', 'other'];

export function ScriptCards({
  scripts,
  runningScriptsMap,
  runningCommands,
  packageManager,
  projectPath,
  worktrees = [],
  selectedWorktreePath,
  worktreeStatuses = {},
  isLoadingStatuses = false,
  availableEditors = [],
  onWorktreeChange,
  onExecute,
  onCancel,
  onExecuteCommand,
  onCancelCommand,
}: ScriptCardsProps) {
  // Current worktree path, defaults to project path
  const currentWorktreePath = selectedWorktreePath || projectPath;

  // Version check state
  const { checkCompatibility } = useVersionCheck();
  const [showVersionWarning, setShowVersionWarning] = useState(false);
  const [pendingScript, setPendingScript] = useState<string | null>(null);
  const [currentCompatibility, setCurrentCompatibility] = useState<VersionCompatibility | null>(null);
  // Track preference cleared for current worktree to force re-check
  const [preferenceCleared, setPreferenceCleared] = useState(false);

  // Listen for toolchain-preference-cleared event
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('toolchain-preference-cleared', (event) => {
      const clearedPaths = event.payload.paths;
      if (clearedPaths.includes(currentWorktreePath) || clearedPaths.includes(projectPath)) {
        setPreferenceCleared(true);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [currentWorktreePath, projectPath]);

  // Reset preference cleared flag when worktree changes
  useEffect(() => {
    setPreferenceCleared(false);
  }, [currentWorktreePath]);

  // Check if a script is currently running in the selected worktree
  const isScriptRunningInWorktree = (scriptName: string): boolean => {
    for (const script of runningScriptsMap.values()) {
      if (
        script.scriptName === scriptName &&
        script.projectPath === currentWorktreePath &&
        script.status === 'running'
      ) {
        return true;
      }
    }
    return false;
  };

  // Handle script execution with version check
  const handleExecuteWithVersionCheck = useCallback(async (scriptName: string) => {
    // Check for saved preference first (unless recently cleared)
    if (!preferenceCleared) {
      try {
        const savedPreference = await toolchainAPIImport.getPreference(currentWorktreePath);
        if (savedPreference) {
          // Has saved preference - execute directly using the saved strategy
          // The backend will use the appropriate version management
          onExecute(scriptName, currentWorktreePath);
          return;
        }
      } catch (err) {
        // Preference check failed - continue with compatibility check
        console.error('Failed to check preference:', err);
      }
    }

    // Check version compatibility before execution
    const compatibility = await checkCompatibility(currentWorktreePath);

    if (compatibility && !compatibility.isCompatible) {
      // Show warning dialog
      setCurrentCompatibility(compatibility);
      setPendingScript(scriptName);
      setShowVersionWarning(true);
      // Reset preference cleared flag after showing dialog
      setPreferenceCleared(false);
    } else {
      // Version compatible or no requirements - execute directly
      onExecute(scriptName, currentWorktreePath);
    }
  }, [checkCompatibility, currentWorktreePath, onExecute, preferenceCleared]);

  // Handle continue despite version mismatch
  const handleContinueAnyway = useCallback(() => {
    if (pendingScript) {
      onExecute(pendingScript, currentWorktreePath);
      setPendingScript(null);
      setCurrentCompatibility(null);
    }
  }, [pendingScript, currentWorktreePath, onExecute]);

  // Handle cancel execution
  const handleCancelExecution = useCallback(() => {
    setPendingScript(null);
    setCurrentCompatibility(null);
  }, []);

  // Handle use Volta (future implementation)
  const handleUseVolta = useCallback(() => {
    // TODO: Implement Volta version switching
    // For now, just execute the script
    if (pendingScript) {
      onExecute(pendingScript, currentWorktreePath);
      setPendingScript(null);
      setCurrentCompatibility(null);
    }
  }, [pendingScript, currentWorktreePath, onExecute]);

  // Handle use Corepack (future implementation)
  const handleUseCorepack = useCallback(() => {
    // TODO: Implement Corepack version switching
    // For now, just execute the script
    if (pendingScript) {
      onExecute(pendingScript, currentWorktreePath);
      setPendingScript(null);
      setCurrentCompatibility(null);
    }
  }, [pendingScript, currentWorktreePath, onExecute]);

  // Categorize scripts
  const categorizedScripts = Object.entries(scripts).map(([name, command]) => ({
    name,
    command,
    category: categorizeScript(name),
  }));

  // Group by category and sort by name
  const groupedScripts = categoryOrder.reduce((acc, category) => {
    const scripts = categorizedScripts
      .filter(s => s.category === category)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (scripts.length > 0) {
      acc[category] = scripts;
    }
    return acc;
  }, {} as Record<ScriptCategory, CategorizedScript[]>);

  const hasScripts = Object.keys(groupedScripts).length > 0;

  return (
    <div className="space-y-4">
      {/* Worktree selector */}
      <WorkingDirectorySelector
        worktrees={worktrees}
        selectedPath={currentWorktreePath}
        statuses={worktreeStatuses}
        isLoadingStatuses={isLoadingStatuses}
        availableEditors={availableEditors}
        onChange={(path) => onWorktreeChange?.(path)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min items-start">
        {/* Package manager commands card */}
        <PackageManagerCommands
          packageManager={packageManager}
          projectPath={currentWorktreePath}
          runningCommands={runningCommands}
          runningScriptsMap={runningScriptsMap}
          onExecute={onExecuteCommand}
          onCancel={onCancelCommand}
        />

        {/* Empty state when no scripts */}
        {!hasScripts && (
          <div className="col-span-full p-8 text-center text-muted-foreground">
            <p>No scripts defined for this project</p>
          </div>
        )}

        {/* Script category cards */}
        {categoryOrder.map(category => {
          const categoryScripts = groupedScripts[category];
          if (!categoryScripts) return null;

          const config = categoryConfig[category];

          return (
            <div
              key={category}
              className={`rounded-lg border border-border bg-card p-4 ${config.gradient}`}
            >
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${config.color}`}>
                <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                {config.label}
              </h3>
              <ul className="space-y-2">
                {categoryScripts.map(script => {
                  const isRunning = isScriptRunningInWorktree(script.name);

                  return (
                    <li key={script.name}>
                      <div className="flex items-center justify-between gap-2 p-2 rounded bg-card/50 hover:bg-card transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {script.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate" title={script.command}>
                            {script.command}
                          </div>
                        </div>
                        <Button
                          variant={isRunning ? 'outline-destructive' : 'ghost'}
                          size="icon"
                          onClick={() => isRunning
                            ? onCancel(script.name, currentWorktreePath)
                            : handleExecuteWithVersionCheck(script.name)
                          }
                          title={isRunning ? 'Stop' : 'Run'}
                        >
                          {isRunning ? (
                            <Square className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Version Warning Dialog */}
      {currentCompatibility && pendingScript && (
        <VersionWarningDialog
          open={showVersionWarning}
          onOpenChange={setShowVersionWarning}
          compatibility={currentCompatibility}
          scriptName={pendingScript}
          projectPath={currentWorktreePath}
          onContinue={handleContinueAnyway}
          onCancel={handleCancelExecution}
          onUseVolta={handleUseVolta}
          onUseCorepack={handleUseCorepack}
        />
      )}
    </div>
  );
}
