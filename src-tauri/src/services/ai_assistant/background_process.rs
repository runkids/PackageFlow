//! Background Process Manager for AI Assistant
//!
//! Manages long-running background processes (like dev servers) started by AI Assistant.
//! Provides real-time output streaming via Tauri events.
//!
//! Feature: AI Assistant Background Script Execution

use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, RwLock, Semaphore};
use uuid::Uuid;

use crate::utils::path_resolver;

// ============================================================================
// Constants
// ============================================================================

/// Maximum concurrent background processes
const MAX_BACKGROUND_PROCESSES: usize = 10;

/// Maximum output buffer size per process (500KB)
const MAX_OUTPUT_BUFFER_BYTES: usize = 500 * 1024;

/// Maximum lines to keep in buffer
const MAX_OUTPUT_BUFFER_LINES: usize = 5000;

/// Default success pattern timeout (30 seconds)
const DEFAULT_SUCCESS_TIMEOUT_MS: u64 = 30_000;

/// Process cleanup interval (check every 60 seconds)
#[allow(dead_code)]
const CLEANUP_INTERVAL_SECS: u64 = 60;

/// Time after completion before process is removed (5 minutes)
const COMPLETED_PROCESS_TTL_SECS: u64 = 300;

/// Batch size for output events
const OUTPUT_BATCH_SIZE: usize = 50;

/// Batch interval for output events
const OUTPUT_BATCH_INTERVAL_MS: u64 = 100;

// ============================================================================
// Types
// ============================================================================

/// Status of a background process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundProcessStatus {
    /// Process is starting, waiting for success pattern
    Starting,
    /// Process is running (success pattern matched or no pattern specified)
    Running,
    /// Process completed successfully (exit code 0)
    Completed,
    /// Process failed (non-zero exit code)
    Failed,
    /// Process was stopped by user
    Stopped,
    /// Process timed out waiting for success pattern
    TimedOut,
}

impl std::fmt::Display for BackgroundProcessStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Starting => write!(f, "starting"),
            Self::Running => write!(f, "running"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
            Self::Stopped => write!(f, "stopped"),
            Self::TimedOut => write!(f, "timed_out"),
        }
    }
}

/// Output line with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputLine {
    /// Line content
    pub content: String,
    /// Stream type ("stdout" or "stderr")
    pub stream: String,
    /// Timestamp (ISO 8601)
    pub timestamp: String,
}

/// Information about a background process (returned to frontend/AI)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundProcessInfo {
    /// Unique process identifier
    pub id: String,
    /// OS process ID
    pub pid: Option<u32>,
    /// Process group ID (for termination)
    #[cfg(unix)]
    pub pgid: Option<i32>,
    /// Script/command name
    pub name: String,
    /// Working directory
    pub cwd: String,
    /// Full command
    pub command: String,
    /// Project path
    pub project_path: String,
    /// Current status
    pub status: BackgroundProcessStatus,
    /// Start time (ISO 8601)
    pub started_at: String,
    /// End time (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    /// Exit code (if completed/failed/stopped)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    /// Whether success pattern was matched
    pub pattern_matched: bool,
    /// Associated conversation ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// Associated tool call ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// Detected port (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

/// Process output payload for Tauri events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOutputPayload {
    /// Process ID
    pub process_id: String,
    /// Conversation ID (for filtering)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// Batch of output lines
    pub output: Vec<OutputLine>,
}

/// Process status change payload for Tauri events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatusPayload {
    /// Process ID
    pub process_id: String,
    /// Conversation ID (for filtering)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// New status
    pub status: BackgroundProcessStatus,
    /// Exit code (if applicable)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    /// Pattern matched flag
    pub pattern_matched: bool,
}

/// Process started payload for Tauri events (sent when a new background process starts)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStartedPayload {
    /// Process ID
    pub process_id: String,
    /// Display name (script name)
    pub name: String,
    /// Full command
    pub command: String,
    /// Working directory
    pub cwd: String,
    /// Project path
    pub project_path: String,
    /// Project name (for display)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    /// Initial status
    pub status: BackgroundProcessStatus,
    /// Start time (ISO 8601)
    pub started_at: String,
    /// Associated conversation ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    /// Associated message ID (tool_call_id)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

