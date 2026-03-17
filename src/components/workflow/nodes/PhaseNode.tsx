/**
 * Phase Node - Workflow Phase Visual Node
 * Represents a single phase in the spec lifecycle workflow.
 * Replaces ScriptNode for spec-driven workflows.
 */

import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { Layers } from 'lucide-react';
import type { Phase } from '../../../types/workflow-phase';

export interface PhaseNodeData extends Record<string, unknown> {
  phase: Phase;
  isCurrentPhase?: boolean;
  specCount?: number;
}

export type PhaseNodeType = Node<PhaseNodeData, 'phase'>;

interface PhaseNodeProps {
  data: PhaseNodeData;
  selected?: boolean;
}

export const PhaseNode = memo(({ data, selected }: PhaseNodeProps) => {
  const { phase, isCurrentPhase, specCount } = data;
  const color = phase.color ?? '#6366f1';

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[280px] rounded-xl border-2 transition-all duration-300',
        'bg-card/90 border-border',
        selected && 'ring-2 ring-blue-400 ring-offset-2 ring-offset-background',
        isCurrentPhase && 'shadow-lg'
      )}
      style={{
        borderTopColor: color,
        borderTopWidth: '4px',
        ...(isCurrentPhase
          ? { boxShadow: `0 0 20px ${color}40, 0 0 40px ${color}20` }
          : {}),
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-border',
          'hover:!border-blue-400 hover:!bg-blue-400/20 transition-colors'
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Color dot */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: `${color}30` }}
        >
          <Layers className="w-4 h-4" style={{ color }} />
        </div>

        {/* Phase name */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground truncate">
            {phase.name}
          </h3>
          <span className="text-[11px] text-muted-foreground font-mono">{phase.id}</span>
        </div>

        {/* Current phase indicator */}
        {isCurrentPhase && (
          <div
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: color }}
          />
        )}
      </div>

      {/* on_enter actions */}
      {phase.on_enter.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {phase.on_enter.map((action, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border"
            >
              {action.action}
            </span>
          ))}
        </div>
      )}

      {/* Spec count */}
      {specCount !== undefined && specCount > 0 && (
        <div className="px-4 pb-3">
          <span className="text-[11px] text-muted-foreground">
            {specCount} spec{specCount !== 1 ? 's' : ''} in this phase
          </span>
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-border',
          'hover:!border-blue-400 hover:!bg-blue-400/20 transition-colors'
        )}
      />
    </div>
  );
});

PhaseNode.displayName = 'PhaseNode';
