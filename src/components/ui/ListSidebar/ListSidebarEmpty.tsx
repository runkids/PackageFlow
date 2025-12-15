/**
 * ListSidebarEmpty - Empty state component for list sidebars
 * Provides visual feedback and guidance when no items exist
 */

import { Workflow, FolderOpen, SearchX, Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../Button';
import type { ListSidebarEmptyProps } from './types';

export function ListSidebarEmpty({
  type,
  hasSearch,
  searchQuery,
  onCreateNew,
}: ListSidebarEmptyProps) {
  // Search result empty state
  if (hasSearch && searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div
          className={cn(
            'w-14 h-14 rounded-2xl mb-4',
            'bg-muted/50',
            'flex items-center justify-center'
          )}
        >
          <SearchX className="w-7 h-7 text-muted-foreground/60" />
        </div>
        <h3 className="text-sm font-medium text-foreground">No results found</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-[180px]">
          No {type} matching "{searchQuery}"
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onCreateNew}
        >
          <Plus className="w-4 h-4 mr-2" />
          Create new {type === 'workflows' ? 'workflow' : 'project'}
        </Button>
      </div>
    );
  }

  // Initial empty state
  const Icon = type === 'workflows' ? Workflow : FolderOpen;
  const title = type === 'workflows' ? 'No workflows yet' : 'No projects yet';
  const description =
    type === 'workflows'
      ? 'Create your first workflow to automate repetitive tasks'
      : 'Add a project folder to start managing your packages';
  const buttonText = type === 'workflows' ? 'Create Workflow' : 'Add Project';
  const shortcutKey = type === 'workflows' ? 'N' : 'Shift+Cmd+O';

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      {/* Icon with gradient background */}
      <div
        className={cn(
          'w-16 h-16 rounded-2xl mb-4',
          'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-purple-500/10',
          'dark:from-blue-500/15 dark:via-blue-600/10 dark:to-purple-500/10',
          'flex items-center justify-center',
          'border border-blue-500/20',
          'shadow-lg shadow-blue-500/5'
        )}
      >
        <Icon className="w-8 h-8 text-blue-500 dark:text-blue-400" />
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {/* Description */}
      <p className="mt-2 text-sm text-muted-foreground max-w-[200px] leading-relaxed">
        {description}
      </p>

      {/* Create button */}
      <Button variant="default" className="mt-5" onClick={onCreateNew}>
        <Plus className="w-4 h-4 mr-2" />
        {buttonText}
      </Button>

      {/* Keyboard shortcut hint */}
      <p className="mt-4 text-xs text-muted-foreground">
        or press{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
          {shortcutKey}
        </kbd>
      </p>
    </div>
  );
}
