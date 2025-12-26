// Script execution commands
// Implements US3: Script Execution with Real-time Output

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use tokio::sync::RwLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use uuid::Uuid;

use crate::commands::project::parse_package_json;
use crate::commands::version::detect_volta;
use crate::utils::path_resolver;
use std::path::Path;

// ============================================================================
// Feature 007: Terminal Session Reconnect - New Types
// ============================================================================

/// Execution status for tracking script state (Feature 007)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl Default for ExecutionStatus {
    fn default() -> Self {
        Self::Running
    }
}

impl std::fmt::Display for ExecutionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionStatus::Running => write!(f, "running"),
            ExecutionStatus::Completed => write!(f, "completed"),
            ExecutionStatus::Failed => write!(f, "failed"),
            ExecutionStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Single output line for buffering (Feature 007)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputLine {
    pub content: String,
    pub stream: String,    // "stdout" | "stderr"
    pub timestamp: String, // ISO 8601
}

/// Output buffer with size limit for storing script output history (Feature 007)
/// Uses a ring buffer approach - when max size is exceeded, oldest content is removed
pub struct OutputBuffer {
    lines: VecDeque<OutputLine>,
    total_size: usize,
    max_size: usize,
    truncated: bool,
}

impl OutputBuffer {
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
    pub fn push(&mut self, line: OutputLine) {
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
    pub fn get_lines(&self) -> Vec<OutputLine> {
        self.lines.iter().cloned().collect()
    }

    /// Get combined output as a single string
    pub fn get_combined_output(&self) -> String {
        self.lines
            .iter()
            .map(|l| l.content.as_str())
            .collect::<Vec<_>>()
            .join("")
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

impl Default for OutputBuffer {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Performance Optimization: Output Batcher
// Batches output events to reduce IPC overhead (8KB or 16ms threshold)
// ============================================================================

/// Performance optimization: Batch output before emitting to frontend
/// Reduces IPC overhead by batching events (8KB or 16ms, whichever comes first)
pub struct OutputBatcher {
    buffer: String,
    last_flush: Instant,
    execution_id: String,
    stream_type: String,
}

impl OutputBatcher {
    /// Batch size threshold (8KB)
    const BATCH_SIZE_THRESHOLD: usize = 8192;
    /// Time threshold (16ms = ~60fps)
    const TIME_THRESHOLD_MS: u64 = 16;

    pub fn new(execution_id: String, stream_type: &str) -> Self {
        Self {
            buffer: String::new(),
            last_flush: Instant::now(),
            execution_id,
            stream_type: stream_type.to_string(),
        }
    }

    /// Add content to buffer and flush if thresholds are met
    pub async fn add(&mut self, content: &str, app: &AppHandle, state: &ScriptExecutionState) {
        self.buffer.push_str(content);

        let should_flush = self.buffer.len() >= Self::BATCH_SIZE_THRESHOLD
            || self.last_flush.elapsed().as_millis() as u64 >= Self::TIME_THRESHOLD_MS;

        if should_flush {
            self.flush(app, state).await;
        }
    }

    /// Flush any remaining content (call at end of stream)
    pub async fn flush(&mut self, app: &AppHandle, state: &ScriptExecutionState) {
        if self.buffer.is_empty() {
            return;
        }

        let timestamp = Utc::now().to_rfc3339();

        // Buffer the output in state (using write lock for mutation)
        {
            let mut executions = state.executions.write().await;
            if let Some(exec) = executions.get_mut(&self.execution_id) {
                exec.output_buffer.push(OutputLine {
                    content: self.buffer.clone(),
                    stream: self.stream_type.clone(),
                    timestamp: timestamp.clone(),
                });
            }
        }

        // Emit to frontend
        let _ = app.emit(
            "script_output",
            ScriptOutputPayload {
                execution_id: self.execution_id.clone(),
                output: self.buffer.clone(),
                stream: self.stream_type.clone(),
                timestamp,
            },
        );

        self.buffer.clear();
        self.last_flush = Instant::now();
    }
}

// ============================================================================
// Shared Output Stream Handler
// Eliminates code duplication between execute_script and execute_command
// ============================================================================

/// Stream type for output handling
#[derive(Clone, Copy)]
pub enum StreamType {
    Stdout,
    Stderr,
}

impl StreamType {
    fn as_str(&self) -> &'static str {
        match self {
            StreamType::Stdout => "stdout",
            StreamType::Stderr => "stderr",
        }
    }
}

/// Shared output stream handler - processes lines from stdout/stderr
/// Uses OutputBatcher for performance optimization
async fn stream_output<R: tokio::io::AsyncRead + Unpin>(
    reader: R,
    stream_type: StreamType,
    execution_id: String,
    app: AppHandle,
) {
    let state = app.state::<ScriptExecutionState>();
    let mut batcher = OutputBatcher::new(execution_id.clone(), stream_type.as_str());
    let mut line_reader = BufReader::new(reader).lines();

    while let Ok(Some(line)) = line_reader.next_line().await {
        // BufReader::lines() strips newlines, so we add it back for proper display
        let line_with_newline = format!("{}\n", line);
        batcher.add(&line_with_newline, &app, &state).await;
    }

    // Flush any remaining content
    batcher.flush(&app, &state).await;
}

/// Shared process completion handler
/// Eliminates code duplication between execute_script and execute_command
async fn handle_process_completion(
    execution_id: String,
    start_time: Instant,
    app: AppHandle,
) {
    // Get the child process (outside lock scope for await)
    let child_opt = {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;
        executions
            .get_mut(&execution_id)
            .and_then(|exec| exec.child.take())
    };

    // Wait for the child process (no lock held)
    let status = if let Some(mut child) = child_opt {
        child.wait().await.ok()
    } else {
        None
    };

    let exit_code = status.and_then(|s| s.code()).unwrap_or(-1);
    let duration = start_time.elapsed();

    let _ = app.emit(
        "script_completed",
        ScriptCompletedPayload {
            execution_id: execution_id.clone(),
            exit_code,
            success: exit_code == 0,
            duration_ms: duration.as_millis() as u64,
        },
    );

    // Update status instead of removing (keep for 5 min retention)
    let state = app.state::<ScriptExecutionState>();
    let mut executions = state.executions.write().await;
    if let Some(exec) = executions.get_mut(&execution_id) {
        exec.status = if exit_code == 0 {
            ExecutionStatus::Completed
        } else {
            ExecutionStatus::Failed
        };
        exec.exit_code = Some(exit_code);
        exec.completed_at = Some(Utc::now().to_rfc3339());
        exec.child = None;
        exec.stdin = None;
    }
}

// ============================================================================
// Types
// ============================================================================

/// Execution state stored in app state
pub struct ScriptExecutionState {
    /// Map of execution_id -> child process handle
    /// Uses RwLock for better async performance (allows concurrent reads)
    pub executions: RwLock<HashMap<String, RunningExecution>>,
}

/// Running execution info with output buffer for reconnection support (Feature 007)
pub struct RunningExecution {
    // Original fields
    pub execution_id: String,
    pub script_name: String,
    pub started_at: Instant,
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub pid: Option<u32>,
    // Feature 007: New fields for reconnection support
    pub project_path: String,
    pub project_name: Option<String>,
    pub output_buffer: OutputBuffer,
    pub started_at_iso: String,
    pub status: ExecutionStatus,
    pub exit_code: Option<i32>,
    pub completed_at: Option<String>,
}

impl Default for ScriptExecutionState {
    fn default() -> Self {
        Self {
            executions: RwLock::new(HashMap::new()),
        }
    }
}

/// Get all descendant PIDs of a process (children, grandchildren, etc.)
fn get_descendant_pids(pid: u32) -> Vec<u32> {
    let mut descendants = Vec::new();

    // Use pgrep -P to find direct children
    let output = path_resolver::create_command("pgrep")
        .args(["-P", &pid.to_string()])
        .output();

    if let Ok(output) = output {
        let pids_str = String::from_utf8_lossy(&output.stdout);
        for line in pids_str.lines() {
            if let Ok(child_pid) = line.trim().parse::<u32>() {
                // Add this child
                descendants.push(child_pid);
                // Recursively get grandchildren
                descendants.extend(get_descendant_pids(child_pid));
            }
        }
    }

    descendants
}

/// Kill a process and all its descendants (children, grandchildren, etc.)
/// This ensures that child processes spawned by npm/pnpm/yarn/vite are also terminated
fn kill_process_tree(pid: u32) -> Result<(), String> {
    println!("[kill_process_tree] Killing process tree for PID: {}", pid);

    // First, collect all descendant PIDs (depth-first to get deepest children first)
    let descendants = get_descendant_pids(pid);
    println!(
        "[kill_process_tree] Found {} descendants: {:?}",
        descendants.len(),
        descendants
    );

    // Kill descendants in reverse order (deepest first) to avoid orphaning
    for child_pid in descendants.iter().rev() {
        println!("[kill_process_tree] Killing descendant PID: {}", child_pid);
        let _ = path_resolver::create_command("kill")
            .args(["-9", &child_pid.to_string()])
            .output();
    }

    // Finally kill the parent process
    let kill_result = path_resolver::create_command("kill")
        .args(["-9", &pid.to_string()])
        .output();

    match &kill_result {
        Ok(output) => {
            println!(
                "[kill_process_tree] kill -9 {} result: status={}, stderr={}",
                pid,
                output.status,
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Err(e) => {
            println!("[kill_process_tree] kill -9 {} error: {}", pid, e);
        }
    }

    Ok(())
}

/// Script output event payload (sent to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutputPayload {
    pub execution_id: String,
    pub output: String,
    pub stream: String, // "stdout" | "stderr"
    pub timestamp: String,
}

/// Script completed event payload (sent to frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptCompletedPayload {
    pub execution_id: String,
    pub exit_code: i32,
    pub success: bool,
    pub duration_ms: u64,
}

/// Response for execute_script command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteScriptResponse {
    pub success: bool,
    pub execution_id: Option<String>,
    pub error: Option<String>,
}

/// Response for cancel_script command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelScriptResponse {
    pub success: bool,
    pub error: Option<String>,
}

// ============================================================================
// Commands
// ============================================================================

/// Execute an npm script
/// Uses path_resolver to handle macOS GUI app PATH issues
#[tauri::command]
pub async fn execute_script(
    app: AppHandle,
    project_path: String,
    script_name: String,
    package_manager: String,
    cwd: Option<String>,
    project_name: Option<String>, // Feature 007: Optional project name for reconnection
) -> Result<ExecuteScriptResponse, String> {
    let execution_id = Uuid::new_v4().to_string();
    let working_dir = cwd.clone().unwrap_or_else(|| project_path.clone());
    let stored_project_path = cwd.unwrap_or(project_path); // Feature 007: Store actual working dir

    // Determine command based on package manager
    // Special handling for built-in commands (install, build, etc.)
    let is_builtin_command = matches!(script_name.as_str(), "install" | "i" | "ci");

    let pm_cmd = match package_manager.as_str() {
        "pnpm" => "pnpm",
        "yarn" => "yarn",
        "npm" | _ => "npm",
    };

    let pm_args: Vec<String> = if is_builtin_command {
        // For built-in commands, run directly without "run"
        vec![script_name.clone()]
    } else {
        // For package.json scripts, use "run"
        vec!["run".to_string(), script_name.clone()]
    };

    // Check if project has Volta config and Volta is available
    let path = Path::new(&working_dir);
    let volta_config = match parse_package_json(path) {
        Ok(pj) => {
            println!("[execute_script] package.json volta config: {:?}", pj.volta);
            pj.volta.clone()
        }
        Err(e) => {
            println!("[execute_script] Failed to parse package.json: {}", e);
            None
        }
    };
    let volta_status = detect_volta();
    println!(
        "[execute_script] Volta status: available={}, path={:?}",
        volta_status.available, volta_status.path
    );
    println!(
        "[execute_script] volta_config.is_some()={}, volta_status.available={}",
        volta_config.is_some(),
        volta_status.available
    );

    // Determine final command and args (with or without Volta wrapper)
    let (cmd, args): (String, Vec<String>) = if volta_config.is_some() && volta_status.available {
        // Use volta run to ensure correct versions
        let volta_cmd = volta_status.path.unwrap_or_else(|| "volta".to_string());
        let mut volta_args = vec!["run".to_string()];

        // Add all configured volta versions
        if let Some(ref config) = volta_config {
            // Node.js version
            if let Some(ref node_version) = config.node {
                volta_args.push("--node".to_string());
                volta_args.push(node_version.clone());
            }
            // npm version (only when running npm)
            if pm_cmd == "npm" {
                if let Some(ref npm_version) = config.npm {
                    volta_args.push("--npm".to_string());
                    volta_args.push(npm_version.clone());
                }
            }
            // yarn version (only when running yarn)
            if pm_cmd == "yarn" {
                if let Some(ref yarn_version) = config.yarn {
                    volta_args.push("--yarn".to_string());
                    volta_args.push(yarn_version.clone());
                }
            }
            // Note: Volta doesn't directly support --pnpm flag
            // pnpm version management should use corepack instead
        }

        volta_args.push(pm_cmd.to_string());
        volta_args.extend(pm_args);
        println!(
            "[execute_script] Using Volta: {} {:?} in {}",
            volta_cmd, volta_args, working_dir
        );
        (volta_cmd, volta_args)
    } else {
        println!(
            "[execute_script] Spawning {} {:?} in {}",
            pm_cmd, pm_args, working_dir
        );
        (pm_cmd.to_string(), pm_args)
    };

    // Use path_resolver to create command with proper PATH for macOS GUI apps
    let mut command = path_resolver::create_command(&cmd);
    command.args(&args);
    command.current_dir(&working_dir);
    // Set CI=true to prevent interactive prompts from pnpm/npm
    command.env("CI", "true");
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.stdin(Stdio::piped());

    // Convert to tokio command and spawn
    let mut child = tokio::process::Command::from(command)
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let pid = child.id();
    println!("[execute_script] Spawned process with PID: {:?}", pid);

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let stdin = child.stdin.take();

    let exec_id = execution_id.clone();
    let start_time = Instant::now();

    // Feature 007: Store execution state with extended fields
    let started_at_iso = Utc::now().to_rfc3339();
    let stored_path = stored_project_path.clone();
    let stored_name = project_name.clone();
    {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;
        executions.insert(
            execution_id.clone(),
            RunningExecution {
                execution_id: execution_id.clone(),
                script_name: script_name.clone(),
                started_at: start_time,
                child: Some(child),
                stdin,
                pid,
                // Feature 007: New fields
                project_path: stored_path.clone(),
                project_name: stored_name.clone(),
                output_buffer: OutputBuffer::new(),
                started_at_iso: started_at_iso.clone(),
                status: ExecutionStatus::Running,
                exit_code: None,
                completed_at: None,
            },
        );
    }

    // Performance optimization: Use shared stream handlers with batching
    let app_stdout = app.clone();
    let exec_id_stdout = exec_id.clone();
    let stdout_task = tauri::async_runtime::spawn(async move {
        stream_output(stdout, StreamType::Stdout, exec_id_stdout, app_stdout).await;
    });

    let app_stderr = app.clone();
    let exec_id_stderr = exec_id.clone();
    let stderr_task = tauri::async_runtime::spawn(async move {
        stream_output(stderr, StreamType::Stderr, exec_id_stderr, app_stderr).await;
    });

    // Spawn task to wait for process completion
    let app_wait = app.clone();
    let exec_id_wait = exec_id.clone();
    tauri::async_runtime::spawn(async move {
        // Wait for output tasks to complete
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        // Use shared completion handler
        handle_process_completion(exec_id_wait, start_time, app_wait).await;
    });

    Ok(ExecuteScriptResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    })
}

