// Workflow automation commands
// Implements US4: Visual Workflow Automation
// Updated to use SQLite database for storage

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

use crate::models::{Execution, ExecutionStatus, Workflow, WorkflowNode};
use crate::repositories::WorkflowRepository;
use crate::services::notification::{
    send_notification, NotificationType,
};
use crate::utils::database::Database;
use crate::utils::path_resolver;
use crate::DatabaseState;

// Unix-specific imports for process signal handling
#[cfg(unix)]
use libc;

// ============================================================================
// State Management
// ============================================================================

/// Single output line for buffering workflow output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOutputLine {
    pub node_id: String,
    pub node_name: String,
    pub content: String,
    pub stream: String,    // "stdout" | "stderr" | "system"
    pub timestamp: String, // ISO 8601
}

/// Output buffer with size limit for storing workflow output history
/// Uses a ring buffer approach - when max size is exceeded, oldest content is removed
pub struct WorkflowOutputBuffer {
    lines: VecDeque<WorkflowOutputLine>,
    total_size: usize,
    max_size: usize,
    truncated: bool,
}

impl WorkflowOutputBuffer {
    /// Default max size: 1MB
    pub const DEFAULT_MAX_SIZE: usize = 1_048_576;

    pub fn new() -> Self {
        Self::with_max_size(Self::DEFAULT_MAX_SIZE)
    }

    pub fn with_max_size(max_size: usize) -> Self {
        Self {
            lines: VecDeque::new(),
            total_size: 0,
            max_size,
            truncated: false,
        }
    }

    /// Push a new line, removing old content if necessary to stay within size limit
    pub fn push(&mut self, line: WorkflowOutputLine) {
        let line_size = line.content.len();

        // Remove old lines if adding new line would exceed max size
        while self.total_size + line_size > self.max_size && !self.lines.is_empty() {
            if let Some(removed) = self.lines.pop_front() {
                self.total_size = self.total_size.saturating_sub(removed.content.len());
                self.truncated = true;
            }
        }

        // Only add if the single line doesn't exceed max size
        if line_size <= self.max_size {
            self.total_size += line_size;
            self.lines.push_back(line);
        }
    }

    /// Get all lines as a vector
    pub fn get_lines(&self) -> Vec<WorkflowOutputLine> {
        self.lines.iter().cloned().collect()
    }

    /// Check if content was truncated due to size limit
    pub fn is_truncated(&self) -> bool {
        self.truncated
    }

    /// Get current buffer size in bytes
    pub fn size(&self) -> usize {
        self.total_size
    }
}

impl Default for WorkflowOutputBuffer {
    fn default() -> Self {
        Self::new()
    }
}

/// Workflow execution state
pub struct WorkflowExecutionState {
    /// Map of execution_id -> running execution
    pub executions: Mutex<HashMap<String, RunningWorkflowExecution>>,
}

impl Default for WorkflowExecutionState {
    fn default() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
        }
    }
}

/// Running workflow execution info
pub struct RunningWorkflowExecution {
    pub execution: Execution,
    pub workflow: Workflow,
    pub current_node_index: usize,
    pub is_paused: bool,
    pub should_cancel: bool,
    /// PID of currently running child process (for killing on cancel)
    pub current_process_id: Option<u32>,
    /// Output buffer for storing execution output history
    pub output_buffer: WorkflowOutputBuffer,
}

