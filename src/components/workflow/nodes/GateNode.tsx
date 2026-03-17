/**
 * Gate Node - Workflow Transition Gate Visual Node
 * Represents a gate condition between two phases in the spec lifecycle workflow.
 * Displayed with dashed border to distinguish from PhaseNode.
 */

import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Gate } from '../../../types/workflow-phase';

export interface GateNodeData extends Record<string, unknown> {
  gate: Gate;
  passed?: boolean;
  blockedCount?: number;
}

export type GateNodeType = Node<GateNodeData, 'gate'>;

interface GateNodeProps {
  data: GateNodeData;
  selected?: boolean;
}

export const GateNode = memo(({ data, selected }: GateNodeProps) => {
  const { gate, passed, blockedCount } = data;
  const isPassed = passed === true;
  const isBlocked = passed === false;

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[240px] rounded-lg transition-all duration-300',
        'border-2 border-dashed',
        isPassed
          ? 'border-green-500/60 bg-green-500/5'
          : isBlocked
            ? 'border-amber-500/60 bg-amber-500/5'
            : 'border-border bg-muted/30',
        selected && 'ring-2 ring-blue-400 ring-offset-2 ring-offset-background'
      )}
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

      {/* Content */}
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Status icon + label */}
        <div className="flex items-center gap-2">
          {isPassed ? (
            <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <ShieldAlert
              className={cn(
                'w-4 h-4 flex-shrink-0',
                isBlocked ? 'text-amber-500' : 'text-muted-foreground'
              )}
            />
          )}
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Gate
          </span>
        </div>

        {/* Condition */}
        <div className="bg-secondary/80 rounded px-2 py-1">
          <code className="text-[10px] font-mono text-foreground break-all leading-relaxed">
            {gate.condition}
          </code>
        </div>

        {/* Gate message */}
        {gate.message && (
          <p className="text-[11px] text-muted-foreground leading-snug">{gate.message}</p>
        )}

        {/* Auto-advance badge */}
        {gate.auto_advance && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            auto-advance
          </span>
        )}

        {/* Blocked count */}
        {blockedCount !== undefined && blockedCount > 0 && (
          <p className="text-[10px] text-amber-500">
            {blockedCount} spec{blockedCount !== 1 ? 's' : ''} blocked
          </p>
        )}
      </div>

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

GateNode.displayName = 'GateNode';