/// Circular buffer for output with configurable max size
struct CircularBuffer {
    lines: VecDeque<OutputLine>,
    max_lines: usize,
    total_bytes: usize,
    max_bytes: usize,
}

impl CircularBuffer {
    fn new(max_lines: usize, max_bytes: usize) -> Self {
        Self {
            lines: VecDeque::new(),
            max_lines,
            total_bytes: 0,
            max_bytes,
        }
    }

    fn push(&mut self, line: OutputLine) {
        let line_len = line.content.len();

        // Remove old lines if we exceed limits
        while (self.lines.len() >= self.max_lines || self.total_bytes + line_len > self.max_bytes)
            && !self.lines.is_empty()
        {
            if let Some(old) = self.lines.pop_front() {
                self.total_bytes = self.total_bytes.saturating_sub(old.content.len());
            }
        }

        self.total_bytes += line_len;
        self.lines.push_back(line);
    }

    fn tail(&self, n: usize) -> Vec<OutputLine> {
        self.lines.iter().rev().take(n).rev().cloned().collect()
    }

    #[allow(dead_code)]
    fn len(&self) -> usize {
        self.lines.len()
    }

    fn get_all(&self) -> Vec<OutputLine> {
        self.lines.iter().cloned().collect()
    }
}

/// Internal state for tracking a background process
struct BackgroundProcessState {
    info: BackgroundProcessInfo,
    /// Handle to the child process
    child: Option<tokio::process::Child>,
    /// Output buffer (combined stdout/stderr)
    output_buffer: CircularBuffer,
    /// Success pattern regex
    success_pattern: Option<Regex>,
    /// Whether pattern has been matched
    pattern_matched: bool,
    /// Task handle for output reading (abort on stop)
    #[allow(dead_code)]
    output_task: Option<tokio::task::JoinHandle<()>>,
    /// Task handle for process monitoring
    #[allow(dead_code)]
    monitor_task: Option<tokio::task::JoinHandle<()>>,
}

// ============================================================================
// Background Process Manager
// ============================================================================

/// Manager for background processes
pub struct BackgroundProcessManager {
    processes: Arc<RwLock<HashMap<String, Arc<RwLock<BackgroundProcessState>>>>>,
    semaphore: Semaphore,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl BackgroundProcessManager {
    /// Create a new background process manager
    pub fn new() -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            semaphore: Semaphore::new(MAX_BACKGROUND_PROCESSES),
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Set the Tauri app handle for event emission
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut app = self.app_handle.write().await;
        *app = Some(handle);
    }

    /// Start a background process
    pub async fn start_process(
        &self,
        name: String,
        command: String,
        args: Vec<String>,
        cwd: String,
        project_path: String,
        success_pattern: Option<String>,
        success_timeout_ms: Option<u64>,
        conversation_id: Option<String>,
        tool_call_id: Option<String>,
    ) -> Result<BackgroundProcessInfo, String> {
        // Try to acquire semaphore permit
        let _permit = self.semaphore.try_acquire()
            .map_err(|_| format!("Maximum background processes ({}) reached", MAX_BACKGROUND_PROCESSES))?;

        // Generate unique ID
        let id = format!("bg_{}", Uuid::new_v4().to_string().split('-').next().unwrap_or("unknown"));

        // Build command string for display
        let full_command = if args.is_empty() {
            command.clone()
        } else {
            format!("{} {}", command, args.join(" "))
        };

        // Build std::process::Command with process group
        let mut std_cmd = std::process::Command::new(&command);
        std_cmd.args(&args)
            .current_dir(&cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // Set environment variables for macOS GUI apps
        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy().to_string();
            std_cmd.env("HOME", &home_str);

            // Volta support
            let volta_home = format!("{}/.volta", home_str);
            if std::path::Path::new(&volta_home).exists() {
                std_cmd.env("VOLTA_HOME", &volta_home);
            }

            // fnm support
            let fnm_dir = format!("{}/.fnm", home_str);
            if std::path::Path::new(&fnm_dir).exists() {
                std_cmd.env("FNM_DIR", &fnm_dir);
            }
        }

        // Set PATH
        std_cmd.env("PATH", path_resolver::get_path());

        // Set encoding and terminal settings
        std_cmd.env("LANG", "en_US.UTF-8");
        std_cmd.env("LC_ALL", "en_US.UTF-8");
        std_cmd.env("TERM", "xterm-256color");
        std_cmd.env("FORCE_COLOR", "1");
        std_cmd.env("CI", "false");

        // Create new process group on Unix for proper child termination
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            std_cmd.process_group(0);
        }