// ============================================================================
// Event Payloads
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStartedPayload {
    pub execution_id: String,
    /// Workflow ID for direct matching (fixes output mixing between workflows)
    pub workflow_id: String,
    pub node_id: String,
    pub node_name: String,
    /// Feature 013: Node type for differentiated UI messages
    pub node_type: String,
    /// Feature 013: Target workflow name for trigger-workflow nodes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_workflow_name: Option<String>,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionOutputPayload {
    pub execution_id: String,
    /// Workflow ID for direct matching (fixes output mixing between workflows)
    pub workflow_id: String,
    pub node_id: String,
    pub output: String,
    pub stream: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeCompletedPayload {
    pub execution_id: String,
    /// Workflow ID for direct matching (fixes output mixing between workflows)
    pub workflow_id: String,
    pub node_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub finished_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCompletedPayload {
    pub execution_id: String,
    pub workflow_id: String,
    pub status: String,
    pub finished_at: String,
    pub total_duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPausedPayload {
    pub execution_id: String,
    pub workflow_id: String,
    pub paused_at_node_id: String,
    pub reason: String,
}

// ============================================================================
// Child Execution Event Payloads (Feature 013)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildExecutionStartedPayload {
    pub parent_execution_id: String,
    pub parent_node_id: String,
    pub child_execution_id: String,
    pub child_workflow_id: String,
    pub child_workflow_name: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildExecutionProgressPayload {
    pub parent_execution_id: String,
    pub parent_node_id: String,
    pub child_execution_id: String,
    pub current_step: usize,
    pub total_steps: usize,
    pub current_node_id: String,
    pub current_node_name: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildExecutionCompletedPayload {
    pub parent_execution_id: String,
    pub parent_node_id: String,
    pub child_execution_id: String,
    pub child_workflow_id: String,
    pub status: String,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub finished_at: String,
}

// ============================================================================
// Commands
// ============================================================================

// Note: load_workflows is in settings.rs to avoid duplication

/// Save a workflow to SQLite database
#[tauri::command]
pub async fn save_workflow(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    workflow: Workflow,
) -> Result<(), String> {
    println!(
        "[workflow] save_workflow called: id={}, name={}, project_id={:?}",
        workflow.id, workflow.name, workflow.project_id
    );

    let repo = WorkflowRepository::new(db.0.as_ref().clone());
    repo.save(&workflow)?;
    println!("[workflow] Saved workflow to database: {}", workflow.name);

    Ok(())
}

/// Delete a workflow from SQLite database
#[tauri::command]
pub async fn delete_workflow(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    workflow_id: String,
) -> Result<(), String> {
    let repo = WorkflowRepository::new(db.0.as_ref().clone());
    repo.delete(&workflow_id)?;

    Ok(())
}

/// Execute a workflow (internal implementation)
/// Takes Database directly for use from non-command contexts (e.g., incoming webhooks)
pub async fn execute_workflow_internal(
    app: AppHandle,
    db: Database,
    workflow_id: String,
    parent_execution_id: Option<String>,
    parent_node_id: Option<String>,
) -> Result<String, String> {
    println!(
        "[workflow] execute_workflow called with id: {}, parent: {:?}",
        workflow_id, parent_execution_id
    );

    // Load workflow from database
    let workflow_repo = WorkflowRepository::new(db.clone());

    let workflow = workflow_repo
        .get(&workflow_id)?
        .ok_or_else(|| {
            println!("[workflow] Workflow not found: {}", workflow_id);
            "Workflow not found".to_string()
        })?;

    println!(
        "[workflow] Found workflow: {} with {} nodes",
        workflow.name,
        workflow.nodes.len()
    );

    // Calculate depth from parent execution (Feature 013: T009)
    let depth = if let Some(ref parent_exec_id) = parent_execution_id {
        let state = app.state::<WorkflowExecutionState>();
        let executions = state.executions.lock().unwrap();
        if let Some(parent_exec) = executions.get(parent_exec_id) {
            parent_exec.execution.depth + 1
        } else {
            // Parent execution not found in state - calculate from scratch
            1
        }
    } else {
        0
    };

    // Check recursion depth limit (Feature 013: T010)
    if depth >= crate::models::execution::MAX_EXECUTION_DEPTH {
        let error_msg = format!(
            "Max recursion depth exceeded ({}/{}). Cannot execute nested workflow.",
            depth,
            crate::models::execution::MAX_EXECUTION_DEPTH
        );
        println!("[workflow] {}", error_msg);
        return Err(error_msg);
    }

    // Project path lookup removed (Projects feature deleted)
    let project_path: Option<String> = None;

    println!(
        "[workflow] Project path: {:?}, depth: {}",
        project_path, depth
    );

    // Create execution with parent tracking (Feature 013)
    let execution_id = Uuid::new_v4().to_string();
    let execution = if let (Some(ref parent_exec_id), Some(ref parent_node)) =
        (&parent_execution_id, &parent_node_id)
    {
        Execution::new_child(
            execution_id.clone(),
            workflow_id.clone(),
            parent_exec_id.clone(),
            parent_node.clone(),
            depth,
        )
    } else {
        Execution::new(execution_id.clone(), workflow_id.clone())
    };

    // Sort nodes by order
    let mut sorted_nodes = workflow.nodes.clone();
    sorted_nodes.sort_by_key(|n| n.order);

    // Store execution state
    {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        executions.insert(
            execution_id.clone(),
            RunningWorkflowExecution {
                execution,
                workflow: workflow.clone(),
                current_node_index: 0,
                is_paused: false,
                should_cancel: false,
                current_process_id: None,
                output_buffer: WorkflowOutputBuffer::new(),
            },
        );
    }

    // Feature 013: Create execution context with pre-loaded data
    // T043: Initialize execution_chain with the starting workflow ID
    let ctx = WorkflowExecutionContext {
        workflows: workflow_repo.list()?,
        execution_chain: vec![workflow_id.clone()],
    };

    // Clone for async task
    let app_clone = app.clone();
    let exec_id = execution_id.clone();
    let parent_exec_id_clone = parent_execution_id.clone();
    let parent_node_id_clone = parent_node_id.clone();

    // Spawn execution task
    tauri::async_runtime::spawn(async move {
        execute_workflow_nodes_with_context(
            app_clone,
            ctx,
            exec_id,
            sorted_nodes,
            project_path,
            parent_exec_id_clone,
            parent_node_id_clone,
        )
        .await;
    });

    Ok(execution_id)
}

/// Execute a workflow (Tauri command wrapper)
/// Feature 013: Extended to support parent-child execution tracking
#[tauri::command]
pub async fn execute_workflow(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    workflow_id: String,
    parent_execution_id: Option<String>,
    parent_node_id: Option<String>,
) -> Result<String, String> {
    execute_workflow_internal(
        app,
        db.0.as_ref().clone(),
        workflow_id,
        parent_execution_id,
        parent_node_id,
    )
    .await
}

/// Execute workflow nodes sequentially with pre-loaded context
/// Feature 013: Extended to support trigger-workflow nodes and child execution tracking
async fn execute_workflow_nodes_with_context(
    app: AppHandle,
    ctx: WorkflowExecutionContext,
    execution_id: String,
    nodes: Vec<WorkflowNode>,
    default_cwd: Option<String>,
    parent_execution_id: Option<String>,
    parent_node_id: Option<String>,
) {
    let start_time = std::time::Instant::now();
    let total_nodes = nodes.len();

    // Get workflow_id early for event payloads (fixes output mixing between workflows)
    let workflow_id = {
        let state = app.state::<WorkflowExecutionState>();
        let executions = state.executions.lock().unwrap();
        executions
            .get(&execution_id)
            .map(|e| e.workflow.id.clone())
            .unwrap_or_default()
    };

    for (index, node) in nodes.iter().enumerate() {
        // Check if paused or cancelled
        {
            let state = app.state::<WorkflowExecutionState>();
            let executions = state.executions.lock().unwrap();
            if let Some(exec) = executions.get(&execution_id) {
                if exec.is_paused {
                    // Emit paused event
                    let _ = app.emit(
                        "execution_paused",
                        ExecutionPausedPayload {
                            execution_id: execution_id.clone(),
                            workflow_id: exec.workflow.id.clone(),
                            paused_at_node_id: node.id.clone(),
                            reason: "user_requested".to_string(),
                        },
                    );
                    return;
                }
                if exec.should_cancel {
                    break;
                }
            } else {
                return;
            }
        }

        // Update current node index
        {
            let state = app.state::<WorkflowExecutionState>();
            let mut executions = state.executions.lock().unwrap();
            if let Some(exec) = executions.get_mut(&execution_id) {
                exec.current_node_index = index;
            }
        }

        // Feature 013: Get target workflow name for trigger-workflow nodes
        let target_workflow_name = if node.is_trigger_workflow() {
            node.get_trigger_workflow_config().and_then(|config| {
                ctx.workflows
                    .iter()
                    .find(|w| w.id == config.target_workflow_id)
                    .map(|w| w.name.clone())
            })
        } else {
            None
        };

        // Emit node started
        let _ = app.emit(
            "execution_node_started",
            NodeStartedPayload {
                execution_id: execution_id.clone(),
                workflow_id: workflow_id.clone(),
                node_id: node.id.clone(),
                node_name: node.name.clone(),
                node_type: node.node_type.clone(),
                target_workflow_name,
                started_at: Utc::now().to_rfc3339(),
            },
        );

        // Feature 013: Emit child execution progress if this is a child execution
        if let (Some(ref parent_exec_id), Some(ref parent_node)) =
            (&parent_execution_id, &parent_node_id)
        {
            let _ = app.emit(
                "child_execution_progress",
                ChildExecutionProgressPayload {
                    parent_execution_id: parent_exec_id.clone(),
                    parent_node_id: parent_node.clone(),
                    child_execution_id: execution_id.clone(),
                    current_step: index,
                    total_steps: total_nodes,
                    current_node_id: node.id.clone(),
                    current_node_name: node.name.clone(),
                    timestamp: Utc::now().to_rfc3339(),
                },
            );
        }

        // Execute node based on type (Feature 013: T011)
        let result = if node.is_trigger_workflow() {
            execute_trigger_workflow_node(&app, &ctx, &execution_id, node).await
        } else {
            execute_node(
                &app,
                &execution_id,
                &workflow_id,
                node,
                default_cwd.as_deref(),
            )
            .await
        };

        // Emit node completed
        let (status_str, exit_code, error_msg) = match &result {
            Ok(code) => {
                if *code == 0 {
                    ("completed".to_string(), Some(*code), None)
                } else {
                    (
                        "failed".to_string(),
                        Some(*code),
                        Some(format!("Exit code: {}", code)),
                    )
                }
            }
            Err(e) => ("failed".to_string(), None, Some(e.clone())),
        };

        let _ = app.emit(
            "execution_node_completed",
            NodeCompletedPayload {
                execution_id: execution_id.clone(),
                workflow_id: workflow_id.clone(),
                node_id: node.id.clone(),
                status: status_str.clone(),
                exit_code,
                error_message: error_msg.clone(),
                finished_at: Utc::now().to_rfc3339(),
            },
        );

        // If node failed, stop execution
        if status_str == "failed" {
            // Update execution status
            {
                let state = app.state::<WorkflowExecutionState>();
                let mut executions = state.executions.lock().unwrap();
                if let Some(exec) = executions.get_mut(&execution_id) {
                    exec.execution.fail();
                }
            }

            // Get workflow info
            let (workflow_id, workflow_name) = {
                let state = app.state::<WorkflowExecutionState>();
                let executions = state.executions.lock().unwrap();
                executions
                    .get(&execution_id)
                    .map(|e| {
                        (
                            e.workflow.id.clone(),
                            e.workflow.name.clone(),
                        )
                    })
                    .unwrap_or_default()
            };

            let duration_ms = start_time.elapsed().as_millis() as u64;

            // Emit execution completed
            if !workflow_id.is_empty() {
                let _ = app.emit(
                    "execution_completed",
                    ExecutionCompletedPayload {
                        execution_id: execution_id.clone(),
                        workflow_id: workflow_id.clone(),
                        status: "failed".to_string(),
                        finished_at: Utc::now().to_rfc3339(),
                        total_duration_ms: duration_ms,
                    },
                );

                // Send desktop notification for workflow failure
                let _ = send_notification(
                    &app,
                    NotificationType::WorkflowFailed {
                        workflow_name: workflow_name.clone(),
                        error: error_msg.clone().unwrap_or_else(|| "Unknown error".to_string()),
                    },
                );

                // Feature 013: Emit child execution completed if this is a child execution
                if let (Some(ref parent_exec_id), Some(ref parent_node)) =
                    (&parent_execution_id, &parent_node_id)
                {
                    let _ = app.emit(
                        "child_execution_completed",
                        ChildExecutionCompletedPayload {
                            parent_execution_id: parent_exec_id.clone(),
                            parent_node_id: parent_node.clone(),
                            child_execution_id: execution_id.clone(),
                            child_workflow_id: workflow_id.clone(),
                            status: "failed".to_string(),
                            duration_ms,
                            error_message: error_msg.clone(),
                            finished_at: Utc::now().to_rfc3339(),
                        },
                    );
                }
            }

            // Remove from running executions
            {
                let state = app.state::<WorkflowExecutionState>();
                let mut executions = state.executions.lock().unwrap();
                executions.remove(&execution_id);
            }

            return;
        }
    }

    // Check if execution was cancelled
    let was_cancelled = {
        let state = app.state::<WorkflowExecutionState>();
        let executions = state.executions.lock().unwrap();
        executions
            .get(&execution_id)
            .map(|e| e.should_cancel)
            .unwrap_or(false)
    };

    let duration_ms = start_time.elapsed().as_millis() as u64;

    if was_cancelled {
        // Execution was cancelled - get current node index
        let current_node_index = {
            let state = app.state::<WorkflowExecutionState>();
            let mut executions = state.executions.lock().unwrap();
            if let Some(exec) = executions.get_mut(&execution_id) {
                exec.execution.cancel();
                exec.current_node_index
            } else {
                0
            }
        };

        // Emit node_completed for the current running node (mark as cancelled)
        if current_node_index < nodes.len() {
            let current_node = &nodes[current_node_index];
            let _ = app.emit(
                "execution_node_completed",
                NodeCompletedPayload {
                    execution_id: execution_id.clone(),
                    workflow_id: workflow_id.clone(),
                    node_id: current_node.id.clone(),
                    status: "cancelled".to_string(),
                    exit_code: None,
                    error_message: Some("Execution cancelled by user".to_string()),
                    finished_at: Utc::now().to_rfc3339(),
                },
            );
        }

        if !workflow_id.is_empty() {
            let wf_id = workflow_id.clone();
            println!(
                "[workflow] Emitting execution_completed (cancelled) for {}",
                execution_id
            );
            let _ = app.emit(
                "execution_completed",
                ExecutionCompletedPayload {
                    execution_id: execution_id.clone(),
                    workflow_id: wf_id.clone(),
                    status: "cancelled".to_string(),
                    finished_at: Utc::now().to_rfc3339(),
                    total_duration_ms: duration_ms,
                },
            );

            // Feature 013: Emit child execution completed if this is a child execution
            if let (Some(ref parent_exec_id), Some(ref parent_node)) =
                (&parent_execution_id, &parent_node_id)
            {
                let _ = app.emit(
                    "child_execution_completed",
                    ChildExecutionCompletedPayload {
                        parent_execution_id: parent_exec_id.clone(),
                        parent_node_id: parent_node.clone(),
                        child_execution_id: execution_id.clone(),
                        child_workflow_id: wf_id.clone(),
                        status: "cancelled".to_string(),
                        duration_ms,
                        error_message: None,
                        finished_at: Utc::now().to_rfc3339(),
                    },
                );
            }
        }

        // Remove from running executions
        {
            let state = app.state::<WorkflowExecutionState>();
            let mut executions = state.executions.lock().unwrap();
            executions.remove(&execution_id);
        }
        return;
    }

    // All nodes completed successfully
    let (workflow_id, workflow_name) = {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        if let Some(exec) = executions.get_mut(&execution_id) {
            exec.execution.complete();
            (
                Some(exec.workflow.id.clone()),
                exec.workflow.name.clone(),
            )
        } else {
            (None, String::new())
        }
    };

    if let Some(wf_id) = workflow_id {
        println!(
            "[workflow] Emitting execution_completed for {}",
            execution_id
        );
        let _ = app.emit(
            "execution_completed",
            ExecutionCompletedPayload {
                execution_id: execution_id.clone(),
                workflow_id: wf_id.clone(),
                status: "completed".to_string(),
                finished_at: Utc::now().to_rfc3339(),
                total_duration_ms: duration_ms,
            },
        );

        // Send desktop notification for workflow completion
        let _ = send_notification(
            &app,
            NotificationType::WorkflowCompleted {
                workflow_name: workflow_name.clone(),
                duration_ms,
            },
        );

        // Feature 013: Emit child execution completed if this is a child execution
        if let (Some(ref parent_exec_id), Some(ref parent_node)) =
            (&parent_execution_id, &parent_node_id)
        {
            let _ = app.emit(
                "child_execution_completed",
                ChildExecutionCompletedPayload {
                    parent_execution_id: parent_exec_id.clone(),
                    parent_node_id: parent_node.clone(),
                    child_execution_id: execution_id.clone(),
                    child_workflow_id: wf_id.clone(),
                    status: "completed".to_string(),
                    duration_ms,
                    error_message: None,
                    finished_at: Utc::now().to_rfc3339(),
                },
            );
        }

    }

    // Remove from running executions
    {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        executions.remove(&execution_id);
    }
}

/// Execute a trigger-workflow node (Feature 013: T011)
/// This spawns a child workflow execution and waits for it to complete
async fn execute_trigger_workflow_node(
    app: &AppHandle,
    ctx: &WorkflowExecutionContext,
    execution_id: &str,
    node: &WorkflowNode,
) -> Result<i32, String> {
    let config = node
        .get_trigger_workflow_config()
        .ok_or_else(|| "Invalid trigger-workflow node config".to_string())?;

    let target_workflow_id = &config.target_workflow_id;

    // Get target workflow from pre-loaded context
    let target_workflow = ctx
        .workflows
        .iter()
        .find(|w| w.id == *target_workflow_id)
        .ok_or_else(|| format!("Target workflow not found: {}", target_workflow_id))?;

    let target_workflow_name = target_workflow.name.clone();

    println!(
        "[workflow] Executing trigger-workflow node: {} -> {} ({})",
        node.name, target_workflow_name, target_workflow_id
    );

    // Emit child execution started event
    let child_start_time = std::time::Instant::now();

    // Execute the child workflow using sync function with context
    let child_execution_id =
        execute_child_workflow_sync(app, ctx, target_workflow_id, execution_id, &node.id)?;

    // Emit child execution started event
    let _ = app.emit(
        "child_execution_started",
        ChildExecutionStartedPayload {
            parent_execution_id: execution_id.to_string(),
            parent_node_id: node.id.clone(),
            child_execution_id: child_execution_id.clone(),
            child_workflow_id: target_workflow_id.clone(),
            child_workflow_name: target_workflow_name.clone(),
            started_at: Utc::now().to_rfc3339(),
        },
    );

    // If waitForCompletion is false, return immediately
    if !config.wait_for_completion {
        println!(
            "[workflow] Fire-and-forget mode: child workflow {} started",
            child_execution_id
        );
        return Ok(0);
    }

    // Wait for child execution to complete
    println!(
        "[workflow] Waiting for child workflow {} to complete...",
        child_execution_id
    );

    loop {
        // Check if child execution is still running
        let child_status = {
            let state = app.state::<WorkflowExecutionState>();
            let executions = state.executions.lock().unwrap();
            executions
                .get(&child_execution_id)
                .map(|e| e.execution.status.clone())
        };

        match child_status {
            Some(crate::models::execution::ExecutionStatus::Running) => {
                // Still running, wait a bit
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
            Some(crate::models::execution::ExecutionStatus::Completed) => {
                println!(
                    "[workflow] Child workflow {} completed successfully",
                    child_execution_id
                );
                return Ok(0);
            }
            Some(crate::models::execution::ExecutionStatus::Failed) => {
                let duration_ms = child_start_time.elapsed().as_millis() as u64;

                // Check onChildFailure config
                if config.on_child_failure == crate::models::workflow::OnChildFailure::Continue {
                    println!("[workflow] Child workflow {} failed, but continuing (onChildFailure=continue)", child_execution_id);
                    return Ok(0);
                }

                println!("[workflow] Child workflow {} failed", child_execution_id);
                return Err(format!(
                    "Child workflow '{}' failed after {}ms",
                    target_workflow_name, duration_ms
                ));
            }
            Some(crate::models::execution::ExecutionStatus::Cancelled) => {
                println!(
                    "[workflow] Child workflow {} was cancelled",
                    child_execution_id
                );
                return Err(format!(
                    "Child workflow '{}' was cancelled",
                    target_workflow_name
                ));
            }
            Some(crate::models::execution::ExecutionStatus::Paused) => {
                // Still considered running for our purposes
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
            None => {
                // Child execution has been removed from state - it must have completed
                // Check the final status from events or assume completed
                println!(
                    "[workflow] Child workflow {} finished (removed from state)",
                    child_execution_id
                );
                return Ok(0);
            }
        }
    }
}

/// Internal context for workflow execution (Feature 013)
/// Pre-loaded data to avoid accessing store from spawned tasks
/// Feature 013 T043: Added execution_chain for runtime cycle detection
#[derive(Clone)]
struct WorkflowExecutionContext {
    workflows: Vec<Workflow>,
    /// Chain of workflow IDs being executed (for runtime cycle detection)
    execution_chain: Vec<String>,
}

/// Internal function to execute a child workflow (Feature 013)
/// This is separated to avoid async recursion issues
fn execute_child_workflow_sync(
    app: &AppHandle,
    ctx: &WorkflowExecutionContext,
    workflow_id: &str,
    parent_execution_id: &str,
    parent_node_id: &str,
) -> Result<String, String> {
    println!(
        "[workflow] execute_child_workflow_sync called with id: {}, parent: {}",
        workflow_id, parent_execution_id
    );

    let workflow = ctx
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .cloned()
        .ok_or_else(|| format!("Workflow not found: {}", workflow_id))?;

    // Calculate depth from parent execution
    let depth = {
        let state = app.state::<WorkflowExecutionState>();
        let executions = state.executions.lock().unwrap();
        if let Some(parent_exec) = executions.get(parent_execution_id) {
            parent_exec.execution.depth + 1
        } else {
            1
        }
    };

    // Check recursion depth limit
    if depth >= crate::models::execution::MAX_EXECUTION_DEPTH {
        return Err(format!(
            "Max recursion depth exceeded ({}/{}). Cannot execute nested workflow.",
            depth,
            crate::models::execution::MAX_EXECUTION_DEPTH
        ));
    }

    // Feature 013 T043: Runtime cycle detection
    // Check if this workflow is already in the execution chain
    if ctx.execution_chain.contains(&workflow_id.to_string()) {
        let chain_names: Vec<String> = ctx
            .execution_chain
            .iter()
            .filter_map(|id| {
                ctx.workflows
                    .iter()
                    .find(|w| &w.id == id)
                    .map(|w| w.name.clone())
            })
            .collect();
        let workflow_name = workflow.name.clone();
        return Err(format!(
            "Runtime cycle detected: {} -> {} (chain: {})",
            chain_names.last().unwrap_or(&"Unknown".to_string()),
            workflow_name,
            chain_names.join(" -> ")
        ));
    }

    // Project path lookup removed (Projects feature deleted)
    let project_path: Option<String> = None;

    // Create child execution
    let execution_id = Uuid::new_v4().to_string();
    let execution = Execution::new_child(
        execution_id.clone(),
        workflow_id.to_string(),
        parent_execution_id.to_string(),
        parent_node_id.to_string(),
        depth,
    );

    // Sort nodes by order
    let mut sorted_nodes = workflow.nodes.clone();
    sorted_nodes.sort_by_key(|n| n.order);

    // Store execution state
    {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        executions.insert(
            execution_id.clone(),
            RunningWorkflowExecution {
                execution,
                workflow: workflow.clone(),
                current_node_index: 0,
                is_paused: false,
                should_cancel: false,
                current_process_id: None,
                output_buffer: WorkflowOutputBuffer::new(),
            },
        );
    }

    // Clone for async task
    let app_clone = app.clone();
    let exec_id = execution_id.clone();
    let parent_exec_id = parent_execution_id.to_string();
    let parent_node = parent_node_id.to_string();
    // Feature 013 T043: Clone context with updated execution chain
    let mut ctx_clone = ctx.clone();
    ctx_clone.execution_chain.push(workflow_id.to_string());

    // Spawn execution task (runs in background)
    tauri::async_runtime::spawn(async move {
        execute_workflow_nodes_with_context(
            app_clone,
            ctx_clone,
            exec_id,
            sorted_nodes,
            project_path,
            Some(parent_exec_id),
            Some(parent_node),
        )
        .await;
    });

    Ok(execution_id)
}

/// Execute a single node
/// Uses path_resolver to handle macOS GUI app PATH issues
/// Supports cancellation by checking should_cancel flag and killing the process
async fn execute_node(
    app: &AppHandle,
    execution_id: &str,
    workflow_id: &str,
    node: &WorkflowNode,
    default_cwd: Option<&str>,
) -> Result<i32, String> {
    // Only script nodes can be executed with this function
    if !node.is_script() {
        return Err(format!(
            "Node type '{}' not supported for direct execution",
            node.node_type
        ));
    }

    let config = node
        .get_script_config()
        .ok_or_else(|| "Invalid script node config".to_string())?;

    // Determine working directory: node config > default (project path)
    let cwd = config.cwd.as_deref().or(default_cwd);

    // Check if command contains shell special characters (pipes, redirects, etc.)
    let needs_shell = config.command.contains('|')
        || config.command.contains("&&")
        || config.command.contains("||")
        || config.command.contains(';')
        || config.command.contains('>')
        || config.command.contains('<')
        || config.command.contains('$')
        || config.command.contains('`')
        || config.command.contains('*')
        || config.command.contains('?');

    let (final_cmd, final_args) = if needs_shell {
        // Execute through shell for complex commands
        #[cfg(unix)]
        {
            (
                "/bin/sh".to_string(),
                vec!["-c".to_string(), config.command.clone()],
            )
        }
        #[cfg(windows)]
        {
            (
                "cmd".to_string(),
                vec!["/C".to_string(), config.command.clone()],
            )
        }
    } else {
        // Parse simple command
        let parts: Vec<&str> = config.command.split_whitespace().collect();
        if parts.is_empty() {
            return Err("Empty command".to_string());
        }

        let cmd_name = parts[0];
        let args: Vec<&str> = parts[1..].to_vec();

        // 🗑️ Intercept rm command - use trash instead of permanent delete
        if cmd_name == "rm" {
            return execute_trash_command(app, execution_id, workflow_id, node, &args, cwd).await;
        }

        (
            path_resolver::get_tool_path(cmd_name),
            args.iter().map(|s| s.to_string()).collect(),
        )
    };

    // Spawn and handle output
    println!(
        "[workflow] Spawning command: {} {:?} in cwd: {:?}",
        final_cmd, final_args, cwd
    );

    // Use path_resolver to create command with proper PATH for macOS GUI apps
    let mut command = path_resolver::create_command(&final_cmd);
    command.args(&final_args);

    // Expand ~ in cwd path
    if let Some(cwd_path) = cwd {
        let expanded_cwd = if cwd_path.starts_with("~/") {
            if let Some(home) = path_resolver::get_home_dir() {
                cwd_path.replacen("~", &home, 1)
            } else {
                cwd_path.to_string()
            }
        } else if cwd_path == "~" {
            path_resolver::get_home_dir().unwrap_or_else(|| cwd_path.to_string())
        } else {
            cwd_path.to_string()
        };
        command.current_dir(&expanded_cwd);
    }

    // Set CI=true to prevent interactive prompts from pnpm/npm
    // This fixes ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY error
    command.env("CI", "true");

    // Set up stdio for streaming output
    // Kill child processes when the main process is killed
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Create new process group so we can kill all children
        command.process_group(0);
    }

    // Spawn the process
    let mut child = tokio::process::Command::from(command)
        .spawn()
        .map_err(|e| {
            println!("[workflow] Failed to spawn: {}", e);
            e.to_string()
        })?;

    // Store the process ID for potential cancellation
    let child_pid = child.id();
    {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        if let Some(exec) = executions.get_mut(execution_id) {
            exec.current_process_id = child_pid;
        }
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Clone data for async tasks
    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let exec_id_stdout = execution_id.to_string();
    let exec_id_stderr = execution_id.to_string();
    let wf_id_stdout = workflow_id.to_string();
    let wf_id_stderr = workflow_id.to_string();
    let node_id_stdout = node.id.clone();
    let node_id_stderr = node.id.clone();
    let node_name_stdout = node.name.clone();
    let node_name_stderr = node.name.clone();

    // Spawn tasks to read stdout and stderr concurrently
    let stdout_task = tokio::spawn(async move {
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            println!("[workflow] stdout: {}", line);
            let timestamp = Utc::now().to_rfc3339();
            let _ = app_stdout.emit(
                "execution_output",
                ExecutionOutputPayload {
                    execution_id: exec_id_stdout.clone(),
                    workflow_id: wf_id_stdout.clone(),
                    node_id: node_id_stdout.clone(),
                    output: line.clone(),
                    stream: "stdout".to_string(),
                    timestamp: timestamp.clone(),
                },
            );
            // Store in output buffer
            {
                let state = app_stdout.state::<WorkflowExecutionState>();
                let mut executions = state.executions.lock().unwrap();
                if let Some(exec) = executions.get_mut(&exec_id_stdout) {
                    exec.output_buffer.push(WorkflowOutputLine {
                        node_id: node_id_stdout.clone(),
                        node_name: node_name_stdout.clone(),
                        content: line,
                        stream: "stdout".to_string(),
                        timestamp,
                    });
                }
            }
        }
    });

    let stderr_task = tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            let timestamp = Utc::now().to_rfc3339();
            let _ = app_stderr.emit(
                "execution_output",
                ExecutionOutputPayload {
                    execution_id: exec_id_stderr.clone(),
                    workflow_id: wf_id_stderr.clone(),
                    node_id: node_id_stderr.clone(),
                    output: line.clone(),
                    stream: "stderr".to_string(),
                    timestamp: timestamp.clone(),
                },
            );
            // Store in output buffer
            {
                let state = app_stderr.state::<WorkflowExecutionState>();
                let mut executions = state.executions.lock().unwrap();
                if let Some(exec) = executions.get_mut(&exec_id_stderr) {
                    exec.output_buffer.push(WorkflowOutputLine {
                        node_id: node_id_stderr.clone(),
                        node_name: node_name_stderr.clone(),
                        content: line,
                        stream: "stderr".to_string(),
                        timestamp,
                    });
                }
            }
        }
    });

    // Wait for the process to complete, checking for cancellation periodically
    let app_cancel_check = app.clone();
    let exec_id_cancel = execution_id.to_string();

    let result = loop {
        // Check if we should cancel
        let should_cancel = {
            let state = app_cancel_check.state::<WorkflowExecutionState>();
            let executions = state.executions.lock().unwrap();
            executions
                .get(&exec_id_cancel)
                .map(|e| e.should_cancel)
                .unwrap_or(false)
        };

        if should_cancel {
            println!("[workflow] Cancellation requested, killing process");
            // Kill the process and its children
            #[cfg(unix)]
            if let Some(pid) = child_pid {
                // Kill the entire process group
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
                // Give it a moment to terminate gracefully
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                // Force kill if still running
                let _ = child.kill().await;
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill().await;
            }
            break Err("Execution cancelled".to_string());
        }

        // Use tokio::select to wait for either process completion or a short timeout
        tokio::select! {
            status = child.wait() => {
                match status {
                    Ok(exit_status) => {
                        break Ok(exit_status.code().unwrap_or(-1));
                    }
                    Err(e) => {
                        break Err(e.to_string());
                    }
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                // Continue loop to check cancellation
            }
        }
    };

    // Clear the process ID
    {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();
        if let Some(exec) = executions.get_mut(execution_id) {
            exec.current_process_id = None;
        }
    }

    // Wait for output tasks to complete
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    result
}

/// Execute rm command by moving files to trash instead of permanent deletion
/// This intercepts rm commands and uses the trash crate for soft delete
async fn execute_trash_command(
    app: &AppHandle,
    execution_id: &str,
    workflow_id: &str,
    node: &WorkflowNode,
    args: &[&str],
    cwd: Option<&str>,
) -> Result<i32, String> {
    println!("[workflow] Intercepting rm command, using trash instead");

    // Filter out flags (like -r, -f, -rf, etc.) and get file paths
    let files: Vec<&str> = args
        .iter()
        .filter(|arg| !arg.starts_with('-'))
        .copied()
        .collect();

    if files.is_empty() {
        let msg = "rm: missing operand (no files specified)".to_string();
        let _ = app.emit(
            "execution_output",
            ExecutionOutputPayload {
                execution_id: execution_id.to_string(),
                workflow_id: workflow_id.to_string(),
                node_id: node.id.clone(),
                output: msg.clone(),
                stream: "stderr".to_string(),
                timestamp: Utc::now().to_rfc3339(),
            },
        );
        return Err(msg);
    }

    let base_path = cwd.map(PathBuf::from);
    let mut success_count = 0;
    let mut error_count = 0;

    for file in &files {
        // Resolve path: if relative, join with cwd
        let path = if file.starts_with('/') || file.starts_with('~') {
            // Absolute path or home-relative
            let expanded = if file.starts_with('~') {
                shellexpand::tilde(file).to_string()
            } else {
                file.to_string()
            };
            PathBuf::from(expanded)
        } else {
            // Relative path
            match &base_path {
                Some(base) => base.join(file),
                None => PathBuf::from(file),
            }
        };

        // Check if path exists
        if !path.exists() {
            let msg = format!("rm: {}: No such file or directory", file);
            let _ = app.emit(
                "execution_output",
                ExecutionOutputPayload {
                    execution_id: execution_id.to_string(),
                    workflow_id: workflow_id.to_string(),
                    node_id: node.id.clone(),
                    output: msg,
                    stream: "stderr".to_string(),
                    timestamp: Utc::now().to_rfc3339(),
                },
            );
            error_count += 1;
            continue;
        }

        // Move to trash
        match trash::delete(&path) {
            Ok(_) => {
                let msg = format!("🗑️ Moved to Trash: {}", path.display());
                println!("[workflow] {}", msg);
                let _ = app.emit(
                    "execution_output",
                    ExecutionOutputPayload {
                        execution_id: execution_id.to_string(),
                        workflow_id: workflow_id.to_string(),
                        node_id: node.id.clone(),
                        output: msg,
                        stream: "stdout".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    },
                );
                success_count += 1;
            }
            Err(e) => {
                let msg = format!("rm: {}: {}", file, e);
                let _ = app.emit(
                    "execution_output",
                    ExecutionOutputPayload {
                        execution_id: execution_id.to_string(),
                        workflow_id: workflow_id.to_string(),
                        node_id: node.id.clone(),
                        output: msg,
                        stream: "stderr".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    },
                );
                error_count += 1;
            }
        }
    }

    // Summary message
    let summary = format!(
        "Trash operation complete: {} moved to trash, {} errors",
        success_count, error_count
    );
    let _ = app.emit(
        "execution_output",
        ExecutionOutputPayload {
            execution_id: execution_id.to_string(),
            workflow_id: workflow_id.to_string(),
            node_id: node.id.clone(),
            output: summary,
            stream: "stdout".to_string(),
            timestamp: Utc::now().to_rfc3339(),
        },
    );

    // Return exit code: 0 if all success, 1 if any errors
    if error_count > 0 {
        Ok(1)
    } else {
        Ok(0)
    }
}

/// Cancel (pause) a running execution
#[tauri::command]
/// Feature 013 T048: Cancel execution with optional cascade to child executions
pub async fn cancel_execution(
    app: AppHandle,
    execution_id: String,
    #[allow(unused_variables)] cascade: Option<bool>,
) -> Result<(), String> {
    let cascade = cascade.unwrap_or(true); // Default to cascading cancel

    // Collect child execution IDs first (to avoid holding lock during cancel)
    let child_execution_ids: Vec<String> = if cascade {
        let state = app.state::<WorkflowExecutionState>();
        let executions = state.executions.lock().unwrap();
        executions
            .values()
            .filter(|e| e.execution.parent_execution_id.as_ref() == Some(&execution_id))
            .map(|e| e.execution.id.clone())
            .collect()
    } else {
        Vec::new()
    };

    // Cancel child executions recursively
    for child_id in child_execution_ids {
        // Recursive call with Box::pin to handle async recursion
        if let Err(e) = Box::pin(cancel_execution(app.clone(), child_id.clone(), Some(true))).await
        {
            println!(
                "[workflow] Warning: Failed to cancel child execution {}: {}",
                child_id, e
            );
        }
    }

    // Cancel the main execution
    let state = app.state::<WorkflowExecutionState>();
    let mut executions = state.executions.lock().unwrap();

    if let Some(exec) = executions.get_mut(&execution_id) {
        exec.should_cancel = true;
        exec.execution.status = ExecutionStatus::Cancelled;
        println!(
            "[workflow] Execution {} cancelled (cascade={})",
            execution_id, cascade
        );
        Ok(())
    } else {
        Err("Execution not found".to_string())
    }
}

/// Continue a paused execution
#[tauri::command]
pub async fn continue_execution(
    app: AppHandle,
    db: tauri::State<'_, DatabaseState>,
    execution_id: String,
) -> Result<(), String> {
    let (workflow, start_index, project_id, workflow_id, parent_execution_id, parent_node_id) = {
        let state = app.state::<WorkflowExecutionState>();
        let mut executions = state.executions.lock().unwrap();

        if let Some(exec) = executions.get_mut(&execution_id) {
            if !exec.is_paused {
                return Err("Execution is not paused".to_string());
            }
            exec.is_paused = false;
            exec.execution.status = ExecutionStatus::Running;

            let mut sorted_nodes = exec.workflow.nodes.clone();
            sorted_nodes.sort_by_key(|n| n.order);

            (
                sorted_nodes,
                exec.current_node_index,
                exec.workflow.project_id.clone(),
                exec.workflow.id.clone(),
                exec.execution.parent_execution_id.clone(),
                exec.execution.parent_node_id.clone(),
            )
        } else {
            return Err("Execution not found".to_string());
        }
    };

    // Load context from database
    // T043: Initialize execution_chain with the continuing workflow ID
    let db_clone = db.0.as_ref().clone();
    let workflow_repo = WorkflowRepository::new(db_clone.clone());
    let ctx = WorkflowExecutionContext {
        workflows: workflow_repo.list()?,
        execution_chain: vec![workflow_id],
    };

    // Project path lookup removed (Projects feature deleted)
    let project_path: Option<String> = None;

    // Continue from current node
    let remaining_nodes: Vec<WorkflowNode> = workflow.into_iter().skip(start_index).collect();

    let app_clone = app.clone();
    let exec_id = execution_id.clone();

    tauri::async_runtime::spawn(async move {
        execute_workflow_nodes_with_context(
            app_clone,
            ctx,
            exec_id,
            remaining_nodes,
            project_path,
            parent_execution_id,
            parent_node_id,
        )
        .await;
    });

    Ok(())
}

/// Get all running executions
#[tauri::command]
pub async fn get_running_executions(app: AppHandle) -> Result<HashMap<String, Execution>, String> {
    let state = app.state::<WorkflowExecutionState>();
    let executions = state.executions.lock().unwrap();

    let result: HashMap<String, Execution> = executions
        .iter()
        .map(|(id, exec)| (id.clone(), exec.execution.clone()))
        .collect();

    Ok(result)
}

/// Response for get_workflow_output command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOutputResponse {
    pub found: bool,
    pub workflow_id: Option<String>,
    pub execution_id: Option<String>,
    pub lines: Vec<WorkflowOutputLine>,
    pub truncated: bool,
    pub buffer_size: usize,
}

/// Get buffered output for a workflow execution
/// Used to restore output when user navigates back to a workflow
#[tauri::command]
pub async fn get_workflow_output(
    app: AppHandle,
    workflow_id: String,
) -> Result<WorkflowOutputResponse, String> {
    let state = app.state::<WorkflowExecutionState>();
    let executions = state.executions.lock().unwrap();

    // Find execution for this workflow
    let execution = executions
        .iter()
        .find(|(_, exec)| exec.workflow.id == workflow_id);

    match execution {
        Some((exec_id, exec)) => Ok(WorkflowOutputResponse {
            found: true,
            workflow_id: Some(workflow_id),
            execution_id: Some(exec_id.clone()),
            lines: exec.output_buffer.get_lines(),
            truncated: exec.output_buffer.is_truncated(),
            buffer_size: exec.output_buffer.size(),
        }),
        None => Ok(WorkflowOutputResponse {
            found: false,
            workflow_id: Some(workflow_id),
            execution_id: None,
            lines: vec![],
            truncated: false,
            buffer_size: 0,
        }),
    }
}

/// Restore running executions (placeholder - executions don't persist across restarts)
#[tauri::command]
pub async fn restore_running_executions(
    _app: AppHandle,
    _db: tauri::State<'_, DatabaseState>,
) -> Result<(), String> {
    // ExecutionRepository removed - no-op stub
    Ok(())
}

/// Kill a specific workflow process (by execution id)
#[tauri::command]
pub async fn kill_process(app: AppHandle, execution_id: String) -> Result<(), String> {
    let state = app.state::<WorkflowExecutionState>();
    let mut executions = state.executions.lock().unwrap();

    if let Some(exec) = executions.get_mut(&execution_id) {
        exec.should_cancel = true;
        exec.execution.cancel();

        // Emit completion event
        let _ = app.emit(
            "execution_completed",
            ExecutionCompletedPayload {
                execution_id: execution_id.clone(),
                workflow_id: exec.workflow.id.clone(),
                status: "cancelled".to_string(),
                finished_at: Utc::now().to_rfc3339(),
                total_duration_ms: 0,
            },
        );

        executions.remove(&execution_id);
        Ok(())
    } else {
        Err("Execution not found".to_string())
    }
}

// Webhook functions removed

// ============================================================================
// Available Workflows (Feature 013: Workflow Trigger Workflow)
// ============================================================================

/// Available workflow info for selection UI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableWorkflowInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub step_count: u32,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub last_executed_at: Option<String>,
}

/// Get available workflows for trigger selection (excludes the current workflow)
#[tauri::command]
pub async fn get_available_workflows(
    db: tauri::State<'_, DatabaseState>,
    exclude_workflow_id: String,
) -> Result<Vec<AvailableWorkflowInfo>, String> {
    let workflow_repo = WorkflowRepository::new(db.0.as_ref().clone());

    // Load workflows
    let workflows = workflow_repo.list()?;

    // Filter and map workflows
    let available: Vec<AvailableWorkflowInfo> = workflows
        .into_iter()
        .filter(|w| w.id != exclude_workflow_id)
        .map(|w| {
            AvailableWorkflowInfo {
                id: w.id,
                name: w.name,
                description: w.description,
                step_count: w.nodes.len() as u32,
                project_id: w.project_id,
                project_name: None, // Projects feature removed
                last_executed_at: w.last_executed_at,
            }
        })
        .collect();

    Ok(available)
}

// ============================================================================
// Cycle Detection (Feature 013: User Story 4)
// ============================================================================

/// Result of cycle detection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CycleDetectionResult {
    /// Whether a cycle was detected
    pub has_cycle: bool,
    /// The cycle path if detected (workflow IDs in order)
    pub cycle_path: Option<Vec<String>>,
    /// Human-readable cycle description
    pub cycle_description: Option<String>,
}

