// AI CLI Executor
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Handles execution of AI CLI tools with:
// - PTY-based streaming output via Tauri events (real-time like terminal)
// - Timeout handling
// - Process cancellation
// - Dual auth mode (CLI native / API key)

use crate::models::cli_tool::{
    AICLIContext, AICLIErrorCode, AICLIExecuteRequest, AICLIExecuteResult,
    AICLIOutputEvent, CLIAuthMode, CLIToolConfig, CLIToolType,
};
use crate::services::ai_cli::security::{sanitize_line, validate_arguments, validate_working_directory};
use crate::utils::path_resolver;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Wry};
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio::time::Duration;
use uuid::Uuid;

/// Default timeout in seconds
const DEFAULT_TIMEOUT_SECS: u64 = 300;

/// Event name for CLI output
pub const CLI_OUTPUT_EVENT: &str = "ai:cli-output";

/// Active process handles for cancellation
pub struct ActiveProcesses {
    processes: RwLock<HashMap<String, tokio::sync::oneshot::Sender<()>>>,
}

impl ActiveProcesses {
    pub fn new() -> Self {
        Self {
            processes: RwLock::new(HashMap::new()),
        }
    }

    pub async fn register(&self, execution_id: String) -> tokio::sync::oneshot::Receiver<()> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.processes.write().await.insert(execution_id, tx);
        rx
    }

    pub async fn cancel(&self, execution_id: &str) -> bool {
        if let Some(tx) = self.processes.write().await.remove(execution_id) {
            let _ = tx.send(());
            true
        } else {
            false
        }
    }

    pub async fn remove(&self, execution_id: &str) {
        self.processes.write().await.remove(execution_id);
    }
}

impl Default for ActiveProcesses {
    fn default() -> Self {
        Self::new()
    }
}

/// CLI Executor service
pub struct CLIExecutor {
    app_handle: AppHandle<Wry>,
    active_processes: Arc<ActiveProcesses>,
}

impl CLIExecutor {
    pub fn new(app_handle: AppHandle<Wry>) -> Self {
        Self {
            app_handle,
            active_processes: Arc::new(ActiveProcesses::new()),
        }
    }

