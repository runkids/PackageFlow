/**
 * Workflow Phase type definitions
 * Mirrors the Rust WorkflowDefinition and related structs from
 * src-tauri/src/models/workflow_phase.rs
 */

export interface WorkflowDefinition {
  name: string;
  description?: string;
  autopilot: boolean;
  phases: Phase[];
  transitions: WorkflowTransition[];
}

export interface Phase {
  id: string;
  name: string;
  color?: string;
  on_enter: ActionDef[];
}

export interface WorkflowTransition {
  from: string;
  to: string;
  gate?: Gate;
}

export interface Gate {
  condition: string;
  message?: string;
  auto_advance: boolean;
}

export interface ActionDef {
  action: string;
  config?: Record<string, unknown>;
}

/**
 * Response from `get_workflow_status` Tauri command.
 * JSON shape defined in workflow_commands.rs.
 */
export interface WorkflowStatus {
  specId: string;
  currentPhase: string;
  workflowName: string;
  autopilot: boolean;
  availableTransitions: TransitionStatus[];
}

export interface TransitionStatus {
  to: string;
  gatePassed: boolean;
  gateMessage?: string | null;
}

/**
 * Response from `advance_spec` Tauri command.
 */
export interface AdvanceResult {
  fromPhase: string;
  toPhase: string;
  gatePassed: boolean;
  actionsExecuted: unknown[];
}
