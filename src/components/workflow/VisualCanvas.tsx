/**
 * Visual Canvas - React Flow Based Workflow Canvas
 * n8n-style visual workflow editor with drag-and-drop support
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ScriptNode, type ScriptNodeData } from './nodes/ScriptNode';
import { StartNode, type StartNodeData } from './nodes/StartNode';
import { TriggerWorkflowNode, type TriggerWorkflowNodeData } from './nodes/TriggerWorkflowNode';
import { AnimatedEdge } from './edges/AnimatedEdge';
import { InsertableEdge, type InsertableEdgeData } from './edges/InsertableEdge';
import { WorkflowEmptyState } from './WorkflowEmptyState';
import type { WorkflowNode as WorkflowNodeType, NodeStatus } from '../../types/workflow';

const nodeTypes: NodeTypes = {
  script: ScriptNode,
  start: StartNode,
  'trigger-workflow': TriggerWorkflowNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  insertable: InsertableEdge,
};

interface ChildProgressInfo {
  currentStep: number;
  totalSteps: number;
  currentNodeName?: string;
}

interface VisualCanvasProps {
  nodes: WorkflowNodeType[];
  nodeStatuses: Map<string, NodeStatus>;
  childProgressMap?: Map<string, ChildProgressInfo>;
  selectedNodeId: string | null;
  disabled?: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onEditNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onInsertNode?: (insertIndex: number) => void;
  onInsertNodeBefore?: (nodeId: string) => void;
  onInsertNodeAfter?: (nodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onReorderByPosition?: () => void;
  onExportNode?: (nodeId: string) => void;
  onSaveAsTemplate?: (nodeId: string) => void;
  // Empty state actions
  onAddStep?: () => void;
  onFromTemplate?: () => void;
}

interface NodeActionCallbacks {
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onInsertBefore?: (nodeId: string) => void;
  onInsertAfter?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onExportNode?: (nodeId: string) => void;
  onSaveAsTemplate?: (nodeId: string) => void;
  disabled?: boolean;
}

function workflowNodesToFlowNodes(
  workflowNodes: WorkflowNodeType[],
  nodeStatuses: Map<string, NodeStatus>,
  callbacks?: NodeActionCallbacks,
  childProgressMap?: Map<string, ChildProgressInfo>
): Node[] {
  const sortedNodes = [...workflowNodes].sort((a, b) => a.order - b.order);

  const startY = 80;
  const nodeSpacing = 180;

  const flowNodes: Node[] = [
    {
      id: 'start',
      type: 'start',
      position: { x: 200, y: 0 },
      data: { label: 'Start' } as StartNodeData,
      draggable: false,
      selectable: false,
    },
  ];

  sortedNodes.forEach((node, index) => {
    const defaultPosition = { x: 100, y: startY + index * nodeSpacing };
    const position = node.position ?? defaultPosition;

    if (node.type === 'trigger-workflow') {
      const config = node.config as { targetWorkflowId: string; waitForCompletion: boolean; onChildFailure: 'fail' | 'continue'; targetWorkflowName?: string };
      const childProgress = childProgressMap?.get(node.id);
      flowNodes.push({
        id: node.id,
        type: 'trigger-workflow',
        position,
        data: {
          label: node.name,
          targetWorkflowId: config.targetWorkflowId,
          targetWorkflowName: config.targetWorkflowName,
          waitForCompletion: config.waitForCompletion,
          onChildFailure: config.onChildFailure,
          status: nodeStatuses.get(node.id),
          order: node.order,
          childProgress: childProgress,
          nodeId: node.id,
          onEdit: callbacks?.onEdit,
          onDelete: callbacks?.onDelete,
          onInsertBefore: callbacks?.onInsertBefore,
          onInsertAfter: callbacks?.onInsertAfter,
          onDuplicate: callbacks?.onDuplicate,
          // Node sharing callbacks
          onExportNode: callbacks?.onExportNode,
          onSaveAsTemplate: callbacks?.onSaveAsTemplate,
          disabled: callbacks?.disabled,
        } as TriggerWorkflowNodeData,
        draggable: true,
      });
    } else {
      const config = node.config as { command: string; cwd?: string };
      flowNodes.push({
        id: node.id,
        type: 'script',
        position,
        data: {
          label: node.name,
          command: config.command,
          cwd: config.cwd,
          status: nodeStatuses.get(node.id),
          order: node.order,
          nodeId: node.id,
          onEdit: callbacks?.onEdit,
          onDelete: callbacks?.onDelete,
          onInsertBefore: callbacks?.onInsertBefore,
          onInsertAfter: callbacks?.onInsertAfter,
          onDuplicate: callbacks?.onDuplicate,
          // Node sharing callbacks
          onExportNode: callbacks?.onExportNode,
          onSaveAsTemplate: callbacks?.onSaveAsTemplate,
          disabled: callbacks?.disabled,
        } as ScriptNodeData,
        draggable: true,
      });
    }
  });

  return flowNodes;
}

function workflowNodesToFlowEdges(
  workflowNodes: WorkflowNodeType[],
  nodeStatuses: Map<string, NodeStatus>,
  onInsertClick?: (insertIndex: number) => void,
  disabled?: boolean
): Edge[] {
  const sortedNodes = [...workflowNodes].sort((a, b) => a.order - b.order);
  const edges: Edge[] = [];

  if (sortedNodes.length === 0) return edges;

  edges.push({
    id: 'start-to-first',
    source: 'start',
    target: sortedNodes[0].id,
    type: 'insertable',
    data: {
      fromStatus: 'completed',
      toStatus: nodeStatuses.get(sortedNodes[0].id),
      insertIndex: 0,
      onInsertClick,
      disabled,
    } as InsertableEdgeData,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  });

  for (let i = 0; i < sortedNodes.length - 1; i++) {
    const currentNode = sortedNodes[i];
    const nextNode = sortedNodes[i + 1];

    edges.push({
      id: `${currentNode.id}-to-${nextNode.id}`,
      source: currentNode.id,
      target: nextNode.id,
      type: 'insertable',
      data: {
        fromStatus: nodeStatuses.get(currentNode.id),
        toStatus: nodeStatuses.get(nextNode.id),
        insertIndex: i + 1,
        onInsertClick,
        disabled,
      } as InsertableEdgeData,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
      },
    });
  }

  return edges;
}

export function VisualCanvas({
  nodes: workflowNodes,
  nodeStatuses,
  childProgressMap,
  selectedNodeId,
  disabled = false,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  onInsertNode,
  onInsertNodeBefore,
  onInsertNodeAfter,
  onDuplicateNode,
  onNodePositionChange,
  onReorderByPosition,
  onExportNode,
  onSaveAsTemplate,
  onAddStep,
  onFromTemplate,
}: VisualCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isDraggingRef = useRef(false);

  // Theme detection for MiniMap colors
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const callbacksRef = useRef<NodeActionCallbacks>({
    onEdit: onEditNode,
    onDelete: onDeleteNode,
    onInsertBefore: onInsertNodeBefore,
    onInsertAfter: onInsertNodeAfter,
    onDuplicate: onDuplicateNode,
    onExportNode,
    onSaveAsTemplate,
    disabled,
  });

  useEffect(() => {
    callbacksRef.current = {
      onEdit: onEditNode,
      onDelete: onDeleteNode,
      onInsertBefore: onInsertNodeBefore,
      onInsertAfter: onInsertNodeAfter,
      onDuplicate: onDuplicateNode,
      onExportNode,
      onSaveAsTemplate,
      disabled,
    };
  }, [onEditNode, onDeleteNode, onInsertNodeBefore, onInsertNodeAfter, onDuplicateNode, onExportNode, onSaveAsTemplate, disabled]);

  useEffect(() => {
    setNodes((currentNodes) => {
      const flowNodes = workflowNodesToFlowNodes(
        workflowNodes,
        nodeStatuses,
        callbacksRef.current,
        childProgressMap
      );

      if (isDraggingRef.current && currentNodes.length > 0) {
        const currentPositions = new Map(
          currentNodes.map((n) => [n.id, n.position])
        );
        return flowNodes.map((node) => {
          const currentPos = currentPositions.get(node.id);
          if (currentPos && node.id !== 'start') {
            return { ...node, position: currentPos };
          }
          return node;
        });
      }

      return flowNodes;
    });
  }, [workflowNodes, nodeStatuses, childProgressMap, setNodes]);

  useEffect(() => {
    const flowEdges = workflowNodesToFlowEdges(workflowNodes, nodeStatuses, onInsertNode, disabled);
    setEdges(flowEdges);
  }, [workflowNodes, nodeStatuses, onInsertNode, disabled, setEdges]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id === 'start') return;
      onSelectNode(node.id);
      if (!disabled) {
        onEditNode(node.id);
      }
    },
    [onSelectNode, onEditNode, disabled]
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id === 'start' || disabled) return;
      onEditNode(node.id);
    },
    [onEditNode, disabled]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      if (node.id === 'start' || !onNodePositionChange) {
        isDraggingRef.current = false;
        return;
      }

      await onNodePositionChange(node.id, { x: node.position.x, y: node.position.y });

      if (onReorderByPosition) {
        setTimeout(() => {
          onReorderByPosition();
          isDraggingRef.current = false;
        }, 150);
      } else {
        isDraggingRef.current = false;
      }
    },
    [onNodePositionChange, onReorderByPosition]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled || !selectedNodeId) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        onDeleteNode(selectedNodeId);
        onSelectNode(null);
      }
    },
    [disabled, selectedNodeId, onDeleteNode, onSelectNode]
  );

  const minimapNodeColor = useCallback((node: Node) => {
    if (node.id === 'start') return isDarkMode ? '#10b981' : '#059669';

    const isTriggerNode = node.type === 'trigger-workflow';
    const data = node.data as ScriptNodeData | TriggerWorkflowNodeData;

    // Light mode uses lighter/softer colors for better visibility
    if (!isDarkMode) {
      switch (data.status) {
        case 'running':
          return isTriggerNode ? '#c4b5fd' : '#93c5fd';
        case 'completed':
          return '#86efac';
        case 'failed':
          return '#fca5a5';
        case 'skipped':
          return '#d1d5db';
        default:
          return isTriggerNode ? '#c4b5fd' : '#d1d5db';
      }
    }

    // Dark mode colors (original)
    switch (data.status) {
      case 'running':
        return isTriggerNode ? '#a855f7' : '#3b82f6';
      case 'completed':
        return '#22c55e';
      case 'failed':
        return '#ef4444';
      case 'skipped':
        return '#6b7280';
      default:
        return isTriggerNode ? '#7c3aed' : '#374151';
    }
  }, [isDarkMode]);

  if (workflowNodes.length === 0) {
    return (
      <WorkflowEmptyState
        onAddStep={onAddStep || (() => {})}
        onFromTemplate={onFromTemplate}
      />
    );
  }

  return (
    <div
      className="w-full h-full"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
        }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        nodesDraggable={!disabled}
        nodesConnectable={false}
        elementsSelectable={!disabled}
        selectNodesOnDrag={false}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        className="bg-background"
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="hsl(var(--muted-foreground) / 0.3)"
        />

        <Controls
          showInteractive={false}
          className="!bg-card/90 !border-border/50 !shadow-xl !backdrop-blur-sm !rounded-lg"
        />

        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="hsl(var(--background) / 0.85)"
          className="!bg-card/90 !border-border/50 !rounded-lg !shadow-xl"
          style={{ backgroundColor: 'hsl(var(--card))' }}
          pannable
          zoomable
        />

        <Panel position="bottom-center" className="!mb-4">
          <div className="flex items-center gap-4 px-4 py-2 bg-card/80 rounded-lg backdrop-blur-sm border border-border">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Running</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

    </div>
  );
}