        // Spawn via tokio
        let mut child = Command::from(std_cmd).spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let pid = child.id();

        #[cfg(unix)]
        let pgid = pid.map(|p| p as i32);

        // Compile success pattern regex
        let compiled_pattern = if let Some(ref pattern) = success_pattern {
            Some(Regex::new(pattern)
                .map_err(|e| format!("Invalid success pattern regex: {}", e))?)
        } else {
            None
        };

        // Create initial info
        let info = BackgroundProcessInfo {
            id: id.clone(),
            pid,
            #[cfg(unix)]
            pgid,
            name: name.clone(),
            cwd: cwd.clone(),
            command: full_command,
            project_path,
            status: if success_pattern.is_some() {
                BackgroundProcessStatus::Starting
            } else {
                BackgroundProcessStatus::Running
            },
            started_at: Utc::now().to_rfc3339(),
            ended_at: None,
            exit_code: None,
            pattern_matched: false,
            conversation_id: conversation_id.clone(),
            tool_call_id,
            port: None,
        };

        // Take stdout and stderr handles
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Create state
        let state = BackgroundProcessState {
            info: info.clone(),
            child: Some(child),
            output_buffer: CircularBuffer::new(MAX_OUTPUT_BUFFER_LINES, MAX_OUTPUT_BUFFER_BYTES),
            success_pattern: compiled_pattern,
            pattern_matched: false,
            output_task: None,
            monitor_task: None,
        };

        let state = Arc::new(RwLock::new(state));

        // Store in map
        {
            let mut processes = self.processes.write().await;
            processes.insert(id.clone(), state.clone());
        }

        // Emit process-started event to frontend
        {
            let app = self.app_handle.read().await;
            if let Some(ref handle) = *app {
                let started_payload = ProcessStartedPayload {
                    process_id: id.clone(),
                    name: name.clone(),
                    command: info.command.clone(),
                    cwd: cwd.clone(),
                    project_path: info.project_path.clone(),
                    project_name: None, // Could be added to start_process params if needed
                    status: info.status.clone(),
                    started_at: info.started_at.clone(),
                    conversation_id: conversation_id.clone(),
                    message_id: info.tool_call_id.clone(),
                };
                let _ = handle.emit("ai:background-process-started", started_payload);
                log::debug!("[BackgroundProcessManager] Emitted process-started event for {}", id);
            }
        }

        // Spawn output reader tasks
        let (output_tx, output_rx) = mpsc::channel::<OutputLine>(1000);

        self.spawn_output_readers(
            id.clone(),
            stdout,
            stderr,
            output_tx,
            state.clone(),
        );

        // Spawn output batcher (sends events to frontend)
        self.spawn_output_batcher(
            id.clone(),
            conversation_id.clone(),
            output_rx,
            state.clone(),
        );

        // Spawn process monitor
        self.spawn_process_monitor(
            id.clone(),
            conversation_id,
            state.clone(),
            success_pattern.is_some(),
            success_timeout_ms.unwrap_or(DEFAULT_SUCCESS_TIMEOUT_MS),
        );

        log::info!("[BackgroundProcessManager] Started process {} (pid: {:?})", id, pid);