/// Execute a command from the allowed list
/// Uses path_resolver to handle macOS GUI app PATH issues
///
/// Allowed commands include:
/// - Package managers: npm, yarn, pnpm, bun
/// - Node.js: node, npx, tsx
/// - Version control: git
/// - Build tools: make, cmake
/// - Rust: cargo, rustc, rustup
/// - Python: python, python3, pip, pip3, pipenv, poetry
/// - Go: go
/// - Mobile development: expo, eas, flutter, dart, pod, xcodebuild, fastlane
/// - Container: docker, docker-compose
/// - File operations: ls, cat, head, tail, find, grep, mkdir, rm, cp, mv, touch, chmod
/// - Utilities: echo, pwd, which, env, curl, wget, tar, unzip, open
/// - macOS: brew, xcrun
#[tauri::command]
pub async fn execute_command(
    app: AppHandle,
    command: String,
    args: Vec<String>,
    cwd: String,
    project_path: Option<String>, // Feature 007: Optional project root
    project_name: Option<String>, // Feature 007: Optional project name
) -> Result<ExecuteScriptResponse, String> {
    // Validate allowed commands
    let allowed_commands = [
        // Package managers
        "npm",
        "yarn",
        "pnpm",
        "bun",
        // Node.js tools
        "node",
        "npx",
        "tsx",
        // Version managers
        "volta",
        "fnm",
        "nvm",
        "corepack",
        // Version control
        "git",
        // Build tools
        "make",
        "cmake",
        // Rust
        "cargo",
        "rustc",
        "rustup",
        // Python
        "python",
        "python3",
        "pip",
        "pip3",
        "pipenv",
        "poetry",
        "uv",
        // Go
        "go",
        // Mobile development (Expo / React Native)
        "expo",
        "eas",
        // Mobile development (Flutter)
        "flutter",
        "dart",
        // Mobile development (iOS)
        "pod",
        "xcodebuild",
        "fastlane",
        "xcrun",
        // Container
        "docker",
        "docker-compose",
        // File operations
        "ls",
        "cat",
        "head",
        "tail",
        "find",
        "grep",
        "mkdir",
        "rm",
        "cp",
        "mv",
        "touch",
        "chmod",
        // Utilities
        "echo",
        "pwd",
        "which",
        "env",
        "curl",
        "wget",
        "tar",
        "unzip",
        "open",
        // macOS
        "brew",
    ];

    // Extract base command name from full path (e.g., "/Users/foo/.volta/bin/volta" -> "volta")
    let base_command = std::path::Path::new(&command)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&command);

    if !allowed_commands.contains(&base_command) {
        return Ok(ExecuteScriptResponse {
            success: false,
            execution_id: None,
            error: Some(format!(
                "Command '{}' is not allowed. Run 'packageflow --help' for the list of allowed commands.",
                base_command
            )),
        });
    }

    let execution_id = Uuid::new_v4().to_string();

    println!(
        "[execute_command] command: {}, args: {:?}, cwd: {}",
        command, args, cwd
    );

    // Use path_resolver to create command with proper PATH for macOS GUI apps
    let mut cmd = path_resolver::create_command(&command);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());

    // Convert to tokio command and spawn
    let mut child = tokio::process::Command::from(cmd)
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let pid = child.id();
    println!("[execute_command] Spawned process with PID: {:?}", pid);

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let stdin = child.stdin.take();

    let exec_id = execution_id.clone();
    let start_time = Instant::now();

    // Feature 007: Store execution state with extended fields
    let started_at_iso = Utc::now().to_rfc3339();
    let stored_path = project_path.unwrap_or_else(|| cwd.clone());
    {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;
        executions.insert(
            execution_id.clone(),
            RunningExecution {
                execution_id: execution_id.clone(),
                script_name: format!("{} {}", command, args.join(" ")),
                started_at: start_time,
                child: Some(child),
                stdin,
                pid,
                // Feature 007: New fields
                project_path: stored_path,
                project_name: project_name.clone(),
                output_buffer: OutputBuffer::new(),
                started_at_iso: started_at_iso.clone(),
                status: ExecutionStatus::Running,
                exit_code: None,
                completed_at: None,
            },
        );
    }

    // Performance optimization: Use shared stream handlers with batching
    let app_stdout = app.clone();
    let exec_id_stdout = exec_id.clone();
    let stdout_task = tauri::async_runtime::spawn(async move {
        stream_output(stdout, StreamType::Stdout, exec_id_stdout, app_stdout).await;
    });

    let app_stderr = app.clone();
    let exec_id_stderr = exec_id.clone();
    let stderr_task = tauri::async_runtime::spawn(async move {
        stream_output(stderr, StreamType::Stderr, exec_id_stderr, app_stderr).await;
    });

    // Spawn task to wait for process completion
    let app_wait = app.clone();
    let exec_id_wait = exec_id.clone();
    tauri::async_runtime::spawn(async move {
        // Wait for output tasks to complete
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        // Use shared completion handler
        handle_process_completion(exec_id_wait, start_time, app_wait).await;
    });

    Ok(ExecuteScriptResponse {
        success: true,
        execution_id: Some(execution_id),
        error: None,
    })
}

