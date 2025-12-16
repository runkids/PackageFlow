/**
 * Workflow Preview Component
 * Displays a compact linear view of workflow nodes for inline preview
 */

import { Terminal, Workflow, Loader2, Play, Edit } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import type { WorkflowNode } from '../../types/workflow';

interface WorkflowPreviewProps {
  nodes: WorkflowNode[];
  onEdit: () => void;
  onRun: () => void;
  isRunning?: boolean;
  currentNodeIndex?: number;
  disabled?: boolean;
}

/**
 * Compact workflow preview showing a linear list of nodes
 * Used for inline preview in ProjectWorkflows
 */
export function WorkflowPreview({
  nodes,
  onEdit,
  onRun,
  isRunning = false,
  currentNodeIndex,
  disabled = false,
}: WorkflowPreviewProps) {
  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      {/* Node list */}
      {sortedNodes.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-2">
          No steps in this workflow
        </div>
      ) : (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {sortedNodes.map((node, index) => (
            <div
              key={node.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded text-sm',
                isRunning && currentNodeIndex === index && 'bg-blue-500/10 border border-blue-500/30'
              )}
            >
              {/* Step number */}
              <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">
                {index + 1}.
              </span>

              {/* Node type icon */}
              {node.type === 'script' ? (
                <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Workflow className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              )}

              {/* Node name */}
              <span className="text-foreground truncate flex-1">
                {node.name}
              </span>

              {/* Running indicator */}
              {isRunning && currentNodeIndex === index && (
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={disabled}
          className="flex-1"
        >
          <Edit className="w-3.5 h-3.5 mr-1.5" />
          Edit
        </Button>
        <Button
          variant="success"
          size="sm"
          onClick={onRun}
          disabled={disabled || isRunning || sortedNodes.length === 0}
          className="flex-1"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Running
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Run
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