        Ok(info)
    }

    /// Spawn tasks to read stdout and stderr
    fn spawn_output_readers(
        &self,
        process_id: String,
        stdout: Option<tokio::process::ChildStdout>,
        stderr: Option<tokio::process::ChildStderr>,
        output_tx: mpsc::Sender<OutputLine>,
        state: Arc<RwLock<BackgroundProcessState>>,
    ) {
        // Read stdout
        if let Some(stdout) = stdout {
            let tx = output_tx.clone();
            let state = state.clone();
            let process_id = process_id.clone();

            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    let output = OutputLine {
                        content: line.clone(),
                        stream: "stdout".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    };

                    // Check for success pattern
                    {
                        let mut s = state.write().await;
                        if let Some(ref pattern) = s.success_pattern {
                            if !s.pattern_matched && pattern.is_match(&line) {
                                s.pattern_matched = true;
                                s.info.pattern_matched = true;
                                if s.info.status == BackgroundProcessStatus::Starting {
                                    s.info.status = BackgroundProcessStatus::Running;
                                }
                                log::info!("[BackgroundProcessManager] Process {} matched success pattern", process_id);
                            }
                        }
                        s.output_buffer.push(output.clone());
                    }

                    // Send to batcher (ignore send errors if receiver dropped)
                    let _ = tx.send(output).await;
                }
            });
        }

        // Read stderr
        if let Some(stderr) = stderr {
            let tx = output_tx;
            let state = state.clone();
            let process_id = process_id.clone();

            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    let output = OutputLine {
                        content: line.clone(),
                        stream: "stderr".to_string(),
                        timestamp: Utc::now().to_rfc3339(),
                    };

                    // Check for success pattern (also on stderr)
                    {
                        let mut s = state.write().await;
                        if let Some(ref pattern) = s.success_pattern {
                            if !s.pattern_matched && pattern.is_match(&line) {
                                s.pattern_matched = true;
                                s.info.pattern_matched = true;
                                if s.info.status == BackgroundProcessStatus::Starting {
                                    s.info.status = BackgroundProcessStatus::Running;
                                }
                                log::info!("[BackgroundProcessManager] Process {} matched success pattern", process_id);
                            }
                        }
                        s.output_buffer.push(output.clone());
                    }

                    let _ = tx.send(output).await;
                }
            });
        }
    }

    /// Spawn task to batch output and emit events
    fn spawn_output_batcher(
        &self,
        process_id: String,
        conversation_id: Option<String>,
        mut output_rx: mpsc::Receiver<OutputLine>,
        _state: Arc<RwLock<BackgroundProcessState>>,
    ) {
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            let mut batch = Vec::with_capacity(OUTPUT_BATCH_SIZE);
            let mut interval = tokio::time::interval(Duration::from_millis(OUTPUT_BATCH_INTERVAL_MS));

            loop {
                tokio::select! {
                    Some(line) = output_rx.recv() => {
                        batch.push(line);
                        if batch.len() >= OUTPUT_BATCH_SIZE {
                            emit_output_batch(&app_handle, &process_id, &conversation_id, &mut batch).await;
                        }
                    }
                    _ = interval.tick() => {
                        if !batch.is_empty() {
                            emit_output_batch(&app_handle, &process_id, &conversation_id, &mut batch).await;
                        }
                    }
                    else => break,
                }
            }

            // Emit remaining batch
            if !batch.is_empty() {
                emit_output_batch(&app_handle, &process_id, &conversation_id, &mut batch).await;
            }
        });
    }

    /// Spawn task to monitor process status
    fn spawn_process_monitor(
        &self,
        process_id: String,
        conversation_id: Option<String>,
        state: Arc<RwLock<BackgroundProcessState>>,
        has_pattern: bool,
        pattern_timeout_ms: u64,
    ) {
        let app_handle = self.app_handle.clone();
        let _processes = self.processes.clone();

        tokio::spawn(async move {
            let pattern_deadline = if has_pattern {
                Some(std::time::Instant::now() + Duration::from_millis(pattern_timeout_ms))
            } else {
                None
            };

            let mut interval = tokio::time::interval(Duration::from_millis(500));

            loop {
                interval.tick().await;

                let mut s = state.write().await;

                // Check pattern timeout
                if let Some(deadline) = pattern_deadline {
                    if !s.pattern_matched && std::time::Instant::now() >= deadline {
                        s.info.status = BackgroundProcessStatus::TimedOut;
                        s.info.ended_at = Some(Utc::now().to_rfc3339());
                        emit_status_change(&app_handle, &process_id, &conversation_id, &s.info).await;
                        log::warn!("[BackgroundProcessManager] Process {} timed out waiting for pattern", process_id);
                        break;
                    }
                }

                // Check if process has exited
                if let Some(ref mut child) = s.child {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            s.info.exit_code = status.code();
                            s.info.status = if status.success() {
                                BackgroundProcessStatus::Completed
                            } else {
                                BackgroundProcessStatus::Failed
                            };
                            s.info.ended_at = Some(Utc::now().to_rfc3339());
                            s.child = None;

                            emit_status_change(&app_handle, &process_id, &conversation_id, &s.info).await;
                            log::info!("[BackgroundProcessManager] Process {} exited with code {:?}", process_id, status.code());
                            break;
                        }
                        Ok(None) => {
                            // Still running
                        }
                        Err(e) => {
                            s.info.status = BackgroundProcessStatus::Failed;
                            s.info.ended_at = Some(Utc::now().to_rfc3339());
                            s.child = None;
                            emit_status_change(&app_handle, &process_id, &conversation_id, &s.info).await;
                            log::error!("[BackgroundProcessManager] Process {} error: {}", process_id, e);
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });
    }

    /// Stop a background process
    pub async fn stop_process(&self, process_id: &str, force: bool) -> Result<(), String> {
        let processes = self.processes.read().await;
        let state = processes.get(process_id)
            .ok_or_else(|| format!("Process not found: {}", process_id))?
            .clone();

        let mut s = state.write().await;

        // Copy pgid before mutable borrow of child
        #[cfg(unix)]
        let pgid_copy = s.info.pgid;

        if let Some(ref mut child) = s.child {
            #[cfg(unix)]
            {
                if let Some(pgid) = pgid_copy {
                    log::info!("[BackgroundProcessManager] Stopping process group {}", pgid);

                    unsafe {
                        let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
                        libc::kill(-pgid, signal);
                    }

                    if !force {
                        // Wait for graceful shutdown
                        tokio::time::sleep(Duration::from_secs(2)).await;

                        // Force kill if still running
                        if let Ok(None) = child.try_wait() {
                            unsafe {
                                libc::kill(-pgid, libc::SIGKILL);
                            }
                        }
                    }
                } else if let Some(pid) = child.id() {
                    // Fallback: kill single process
                    log::warn!("[BackgroundProcessManager] No pgid, killing process {}", pid);
                    let _ = child.kill().await;
                }
            }

            #[cfg(not(unix))]
            {
                let _ = child.kill().await;
            }

            // Wait for process to terminate
            let _ = child.wait().await;
            s.child = None;
        }

        s.info.status = BackgroundProcessStatus::Stopped;
        s.info.ended_at = Some(Utc::now().to_rfc3339());

        // Emit status change
        let app = self.app_handle.read().await;
        if let Some(ref handle) = *app {
            let _ = handle.emit("ai:background-process-status", ProcessStatusPayload {
                process_id: process_id.to_string(),
                conversation_id: s.info.conversation_id.clone(),
                status: s.info.status.clone(),
                exit_code: s.info.exit_code,
                pattern_matched: s.info.pattern_matched,
            });
        }

        log::info!("[BackgroundProcessManager] Stopped process {}", process_id);
        Ok(())
    }

    /// Get output from a process
    pub async fn get_output(&self, process_id: &str, tail_lines: Option<usize>) -> Result<Vec<OutputLine>, String> {
        let processes = self.processes.read().await;
        let state = processes.get(process_id)
            .ok_or_else(|| format!("Process not found: {}", process_id))?;

        let s = state.read().await;
        let lines = if let Some(n) = tail_lines {
            s.output_buffer.tail(n)
        } else {
            s.output_buffer.get_all()
        };

        Ok(lines)
    }

    /// Get process info
    pub async fn get_process(&self, process_id: &str) -> Result<BackgroundProcessInfo, String> {
        let processes = self.processes.read().await;
        let state = processes.get(process_id)
            .ok_or_else(|| format!("Process not found: {}", process_id))?;

        let s = state.read().await;
        Ok(s.info.clone())
    }

    /// List all processes
    pub async fn list_processes(&self) -> Vec<BackgroundProcessInfo> {
        let processes = self.processes.read().await;
        let mut result = Vec::new();

        for state in processes.values() {
            let s = state.read().await;
            result.push(s.info.clone());
        }

        result
    }

    /// Remove a completed process from tracking
    pub async fn remove_process(&self, process_id: &str) -> Result<(), String> {
        let mut processes = self.processes.write().await;

        if let Some(state) = processes.get(process_id) {
            let s = state.read().await;
            if s.info.status == BackgroundProcessStatus::Running || s.info.status == BackgroundProcessStatus::Starting {
                return Err("Cannot remove running process".to_string());
            }
        }

        processes.remove(process_id);
        Ok(())
    }

    /// Stop all running processes (called on shutdown)
    pub async fn shutdown(&self) {
        log::info!("[BackgroundProcessManager] Shutting down, stopping all processes...");

        let processes = self.processes.read().await;

        for (id, state) in processes.iter() {
            let mut s = state.write().await;

            // Copy pgid before mutable borrow of child
            #[cfg(unix)]
            let pgid_copy = s.info.pgid;

            if let Some(ref mut child) = s.child {
                log::info!("[BackgroundProcessManager] Stopping process {} on shutdown", id);

                #[cfg(unix)]
                {
                    if let Some(pgid) = pgid_copy {
                        unsafe {
                            libc::kill(-pgid, libc::SIGTERM);
                        }
                    }
                }

                // Wait briefly then force kill
                tokio::time::sleep(Duration::from_secs(2)).await;
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
        }

        log::info!("[BackgroundProcessManager] All processes stopped");
    }

    /// Cleanup completed processes older than TTL
    pub async fn cleanup(&self) {
        let now = Utc::now();
        let mut to_remove = Vec::new();

        {
            let processes = self.processes.read().await;

            for (id, state) in processes.iter() {
                let s = state.read().await;

                if let Some(ref ended_at) = s.info.ended_at {
                    if let Ok(ended) = chrono::DateTime::parse_from_rfc3339(ended_at) {
                        let elapsed = now.signed_duration_since(ended);
                        if elapsed.num_seconds() > COMPLETED_PROCESS_TTL_SECS as i64 {
                            to_remove.push(id.clone());
                        }
                    }
                }
            }
        }

        if !to_remove.is_empty() {
            let mut processes = self.processes.write().await;
            for id in to_remove {
                processes.remove(&id);
                log::debug!("[BackgroundProcessManager] Cleaned up old process {}", id);
            }
        }
    }
}

/// Helper function to emit output batch
async fn emit_output_batch(
    app_handle: &RwLock<Option<AppHandle>>,
    process_id: &str,
    conversation_id: &Option<String>,
    batch: &mut Vec<OutputLine>,
) {
    let app = app_handle.read().await;
    if let Some(ref handle) = *app {
        let _ = handle.emit("ai:background-process-output", ProcessOutputPayload {
            process_id: process_id.to_string(),
            conversation_id: conversation_id.clone(),
            output: std::mem::take(batch),
        });
    } else {
        batch.clear();
    }
}

/// Helper function to emit status change
async fn emit_status_change(
    app_handle: &RwLock<Option<AppHandle>>,
    process_id: &str,
    conversation_id: &Option<String>,
    info: &BackgroundProcessInfo,
) {
    let app = app_handle.read().await;
    if let Some(ref handle) = *app {
        let _ = handle.emit("ai:background-process-status", ProcessStatusPayload {
            process_id: process_id.to_string(),
            conversation_id: conversation_id.clone(),
            status: info.status.clone(),
            exit_code: info.exit_code,
            pattern_matched: info.pattern_matched,
        });
    }
}

// ============================================================================
// Global Instance
// ============================================================================

/// Global background process manager
pub static BACKGROUND_PROCESS_MANAGER: Lazy<BackgroundProcessManager> =
    Lazy::new(BackgroundProcessManager::new);

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circular_buffer() {
        let mut buffer = CircularBuffer::new(3, 1000);

        buffer.push(OutputLine {
            content: "line1".to_string(),
            stream: "stdout".to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
        });
        buffer.push(OutputLine {
            content: "line2".to_string(),
            stream: "stdout".to_string(),
            timestamp: "2024-01-01T00:00:01Z".to_string(),
        });
        buffer.push(OutputLine {
            content: "line3".to_string(),
            stream: "stdout".to_string(),
            timestamp: "2024-01-01T00:00:02Z".to_string(),
        });

        assert_eq!(buffer.len(), 3);

        // Adding 4th line should remove first
        buffer.push(OutputLine {
            content: "line4".to_string(),
            stream: "stdout".to_string(),
            timestamp: "2024-01-01T00:00:03Z".to_string(),
        });

        assert_eq!(buffer.len(), 3);
        let tail = buffer.tail(3);
        assert_eq!(tail[0].content, "line2");
        assert_eq!(tail[2].content, "line4");
    }

    #[test]
    fn test_status_display() {
        assert_eq!(BackgroundProcessStatus::Running.to_string(), "running");
        assert_eq!(BackgroundProcessStatus::Stopped.to_string(), "stopped");
    }
}
