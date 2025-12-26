// Process Manager for AI Assistant Tool Execution
// Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
//
// Tracks and manages processes spawned by AI tool calls,
// enabling proper cancellation of long-running operations.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::{Child, Command};
use std::process::Stdio;

/// Status of a tracked process
#[derive(Debug, Clone, PartialEq)]
pub enum ProcessStatus {
    /// Process is running
    Running,
    /// Process completed successfully
    Completed,
    /// Process failed
    Failed(String),
    /// Process was stopped by user
    Stopped,
}

/// Information about a tracked process
#[derive(Debug)]
pub struct TrackedProcess {
    /// Tool call ID that spawned this process
    pub tool_call_id: String,
    /// Process description (e.g., "npm run dev")
    pub description: String,
    /// Working directory
    pub cwd: String,
    /// Process status
    pub status: ProcessStatus,
    /// Output buffer
    pub output: String,
    /// Error buffer
    pub error_output: String,
    /// Start time
    pub started_at: chrono::DateTime<chrono::Utc>,
    /// Child process handle (if still running)
    child: Option<Child>,
    /// Process group ID (for proper termination of child processes)
    #[cfg(unix)]
    pgid: Option<i32>,
}

impl TrackedProcess {
    #[cfg(unix)]
    fn new(tool_call_id: String, description: String, cwd: String, child: Child, pgid: Option<i32>) -> Self {
        Self {
            tool_call_id,
            description,
            cwd,
            status: ProcessStatus::Running,
            output: String::new(),
            error_output: String::new(),
            started_at: chrono::Utc::now(),
            child: Some(child),
            pgid,
        }
    }

    #[cfg(not(unix))]
    fn new(tool_call_id: String, description: String, cwd: String, child: Child, _pgid: Option<i32>) -> Self {
        Self {
            tool_call_id,
            description,
            cwd,
            status: ProcessStatus::Running,
            output: String::new(),
            error_output: String::new(),
            started_at: chrono::Utc::now(),
            child: Some(child),
        }
    }
}