/// Cancel a running script
#[tauri::command]
pub async fn cancel_script(
    app: AppHandle,
    execution_id: String,
) -> Result<CancelScriptResponse, String> {
    println!("[cancel_script] Called for execution_id: {}", execution_id);

    // Extract needed data from state first, then release lock
    let (pid, child, duration_ms, should_emit) = {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;

        println!(
            "[cancel_script] Current tracked executions: {:?}",
            executions.keys().collect::<Vec<_>>()
        );

        if let Some(execution) = executions.get_mut(&execution_id) {
            // Only cancel if still running
            if execution.status != ExecutionStatus::Running {
                println!(
                    "[cancel_script] Execution {} is not running (status: {:?})",
                    execution_id, execution.status
                );
                return Ok(CancelScriptResponse {
                    success: false,
                    error: Some("Execution is not running".to_string()),
                });
            }

            println!(
                "[cancel_script] Found execution: {}, PID: {:?}",
                execution.script_name, execution.pid
            );
            let duration = execution.started_at.elapsed().as_millis() as u64;
            let pid = execution.pid;
            let child = execution.child.take();

            // Update status while we have the lock
            execution.status = ExecutionStatus::Cancelled;
            execution.exit_code = Some(-1);
            execution.completed_at = Some(Utc::now().to_rfc3339());
            execution.child = None;
            execution.stdin = None;

            (pid, child, duration, true)
        } else {
            println!("[cancel_script] Execution not found in tracked executions");
            return Ok(CancelScriptResponse {
                success: false,
                error: Some("Execution not found".to_string()),
            });
        }
    };

    // Now kill the process (outside the lock)
    if let Some(pid) = pid {
        let _ = kill_process_tree(pid);
    }

    // Kill via child handle if available
    if let Some(mut child) = child {
        let _ = child.kill().await;
    }

    println!("[cancel_script] Process tree killed");

    // Emit completion event
    if should_emit {
        let emit_result = app.emit(
            "script_completed",
            ScriptCompletedPayload {
                execution_id: execution_id.clone(),
                exit_code: -1,
                success: false,
                duration_ms,
            },
        );
        println!("[cancel_script] Emit result: {:?}", emit_result);
    }

    Ok(CancelScriptResponse {
        success: true,
        error: None,
    })
}