/// Detect workflow cycles using DFS
/// Returns true if adding target_workflow_id as a trigger in source_workflow_id would create a cycle
#[tauri::command]
pub async fn detect_workflow_cycle(
    db: tauri::State<'_, DatabaseState>,
    source_workflow_id: String,
    target_workflow_id: String,
) -> Result<CycleDetectionResult, String> {
    let workflow_repo = WorkflowRepository::new(db.0.as_ref().clone());

    // Load all workflows
    let workflows = workflow_repo.list()?;

    // Build adjacency list (workflow_id -> list of triggered workflow_ids)
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();

    for workflow in &workflows {
        let mut triggers: Vec<String> = Vec::new();
        for node in &workflow.nodes {
            if let Some(config) = node.get_trigger_workflow_config() {
                if !config.target_workflow_id.is_empty() {
                    triggers.push(config.target_workflow_id.clone());
                }
            }
        }
        adjacency.insert(workflow.id.clone(), triggers);
    }

    // Simulate adding the new edge
    let source_triggers = adjacency.entry(source_workflow_id.clone()).or_default();
    if !source_triggers.contains(&target_workflow_id) {
        source_triggers.push(target_workflow_id.clone());
    }

    // DFS to detect cycle starting from target_workflow_id
    // (if target can reach source, adding source->target creates a cycle)
    let mut visited: HashSet<String> = HashSet::new();
    let mut rec_stack: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();

    fn dfs(
        node: &str,
        target: &str,
        adjacency: &HashMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
        path: &mut Vec<String>,
    ) -> bool {
        visited.insert(node.to_string());
        rec_stack.insert(node.to_string());
        path.push(node.to_string());

        if let Some(neighbors) = adjacency.get(node) {
            for neighbor in neighbors {
                // Found the target - cycle detected
                if neighbor == target {
                    path.push(neighbor.to_string());
                    return true;
                }

                if !visited.contains(neighbor) {
                    if dfs(neighbor, target, adjacency, visited, rec_stack, path) {
                        return true;
                    }
                }
            }
        }

        rec_stack.remove(node);
        path.pop();
        false
    }

    // Check if target can reach source (which would create a cycle)
    let has_cycle = dfs(
        &target_workflow_id,
        &source_workflow_id,
        &adjacency,
        &mut visited,
        &mut rec_stack,
        &mut path,
    );

    if has_cycle {
        // Build workflow name map for human-readable description
        let name_map: HashMap<String, String> = workflows
            .iter()
            .map(|w| (w.id.clone(), w.name.clone()))
            .collect();

        let cycle_names: Vec<String> = path
            .iter()
            .map(|id| name_map.get(id).cloned().unwrap_or_else(|| id.clone()))
            .collect();

        let description = format!("Cycle detected: {}", cycle_names.join(" → "));

        Ok(CycleDetectionResult {
            has_cycle: true,
            cycle_path: Some(path),
            cycle_description: Some(description),
        })
    } else {
        Ok(CycleDetectionResult {
            has_cycle: false,
            cycle_path: None,
            cycle_description: None,
        })
    }
}

