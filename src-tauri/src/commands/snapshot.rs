// Snapshot Commands
// Tauri commands for Time Machine functionality

use std::path::PathBuf;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::models::ai::{ChatMessage, ChatOptions, FinishReason};
use crate::models::security_insight::{InsightSummary, SecurityInsight};
use crate::models::snapshot::{
    CreateSnapshotRequest, ExecutionSnapshot, SnapshotDiff, SnapshotFilter, SnapshotListItem,
    SnapshotWithDependencies,
};
use crate::repositories::{AIRepository, SnapshotRepository};
use crate::services::ai::{create_provider, AIKeychain};
use crate::services::snapshot::{SnapshotCaptureService, SnapshotDiffService, SnapshotStorage};
use crate::utils::database::Database;
use crate::DatabaseState;

/// Get the snapshot storage base path
fn get_storage_base_path() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|p| p.join("com.packageflow.app").join("time-machine"))
        .ok_or_else(|| "Failed to get data directory".to_string())
}

// =========================================================================
// Snapshot CRUD Operations
// =========================================================================

/// List snapshots with optional filters
#[tauri::command]
pub async fn list_snapshots(
    db: State<'_, DatabaseState>,
    filter: Option<SnapshotFilter>,
) -> Result<Vec<SnapshotListItem>, String> {
    let db = (*db.0).clone();
    let filter = filter.unwrap_or_default();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.list_snapshots(&filter)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get a single snapshot by ID
#[tauri::command]
pub async fn get_snapshot(
    db: State<'_, DatabaseState>,
    snapshot_id: String,
) -> Result<Option<ExecutionSnapshot>, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.get_snapshot(&snapshot_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get a snapshot with all its dependencies
#[tauri::command]
pub async fn get_snapshot_with_dependencies(
    db: State<'_, DatabaseState>,
    snapshot_id: String,
) -> Result<Option<SnapshotWithDependencies>, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.get_snapshot_with_dependencies(&snapshot_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get the latest snapshot for a workflow
#[tauri::command]
pub async fn get_latest_snapshot(
    db: State<'_, DatabaseState>,
    workflow_id: String,
) -> Result<Option<ExecutionSnapshot>, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.get_latest_snapshot(&workflow_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Delete a snapshot
#[tauri::command]
pub async fn delete_snapshot(
    db: State<'_, DatabaseState>,
    snapshot_id: String,
) -> Result<bool, String> {
    let db = (*db.0).clone();
    let base_path = get_storage_base_path()?;

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        let storage = SnapshotStorage::new(base_path);

        // Delete file storage first
        storage.delete_snapshot(&snapshot_id)?;

        // Delete database record
        repo.delete_snapshot(&snapshot_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Prune old snapshots (keep last N per workflow)
#[tauri::command]
pub async fn prune_snapshots(
    db: State<'_, DatabaseState>,
    keep_per_workflow: Option<usize>,
) -> Result<usize, String> {
    let db = (*db.0).clone();
    let keep = keep_per_workflow.unwrap_or(10);

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.prune_snapshots(keep)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// =========================================================================
// Snapshot Capture
// =========================================================================

/// Capture a new snapshot for a workflow execution
#[tauri::command]
pub async fn capture_snapshot(
    db: State<'_, DatabaseState>,
    request: CreateSnapshotRequest,
    duration_ms: Option<i64>,
) -> Result<ExecutionSnapshot, String> {
    let db = (*db.0).clone();
    let base_path = get_storage_base_path()?;

    tokio::task::spawn_blocking(move || {
        let storage = SnapshotStorage::new(base_path);
        let service = SnapshotCaptureService::new(storage, db);
        service.capture_snapshot(&request, duration_ms)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Capture snapshot in background (non-blocking)
/// Used by workflow executor to capture snapshots after execution completes
#[allow(dead_code)]
pub fn capture_snapshot_background(
    db: Arc<Database>,
    request: CreateSnapshotRequest,
    duration_ms: Option<i64>,
) {
    std::thread::spawn(move || {
        let base_path = match get_storage_base_path() {
            Ok(p) => p,
            Err(e) => {
                log::error!("[snapshot] Failed to get storage path: {}", e);
                return;
            }
        };

        let storage = SnapshotStorage::new(base_path);
        let service = SnapshotCaptureService::new(storage, (*db).clone());

        match service.capture_snapshot(&request, duration_ms) {
            Ok(snapshot) => {
                log::info!(
                    "[snapshot] Captured snapshot {} for workflow {} ({}ms)",
                    snapshot.id,
                    snapshot.workflow_id,
                    snapshot.execution_duration_ms.unwrap_or(0)
                );
            }
            Err(e) => {
                log::error!("[snapshot] Failed to capture snapshot: {}", e);
            }
        }
    });
}

// =========================================================================
// Snapshot Comparison
// =========================================================================

/// Compare two snapshots
#[tauri::command]
pub async fn compare_snapshots(
    db: State<'_, DatabaseState>,
    snapshot_a_id: String,
    snapshot_b_id: String,
) -> Result<SnapshotDiff, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let service = SnapshotDiffService::new(db);
        service.compare_snapshots(&snapshot_a_id, &snapshot_b_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Generate AI-friendly prompt for diff analysis
#[tauri::command]
pub async fn get_diff_ai_prompt(
    db: State<'_, DatabaseState>,
    snapshot_a_id: String,
    snapshot_b_id: String,
) -> Result<String, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let service = SnapshotDiffService::new(db);
        let diff = service.compare_snapshots(&snapshot_a_id, &snapshot_b_id)?;
        Ok(service.generate_ai_prompt(&diff))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get comparison candidates (latest N snapshots for a workflow)
#[tauri::command]
pub async fn get_comparison_candidates(
    db: State<'_, DatabaseState>,
    workflow_id: String,
    limit: Option<i32>,
) -> Result<Vec<ExecutionSnapshot>, String> {
    let db = (*db.0).clone();
    let limit = limit.unwrap_or(10);

    tokio::task::spawn_blocking(move || {
        let service = SnapshotDiffService::new(db);
        service.get_comparison_candidates(&workflow_id, limit)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// =========================================================================
// Security Insights
// =========================================================================

/// Get security insights for a snapshot
#[tauri::command]
pub async fn get_security_insights(
    db: State<'_, DatabaseState>,
    snapshot_id: String,
) -> Result<Vec<SecurityInsight>, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.list_insights(&snapshot_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get security insight summary for a snapshot
#[tauri::command]
pub async fn get_insight_summary(
    db: State<'_, DatabaseState>,
    snapshot_id: String,
) -> Result<InsightSummary, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.get_insight_summary(&snapshot_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Dismiss a security insight
#[tauri::command]
pub async fn dismiss_insight(
    db: State<'_, DatabaseState>,
    insight_id: String,
) -> Result<bool, String> {
    let db = (*db.0).clone();

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        repo.dismiss_insight(&insight_id)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// =========================================================================
// Storage Management
// =========================================================================

/// Get storage statistics
#[tauri::command]
pub async fn get_snapshot_storage_stats(
    db: State<'_, DatabaseState>,
) -> Result<SnapshotStorageStats, String> {
    let db = (*db.0).clone();
    let base_path = get_storage_base_path()?;

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        let storage = SnapshotStorage::new(base_path);

        // Get all snapshots
        let filter = SnapshotFilter::default();
        let snapshots = repo.list_snapshots(&filter)?;

        let mut total_size = 0u64;
        let snapshot_count = snapshots.len();

        for snapshot in &snapshots {
            if let Ok(size) = storage.get_snapshot_size(&snapshot.id) {
                total_size += size;
            }
        }

        Ok(SnapshotStorageStats {
            total_snapshots: snapshot_count,
            total_size_bytes: total_size,
            total_size_human: format_size(total_size),
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Cleanup orphaned storage
#[tauri::command]
pub async fn cleanup_orphaned_storage(
    db: State<'_, DatabaseState>,
) -> Result<usize, String> {
    let db = (*db.0).clone();
    let base_path = get_storage_base_path()?;

    tokio::task::spawn_blocking(move || {
        let repo = SnapshotRepository::new(db);
        let storage = SnapshotStorage::new(base_path);

        // Get all valid snapshot IDs
        let filter = SnapshotFilter::default();
        let snapshots = repo.list_snapshots(&filter)?;
        let valid_ids: Vec<String> = snapshots.iter().map(|s| s.id.clone()).collect();

        storage.cleanup_orphaned(&valid_ids)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// =========================================================================
// Helper Types and Functions
// =========================================================================

/// Storage statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotStorageStats {
    pub total_snapshots: usize,
    pub total_size_bytes: u64,
    pub total_size_human: String,
}

/// Format byte size to human readable string
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

// =========================================================================
// AI Analysis
// =========================================================================

/// Request for AI analysis of snapshot diff
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestAIAnalysisRequest {
    pub base_snapshot_id: String,
    pub compare_snapshot_id: String,
    pub provider_id: Option<String>,
    pub focus_on_security: Option<bool>,
}

/// Response from AI analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIAnalysisResult {
    pub analysis: String,
    pub tokens_used: Option<u32>,
    pub is_truncated: bool,
    pub cached: bool,
}

/// API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> SnapshotApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

/// Helper to get Database from AppHandle
fn get_db(app: &AppHandle) -> Database {
    let db_state = app.state::<DatabaseState>();
    db_state.0.as_ref().clone()
}

/// Request AI analysis of a snapshot diff
/// Uses the default or specified AI provider to analyze dependency changes
#[tauri::command]
pub async fn request_ai_analysis(
    app: AppHandle,
    request: RequestAIAnalysisRequest,
) -> Result<SnapshotApiResponse<AIAnalysisResult>, String> {
    let db = get_db(&app);
    let ai_repo = AIRepository::new(db.clone());
    let keychain = AIKeychain::new(app);

    // Generate the diff and prompt
    let diff_service = SnapshotDiffService::new(db.clone());

    let (diff, prompt) = tokio::task::spawn_blocking({
        let base_id = request.base_snapshot_id.clone();
        let compare_id = request.compare_snapshot_id.clone();
        move || {
            let diff = diff_service.compare_snapshots(&base_id, &compare_id)?;
            let prompt = diff_service.generate_ai_prompt(&diff);
            Ok::<_, String>((diff, prompt))
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Check if there are any changes to analyze
    if diff.summary.added_count == 0
        && diff.summary.removed_count == 0
        && diff.summary.updated_count == 0
    {
        return Ok(SnapshotApiResponse::success(AIAnalysisResult {
            analysis: "No dependency changes detected between these snapshots. The dependency trees are identical.".to_string(),
            tokens_used: None,
            is_truncated: false,
            cached: false,
        }));
    }

    // Get the AI provider
    let service = if let Some(provider_id) = request.provider_id {
        match ai_repo.get_provider(&provider_id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(SnapshotApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(SnapshotApiResponse::error(format!("AI service not found: {}", provider_id))),
            Err(e) => return Ok(SnapshotApiResponse::error(e)),
        }
    } else {
        match ai_repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(SnapshotApiResponse::error("No default AI service configured. Please configure an AI provider in Settings.")),
            Err(e) => return Ok(SnapshotApiResponse::error(e)),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(SnapshotApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Create the AI provider
    let provider = match create_provider(service.clone(), api_key) {
        Ok(p) => p,
        Err(e) => return Ok(SnapshotApiResponse::error(e.to_string())),
    };

    // Build the system prompt for security-focused analysis
    let focus_on_security = request.focus_on_security.unwrap_or(true);
    let system_prompt = if focus_on_security {
        "You are a security-focused dependency analyst. Analyze the dependency changes between two workflow executions and highlight any potential security concerns. Focus on:\n\
        1. New packages that might introduce vulnerabilities\n\
        2. Version changes that could affect security\n\
        3. Postinstall script changes (very important for supply chain security)\n\
        4. Suspicious patterns like typosquatting or unexpected major version jumps\n\
        5. Overall risk assessment\n\n\
        Be concise but thorough. Use markdown formatting for readability."
    } else {
        "You are a dependency analyst. Analyze the dependency changes between two workflow executions. \
        Explain what changed and whether the changes appear intentional or concerning. \
        Use markdown formatting for readability."
    };

    // Call the AI service
    let messages = vec![
        ChatMessage::system(system_prompt.to_string()),
        ChatMessage::user(prompt),
    ];

    let options = ChatOptions {
        temperature: Some(0.3),  // Lower temperature for more focused analysis
        max_tokens: Some(4000),
        top_p: None,
        tools: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            let is_truncated = response.finish_reason
                .as_ref()
                .map(|r| *r == FinishReason::Length)
                .unwrap_or(false);

            Ok(SnapshotApiResponse::success(AIAnalysisResult {
                analysis: response.content.trim().to_string(),
                tokens_used: response.tokens_used,
                is_truncated,
                cached: false,
            }))
        }
        Err(e) => {
            log::error!("AI analysis failed: {}", e);
            Ok(SnapshotApiResponse::error(format!("AI analysis failed: {}", e)))
        }
    }
}