/// Kill all processes tracked by this app (safe mode - only kills PackageFlow-started processes)
#[tauri::command]
pub async fn kill_all_node_processes(app: AppHandle) -> Result<CancelScriptResponse, String> {
    // Collect data to kill outside the lock
    let to_kill: Vec<(String, Option<u32>, Option<Child>, u64)> = {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;

        println!(
            "[kill_all_node_processes] Starting, tracked executions: {}",
            executions.len()
        );

        // Feature 007: Only kill running executions
        let running_ids: Vec<String> = executions
            .iter()
            .filter(|(_, exec)| exec.status == ExecutionStatus::Running)
            .map(|(id, _)| id.clone())
            .collect();

        println!(
            "[kill_all_node_processes] Running execution IDs to kill: {:?}",
            running_ids
        );

        running_ids
            .into_iter()
            .filter_map(|exec_id| {
                if let Some(execution) = executions.get_mut(&exec_id) {
                    println!(
                        "[kill_all_node_processes] Processing {}: {}, PID: {:?}",
                        exec_id, execution.script_name, execution.pid
                    );

                    let pid = execution.pid;
                    let child = execution.child.take();
                    let duration_ms = execution.started_at.elapsed().as_millis() as u64;

                    // Update status while we have the lock
                    execution.status = ExecutionStatus::Cancelled;
                    execution.exit_code = Some(-1);
                    execution.completed_at = Some(Utc::now().to_rfc3339());
                    execution.child = None;
                    execution.stdin = None;

                    Some((exec_id, pid, child, duration_ms))
                } else {
                    None
                }
            })
            .collect()
    };

    let mut killed_count = 0;

    // Kill processes outside the lock
    for (exec_id, pid, child, duration_ms) in to_kill {
        // Kill the process tree using PID
        if let Some(pid) = pid {
            let _ = kill_process_tree(pid);
        }

        // Also try via child handle
        if let Some(mut child) = child {
            let _ = child.kill().await;
        }

        killed_count += 1;
        println!(
            "[kill_all_node_processes] Killed process tree for {}",
            exec_id
        );

        // Emit completion event
        let emit_result = app.emit(
            "script_completed",
            ScriptCompletedPayload {
                execution_id: exec_id.clone(),
                exit_code: -1,
                success: false,
                duration_ms,
            },
        );
        println!(
            "[kill_all_node_processes] Emit result for {}: {:?}",
            exec_id, emit_result
        );
    }

    println!(
        "[kill_all_node_processes] Completed, killed_count: {}",
        killed_count
    );

    Ok(CancelScriptResponse {
        success: true,
        error: if killed_count > 0 {
            Some(format!("Stopped {} process(es)", killed_count))
        } else {
            Some("No running processes to stop".to_string())
        },
    })
}