// ============================================================================
// Child Execution Query (Feature 013: T050)
// ============================================================================

/// Child execution info for API response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildExecutionInfo {
    pub execution_id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub depth: u32,
}

/// Get child executions for a parent execution
#[tauri::command]
pub async fn get_child_executions(
    app: AppHandle,
    parent_execution_id: String,
) -> Result<Vec<ChildExecutionInfo>, String> {
    let state = app.state::<WorkflowExecutionState>();
    let executions = state.executions.lock().unwrap();

    let children: Vec<ChildExecutionInfo> = executions
        .values()
        .filter(|e| e.execution.parent_execution_id.as_ref() == Some(&parent_execution_id))
        .map(|e| ChildExecutionInfo {
            execution_id: e.execution.id.clone(),
            workflow_id: e.workflow.id.clone(),
            workflow_name: e.workflow.name.clone(),
            status: format!("{:?}", e.execution.status),
            started_at: Some(e.execution.started_at.clone()),
            finished_at: e.execution.finished_at.clone(),
            depth: e.execution.depth,
        })
        .collect();

    Ok(children)
}

// ============================================================================
// Execution History Commands
// ============================================================================

/// Execution history item stored in the store
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionHistoryItem {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: String,
    pub duration_ms: u64,
    pub node_count: usize,
    pub completed_node_count: usize,
    pub error_message: Option<String>,
    pub output: Vec<WorkflowOutputLine>,
    pub triggered_by: String,
}

