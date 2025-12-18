//! MCP Server Instance Manager
//!
//! Provides smart multi-instance management with heartbeat-based
//! liveness detection to allow multiple active MCP servers.
//!
//! ## Design
//!
//! Each MCP server instance:
//! - Creates a `{pid}.lock` file with exclusive lock (fs2)
//! - Creates a `{pid}.heartbeat` file with JSON metadata
//! - Updates heartbeat every 10 seconds
//! - Only kills instances with stale heartbeats (>5 min)

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use packageflow_lib::utils::shared_store::get_app_data_dir;

// ============================================================================
// Constants
// ============================================================================

/// Heartbeat update interval in seconds
const HEARTBEAT_INTERVAL_SECS: u64 = 10;

/// Instance considered stale if no heartbeat for this long (5 minutes)
const STALE_THRESHOLD_SECS: u64 = 300;

/// Grace period before killing stale instance
const CLEANUP_GRACE_PERIOD_SECS: u64 = 5;

/// Subdirectory for instance registry files
const INSTANCE_DIR: &str = "mcp-instances";

// ============================================================================
// Types
// ============================================================================

/// Information about an MCP server instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceInfo {
    pub pid: u32,
    pub started_at: String,
    pub last_heartbeat: String,
    pub client_info: Option<String>,
    pub db_path: String,
}

/// Status of an instance
#[derive(Debug, Clone, PartialEq)]
pub enum InstanceStatus {
    /// Lock held and recent heartbeat
    Active,
    /// Lock held but heartbeat expired (>5 min)
    Stale,
    /// No lock, files exist (crashed process)
    Orphaned,
}

/// Result of cleanup operation
#[derive(Debug, Default)]
pub struct CleanupResult {
    pub orphaned_cleaned: u32,
    pub stale_killed: u32,
    pub active_count: u32,
}

// ============================================================================
// Instance Manager
// ============================================================================

/// Instance manager for MCP server multi-instance support
pub struct InstanceManager {
    instance_dir: PathBuf,
    current_pid: u32,
    lock_file: Option<File>,
    heartbeat_task: Mutex<Option<JoinHandle<()>>>,
    shutdown_flag: Arc<AtomicBool>,
}

impl InstanceManager {
    /// Create a new instance manager
    pub fn new() -> Self {
        Self {
            instance_dir: PathBuf::new(),
            current_pid: std::process::id(),
            lock_file: None,
            heartbeat_task: Mutex::new(None),
            shutdown_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Get the instance directory path
    fn get_instance_dir() -> Result<PathBuf, String> {
        let app_dir = get_app_data_dir()?;
        Ok(app_dir.join(INSTANCE_DIR))
    }

    /// Initialize instance management at startup
    pub async fn initialize(&mut self) -> Result<CleanupResult, String> {
        // Get instance directory
        self.instance_dir = Self::get_instance_dir()?;

        // Create directory if not exists
        if !self.instance_dir.exists() {
            fs::create_dir_all(&self.instance_dir)
                .map_err(|e| format!("Failed to create instance dir: {}", e))?;

            // Set permissions to owner only (0700 on Unix)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = fs::Permissions::from_mode(0o700);
                fs::set_permissions(&self.instance_dir, perms)
                    .map_err(|e| format!("Failed to set dir permissions: {}", e))?;
            }
        }

        // Cleanup stale instances first
        let cleanup_result = self.cleanup_stale_instances().await?;

        // Register current instance
        self.register_instance()?;

        // Start heartbeat task
        self.start_heartbeat_task();

        Ok(cleanup_result)
    }

    /// Scan and cleanup stale/orphaned instances
    async fn cleanup_stale_instances(&self) -> Result<CleanupResult, String> {
        let mut result = CleanupResult::default();

        // Read all .heartbeat files
        let entries = fs::read_dir(&self.instance_dir)
            .map_err(|e| format!("Failed to read instance dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "heartbeat") {
                // Extract PID from filename
                if let Some(pid_str) = path.file_stem().and_then(|s| s.to_str()) {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        // Skip self
                        if pid == self.current_pid {
                            continue;
                        }

                        match self.check_instance_liveness(pid) {
                            InstanceStatus::Active => {
                                result.active_count += 1;
                                eprintln!(
                                    "[MCP Instance] Found active instance PID {}, not killing",
                                    pid
                                );
                            }
                            InstanceStatus::Stale => {
                                eprintln!(
                                    "[MCP Instance] Found stale instance PID {}, killing...",
                                    pid
                                );
                                // Grace period before kill
                                tokio::time::sleep(Duration::from_secs(CLEANUP_GRACE_PERIOD_SECS))
                                    .await;
                                if self.kill_instance(pid).await.is_ok() {
                                    result.stale_killed += 1;
                                }
                                self.cleanup_instance_files(pid);
                            }
                            InstanceStatus::Orphaned => {
                                eprintln!(
                                    "[MCP Instance] Found orphaned instance PID {}, cleaning up files",
                                    pid
                                );
                                self.cleanup_instance_files(pid);
                                result.orphaned_cleaned += 1;
                            }
                        }
                    }
                }
            }
        }

        Ok(result)
    }

