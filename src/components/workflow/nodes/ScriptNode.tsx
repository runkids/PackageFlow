/**
 * Script Node - n8n Style Custom Node Component
 * A visual node for executing shell commands in the workflow
 */

import { memo, useState } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { ContextMenu } from '../../ui/ContextMenu';
import { NodeContextMenuItems } from '../NodeContextMenuItems';
import { Terminal, Play, Check, X, Clock, SkipForward, Loader2, Trash2, Plus, Pencil, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import type { NodeStatus } from '../../../types/workflow';

export interface ScriptNodeData extends Record<string, unknown> {
  label: string;
  command: string;
  cwd?: string;
  status?: NodeStatus;
  order: number;
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
}

export type ScriptNodeType = Node<ScriptNodeData, 'script'>;

function getStatusConfig(status?: NodeStatus) {
  switch (status) {
    case 'running':
      return {
        borderColor: 'border-blue-500',
        bgColor: 'bg-blue-950/80',
        iconBg: 'bg-blue-500',
        icon: Loader2,
        iconClass: 'animate-spin',
        glowColor: 'shadow-blue-500/40',
        headerBg: 'bg-blue-900/30',
        // Dark background needs light text
        titleColor: 'text-white',
        orderColor: 'text-white/60',
        labelColor: 'text-white/70',
        cwdColor: 'text-white/70',
        cwdLabelColor: 'text-white/50',
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
        cwdColor: 'text-white/70',
        cwdLabelColor: 'text-white/50',
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
        cwdColor: 'text-white/70',
        cwdLabelColor: 'text-white/50',
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
        cwdColor: 'text-muted-foreground',
        cwdLabelColor: 'text-muted-foreground/70',
      };
    case 'pending':
    default:
      return {
        borderColor: 'border-border',
        bgColor: 'bg-card/90',
        iconBg: 'bg-muted-foreground',
        icon: Clock,
        iconClass: '',
        glowColor: '',
        headerBg: 'bg-muted/50',
        // Light background needs dark text
        titleColor: 'text-foreground',
        orderColor: 'text-muted-foreground',
        labelColor: 'text-muted-foreground',
        cwdColor: 'text-muted-foreground',
        cwdLabelColor: 'text-muted-foreground/70',
      };
  }
}

interface ScriptNodeProps {
  data: ScriptNodeData;
  selected?: boolean;
}

export const ScriptNode = memo(({ data, selected }: ScriptNodeProps) => {
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
        selected && 'ring-2 ring-blue-400 ring-offset-2 ring-offset-background',
        config.glowColor && `shadow-lg ${config.glowColor}`,
        'group'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
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
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-blue-400"
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
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-blue-400"
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
          className="nodrag nopan h-auto w-auto p-1.5 text-muted-foreground hover:text-blue-400"
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

      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-border',
          'hover:!border-blue-400 hover:!bg-blue-400/20 transition-colors'
        )}
      />

      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        <div
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg',
            config.iconBg
          )}
        >
          <Terminal className="w-4 h-4 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-mono', config.orderColor)}>#{data.order + 1}</span>
            <h3 className={cn('font-medium truncate text-sm', config.titleColor)}>
              {data.label}
            </h3>
          </div>
        </div>

        <div
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full',
            config.iconBg
          )}
        >
          <StatusIcon className={cn('w-3.5 h-3.5 text-white', config.iconClass)} />
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="relative">
          <div className={cn('text-xs mb-1 flex items-center gap-1', config.labelColor)}>
            <Play className="w-3 h-3" />
            <span>Command</span>
          </div>
          <div className="bg-secondary/80 rounded-lg p-2 font-mono text-xs text-foreground truncate">
            {data.command || 'No command'}
          </div>
        </div>

        {data.cwd && (
          <div className={cn('text-xs truncate', config.cwdColor)}>
            <span className={config.cwdLabelColor}>cwd:</span> {data.cwd}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-3 !h-3 !border-2 !bg-card !border-border',
          'hover:!border-blue-400 hover:!bg-blue-400/20 transition-colors'
        )}
      />

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

ScriptNode.displayName = 'ScriptNode';
