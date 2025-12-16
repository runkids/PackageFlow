/**
 * Trigger Workflow Node - n8n Style Custom Node Component
 * A visual node for triggering another workflow in the workflow
 * @see specs/013-workflow-trigger-workflow/spec.md
 */

import { memo, useState } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { ContextMenu } from '../../ui/ContextMenu';
import { NodeContextMenuItems } from '../NodeContextMenuItems';
import { Workflow, Check, X, Clock, SkipForward, Loader2, Trash2, Plus, Pencil, Copy, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import type { NodeStatus, OnChildFailure } from '../../../types/workflow';

export interface TriggerWorkflowNodeData extends Record<string, unknown> {
  label: string;
  targetWorkflowId: string;
  targetWorkflowName?: string;
  waitForCompletion: boolean;
  onChildFailure: OnChildFailure;
  status?: NodeStatus;
  order: number;
  // Child execution progress
  childProgress?: {
    currentStep: number;
    totalSteps: number;
    currentNodeName?: string;
  };
  // Action callbacks
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onInsertBefore?: (nodeId: string) => void;
  onInsertAfter?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  // Node sharing callbacks
  onExportNode?: (nodeId: string) => void;
  onSaveAsTemplate?: (nodeId: string) => void;
  nodeId?: string;
  disabled?: boolean;
  // Cycle detection warning
  hasCycleWarning?: boolean;
}

export type TriggerWorkflowNodeType = Node<TriggerWorkflowNodeData, 'trigger-workflow'>;

/**
 * Get status configuration for visual styling
 */
function getStatusConfig(status?: NodeStatus) {
  switch (status) {
    case 'running':
      return {
        borderColor: 'border-purple-500',
        bgColor: 'bg-purple-950/80',
        iconBg: 'bg-purple-500',
        icon: Loader2,
        iconClass: 'animate-spin',
        glowColor: 'shadow-purple-500/40',
        headerBg: 'bg-purple-900/30',
        // Dark background needs light text
        titleColor: 'text-white',
        orderColor: 'text-white/60',
        labelColor: 'text-white/70',
      };
    case 'completed':
      return {
        borderColor: 'border-green-500',
        bgColor: 'bg-green-950/80',
        iconBg: 'bg-green-500',
        icon: Check,
        iconClass: '',
        glowColor: 'shadow-green-500/40',
        headerBg: 'bg-green-900/30',
        // Dark background needs light text
        titleColor: 'text-white',
        orderColor: 'text-white/60',
        labelColor: 'text-white/70',
      };
    case 'failed':
      return {
        borderColor: 'border-red-500',
        bgColor: 'bg-red-950/80',
        iconBg: 'bg-red-500',
        icon: X,
        iconClass: '',
        glowColor: 'shadow-red-500/40',
        headerBg: 'bg-red-900/30',
        // Dark background needs light text
        titleColor: 'text-white',
        orderColor: 'text-white/60',
        labelColor: 'text-white/70',
      };
    case 'skipped':
      return {
        borderColor: 'border-muted-foreground',
        bgColor: 'bg-card/80',
        iconBg: 'bg-muted-foreground',
        icon: SkipForward,
        iconClass: '',
        glowColor: '',
        headerBg: 'bg-muted/50',
        // Light background needs dark text
        titleColor: 'text-foreground',
        orderColor: 'text-muted-foreground',
        labelColor: 'text-muted-foreground',
      };
    case 'pending':
    default:
      return {
        borderColor: 'border-purple-600',
        bgColor: 'bg-card/90',
        iconBg: 'bg-purple-600',
        icon: Clock,
        iconClass: '',
        glowColor: '',
        headerBg: 'bg-purple-800/30',
        // Light background needs dark text
        titleColor: 'text-foreground',
        orderColor: 'text-muted-foreground',
        labelColor: 'text-muted-foreground',
      };
  }
}

interface TriggerWorkflowNodeProps {
  data: TriggerWorkflowNodeData;
  selected?: boolean;
}

/**
 * Trigger Workflow Node Component
 * Displays a workflow trigger step with n8n-like styling
 */
export const TriggerWorkflowNode = memo(({ data, selected }: TriggerWorkflowNodeProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const config = getStatusConfig(data.status);
  const StatusIcon = config.icon;
  const showToolbar = (isHovered || selected) && !data.disabled;

  const closeContextMenu = () => setContextMenu(null);

  const handleEdit = () => {
    closeContextMenu();
    if (data.onEdit && data.nodeId) {
      data.onEdit(data.nodeId);
    }
  };

  const handleDelete = () => {
    closeContextMenu();
    if (data.onDelete && data.nodeId) {
      data.onDelete(data.nodeId);
    }
  };

  const handleInsertBefore = () => {
    closeContextMenu();
    if (data.onInsertBefore && data.nodeId) {
      data.onInsertBefore(data.nodeId);
    }
  };

  const handleInsertAfter = () => {
    closeContextMenu();
    if (data.onInsertAfter && data.nodeId) {
      data.onInsertAfter(data.nodeId);
    }
  };

  const handleDuplicate = () => {
    closeContextMenu();
    if (data.onDuplicate && data.nodeId) {
      data.onDuplicate(data.nodeId);
    }
  };

  const handleExportNode = () => {
    closeContextMenu();
    if (data.onExportNode && data.nodeId) {
      data.onExportNode(data.nodeId);
    }
  };

  const handleSaveAsTemplate = () => {
    closeContextMenu();
    if (data.onSaveAsTemplate && data.nodeId) {
      data.onSaveAsTemplate(data.nodeId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!data.disabled) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // Toolbar button click handlers (need to stop propagation)
  const handleToolbarEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleEdit();
  };

  const handleToolbarDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleDelete();
  };

  const handleToolbarInsertBefore = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleInsertBefore();
  };

  const handleToolbarInsertAfter = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleInsertAfter();
  };

  const handleToolbarDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleDuplicate();
  };

  return (
    <div
      className={cn(
        'relative min-w-[240px] max-w-[320px] rounded-xl border-2 transition-all duration-300',
        config.borderColor,
        config.bgColor,
        selected && 'ring-2 ring-purple-400 ring-offset-2 ring-offset-background',
        config.glowColor && `shadow-lg ${config.glowColor}`,
        'group'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {/* Hover Toolbar */}
      <div
        className={cn(
          'absolute -top-10 left-1/2 -translate-x-1/2 z-10',
          'flex items-center gap-1 px-2 py-1.5 rounded-lg',
          'bg-card border border-border shadow-lg',
          'transition-all duration-200',
          showToolbar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToolbarInsertBefore}
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-purple-400"
          title="Insert step before"
        >
          <div className="relative">
            <ChevronUp className="w-3.5 h-3.5 absolute -top-1" />
            <Plus className="w-3.5 h-3.5" />
          </div>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToolbarInsertAfter}
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-purple-400"
          title="Insert step after"
        >
          <div className="relative">
            <Plus className="w-3.5 h-3.5" />
            <ChevronDown className="w-3.5 h-3.5 absolute -bottom-1" />
          </div>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToolbarDuplicate}
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-green-400"
          title="Duplicate step"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToolbarEdit}
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-purple-400"
          title="Edit step"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToolbarDelete}
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-red-400"
          title="Delete step"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-purple-500',
          'hover:!border-purple-400 hover:!bg-purple-400/20 transition-colors'
        )}
      />

      {/* Node Header */}
      <div className={cn("flex items-center gap-3 px-4 py-3 border-b border-border/50", config.headerBg)}>
        {/* Icon */}
        <div
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg',
            config.iconBg
          )}
        >
          <Workflow className="w-4 h-4 text-white" />
        </div>

        {/* Title and Order */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-mono', config.orderColor)}>#{data.order + 1}</span>
            <h3 className={cn('font-medium truncate text-sm', config.titleColor)}>
              {data.label}
            </h3>
          </div>
        </div>

        {/* Cycle Warning Icon */}
        {data.hasCycleWarning && (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
          </div>
        )}

        {/* Status Icon */}
        <div
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full',
            config.iconBg
          )}
        >
          <StatusIcon className={cn('w-3.5 h-3.5 text-white', config.iconClass)} />
        </div>
      </div>

      {/* Node Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Target Workflow */}
        <div className="relative">
          <div className={cn('text-xs mb-1 flex items-center gap-1', config.labelColor)}>
            <Workflow className="w-3 h-3" />
            <span>Target Workflow</span>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-2 font-medium text-sm text-purple-200 truncate">
            {data.targetWorkflowName || 'Not selected'}
          </div>
        </div>

        {/* Child Progress (when running) */}
        {data.status === 'running' && data.childProgress && (
          <div className="bg-purple-900/20 rounded-lg p-2 border border-purple-500/30">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-purple-300">
                {data.childProgress.currentStep}/{data.childProgress.totalSteps}
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{
                  width: `${(data.childProgress.currentStep / data.childProgress.totalSteps) * 100}%`
                }}
              />
            </div>
            {data.childProgress.currentNodeName && (
              <div className="text-xs text-muted-foreground mt-1 truncate">
                Running: {data.childProgress.currentNodeName}
              </div>
            )}
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn(
            'px-2 py-0.5 rounded-full',
            data.waitForCompletion ? 'bg-green-900/30 text-green-400' : 'bg-muted text-muted-foreground'
          )}>
            {data.waitForCompletion ? 'Wait' : 'Fire & Forget'}
          </span>
          {data.waitForCompletion && (
            <span className={cn(
              'px-2 py-0.5 rounded-full',
              data.onChildFailure === 'fail' ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'
            )}>
              {data.onChildFailure === 'fail' ? 'Stop on Fail' : 'Continue on Fail'}
            </span>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-purple-500',
          'hover:!border-purple-400 hover:!bg-purple-400/20 transition-colors'
        )}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} usePortal>
          <NodeContextMenuItems
            onInsertBefore={data.onInsertBefore ? handleInsertBefore : undefined}
            onInsertAfter={data.onInsertAfter ? handleInsertAfter : undefined}
            onDuplicate={data.onDuplicate ? handleDuplicate : undefined}
            onEdit={data.onEdit ? handleEdit : undefined}
            onExport={data.onExportNode ? handleExportNode : undefined}
            onSaveAsTemplate={data.onSaveAsTemplate ? handleSaveAsTemplate : undefined}
            onDelete={data.onDelete ? handleDelete : undefined}
          />
        </ContextMenu>
      )}
    </div>
  );
});

TriggerWorkflowNode.displayName = 'TriggerWorkflowNode';