    /// Check if an instance is still alive
    fn check_instance_liveness(&self, pid: u32) -> InstanceStatus {
        let lock_path = self.instance_dir.join(format!("{}.lock", pid));
        let heartbeat_path = self.instance_dir.join(format!("{}.heartbeat", pid));

        // Try to acquire shared lock on lock file
        match File::open(&lock_path) {
            Ok(file) => {
                match file.try_lock_shared() {
                    Ok(_) => {
                        // We got the lock - process doesn't hold exclusive lock
                        // Process is dead or orphaned
                        let _ = file.unlock();
                        InstanceStatus::Orphaned
                    }
                    Err(_) => {
                        // Cannot get lock - process is alive and holding exclusive lock
                        // Check heartbeat to determine if stale
                        if let Some(info) = self.read_heartbeat_file(&heartbeat_path) {
                            if let Ok(last_heartbeat) =
                                DateTime::parse_from_rfc3339(&info.last_heartbeat)
                            {
                                let age = Utc::now()
                                    .signed_duration_since(last_heartbeat.with_timezone(&Utc));
                                if age.num_seconds() > STALE_THRESHOLD_SECS as i64 {
                                    return InstanceStatus::Stale;
                                }
                            }
                        }
                        InstanceStatus::Active
                    }
                }
            }
            Err(_) => {
                // Lock file doesn't exist but heartbeat does = orphaned
                if heartbeat_path.exists() {
                    InstanceStatus::Orphaned
                } else {
                    // Neither file exists, nothing to do
                    InstanceStatus::Active // Treat as nothing
                }
            }
        }
    }

