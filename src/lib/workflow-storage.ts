/**
 * Workflow storage module (Tauri version)
 * Uses SQLite database via Tauri commands for persistent storage
 * @see specs/001-expo-workflow-automation/contracts/ipc-api.md
 */

import type {
  Workflow,
  WorkflowNode,
  ScriptNodeConfig,
  SaveResponse,
  DeleteResponse,
  ExecuteResponse,
  CancelResponse,
  ContinueResponse,
} from '../types/workflow';
import { workflowAPI, settingsAPI } from './tauri-api';

/**
 * Generate UUID v4
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new workflow
 * @param name Workflow name
 * @param description Description (optional)
 * @param projectId Associated project ID (optional)
 */
export function createWorkflow(name: string, description?: string, projectId?: string): Workflow {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    description,
    projectId,
    nodes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a workflow for a specific project
 * @param projectId Project ID
 * @param name Workflow name
 * @param description Description (optional)
 */
export function createWorkflowForProject(projectId: string, name: string, description?: string): Workflow {
  return createWorkflow(name, description, projectId);
}

/**
 * Create a new script node
 */
export function createScriptNode(
  name: string,
  command: string,
  order: number,
  config?: Partial<ScriptNodeConfig>
): WorkflowNode {
  return {
    id: generateId(),
    type: 'script',
    name,
    config: {
      command,
      cwd: config?.cwd,
      timeout: config?.timeout,
    },
    order,
  };
}

/**
 * Load all workflows from SQLite database
 */
export async function loadWorkflows(): Promise<Workflow[]> {
  try {
    return await settingsAPI.loadWorkflows();
  } catch (error) {
    console.error('[Tauri] Failed to load workflows:', error);
    return [];
  }
}

/**
 * Load workflows for a specific project
 * @param projectId Project ID (if undefined, loads global workflows)
 */
export async function loadWorkflowsByProject(projectId: string | undefined): Promise<Workflow[]> {
  const allWorkflows = await loadWorkflows();
  if (projectId === undefined) {
    return allWorkflows.filter(w => !w.projectId);
  }
  return allWorkflows.filter(w => w.projectId === projectId);
}

/**
 * Save workflow
 * Uses backend command to trigger incoming webhook server sync
 */
export async function saveWorkflow(workflow: Workflow): Promise<SaveResponse> {
  try {
    console.log('[workflow-storage] saveWorkflow called');
    console.log('[workflow-storage] workflow.projectId:', workflow.projectId);
    console.log('[workflow-storage] workflow.incomingWebhook:', workflow.incomingWebhook);
    console.log('[workflow-storage] workflow.incomingWebhook?.token length:', workflow.incomingWebhook?.token?.length);

    const updatedWorkflow: Workflow = {
      ...workflow,
      updatedAt: new Date().toISOString(),
    };

    console.log('[workflow-storage] updatedWorkflow.projectId:', updatedWorkflow.projectId);
    console.log('[workflow-storage] updatedWorkflow.incomingWebhook:', updatedWorkflow.incomingWebhook);
    await workflowAPI.saveWorkflow(updatedWorkflow);

    return { success: true, workflow: updatedWorkflow };
  } catch (error) {
    console.error('[Tauri] Failed to save workflow:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete workflow
 * Uses backend command to trigger incoming webhook server sync
 */
export async function deleteWorkflow(workflowId: string): Promise<DeleteResponse> {
  try {
    await workflowAPI.deleteWorkflow(workflowId);

    return { success: true };
  } catch (error) {
    console.error('[Tauri] Failed to delete workflow:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * 執行工作流程
 * Uses Tauri invoke to start workflow execution
 */
export async function executeWorkflow(workflowId: string): Promise<ExecuteResponse> {
  try {
    const { workflowAPI } = await import('./tauri-api');
    const executionId = await workflowAPI.executeWorkflow(workflowId);
    return { success: true, executionId };
  } catch (error) {
    console.error('[Tauri] Execute workflow failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Cancel execution
 * Uses Tauri invoke to cancel (pause) workflow execution
 */
export async function cancelExecution(executionId: string): Promise<CancelResponse> {
  try {
    const { workflowAPI } = await import('./tauri-api');
    await workflowAPI.cancelExecution(executionId);
    return { success: true };
  } catch (error) {
    console.error('[Tauri] Cancel execution failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Continue execution
 * Uses Tauri invoke to continue paused workflow execution
 */
export async function continueExecution(executionId: string): Promise<ContinueResponse> {
  try {
    const { workflowAPI } = await import('./tauri-api');
    await workflowAPI.continueExecution(executionId);
    return { success: true };
  } catch (error) {
    console.error('[Tauri] Continue execution failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Add node to workflow
 */
export function addNodeToWorkflow(
  workflow: Workflow,
  name: string,
  command: string,
  config?: Partial<ScriptNodeConfig>
): Workflow {
  const order = workflow.nodes.length;
  const node = createScriptNode(name, command, order, config);
  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Update node in workflow
 */
export function updateNodeInWorkflow(
  workflow: Workflow,
  nodeId: string,
  updates: Partial<Pick<WorkflowNode, 'name' | 'config'>>
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            ...updates,
            config: updates.config ? { ...node.config, ...updates.config } : node.config,
          }
        : node
    ),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove node from workflow
 */
export function removeNodeFromWorkflow(workflow: Workflow, nodeId: string): Workflow {
  const filteredNodes = workflow.nodes.filter((node) => node.id !== nodeId);
  const reorderedNodes = filteredNodes.map((node, index) => ({
    ...node,
    order: index,
  }));
  return {
    ...workflow,
    nodes: reorderedNodes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reorder nodes in workflow
 */
export function reorderNodes(workflow: Workflow, fromIndex: number, toIndex: number): Workflow {
  const nodes = [...workflow.nodes];
  const [movedNode] = nodes.splice(fromIndex, 1);
  nodes.splice(toIndex, 0, movedNode);

  const reorderedNodes = nodes.map((node, index) => ({
    ...node,
    order: index,
  }));

  return {
    ...workflow,
    nodes: reorderedNodes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Insert new node at specific position
 * @param workflow Target workflow
 * @param name Node name
 * @param command Shell command
 * @param insertIndex Insert position (0-based)
 * @param config Optional configuration
 * @returns Updated workflow
 */
export function insertNodeAtPosition(
  workflow: Workflow,
  name: string,
  command: string,
  insertIndex: number,
  config?: Partial<ScriptNodeConfig>
): Workflow {
  const node = createScriptNode(name, command, insertIndex, config);

  const updatedNodes = workflow.nodes.map((n) => ({
    ...n,
    order: n.order >= insertIndex ? n.order + 1 : n.order,
  }));

  const sortedNodes = [...updatedNodes].sort((a, b) => a.order - b.order);
  const prevNode = sortedNodes.find((n) => n.order === insertIndex - 1);
  const nextNode = sortedNodes.find((n) => n.order === insertIndex + 1);

  if (prevNode?.position && nextNode?.position) {
    node.position = {
      x: (prevNode.position.x + nextNode.position.x) / 2,
      y: (prevNode.position.y + nextNode.position.y) / 2,
    };
  } else if (prevNode?.position) {
    node.position = {
      x: prevNode.position.x,
      y: prevNode.position.y + 180,
    };
  } else if (nextNode?.position) {
    node.position = {
      x: nextNode.position.x,
      y: nextNode.position.y - 180,
    };
  }

  const allNodes = [...updatedNodes, node].sort((a, b) => a.order - b.order);

  return {
    ...workflow,
    nodes: allNodes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Recalculate execution order based on node Y coordinates
 * @param workflow Target workflow
 * @returns Updated workflow with recalculated order
 */
export function reorderNodesByPosition(workflow: Workflow): Workflow {
  const nodesWithPosition = workflow.nodes.filter((n) => n.position);
  const nodesWithoutPosition = workflow.nodes.filter((n) => !n.position);

  const sortedByY = [...nodesWithPosition].sort((a, b) => {
    const ay = a.position?.y ?? 0;
    const by = b.position?.y ?? 0;
    return ay - by;
  });

  const reorderedNodes = [
    ...sortedByY.map((node, index) => ({ ...node, order: index })),
    ...nodesWithoutPosition.map((node, index) => ({
      ...node,
      order: sortedByY.length + index,
    })),
  ];

  return {
    ...workflow,
    nodes: reorderedNodes,
    updatedAt: new Date().toISOString(),
  };
}
