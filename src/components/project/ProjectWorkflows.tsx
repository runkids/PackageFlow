/**
 * Project workflows component
 * @see specs/002-frontend-project-manager/tasks.md - T3.3
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit,
  MoreVertical,
  Link2,
  Unlink,
  Workflow as WorkflowIcon,
  Terminal,
  ChevronRight,
  ArrowLeft,
  ChevronDown,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
} from 'lucide-react';
import type { Workflow } from '../../types/workflow';
import {
  loadWorkflowsByProject,
  loadWorkflows,
  createWorkflowForProject,
  deleteWorkflow as deleteWorkflowApi,
  saveWorkflow,
} from '../../lib/workflow-storage';
import { Dialog, DialogContent, DialogClose } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';
import { cn } from '../../lib/utils';
import { useWorkflowExecutionContext } from '../../contexts/WorkflowExecutionContext';
import {
  WorkflowStatusBadge,
  WorkflowExecutionStatus,
} from '../workflow/WorkflowExecutionStatus';
import { WorkflowOutputPanel } from '../workflow/WorkflowOutputPanel';
import { WorkflowPreview } from '../workflow/WorkflowPreview';
import type { WorkflowExecutionState } from '../../hooks/useWorkflowExecution';
import { formatDuration } from '../../hooks/useWorkflowExecution';

interface ProjectWorkflowsProps {
  projectId: string;
  projectPath: string;
  scripts: Record<string, string>;
  onEditWorkflow?: (workflow: Workflow) => void;
  onNavigateToWorkflow?: (workflow: Workflow, projectPath: string) => void;
}

/**
 * Maps workflow execution status to visual status for icon display
 */
function getIconStatus(state: WorkflowExecutionState): 'idle' | 'running' | 'completed' | 'failed' {
  switch (state.status) {
    case 'starting':
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

/**
 * Icon area component with status indicator
 */
function WorkflowIconArea({
  status,
  isExpanded,
}: {
  status: 'idle' | 'running' | 'completed' | 'failed';
  isExpanded: boolean;
}) {
  const iconConfig = {
    idle: {
      icon: WorkflowIcon,
      color: isExpanded ? 'text-blue-400' : 'text-muted-foreground',
      bg: isExpanded ? 'bg-blue-500/15 border-blue-500/30' : 'bg-muted/50 border-border',
    },
    running: {
      icon: Loader2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/15 border-blue-500/30',
      animation: 'animate-spin',
    },
    completed: {
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-500/15 border-green-500/30',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/15 border-red-500/30',
    },
  };

  const config = iconConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'w-10 h-10 rounded-lg flex-shrink-0',
        'flex items-center justify-center',
        'border transition-all duration-200',
        config.bg,
        status === 'running' && 'animate-pulse-subtle'
      )}
    >
      <Icon
        className={cn(
          'w-5 h-5 transition-colors',
          config.color,
          'animation' in config && config.animation
        )}
      />
    </div>
  );
}

/**
 * Execute button with integrated loading state
 */
function ExecuteButton({
  isExecuting,
  disabled = false,
  onClick,
}: {
  isExecuting: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled || isExecuting}
      className={cn(
        'h-8 w-8',
        isExecuting && 'bg-blue-500/20 cursor-wait'
      )}
      title={isExecuting ? 'Running...' : disabled ? 'No steps to run' : 'Run workflow'}
    >
      {isExecuting ? (
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
      ) : (
        <Play className="w-4 h-4 text-green-400" />
      )}
    </Button>
  );
}

