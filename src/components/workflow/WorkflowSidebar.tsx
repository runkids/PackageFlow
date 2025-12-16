/**
 * Workflow Sidebar Component
 * @see specs/001-expo-workflow-automation/spec.md - US3
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Workflow as WorkflowIcon,
  Trash2,
  Copy,
  ArrowUpFromLine,
  ArrowDownToLine,
} from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import type { ExecutionStatus } from '../../types/workflow';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DeleteConfirmDialog } from '../ui/ConfirmDialog';
import {
  ListSidebarHeader,
  ListSidebarItem,
  ListSidebarEmpty,
} from '../ui/ListSidebar';
import type { SortOption, ItemStatus } from '../ui/ListSidebar';
import type { Workflow } from '../../types/workflow';
import type { WorkflowSortMode } from '../../types/tauri';

interface WorkflowSidebarProps {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
  sortMode: WorkflowSortMode;
  workflowOrder: string[];
  /** Map of workflow ID to execution status */
  executionStatuses?: Map<string, ExecutionStatus>;
  onSelectWorkflow: (workflow: Workflow) => void;
  onCreateWorkflow: () => void;
  onDeleteWorkflow: (workflowId: string) => void;
  onDuplicateWorkflow?: (workflow: Workflow) => void;
  onSortModeChange: (mode: WorkflowSortMode) => void;
  onWorkflowOrderChange: (order: string[]) => void;
}

const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'created', label: 'Date Created' },
  { value: 'custom', label: 'Custom Order' },
];

// Map ExecutionStatus to ItemStatus
function mapExecutionStatus(status?: ExecutionStatus): ItemStatus | undefined {
  if (!status) return undefined;
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'paused':
      return 'paused';
    default:
      return 'idle';
  }
}