/// Kill processes listening on specific ports
/// Used for cleanup on app close/refresh
#[tauri::command]
pub async fn kill_ports(ports: Vec<u16>) -> Result<CancelScriptResponse, String> {
    println!("[kill_ports] Killing processes on ports: {:?}", ports);

    let mut killed_count = 0;

    for port in ports {
        // Use lsof to find process listening on the port
        let output = path_resolver::create_command("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid_str in pids.lines() {
                if let Ok(pid) = pid_str.trim().parse::<i32>() {
                    println!("[kill_ports] Killing PID {} on port {}", pid, port);
                    // Kill the process
                    let _ = path_resolver::create_command("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                    killed_count += 1;
                }
            }
        }
    }

    println!("[kill_ports] Killed {} process(es)", killed_count);

    Ok(CancelScriptResponse {
        success: true,
        error: if killed_count > 0 {
            Some(format!("Killed {} process(es)", killed_count))
        } else {
            Some("No processes found on specified ports".to_string())
        },
    })
}

/// Check which ports have processes listening
#[tauri::command]
pub async fn check_ports(ports: Vec<u16>) -> Result<Vec<u16>, String> {
    let mut occupied_ports = Vec::new();

    for port in ports {
        let output = path_resolver::create_command("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            if pids.lines().any(|line| !line.trim().is_empty()) {
                occupied_ports.push(port);
            }
        }
    }

    println!("[check_ports] Occupied ports: {:?}", occupied_ports);
    Ok(occupied_ports)
}

