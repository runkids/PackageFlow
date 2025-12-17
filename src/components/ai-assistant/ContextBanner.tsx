/**
 * ContextBanner - Displays current AI context status
 * Feature 024: Context-Aware AI Assistant
 */

import { FolderOpen, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ContextBannerProps {
  /** Current project path (null = no project selected) */
  projectPath?: string;
  /** Project name (for display) */
  projectName?: string;
  /** Whether there are project-dependent actions available */
  hasProjectActions?: boolean;
  /** Handler to clear project context */
  onClearContext?: () => void;
  /** Handler to select a project */
  onSelectProject?: () => void;
  /** Optional class name */
  className?: string;
}

/**
 * Context banner showing the current AI context status
 * - Warning: No project selected but project actions are available
 * - Info: Project is selected
 */
export function ContextBanner({
  projectPath,
  projectName,
  hasProjectActions = false,
  onClearContext,
  onSelectProject,
  className,
}: ContextBannerProps) {
  // Don't show banner if no project and no project actions
  if (!projectPath && !hasProjectActions) {
    return null;
  }

  // Warning state: No project but project actions exist
  if (!projectPath && hasProjectActions) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5',
          'text-xs',
          'bg-amber-500/10 border-b border-amber-500/20',
          'text-amber-700 dark:text-amber-400',
          className
        )}
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1">No project selected - some actions are disabled</span>
        {onSelectProject && (
          <button
            onClick={onSelectProject}
            className={cn(
              'px-2 py-0.5 rounded',
              'bg-amber-500/20 hover:bg-amber-500/30',
              'text-amber-800 dark:text-amber-300',
              'font-medium transition-colors'
            )}
          >
            Select Project
          </button>
        )}
      </div>
    );
  }

  // Info state: Project is selected
  if (projectPath) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5',
          'text-xs',
          'bg-blue-500/10 border-b border-blue-500/20',
          'text-blue-700 dark:text-blue-400',
          className
        )}
      >
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 truncate">
          <span className="opacity-70">Context:</span>{' '}
          <span className="font-medium">{projectName || projectPath}</span>
        </span>
        {onClearContext && (
          <button
            onClick={onClearContext}
            className={cn('p-0.5 rounded hover:bg-blue-500/20', 'transition-colors')}
            title="Clear project context"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Inline context indicator - compact version for use in headers
 */
export function ContextIndicator({
  projectPath,
  projectName,
  className,
}: {
  projectPath?: string;
  projectName?: string;
  className?: string;
}) {
  if (!projectPath) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded',
          'text-[10px] font-medium',
          'bg-muted/50 text-muted-foreground',
          className
        )}
      >
        <Info className="w-3 h-3" />
        <span>Global</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded',
        'text-[10px] font-medium',
        'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        className
      )}
    >
      <FolderOpen className="w-3 h-3" />
      <span className="truncate max-w-[100px]">{projectName || 'Project'}</span>
    </div>
  );
}