export function ProjectWorkflows({
  projectId,
  projectPath,
  scripts: _scripts,
  onEditWorkflow,
  onNavigateToWorkflow,
}: ProjectWorkflowsProps) {
  // TODO: T3.4 - Implement drag-to-create workflow nodes using scripts
  void _scripts;
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [globalWorkflows, setGlobalWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ workflowId: string; x: number; y: number } | null>(null);
  const [outputPanelWorkflowId, setOutputPanelWorkflowId] = useState<string | null>(null);
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());

  const toggleWorkflowExpand = useCallback((workflowId: string) => {
    setExpandedWorkflows(prev => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  }, []);

  // Workflow execution state management (from context to persist across tab switches)
  const {
    getExecutionState,
    executeWorkflow: startExecution,
    cancelExecution,
    clearExecution,
    isExecuting,
  } = useWorkflowExecutionContext();

  const loadProjectWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await loadWorkflowsByProject(projectId);
      setWorkflows(loaded);
    } catch (error) {
      console.error('Failed to load project workflows:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadGlobalWorkflowsList = useCallback(async () => {
    try {
      const all = await loadWorkflows();
      const globals = all.filter(w => !w.projectId);
      setGlobalWorkflows(globals);
    } catch (error) {
      console.error('Failed to load global workflows:', error);
    }
  }, []);

  useEffect(() => {
    loadProjectWorkflows();
  }, [loadProjectWorkflows]);

  const handleAddClick = () => {
    loadGlobalWorkflowsList();
    setShowAddDialog(true);
  };

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) return;

    const newWorkflow = createWorkflowForProject(projectId, newWorkflowName.trim());
    const response = await saveWorkflow(newWorkflow);

    if (response.success && response.workflow) {
      setWorkflows(prev => [...prev, response.workflow!]);
      setShowNewForm(false);
      setShowAddDialog(false);
      setNewWorkflowName('');

      if (onNavigateToWorkflow) {
        onNavigateToWorkflow(response.workflow, projectPath);
      } else if (onEditWorkflow) {
        onEditWorkflow(response.workflow);
      }
    }
  };

  const handleLinkWorkflow = async (workflow: Workflow) => {
    const updatedWorkflow: Workflow = {
      ...workflow,
      projectId,
    };

    const response = await saveWorkflow(updatedWorkflow);

    if (response.success && response.workflow) {
      setWorkflows(prev => [...prev, response.workflow!]);
      setGlobalWorkflows(prev => prev.filter(w => w.id !== workflow.id));
      setShowLinkDialog(false);
      setShowAddDialog(false);
    }
  };

  const handleExecuteWorkflow = async (workflow: Workflow) => {
    console.log('[ProjectWorkflows] handleExecuteWorkflow called with:', workflow.id);

    // Don't start if already executing
    if (isExecuting(workflow.id)) {
      console.log('[ProjectWorkflows] Workflow already executing, skipping');
      return;
    }

    try {
      const result = await startExecution(workflow.id, workflow.nodes.length);
      console.log('[ProjectWorkflows] executeWorkflow result:', result);
      if (!result.success) {
        console.error('Failed to execute workflow:', result.error);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    }
  };

  const handleCancelExecution = async (workflowId: string) => {
    try {
      await cancelExecution(workflowId);
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    }
  };

  const handleViewOutput = (workflowId: string) => {
    setOutputPanelWorkflowId(workflowId);
  };

  const _handleDeleteWorkflow = async (workflowId: string) => {
    try {
      const response = await deleteWorkflowApi(workflowId);
      if (response.success) {
        setWorkflows(prev => prev.filter(w => w.id !== workflowId));
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
    setContextMenu(null);
  };
  void _handleDeleteWorkflow;

  const handleUnlinkWorkflow = async (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    try {
      const updatedWorkflow: Workflow = {
        ...workflow,
        projectId: undefined,
      };

      const response = await saveWorkflow(updatedWorkflow);
      if (response.success) {
        setWorkflows(prev => prev.filter(w => w.id !== workflowId));
      }
    } catch (error) {
      console.error('Failed to unlink workflow:', error);
    }
    setContextMenu(null);
  };

  const handleEditClick = (workflow: Workflow) => {
    if (onNavigateToWorkflow) {
      onNavigateToWorkflow(workflow, projectPath);
    } else if (onEditWorkflow) {
      onEditWorkflow(workflow);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, workflowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ workflowId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = () => closeContextMenu();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-3" onClick={closeContextMenu}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Project workflows</h3>
        <Button
          variant="default"
          size="sm"
          onClick={handleAddClick}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New
        </Button>
      </div>

      {/* Workflow list */}
      {workflows.length === 0 ? (
        /* Empty state - matching ListSidebarEmpty style */
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl mb-4',
              'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-purple-500/10',
              'dark:from-blue-500/15 dark:via-blue-600/10 dark:to-purple-500/10',
              'flex items-center justify-center',
              'border border-blue-500/20',
              'shadow-lg shadow-blue-500/5'
            )}
          >
            <WorkflowIcon className="w-7 h-7 text-blue-500 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No workflows yet</h3>
          <p className="mt-2 text-xs text-muted-foreground max-w-[200px] leading-relaxed">
            Create a project-specific workflow to automate tasks
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={handleAddClick}
            className="mt-4"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Workflow
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {workflows.map(workflow => {
            const executionState = getExecutionState(workflow.id);
            const workflowIsExecuting = isExecuting(workflow.id);
            const hasExecutionState = executionState.status !== 'idle';
            const isExpanded = expandedWorkflows.has(workflow.id);
            const iconStatus = getIconStatus(executionState);

            return (
              <li
                key={workflow.id}
                className="group relative"
              >
                {/* Main card - clickable to expand/collapse */}
                <div
                  onClick={() => toggleWorkflowExpand(workflow.id)}
                  onContextMenu={e => handleContextMenu(e, workflow.id)}
                  className={cn(
                    'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer',
                    'transition-all duration-150',
                    // Expanded/selected state
                    isExpanded && [
                      'bg-blue-600/15 dark:bg-blue-600/20',
                      'border border-blue-500/30',
                      'shadow-sm',
                    ],
                    // Default hover state
                    !isExpanded && [
                      'border border-transparent',
                      'hover:bg-accent hover:border-border',
                    ],
                    // Running pulse effect
                    workflowIsExecuting && isExpanded && 'animate-pulse-subtle'
                  )}
                >
                  {/* Icon area with status indicator */}
                  <WorkflowIconArea
                    status={iconStatus}
                    isExpanded={isExpanded}
                  />

                  {/* Content area */}
                  <div className="flex-1 min-w-0 space-y-0.5 py-0.5">
                    {/* Name row */}
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium truncate leading-tight',
                          isExpanded ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'
                        )}
                      >
                        {workflow.name}
                      </span>
                      {/* Inline status badge */}
                      {hasExecutionState && (
                        <WorkflowStatusBadge state={executionState} />
                      )}
                    </div>

                    {/* Metadata row */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{workflow.nodes.length} steps</span>
                      {executionState.status === 'completed' && executionState.startedAt && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-green-400">
                            {formatDuration(executionState.startedAt, executionState.finishedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Execute button */}
                    <ExecuteButton
                      isExecuting={workflowIsExecuting}
                      disabled={workflow.nodes.length === 0}
                      onClick={() => handleExecuteWorkflow(workflow)}
                    />

                    {/* View output button */}
                    {executionState.output.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                          e.stopPropagation();
                          handleViewOutput(workflow.id);
                        }}
                        className="h-8 w-8"
                        title="View output"
                      >
                        <Terminal className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}

                    {/* More options button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={e => {
                        e.stopPropagation();
                        handleContextMenu(e, workflow.id);
                      }}
                      className={cn(
                        'h-8 w-8 transition-opacity duration-150',
                        contextMenu?.workflowId === workflow.id
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      )}
                      title="More options"
                    >
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </Button>

                    {/* Expand indicator */}
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform duration-200',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="ml-[52px] mt-1 space-y-2">
                    {/* Workflow preview - steps only, no action buttons */}
                    <WorkflowPreview
                      nodes={workflow.nodes}
                      isRunning={workflowIsExecuting}
                      currentNodeIndex={executionState.completedNodes}
                      showActions={false}
                    />
                  </div>
                )}

                {/* Collapsed execution status (when not expanded but has state) */}
                {!isExpanded && hasExecutionState && !workflowIsExecuting && executionState.status !== 'idle' && (
                  <div className="ml-[52px] mt-2">
                    <WorkflowExecutionStatus
                      state={executionState}
                      onCancel={() => handleCancelExecution(workflow.id)}
                      onViewOutput={() => handleViewOutput(workflow.id)}
                      onClear={() => clearExecution(workflow.id)}
                      compact={false}
                    />
                  </div>
                )}

                {/* Running progress bar (when collapsed) */}
                {!isExpanded && workflowIsExecuting && (
                  <div className="ml-[52px] mt-2 pr-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {executionState.currentNode
                          ? `Running: ${executionState.currentNode.name}`
                          : 'Starting...'}
                      </span>
                      <span>{executionState.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-out animate-pulse"
                        style={{ width: `${Math.max(executionState.progress, 2)}%` }}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}>
          <ContextMenuItem
            onClick={() => {
              const workflow = workflows.find(w => w.id === contextMenu.workflowId);
              if (workflow) handleEditClick(workflow);
              closeContextMenu();
            }}
            icon={<Edit className="w-4 h-4" />}
          >
            Edit
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => handleUnlinkWorkflow(contextMenu.workflowId)}
            icon={<Unlink className="w-4 h-4" />}
            warning
          >
            Unlink
          </ContextMenuItem>
        </ContextMenu>
      )}

      {/* Add workflow selection dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className={cn(
          'bg-background border-blue-500/30 max-w-md p-0 overflow-hidden',
          'shadow-2xl shadow-black/60'
        )}>
          {/* Header with gradient background and icon badge */}
          <div className={cn(
            'relative px-6 py-5',
            'border-b border-border',
            'bg-gradient-to-r',
            'dark:from-blue-500/15 dark:via-blue-600/5 dark:to-transparent',
            'from-blue-500/10 via-blue-600/5 to-transparent'
          )}>
            {/* Close button - positioned inside header which has relative */}
            <DialogClose onClick={() => setShowAddDialog(false)} />

            <div className="flex items-center gap-4 pr-8">
              {/* Icon badge */}
              <div className={cn(
                'flex-shrink-0',
                'w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border',
                'bg-blue-500/10 border-blue-500/20',
                'shadow-lg'
              )}>
                <WorkflowIcon className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground leading-tight">
                  Add workflow
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create or link a workflow to this project
                </p>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="p-6">
            {!showNewForm && !showLinkDialog ? (
              <div className="space-y-4">
                {/* Create new workflow option */}
                <Button
                  variant="ghost"
                  onClick={() => setShowNewForm(true)}
                  className={cn(
                    'w-full justify-start gap-4 p-4 h-auto',
                    'bg-card/50 rounded-xl',
                    'border border-border',
                    'hover:border-blue-500/40 hover:bg-blue-500/5',
                    'dark:hover:bg-blue-500/10',
                    'transition-all duration-150',
                    'group',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
                  )}
                >
                  {/* Icon with refined styling */}
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex-shrink-0',
                    'flex items-center justify-center',
                    'bg-blue-500/10 border border-blue-500/20',
                    'group-hover:bg-blue-500/15 transition-colors'
                  )}>
                    <Plus className="w-6 h-6 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-foreground">Create new workflow</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Create a project-specific workflow and start editing
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-400 transition-colors flex-shrink-0" />
                </Button>

                {/* Link existing workflow option */}
                <Button
                  variant="ghost"
                  onClick={() => setShowLinkDialog(true)}
                  disabled={globalWorkflows.length === 0}
                  className={cn(
                    'w-full justify-start gap-4 p-4 h-auto',
                    'bg-card/50 rounded-xl',
                    'border border-border',
                    'hover:border-purple-500/40 hover:bg-purple-500/5',
                    'dark:hover:bg-purple-500/10',
                    'transition-all duration-150',
                    'group',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'disabled:hover:border-border disabled:hover:bg-transparent'
                  )}
                >
                  {/* Icon with refined styling */}
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex-shrink-0',
                    'flex items-center justify-center',
                    'bg-purple-500/10 border border-purple-500/20',
                    'group-hover:bg-purple-500/15 group-disabled:group-hover:bg-purple-500/10 transition-colors'
                  )}>
                    <Link2 className="w-6 h-6 text-purple-400" />
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-foreground">Link existing workflow</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {globalWorkflows.length > 0
                        ? `Choose a global workflow to link (${globalWorkflows.length} available)`
                        : 'No global workflows available'
                      }
                    </div>
                  </div>

                  {/* Arrow indicator - only show when enabled */}
                  {globalWorkflows.length > 0 && (
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-purple-400 transition-colors flex-shrink-0" />
                  )}
                </Button>
              </div>
            ) : showNewForm ? (
              /* Create new workflow form */
              <div className="space-y-4">
                {/* Back navigation */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewForm(false);
                    setNewWorkflowName('');
                  }}
                  className={cn(
                    'gap-2 h-auto px-0',
                    'hover:text-foreground'
                  )}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to options
                </Button>

                {/* Form content */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-foreground">Workflow name</span>
                    <input
                      type="text"
                      placeholder="Enter workflow name..."
                      value={newWorkflowName}
                      onChange={e => setNewWorkflowName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateWorkflow();
                        if (e.key === 'Escape') {
                          setShowNewForm(false);
                          setNewWorkflowName('');
                        }
                      }}
                      autoFocus
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className={cn(
                        'mt-2 w-full px-3 py-2.5',
                        'bg-background border border-border rounded-lg',
                        'text-sm text-foreground placeholder-muted-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                        'transition-shadow duration-150'
                      )}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Working directory: <span className="font-mono text-foreground/70">{projectPath}</span>
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewWorkflowName('');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleCreateWorkflow}
                    disabled={!newWorkflowName.trim()}
                  >
                    Create and edit
                  </Button>
                </div>
              </div>
            ) : (
              /* Link existing workflow list */
              <div className="space-y-4">
                {/* Back navigation */}
                <button
                  onClick={() => setShowLinkDialog(false)}
                  className={cn(
                    'flex items-center gap-2 text-sm text-muted-foreground',
                    'hover:text-foreground transition-colors',
                    'focus:outline-none focus:text-foreground'
                  )}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to options
                </button>

                {/* Workflow list */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {globalWorkflows.map(workflow => (
                    <button
                      key={workflow.id}
                      onClick={() => handleLinkWorkflow(workflow)}
                      className={cn(
                        'w-full flex items-center gap-4 p-3',
                        'bg-card/50 rounded-lg',
                        'border border-border',
                        'hover:border-purple-500/40 hover:bg-purple-500/5',
                        'dark:hover:bg-purple-500/10',
                        'transition-all duration-150',
                        'text-left group',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background'
                      )}
                    >
                      {/* Workflow icon */}
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex-shrink-0',
                        'flex items-center justify-center',
                        'bg-purple-500/10 border border-purple-500/20',
                        'group-hover:bg-purple-500/15 transition-colors'
                      )}>
                        <WorkflowIcon className="w-5 h-5 text-purple-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{workflow.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {workflow.nodes.length} {workflow.nodes.length === 1 ? 'step' : 'steps'}
                        </div>
                      </div>

                      <Link2 className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Output Panel Dialog */}
      {outputPanelWorkflowId && (
        <WorkflowOutputPanel
          workflowId={outputPanelWorkflowId}
          workflowName={workflows.find(w => w.id === outputPanelWorkflowId)?.name || 'Workflow'}
          state={getExecutionState(outputPanelWorkflowId)}
          onClose={() => setOutputPanelWorkflowId(null)}
        />
      )}
    </div>
  );
}