/// Response for get_running_scripts command (Feature 007: Extended with reconnection info)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningScriptInfo {
    // Original fields
    pub execution_id: String,
    pub script_name: String,
    pub started_at_ms: u64, // elapsed time for backward compatibility
    // Feature 007: New fields for reconnection support
    pub project_path: String,
    pub project_name: Option<String>,
    pub started_at: String, // ISO 8601 absolute timestamp
    pub status: ExecutionStatus,
    pub exit_code: Option<i32>,
    pub completed_at: Option<String>,
}

/// Get list of script executions (Feature 007: includes completed scripts within 5 min retention)
#[tauri::command]
pub async fn get_running_scripts(app: AppHandle) -> Result<Vec<RunningScriptInfo>, String> {
    // Feature 007 (T025): Clean up expired scripts first
    cleanup_expired_executions(&app).await;

    let state = app.state::<ScriptExecutionState>();
    let executions = state.executions.read().await;

    // Feature 007: Include all scripts (running + completed within retention period)
    let scripts: Vec<RunningScriptInfo> = executions
        .values()
        .map(|exec| RunningScriptInfo {
            // Original fields
            execution_id: exec.execution_id.clone(),
            script_name: exec.script_name.clone(),
            started_at_ms: exec.started_at.elapsed().as_millis() as u64,
            // Feature 007: New fields
            project_path: exec.project_path.clone(),
            project_name: exec.project_name.clone(),
            started_at: exec.started_at_iso.clone(),
            status: exec.status.clone(),
            exit_code: exec.exit_code,
            completed_at: exec.completed_at.clone(),
        })
        .collect();

    Ok(scripts)
}