/// Manager for tracking processes spawned by AI tools
pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, TrackedProcess>>>,
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessManager {
    /// Create a new process manager
    pub fn new() -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Spawn a process and track it by tool call ID
    /// Uses process groups on Unix for proper child process termination
    pub async fn spawn_tracked(
        &self,
        tool_call_id: String,
        command: &str,
        args: &[&str],
        cwd: &str,
    ) -> Result<String, String> {
        use crate::utils::path_resolver;

        // Build description
        let description = if args.is_empty() {
            command.to_string()
        } else {
            format!("{} {}", command, args.join(" "))
        };

        // Build std::process::Command first to set process_group on Unix
        let mut std_cmd = std::process::Command::new(command);
        std_cmd.args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set environment variables using shared path_resolver config
        // This handles Volta, pnpm, fnm, and other tool environments correctly
        path_resolver::configure_std_command_env(&mut std_cmd);

        // Create new process group on Unix for proper child termination
        // This allows us to kill all child processes when stopping
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            std_cmd.process_group(0); // Creates new process group with leader = child PID
        }

        // Convert to tokio Command and spawn
        let child = Command::from(std_cmd).spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        // On Unix, process group ID equals the process leader's PID
        #[cfg(unix)]
        let pgid = child.id().map(|pid| pid as i32);
        #[cfg(not(unix))]
        let pgid: Option<i32> = None;

        // Track it
        let process = TrackedProcess::new(
            tool_call_id.clone(),
            description,
            cwd.to_string(),
            child,
            pgid,
        );

        let mut processes = self.processes.write().await;
        processes.insert(tool_call_id.clone(), process);

        Ok(tool_call_id)
    }

    /// Stop a process by tool call ID
    /// Terminates the entire process group on Unix to ensure child processes are also killed
    pub async fn stop_process(&self, tool_call_id: &str) -> Result<(), String> {
        let mut processes = self.processes.write().await;

        if let Some(process) = processes.get_mut(tool_call_id) {
            if let Some(mut child) = process.child.take() {
                // On Unix, kill the entire process group for proper child termination
                #[cfg(unix)]
                {
                    if let Some(pgid) = process.pgid {
                        // Send SIGTERM to entire process group (negative PID)
                        log::info!("[ProcessManager] Sending SIGTERM to process group {}", pgid);
                        unsafe {
                            libc::kill(-pgid, libc::SIGTERM);
                        }

                        // Wait for graceful shutdown
                        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                        // Check if process is still running
                        if let Ok(None) = child.try_wait() {
                            // Force kill entire process group if still running
                            log::info!("[ProcessManager] Force killing process group {}", pgid);
                            unsafe {
                                libc::kill(-pgid, libc::SIGKILL);
                            }
                        }
                    } else if let Some(pid) = child.id() {
                        // Fallback: kill single process if pgid not available
                        log::warn!("[ProcessManager] No pgid, killing single process {}", pid);
                        unsafe {
                            libc::kill(pid as i32, libc::SIGTERM);
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    }
                }

                // On non-Unix, just kill the main process
                #[cfg(not(unix))]
                {
                    if let Err(e) = child.kill().await {
                        log::debug!("Process may have already exited: {}", e);
                    }
                }

                // Wait for process to fully terminate
                let _ = child.wait().await;

                process.status = ProcessStatus::Stopped;
                log::info!("[ProcessManager] Process {} stopped successfully", tool_call_id);
                Ok(())
            } else {
                Err("Process already completed or stopped".to_string())
            }
        } else {
            Err(format!("No process found for tool call: {}", tool_call_id))
        }
    }

    /// Check if a process is still running
    pub async fn is_running(&self, tool_call_id: &str) -> bool {
        let processes = self.processes.read().await;
        if let Some(process) = processes.get(tool_call_id) {
            process.status == ProcessStatus::Running && process.child.is_some()
        } else {
            false
        }
    }

    /// Get process status
    pub async fn get_status(&self, tool_call_id: &str) -> Option<ProcessStatus> {
        let processes = self.processes.read().await;
        processes.get(tool_call_id).map(|p| p.status.clone())
    }

    /// Wait for a process to complete and return output
    /// Uses a polling loop so that stop_process can interrupt it
    pub async fn wait_for_output(
        &self,
        tool_call_id: &str,
        timeout_ms: Option<u64>,
    ) -> Result<(String, String, bool), String> {
        let timeout = timeout_ms.unwrap_or(300_000); // 5 minutes default
        let start = std::time::Instant::now();
        println!(">>> [ProcessManager] wait_for_output started for {}", tool_call_id);

        // Poll for completion, checking for stop every 100ms
        loop {
            // Check if we've been stopped or completed
            {
                let processes = self.processes.read().await;
                if let Some(process) = processes.get(tool_call_id) {
                    match &process.status {
                        ProcessStatus::Stopped => {
                            return Err("Cancelled by user".to_string());
                        }
                        ProcessStatus::Completed | ProcessStatus::Failed(_) => {
                            return Ok((
                                process.output.clone(),
                                process.error_output.clone(),
                                process.status == ProcessStatus::Completed,
                            ));
                        }
                        ProcessStatus::Running => {
                            // Continue waiting
                        }
                    }
                } else {
                    return Err(format!("No process found for: {}", tool_call_id));
                }
            }

            // Check timeout
            if start.elapsed().as_millis() as u64 > timeout {
                // Kill the process on timeout
                let _ = self.stop_process(tool_call_id).await;
                return Err("Process timed out".to_string());
            }

            // Try to collect output if process has finished
            {
                let mut processes = self.processes.write().await;
                if let Some(process) = processes.get_mut(tool_call_id) {
                    if let Some(ref mut child) = process.child {
                        // Try non-blocking wait
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                // Process has completed
                                println!(">>> [ProcessManager] Process {} completed with status: {:?}", tool_call_id, status);
                                let mut stdout = String::new();
                                let mut stderr = String::new();

                                // Read any available output
                                if let Some(ref mut out) = child.stdout {
                                    use tokio::io::AsyncReadExt;
                                    let mut buf = Vec::new();
                                    if let Ok(_) = tokio::time::timeout(
                                        tokio::time::Duration::from_millis(100),
                                        out.read_to_end(&mut buf)
                                    ).await {
                                        stdout = String::from_utf8_lossy(&buf).to_string();
                                    }
                                }

                                if let Some(ref mut err) = child.stderr {
                                    use tokio::io::AsyncReadExt;
                                    let mut buf = Vec::new();
                                    if let Ok(_) = tokio::time::timeout(
                                        tokio::time::Duration::from_millis(100),
                                        err.read_to_end(&mut buf)
                                    ).await {
                                        stderr = String::from_utf8_lossy(&buf).to_string();
                                    }
                                }

                                let success = status.success();
                                process.output = stdout.clone();
                                process.error_output = stderr.clone();
                                process.status = if success {
                                    ProcessStatus::Completed
                                } else {
                                    ProcessStatus::Failed(format!("Exit code: {:?}", status.code()))
                                };
                                process.child = None; // Mark as done

                                return Ok((stdout, stderr, success));
                            }
                            Ok(None) => {
                                // Still running
                            }
                            Err(e) => {
                                process.status = ProcessStatus::Failed(e.to_string());
                                process.child = None;
                                return Err(format!("Process error: {}", e));
                            }
                        }
                    }
                }
            }

            // Wait a bit before polling again
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }

    /// Clean up completed/old processes
    pub async fn cleanup(&self, max_age_seconds: u64) {
        let cutoff = chrono::Utc::now() - chrono::Duration::seconds(max_age_seconds as i64);
        let mut processes = self.processes.write().await;

        processes.retain(|_, p| {
            // Keep if running or recently finished
            p.status == ProcessStatus::Running || p.started_at > cutoff
        });
    }

    /// List all tracked processes
    pub async fn list_processes(&self) -> Vec<(String, String, ProcessStatus)> {
        let processes = self.processes.read().await;
        processes.iter()
            .map(|(id, p)| (id.clone(), p.description.clone(), p.status.clone()))
            .collect()
    }
}

// Global instance for the application
use once_cell::sync::Lazy;
pub static PROCESS_MANAGER: Lazy<ProcessManager> = Lazy::new(ProcessManager::new);

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spawn_and_stop() {
        let manager = ProcessManager::new();

        // Spawn a simple sleep command
        let result = manager.spawn_tracked(
            "test_call_1".to_string(),
            "sleep",
            &["10"],
            "/tmp",
        ).await;

        assert!(result.is_ok());
        assert!(manager.is_running("test_call_1").await);

        // Stop it
        let stop_result = manager.stop_process("test_call_1").await;
        assert!(stop_result.is_ok());

        // Should be stopped now
        let status = manager.get_status("test_call_1").await;
        assert_eq!(status, Some(ProcessStatus::Stopped));
    }
}