    /// Read heartbeat file
    fn read_heartbeat_file(&self, path: &PathBuf) -> Option<InstanceInfo> {
        let mut file = File::open(path).ok()?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).ok()?;
        serde_json::from_str(&contents).ok()
    }

    /// Register current instance
    fn register_instance(&mut self) -> Result<(), String> {
        let lock_path = self.instance_dir.join(format!("{}.lock", self.current_pid));
        let heartbeat_path = self
            .instance_dir
            .join(format!("{}.heartbeat", self.current_pid));

        // Create and lock the lock file
        let lock_file = File::create(&lock_path)
            .map_err(|e| format!("Failed to create lock file: {}", e))?;

        lock_file
            .try_lock_exclusive()
            .map_err(|e| format!("Failed to acquire exclusive lock: {}", e))?;

        self.lock_file = Some(lock_file);

        // Create initial heartbeat file
        let now = Utc::now().to_rfc3339();
        let info = InstanceInfo {
            pid: self.current_pid,
            started_at: now.clone(),
            last_heartbeat: now,
            client_info: None,
            db_path: get_app_data_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
        };

        self.write_heartbeat_file(&heartbeat_path, &info)?;

        eprintln!(
            "[MCP Instance] Registered instance PID {}",
            self.current_pid
        );
        Ok(())
    }

    /// Write heartbeat file
    fn write_heartbeat_file(&self, path: &PathBuf, info: &InstanceInfo) -> Result<(), String> {
        let contents =
            serde_json::to_string_pretty(info).map_err(|e| format!("Failed to serialize: {}", e))?;

        let mut file =
            File::create(path).map_err(|e| format!("Failed to create heartbeat file: {}", e))?;

        file.write_all(contents.as_bytes())
            .map_err(|e| format!("Failed to write heartbeat: {}", e))?;

        Ok(())
    }

    /// Start heartbeat update task
    fn start_heartbeat_task(&mut self) {
        let instance_dir = self.instance_dir.clone();
        let current_pid = self.current_pid;
        let shutdown_flag = self.shutdown_flag.clone();

        let handle = tokio::spawn(async move {
            let heartbeat_path = instance_dir.join(format!("{}.heartbeat", current_pid));
            let mut interval = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

            loop {
                interval.tick().await;

                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                // Update heartbeat
                if let Some(mut info) = Self::read_heartbeat_file_static(&heartbeat_path) {
                    info.last_heartbeat = Utc::now().to_rfc3339();
                    if let Err(e) = Self::write_heartbeat_file_static(&heartbeat_path, &info) {
                        eprintln!("[MCP Instance] Failed to update heartbeat: {}", e);
                    }
                }
            }
        });

        // Store handle - we'll use blocking lock since this is called once at startup
        if let Ok(mut task) = self.heartbeat_task.try_lock() {
            *task = Some(handle);
        }
    }

    /// Static version of read_heartbeat_file for use in spawned task
    fn read_heartbeat_file_static(path: &PathBuf) -> Option<InstanceInfo> {
        let mut file = File::open(path).ok()?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).ok()?;
        serde_json::from_str(&contents).ok()
    }

    /// Static version of write_heartbeat_file for use in spawned task
    fn write_heartbeat_file_static(path: &PathBuf, info: &InstanceInfo) -> Result<(), String> {
        let contents =
            serde_json::to_string_pretty(info).map_err(|e| format!("Failed to serialize: {}", e))?;

        let mut file =
            File::create(path).map_err(|e| format!("Failed to create heartbeat file: {}", e))?;

        file.write_all(contents.as_bytes())
            .map_err(|e| format!("Failed to write heartbeat: {}", e))?;

        Ok(())
    }

    /// Kill a specific instance
    async fn kill_instance(&self, pid: u32) -> Result<(), String> {
        #[cfg(unix)]
        {
            use std::process::Command;

            // First try SIGTERM for graceful shutdown
            let _ = Command::new("kill")
                .arg("-15")
                .arg(pid.to_string())
                .output();

            // Wait a bit for graceful shutdown
            tokio::time::sleep(Duration::from_secs(2)).await;

            // Check if still running
            let output = Command::new("kill")
                .arg("-0")
                .arg(pid.to_string())
                .output();

            if output.map_or(false, |o| o.status.success()) {
                // Still running, force kill
                eprintln!("[MCP Instance] PID {} didn't respond to SIGTERM, force killing", pid);
                let _ = Command::new("kill")
                    .arg("-9")
                    .arg(pid.to_string())
                    .output();
            }
        }

        #[cfg(not(unix))]
        {
            // On Windows, use taskkill
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output();
        }

        Ok(())
    }

    /// Cleanup instance files for a given PID
    fn cleanup_instance_files(&self, pid: u32) {
        let lock_path = self.instance_dir.join(format!("{}.lock", pid));
        let heartbeat_path = self.instance_dir.join(format!("{}.heartbeat", pid));

        let _ = fs::remove_file(&lock_path);
        let _ = fs::remove_file(&heartbeat_path);
    }

    /// Graceful shutdown
    pub async fn shutdown(&mut self) {
        eprintln!("[MCP Instance] Shutting down instance manager...");

        // Signal heartbeat task to stop
        self.shutdown_flag.store(true, Ordering::Relaxed);

        // Wait for heartbeat task to finish
        if let Ok(mut task) = self.heartbeat_task.try_lock() {
            if let Some(handle) = task.take() {
                let _ = handle.await;
            }
        }

        // Release lock file
        if let Some(lock_file) = self.lock_file.take() {
            let _ = lock_file.unlock();
        }

        // Remove our files
        self.cleanup_instance_files(self.current_pid);

        eprintln!("[MCP Instance] Instance manager shutdown complete");
    }
}

impl Default for InstanceManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instance_info_serialization() {
        let info = InstanceInfo {
            pid: 12345,
            started_at: "2025-01-15T10:00:00Z".to_string(),
            last_heartbeat: "2025-01-15T10:05:30Z".to_string(),
            client_info: Some("claude-code".to_string()),
            db_path: "/path/to/db".to_string(),
        };

        let json = serde_json::to_string(&info).unwrap();
        let parsed: InstanceInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.pid, 12345);
        assert_eq!(parsed.client_info, Some("claude-code".to_string()));
    }

    #[test]
    fn test_cleanup_result_default() {
        let result = CleanupResult::default();
        assert_eq!(result.orphaned_cleaned, 0);
        assert_eq!(result.stale_killed, 0);
        assert_eq!(result.active_count, 0);
    }
}