// ============================================================================
// Feature 007: Get Script Output Command
// ============================================================================

/// Response for get_script_output command (Feature 007)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetScriptOutputResponse {
    pub success: bool,
    pub execution_id: String,
    pub output: Option<String>,
    pub lines: Option<Vec<OutputLine>>,
    pub truncated: bool,
    pub buffer_size: usize,
    pub error: Option<String>,
}

/// Get buffered output for a script execution (Feature 007: for reconnection support)
#[tauri::command]
pub async fn get_script_output(
    app: AppHandle,
    execution_id: String,
) -> Result<GetScriptOutputResponse, String> {
    // Feature 007 (T025): Clean up expired scripts first
    cleanup_expired_executions(&app).await;

    let state = app.state::<ScriptExecutionState>();
    let executions = state.executions.read().await;

    if let Some(exec) = executions.get(&execution_id) {
        Ok(GetScriptOutputResponse {
            success: true,
            execution_id,
            output: Some(exec.output_buffer.get_combined_output()),
            lines: Some(exec.output_buffer.get_lines()),
            truncated: exec.output_buffer.is_truncated(),
            buffer_size: exec.output_buffer.size(),
            error: None,
        })
    } else {
        Ok(GetScriptOutputResponse {
            success: false,
            execution_id,
            output: None,
            lines: None,
            truncated: false,
            buffer_size: 0,
            error: Some("Execution not found".to_string()),
        })
    }
}

// ============================================================================
// Feature 007: Cleanup & Edge Cases
// ============================================================================

/// Retention period for completed scripts (5 minutes)
const COMPLETED_SCRIPT_RETENTION_SECS: u64 = 5 * 60;

/// Clean up expired completed scripts (Feature 007: T025)
async fn cleanup_expired_executions(app: &AppHandle) {
    let state = app.state::<ScriptExecutionState>();
    let mut executions = state.executions.write().await;

    let expired_ids: Vec<String> = executions
        .iter()
        .filter(|(_, exec)| {
            // Only clean up completed scripts (not running)
            exec.status != ExecutionStatus::Running
        })
        .filter(|(_, exec)| {
            // Check if retention period has passed
            exec.started_at.elapsed().as_secs() > COMPLETED_SCRIPT_RETENTION_SECS
        })
        .map(|(id, _)| id.clone())
        .collect();

    for id in expired_ids {
        executions.remove(&id);
    }
}

// ============================================================================
// Feature 008: stdin Interaction Support
// ============================================================================

/// Response for write_to_script command (Feature 008)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteToScriptResponse {
    pub success: bool,
    pub error: Option<String>,
}

/// Maximum allowed input size for stdin (4KB - reasonable for interactive prompts)
const MAX_STDIN_INPUT_SIZE: usize = 4096;