interface SortableWorkflowItemProps {
  workflow: Workflow;
  isActive: boolean;
  isMenuOpen: boolean;
  isDraggable: boolean;
  executionStatus?: ExecutionStatus;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortableWorkflowItem({
  workflow,
  isActive,
  isMenuOpen,
  isDraggable,
  executionStatus,
  onSelect,
  onContextMenu,
}: SortableWorkflowItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workflow.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Build secondary metadata (webhook indicators)
  const secondaryMeta =
    workflow.webhook?.enabled || workflow.incomingWebhook?.enabled ? (
      <span className="flex items-center gap-0.5">
        {workflow.webhook?.enabled && (
          <span title="Outgoing Webhook enabled" className="text-green-500">
            <ArrowUpFromLine className="w-3 h-3" />
          </span>
        )}
        {workflow.incomingWebhook?.enabled && (
          <span title="Incoming Webhook enabled" className="text-purple-500">
            <ArrowDownToLine className="w-3 h-3" />
          </span>
        )}
      </span>
    ) : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <ListSidebarItem
        id={workflow.id}
        name={workflow.name || 'Untitled workflow'}
        description={workflow.description}
        icon={WorkflowIcon}
        primaryMeta={`${workflow.nodes.length} steps`}
        secondaryMeta={secondaryMeta}
        status={mapExecutionStatus(executionStatus)}
        isSelected={isActive}
        isMenuOpen={isMenuOpen}
        isDraggable={isDraggable}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

export function WorkflowSidebar({
  workflows,
  selectedWorkflowId,
  sortMode,
  workflowOrder,
  executionStatuses,
  onSelectWorkflow,
  onCreateWorkflow,
  onDeleteWorkflow,
  onDuplicateWorkflow,
  onSortModeChange,
  onWorkflowOrderChange,
}: WorkflowSidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    workflowId: string;
    x: number;
    y: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Listen for Cmd+F shortcut event to focus search input
  useEffect(() => {
    const handleShortcutFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('shortcut-focus-search', handleShortcutFocusSearch);
    return () =>
      window.removeEventListener(
        'shortcut-focus-search',
        handleShortcutFocusSearch
      );
  }, []);

  const sortedWorkflows = useMemo(() => {
    let filtered = [...workflows];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          (w.name || '').toLowerCase().includes(query) ||
          (w.description || '').toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sortMode) {
      case 'name':
        return filtered.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );
      case 'updated':
        return filtered.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      case 'created':
        return filtered.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      case 'custom':
        return filtered.sort((a, b) => {
          const aIndex = workflowOrder.indexOf(a.id);
          const bIndex = workflowOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1)
            return (a.name || '').localeCompare(b.name || '');
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      default:
        return filtered.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }
  }, [workflows, sortMode, workflowOrder, searchQuery]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortedWorkflows.findIndex((w) => w.id === active.id);
        const newIndex = sortedWorkflows.findIndex((w) => w.id === over.id);

        const newSortedWorkflows = arrayMove(sortedWorkflows, oldIndex, newIndex);
        const newOrder = newSortedWorkflows.map((w) => w.id);
        onWorkflowOrderChange(newOrder);
      }
    },
    [sortedWorkflows, onWorkflowOrderChange]
  );

  const handleContextMenu = (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isButtonClick = e.type === 'click';
    setContextMenu({
      workflowId,
      x: isButtonClick ? rect.right - 140 : e.clientX,
      y: isButtonClick ? rect.bottom + 4 : e.clientY,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDeleteClick = (workflow: Workflow) => {
    setDeleteTarget(workflow);
    closeContextMenu();
  };

  const handleDuplicateClick = (workflow: Workflow) => {
    onDuplicateWorkflow?.(workflow);
    closeContextMenu();
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteWorkflow(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-background"
      onClick={closeContextMenu}
    >
      {/* Search and actions */}
      <ListSidebarHeader
        searchQuery={searchQuery}
        searchPlaceholder="Search workflows..."
        sortMode={sortMode}
        sortOptions={SORT_OPTIONS}
        onSearchChange={setSearchQuery}
        onSortModeChange={(mode) => onSortModeChange(mode as WorkflowSortMode)}
        onCreateNew={onCreateWorkflow}
      />

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto">
        {sortedWorkflows.length === 0 ? (
          <ListSidebarEmpty
            type="workflows"
            hasSearch={searchQuery.trim().length > 0}
            searchQuery={searchQuery}
            onCreateNew={onCreateWorkflow}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedWorkflows.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="p-2 space-y-1">
                {sortedWorkflows.map((workflow) => (
                  <SortableWorkflowItem
                    key={workflow.id}
                    workflow={workflow}
                    isActive={selectedWorkflowId === workflow.id}
                    isMenuOpen={contextMenu?.workflowId === workflow.id}
                    isDraggable={sortMode === 'custom'}
                    executionStatus={executionStatuses?.get(workflow.id)}
                    onSelect={() => onSelectWorkflow(workflow)}
                    onContextMenu={(e) => handleContextMenu(e, workflow.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Drag hint - only show in custom mode */}
      {sortMode === 'custom' && sortedWorkflows.length > 1 && (
        <div className="px-2 py-1.5 border-t border-border text-xs text-muted-foreground text-center">
          Drag items to reorder
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
          {onDuplicateWorkflow && (
            <ContextMenuItem
              onClick={() => {
                const workflow = workflows.find((w) => w.id === contextMenu.workflowId);
                if (workflow) handleDuplicateClick(workflow);
              }}
              icon={<Copy className="w-4 h-4" />}
            >
              Duplicate
            </ContextMenuItem>
          )}
          {onDuplicateWorkflow && <ContextMenuSeparator />}
          <ContextMenuItem
            onClick={() => {
              const workflow = workflows.find((w) => w.id === contextMenu.workflowId);
              if (workflow) handleDeleteClick(workflow);
            }}
            icon={<Trash2 className="w-4 h-4" />}
            destructive
          >
            Delete
          </ContextMenuItem>
        </ContextMenu>
      )}

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        itemType="workflow"
        itemName={deleteTarget?.name || ''}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