/// Execution history settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionHistorySettings {
    pub max_history_per_workflow: usize,
    pub retention_days: u32,
    pub max_output_lines: usize,
}

impl Default for ExecutionHistorySettings {
    fn default() -> Self {
        Self {
            max_history_per_workflow: 50,
            retention_days: 30,
            max_output_lines: 500,
        }
    }
}

/// Execution history store structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionHistoryStore {
    pub version: String,
    pub histories: HashMap<String, Vec<ExecutionHistoryItem>>,
    pub settings: Option<ExecutionHistorySettings>,
}

/// Settings key for execution history
const EXECUTION_HISTORY_SETTINGS_KEY: &str = "execution_history_settings";

/// Load execution history for a workflow
#[tauri::command]
pub async fn load_execution_history(
    _db: tauri::State<'_, DatabaseState>,
    _workflow_id: String,
) -> Result<Vec<ExecutionHistoryItem>, String> {
    // ExecutionRepository removed - return empty
    Ok(vec![])
}

/// Load all execution history
#[tauri::command]
pub async fn load_all_execution_history(
    _db: tauri::State<'_, DatabaseState>,
) -> Result<ExecutionHistoryStore, String> {
    // ExecutionRepository removed - return empty
    Ok(ExecutionHistoryStore {
        version: "3.0".to_string(),
        histories: HashMap::new(),
        settings: None,
    })
}

/// Save a new execution history item
#[tauri::command]
pub async fn save_execution_history(
    _db: tauri::State<'_, DatabaseState>,
    _item: ExecutionHistoryItem,
) -> Result<(), String> {
    // ExecutionRepository removed - no-op stub
    Ok(())
}

/// Delete a specific history item
#[tauri::command]
pub async fn delete_execution_history(
    _db: tauri::State<'_, DatabaseState>,
    _workflow_id: String,
    _history_id: String,
) -> Result<(), String> {
    // ExecutionRepository removed - no-op stub
    Ok(())
}

/// Clear all history for a workflow
#[tauri::command]
pub async fn clear_workflow_execution_history(
    _db: tauri::State<'_, DatabaseState>,
    _workflow_id: String,
) -> Result<(), String> {
    // ExecutionRepository removed - no-op stub
    Ok(())
}

/// Update execution history settings
#[tauri::command]
pub async fn update_execution_history_settings(
    _db: tauri::State<'_, DatabaseState>,
    _settings: ExecutionHistorySettings,
) -> Result<(), String> {
    // ExecutionRepository removed - no-op stub
    Ok(())
}