/// Write input to a running script's stdin (Feature 008)
/// Security notes:
/// - Only writes to already-running processes (cannot start new processes)
/// - Input size is limited to prevent memory issues
/// - All writes are logged for auditing
#[tauri::command]
pub async fn write_to_script(
    app: AppHandle,
    execution_id: String,
    input: String,
) -> Result<WriteToScriptResponse, String> {
    // Security: Limit input size
    if input.len() > MAX_STDIN_INPUT_SIZE {
        println!(
            "[write_to_script] SECURITY: Input too large ({} bytes), rejected",
            input.len()
        );
        return Ok(WriteToScriptResponse {
            success: false,
            error: Some(format!(
                "Input too large (max {} bytes)",
                MAX_STDIN_INPUT_SIZE
            )),
        });
    }

    // Extract stdin handle and script name, then release lock
    let (stdin_result, script_name) = {
        let state = app.state::<ScriptExecutionState>();
        let mut executions = state.executions.write().await;

        if let Some(execution) = executions.get_mut(&execution_id) {
            // Check if process is still running
            if execution.status != ExecutionStatus::Running {
                return Ok(WriteToScriptResponse {
                    success: false,
                    error: Some("Process is not running".to_string()),
                });
            }

            let script_name = execution.script_name.clone();

            // Take stdin temporarily for writing
            if execution.stdin.is_some() {
                (Ok(execution.stdin.take()), script_name)
            } else {
                (Err("Stdin handle not available".to_string()), script_name)
            }
        } else {
            return Ok(WriteToScriptResponse {
                success: false,
                error: Some("Execution not found".to_string()),
            });
        }
    };

    // Write to stdin outside the lock
    match stdin_result {
        Ok(Some(mut stdin)) => {
            let bytes = input.as_bytes();

            // Log the write attempt (sanitize for logging - show length and type)
            let input_type = if input.starts_with('\x1b') {
                "ANSI escape sequence"
            } else if input == "\n" {
                "newline"
            } else if input == " " {
                "space"
            } else if input == "\t" {
                "tab"
            } else if input == "\x03" {
                "Ctrl+C"
            } else {
                "text input"
            };
            println!(
                "[write_to_script] Writing {} ({} bytes) to script '{}' (execution: {})",
                input_type,
                bytes.len(),
                script_name,
                execution_id
            );

            match stdin.write_all(bytes).await {
                Ok(_) => {
                    // Put stdin back
                    let state = app.state::<ScriptExecutionState>();
                    let mut executions = state.executions.write().await;
                    if let Some(execution) = executions.get_mut(&execution_id) {
                        execution.stdin = Some(stdin);
                    }
                    Ok(WriteToScriptResponse {
                        success: true,
                        error: None,
                    })
                }
                Err(e) => {
                    println!("[write_to_script] Failed to write to stdin: {}", e);
                    Ok(WriteToScriptResponse {
                        success: false,
                        error: Some(format!("Failed to write to stdin: {}", e)),
                    })
                }
            }
        }
        Ok(None) => Ok(WriteToScriptResponse {
            success: false,
            error: Some("Stdin handle not available".to_string()),
        }),
        Err(e) => Ok(WriteToScriptResponse {
            success: false,
            error: Some(e),
        }),
    }
}

// ============================================================================
// Feature 008: PTY Environment Variables
// ============================================================================

/// Get environment variables for PTY sessions
/// This ensures PTY processes have access to the same environment as other commands
#[tauri::command]
pub async fn get_pty_env() -> Result<std::collections::HashMap<String, String>, String> {
    Ok(path_resolver::build_env_for_child())
}

// ============================================================================
// Volta-wrapped command for PTY execution
// ============================================================================

/// Response for get_volta_wrapped_command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoltaWrappedCommand {
    pub command: String,
    pub args: Vec<String>,
    pub use_volta: bool,
}

/// Get command wrapped with Volta if project has volta config
/// This ensures PTY terminal uses the correct Node.js version
#[tauri::command]
pub async fn get_volta_wrapped_command(
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<VoltaWrappedCommand, String> {
    let path = Path::new(&cwd);
    let volta_config = match parse_package_json(path) {
        Ok(pj) => pj.volta.clone(),
        Err(_) => None,
    };
    let volta_status = detect_volta();

    if volta_config.is_some() && volta_status.available {
        let volta_cmd = volta_status.path.unwrap_or_else(|| "volta".to_string());
        let mut volta_args = vec!["run".to_string()];

        // Add all configured volta versions
        if let Some(ref config) = volta_config {
            // Node.js version
            if let Some(ref node_version) = config.node {
                volta_args.push("--node".to_string());
                volta_args.push(node_version.clone());
            }
            // npm version (only when running npm)
            if command == "npm" {
                if let Some(ref npm_version) = config.npm {
                    volta_args.push("--npm".to_string());
                    volta_args.push(npm_version.clone());
                }
            }
            // yarn version (only when running yarn)
            if command == "yarn" {
                if let Some(ref yarn_version) = config.yarn {
                    volta_args.push("--yarn".to_string());
                    volta_args.push(yarn_version.clone());
                }
            }
        }

        volta_args.push(command);
        volta_args.extend(args);

        println!(
            "[get_volta_wrapped_command] Wrapping with Volta: {} {:?}",
            volta_cmd, volta_args
        );

        Ok(VoltaWrappedCommand {
            command: volta_cmd,
            args: volta_args,
            use_volta: true,
        })
    } else {
        println!(
            "[get_volta_wrapped_command] No Volta wrap needed: {} {:?}",
            command, args
        );
        Ok(VoltaWrappedCommand {
            command,
            args,
            use_volta: false,
        })
    }
}
