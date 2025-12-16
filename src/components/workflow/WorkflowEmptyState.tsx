/**
 * Workflow Empty State Component
 * Displays a welcoming empty state when a workflow has no nodes
 */

import { Workflow, Plus, FileBox } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface WorkflowEmptyStateProps {
  onAddStep: () => void;
  onFromTemplate?: () => void;
}

/**
 * Empty state component for workflows with no nodes
 * Features:
 * - Gradient background icon
 * - Clear title and description
 * - Primary "Add First Step" button
 * - Optional "Use Template" button
 * - Keyboard shortcut hints
 */
export function WorkflowEmptyState({ onAddStep, onFromTemplate }: WorkflowEmptyStateProps) {
  return (
    <div className="relative w-full h-full bg-background">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="workflow-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="1" className="fill-muted-foreground" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#workflow-grid)" />
        </svg>
      </div>

      {/* Content container */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Gradient icon */}
        <div
          className={cn(
            'w-20 h-20 rounded-2xl mb-6',
            'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-purple-500/10',
            'dark:from-blue-500/15 dark:via-blue-600/10 dark:to-purple-500/10',
            'flex items-center justify-center',
            'border border-blue-500/20',
            'shadow-lg shadow-blue-500/10'
          )}
        >
          <Workflow className="w-10 h-10 text-blue-500 dark:text-blue-400" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Start Your Workflow
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground max-w-[280px] text-center mb-6 leading-relaxed">
          Add your first step to begin automating tasks. You can run shell commands or trigger other workflows.
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button variant="default" onClick={onAddStep}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Step
          </Button>
          {onFromTemplate && (
            <Button variant="outline" onClick={onFromTemplate}>
              <FileBox className="w-4 h-4 mr-2" />
              Use Template
            </Button>
          )}
        </div>

        {/* Keyboard shortcuts */}
        <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              Cmd+N
            </kbd>
            <span>Add step</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              Cmd+R
            </kbd>
            <span>Run workflow</span>
          </span>
        </div>
      </div>
    </div>
  );
}