    /// Execute an AI CLI command with streaming output
    pub async fn execute(
        &self,
        request: AICLIExecuteRequest,
        config: Option<&CLIToolConfig>,
        api_key: Option<&str>,
    ) -> Result<AICLIExecuteResult, (AICLIErrorCode, String)> {
        let execution_id = Uuid::new_v4().to_string();
        let start_time = Instant::now();

        // Validate working directory
        validate_working_directory(&request.project_path)
            .map_err(|e| (AICLIErrorCode::WorkingDirNotFound, e))?;

        // Find the binary
        let binary_path = self.get_binary_path(&request.tool, config)?;

        // Build command arguments
        let args = self.build_args(&request)?;

        // Validate arguments for security
        validate_arguments(&args).map_err(|e| (AICLIErrorCode::SecurityViolation, e))?;

        // Build the PTY command
        let cmd = self.build_pty_command(&binary_path, &args, &request, config, api_key)?;

        // Register for cancellation
        let cancel_rx = self.active_processes.register(execution_id.clone()).await;

        // Emit start status
        self.emit_status(&execution_id, "Starting AI CLI execution...", false);

        // Execute with timeout
        let timeout_secs = request.options.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
        let result = self
            .execute_with_streaming(cmd, &execution_id, timeout_secs, cancel_rx)
            .await;

        // Clean up
        self.active_processes.remove(&execution_id).await;

        let duration_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok((stdout, stderr, exit_code)) => {
                self.emit_status(&execution_id, "Execution completed", true);
                Ok(AICLIExecuteResult {
                    execution_id,
                    exit_code: Some(exit_code),
                    stdout,
                    stderr,
                    duration_ms: Some(duration_ms),
                    cancelled: false,
                })
            }
            Err(ExecuteError::Cancelled) => {
                self.emit_status(&execution_id, "Execution cancelled", true);
                Ok(AICLIExecuteResult {
                    execution_id,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    duration_ms: Some(duration_ms),
                    cancelled: true,
                })
            }
            Err(ExecuteError::Timeout) => {
                self.emit_status(&execution_id, &format!("Execution timed out after {}s", timeout_secs), true);
                Err((
                    AICLIErrorCode::Timeout,
                    format!("Process timed out after {} seconds", timeout_secs),
                ))
            }
            Err(ExecuteError::SpawnFailed(e)) => {
                self.emit_status(&execution_id, &format!("Failed to start: {}", e), true);
                Err((AICLIErrorCode::SpawnFailed, e))
            }
            Err(ExecuteError::IoError(e)) => {
                self.emit_status(&execution_id, &format!("I/O error: {}", e), true);
                Err((AICLIErrorCode::Unknown, e))
            }
        }
    }

    /// Cancel a running execution
    pub async fn cancel(&self, execution_id: &str) -> bool {
        self.active_processes.cancel(execution_id).await
    }

    /// Get the binary path for a tool
    fn get_binary_path(
        &self,
        tool_type: &CLIToolType,
        config: Option<&CLIToolConfig>,
    ) -> Result<String, (AICLIErrorCode, String)> {
        // First check if config has a custom path
        if let Some(cfg) = config {
            if let Some(ref path) = cfg.binary_path {
                if Path::new(path).exists() {
                    return Ok(path.clone());
                }
            }
        }

        // Auto-detect using path_resolver
        path_resolver::find_tool(tool_type.binary_name()).ok_or_else(|| {
            (
                AICLIErrorCode::ToolNotFound,
                format!(
                    "{} CLI tool not found. Please install it first.",
                    tool_type.display_name()
                ),
            )
        })
    }

    /// Build command arguments based on the request
    fn build_args(&self, request: &AICLIExecuteRequest) -> Result<Vec<String>, (AICLIErrorCode, String)> {
        let mut args = Vec::new();

        match request.tool {
            CLIToolType::ClaudeCode => {
                // Claude CLI arguments
                // Use --print for non-interactive output mode (outputs result directly to stdout)
                args.push("--print".to_string());
                // The prompt
                args.push(request.prompt.clone());

                // Add model if specified
                if let Some(ref model) = request.model {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }

                // Add max tokens if specified
                if let Some(max_tokens) = request.options.max_tokens {
                    args.push("--max-tokens".to_string());
                    args.push(max_tokens.to_string());
                }
            }
            CLIToolType::Codex => {
                // Codex CLI arguments
                args.push(request.prompt.clone());

                // Add model if specified
                if let Some(ref model) = request.model {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }
            }
            CLIToolType::GeminiCli => {
                // Gemini CLI arguments
                args.push(request.prompt.clone());

                // Add model if specified
                if let Some(ref model) = request.model {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }
            }
        }

        Ok(args)
    }

    /// Build PTY command with proper environment
    fn build_pty_command(
        &self,
        binary_path: &str,
        args: &[String],
        request: &AICLIExecuteRequest,
        config: Option<&CLIToolConfig>,
        api_key: Option<&str>,
    ) -> Result<CommandBuilder, (AICLIErrorCode, String)> {
        let mut cmd = CommandBuilder::new(binary_path);

        // Add arguments
        for arg in args {
            cmd.arg(arg);
        }

        // Set working directory
        cmd.cwd(&request.project_path);

        // Set up environment using path_resolver pattern
        if let Some(ref home) = path_resolver::get_home_dir() {
            cmd.env("HOME", home);
        }

        // Set PATH
        cmd.env("PATH", path_resolver::get_path());

        // Set LANG for proper encoding
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");

        // Terminal settings - PTY will handle these properly
        cmd.env("TERM", "xterm-256color");
        cmd.env("FORCE_COLOR", "1");
        cmd.env("CI", "false");
        cmd.env("COLORTERM", "truecolor");

        // Handle authentication based on mode
        let auth_mode = config
            .map(|c| c.auth_mode.clone())
            .unwrap_or(CLIAuthMode::CliNative);

        match auth_mode {
            CLIAuthMode::ApiKey => {
                // API key mode - inject key via environment variable
                if let Some(key) = api_key {
                    let env_var = request.tool.env_var_name();
                    cmd.env(env_var, key);
                } else {
                    return Err((
                        AICLIErrorCode::ApiKeyMissing,
                        format!(
                            "API key not configured for {}. Please add it in Settings > AI Services.",
                            request.tool.display_name()
                        ),
                    ));
                }
            }
            CLIAuthMode::CliNative => {
                // CLI native mode - let the CLI handle authentication
                // No API key injection needed
            }
        }

        Ok(cmd)
    }

    /// Execute command with PTY for real-time streaming output
    async fn execute_with_streaming(
        &self,
        cmd: CommandBuilder,
        execution_id: &str,
        timeout_secs: u64,
        cancel_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<(String, String, i32), ExecuteError> {
        let app = self.app_handle.clone();
        let exec_id = execution_id.to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancelled_clone = cancelled.clone();

        // Spawn cancellation listener
        tokio::spawn(async move {
            let _ = cancel_rx.await;
            cancelled_clone.store(true, Ordering::SeqCst);
        });

        // Run PTY in blocking task (portable-pty is not async)
        let result = tokio::task::spawn_blocking(move || {
            // Create PTY system
            let pty_system = NativePtySystem::default();

            // Create PTY pair with reasonable terminal size
            let pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| ExecuteError::SpawnFailed(format!("Failed to create PTY: {}", e)))?;

            // Spawn the command in the PTY
            let mut child = pair
                .slave
                .spawn_command(cmd)
                .map_err(|e| ExecuteError::SpawnFailed(format!("Failed to spawn command: {}", e)))?;

            // Get the master side for reading output
            let mut reader = pair
                .master
                .try_clone_reader()
                .map_err(|e| ExecuteError::IoError(format!("Failed to clone PTY reader: {}", e)))?;

            // Drop the slave side - we don't need it anymore
            drop(pair.slave);

            let mut output_buffer = String::new();
            let mut line_buf = String::new();
            let mut chunk_buf = [0u8; 256]; // Smaller buffer for more frequent updates
            let start_time = Instant::now();
            let timeout_duration = Duration::from_secs(timeout_secs);

            // Read loop
            loop {
                // Check timeout
                if start_time.elapsed() > timeout_duration {
                    let _ = child.kill();
                    return Err(ExecuteError::Timeout);
                }

                // Check cancellation
                if cancelled.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    return Err(ExecuteError::Cancelled);
                }

                // Try to read from PTY (non-blocking would be ideal but we'll use small buffer)
                match reader.read(&mut chunk_buf) {
                    Ok(0) => {
                        // EOF - process has likely exited
                        break;
                    }
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&chunk_buf[..n]);
                        output_buffer.push_str(&chunk);

                        // Process chunk for display - emit lines as they complete
                        for ch in chunk.chars() {
                            if ch == '\n' {
                                let sanitized = sanitize_line(&line_buf);
                                if !sanitized.is_empty() {
                                    let _ = app.emit(
                                        CLI_OUTPUT_EVENT,
                                        AICLIOutputEvent::stdout(&exec_id, sanitized),
                                    );
                                }
                                line_buf.clear();
                            } else if ch != '\r' {
                                line_buf.push(ch);
                            }
                        }

                        // Emit partial line for real-time effect (if enough content)
                        if !line_buf.is_empty() && line_buf.len() >= 5 {
                            let sanitized = sanitize_line(&line_buf);
                            if !sanitized.is_empty() {
                                let _ = app.emit(
                                    CLI_OUTPUT_EVENT,
                                    AICLIOutputEvent::stdout(&exec_id, sanitized),
                                );
                            }
                            line_buf.clear();
                        }
                    }
                    Err(e) => {
                        // Check if process has exited
                        if let Ok(Some(_)) = child.try_wait() {
                            break;
                        }
                        // For other errors, just continue
                        if e.kind() != std::io::ErrorKind::WouldBlock {
                            log::warn!("PTY read error: {}", e);
                        }
                        std::thread::sleep(std::time::Duration::from_millis(10));
                    }
                }
            }

            // Emit remaining content
            if !line_buf.is_empty() {
                let sanitized = sanitize_line(&line_buf);
                if !sanitized.is_empty() {
                    let _ = app.emit(
                        CLI_OUTPUT_EVENT,
                        AICLIOutputEvent::stdout(&exec_id, sanitized),
                    );
                }
            }

            // Wait for process to exit and get status
            let status = child
                .wait()
                .map_err(|e| ExecuteError::IoError(format!("Failed to wait for process: {}", e)))?;

            let exit_code = status.exit_code() as i32;

            Ok((output_buffer, String::new(), exit_code))
        })
        .await
        .map_err(|e| ExecuteError::IoError(format!("Task join error: {}", e)))?;

        result
    }

    /// Emit a status event
    fn emit_status(&self, execution_id: &str, message: &str, is_final: bool) {
        let _ = self.app_handle.emit(
            CLI_OUTPUT_EVENT,
            AICLIOutputEvent::status(execution_id, message.to_string(), is_final),
        );
    }
}

/// Internal error type for execution
enum ExecuteError {
    SpawnFailed(String),
    Timeout,
    Cancelled,
    IoError(String),
}

/// Build context string from AICLIContext
pub async fn build_context_string(
    project_path: &str,
    context: &AICLIContext,
) -> Result<String, String> {
    let mut parts = Vec::new();

    // Include custom context
    if let Some(ref custom) = context.custom_context {
        parts.push(custom.clone());
    }

    // Include files
    for file in &context.files {
        let file_path = Path::new(project_path).join(file);
        if file_path.exists() {
            match tokio::fs::read_to_string(&file_path).await {
                Ok(content) => {
                    parts.push(format!("File: {}\n```\n{}\n```", file, content));
                }
                Err(e) => {
                    log::warn!("Failed to read file {}: {}", file, e);
                }
            }
        }
    }

    // Include git diff if requested
    if context.include_diff {
        if let Ok(diff) = get_git_diff(project_path).await {
            if !diff.is_empty() {
                parts.push(format!("Git Staged Changes:\n```diff\n{}\n```", diff));
            }
        }
    }

    Ok(parts.join("\n\n---\n\n"))
}

/// Get git staged diff
async fn get_git_diff(project_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(project_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err("Failed to get git diff".to_string())
    }
}
