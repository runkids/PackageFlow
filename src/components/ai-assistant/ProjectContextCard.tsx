/**
 * ProjectContextCard - Display current project context in sidebar
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { Folder, Package, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ProjectContext } from '../../types/ai-assistant';

interface ProjectContextCardProps {
  /** Project context data */
  context: ProjectContext | null;
  /** Whether the card is loading */
  isLoading?: boolean;
  /** Optional class name */
  className?: string;
}

/**
 * Display current project context in a compact card format
 */
export function ProjectContextCard({
  context,
  isLoading = false,
  className,
}: ProjectContextCardProps) {
  if (isLoading) {
    return (
      <div className={cn('px-3 py-2 border-b border-border', className)}>
        <div className="flex items-center gap-2 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className={cn('px-3 py-2 border-b border-border', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div
            className={cn(
              'w-8 h-8 rounded-lg',
              'bg-muted/50',
              'flex items-center justify-center'
            )}
          >
            <Folder className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              No project selected
            </p>
            <p className="text-xs text-muted-foreground/60">
              Select a project to enable context
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('px-3 py-2 border-b border-border', className)}>
      {/* Project header */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-8 h-8 rounded-lg',
            'bg-primary/10',
            'flex items-center justify-center'
          )}
        >
          <Folder className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {context.projectName}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {context.packageManager}
            </span>
            {context.projectType && (
              <span className="text-muted-foreground/60">
                {context.projectType}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Available scripts (if any) */}
      {context.availableScripts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Terminal className="w-3 h-3" />
            <span>Scripts</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {context.availableScripts.slice(0, 5).map((script) => (
              <span
                key={script}
                className={cn(
                  'px-1.5 py-0.5 text-xs',
                  'bg-muted/50 rounded',
                  'text-muted-foreground'
                )}
              >
                {script}
              </span>
            ))}
            {context.availableScripts.length > 5 && (
              <span className="px-1.5 py-0.5 text-xs text-muted-foreground/60">
                +{context.availableScripts.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact variant for minimal display
 */
export function ProjectContextBadge({
  context,
  className,
}: {
  context: ProjectContext | null;
  className?: string;
}) {
  if (!context) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1',
        'text-xs text-muted-foreground',
        'bg-muted/30 rounded-md',
        className
      )}
    >
      <Folder className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{context.projectName}</span>
    </div>
  );
}
