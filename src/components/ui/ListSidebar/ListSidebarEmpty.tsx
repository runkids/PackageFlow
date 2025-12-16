/**
 * ListSidebarEmpty - Empty state component for list sidebars
 * Provides visual feedback and guidance when no items exist
 */

import { Workflow, FolderOpen, SearchX, Plus } from 'lucide-react';
import { CompactEmptyState } from '../EmptyState';
import { Button } from '../Button';
import { cn } from '../../../lib/utils';
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
  const title = type === 'workflows' ? 'No Workflows Yet' : 'No Projects Yet';
  const description =
    type === 'workflows'
      ? 'Create your first workflow to automate repetitive tasks'
      : 'Add a project folder to start managing your packages';
  const buttonText = type === 'workflows' ? 'Create Workflow' : 'Add Project';

  return (
    <CompactEmptyState
      icon={Icon}
      title={title}
      description={description}
      variant="blue"
      action={{
        label: buttonText,
        icon: Plus,
        onClick: onCreateNew,
      }}
      className="h-full"
    />
  );
}
