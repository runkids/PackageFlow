//! Desktop notification service
//! Provides system-level notifications for various application events
//! Uses SQLite for settings storage and supports category-based filtering.

use chrono::{Local, NaiveTime, Utc};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

use crate::repositories::{NotificationRecord, NotificationRepository, SettingsRepository};
use crate::utils::database::Database;
use crate::utils::store::NotificationSettings;
use crate::DatabaseState;

// ============================================================================
// Constants
// ============================================================================

/// Maximum number of notifications to keep in database
const MAX_NOTIFICATION_COUNT: usize = 100;
/// Number of days to keep old notifications
const NOTIFICATION_RETENTION_DAYS: u32 = 30;

// ============================================================================
// Notification Types
// ============================================================================

/// Unified notification types for all application events
pub enum NotificationType {
    // Webhook notifications
    /// Incoming webhook triggered a workflow
    WebhookIncomingTriggered { workflow_name: String },
    /// Outgoing webhook sent successfully
    WebhookOutgoingSuccess { workflow_name: String, url: String },
    /// Outgoing webhook failed to send
    WebhookOutgoingFailure { workflow_name: String, error: String },

    // Workflow execution notifications
    /// Workflow completed successfully
    WorkflowCompleted {
        workflow_name: String,
        duration_ms: u64,
    },
    /// Workflow execution failed
    WorkflowFailed {
        workflow_name: String,
        error: String,
    },

    // Git operation notifications
    /// Git push succeeded
    GitPushSuccess { project_name: String, branch: String },
    /// Git push failed
    GitPushFailed { project_name: String, error: String },

    // Security scan notifications
    /// Security scan completed
    SecurityScanCompleted {
        project_name: String,
        vulnerability_count: u32,
    },

    // Deployment notifications
    /// Deployment succeeded
    DeploymentSuccess {
        project_name: String,
        platform: String,
    },
    /// Deployment failed
    DeploymentFailed {
        project_name: String,
        platform: String,
        error: String,
    },
}

impl NotificationType {
    /// Get the notification category for settings check
    pub fn category(&self) -> &'static str {
        match self {
            NotificationType::WebhookIncomingTriggered { .. }
            | NotificationType::WebhookOutgoingSuccess { .. }
            | NotificationType::WebhookOutgoingFailure { .. } => "webhooks",

            NotificationType::WorkflowCompleted { .. }
            | NotificationType::WorkflowFailed { .. } => "workflow_execution",

            NotificationType::GitPushSuccess { .. } | NotificationType::GitPushFailed { .. } => {
                "git_operations"
            }

            NotificationType::SecurityScanCompleted { .. } => "security_scans",

            NotificationType::DeploymentSuccess { .. }
            | NotificationType::DeploymentFailed { .. } => "deployments",
        }
    }

    /// Get the notification type name for database storage
    pub fn type_name(&self) -> &'static str {
        match self {
            NotificationType::WebhookIncomingTriggered { .. } => "webhook_incoming_triggered",
            NotificationType::WebhookOutgoingSuccess { .. } => "webhook_outgoing_success",
            NotificationType::WebhookOutgoingFailure { .. } => "webhook_outgoing_failure",
            NotificationType::WorkflowCompleted { .. } => "workflow_completed",
            NotificationType::WorkflowFailed { .. } => "workflow_failed",
            NotificationType::GitPushSuccess { .. } => "git_push_success",
            NotificationType::GitPushFailed { .. } => "git_push_failed",
            NotificationType::SecurityScanCompleted { .. } => "security_scan_completed",
            NotificationType::DeploymentSuccess { .. } => "deployment_success",
            NotificationType::DeploymentFailed { .. } => "deployment_failed",
        }
    }

    /// Generate metadata JSON for database storage
    pub fn metadata(&self) -> Option<serde_json::Value> {
        match self {
            NotificationType::WebhookIncomingTriggered { workflow_name } => {
                Some(serde_json::json!({ "workflowName": workflow_name }))
            }
            NotificationType::WebhookOutgoingSuccess { workflow_name, url } => {
                Some(serde_json::json!({ "workflowName": workflow_name, "url": url }))
            }
            NotificationType::WebhookOutgoingFailure {
                workflow_name,
                error,
            } => Some(serde_json::json!({ "workflowName": workflow_name, "error": error })),
            NotificationType::WorkflowCompleted {
                workflow_name,
                duration_ms,
            } => Some(serde_json::json!({ "workflowName": workflow_name, "durationMs": duration_ms })),
            NotificationType::WorkflowFailed {
                workflow_name,
                error,
            } => Some(serde_json::json!({ "workflowName": workflow_name, "error": error })),
            NotificationType::GitPushSuccess {
                project_name,
                branch,
            } => Some(serde_json::json!({ "projectName": project_name, "branch": branch })),
            NotificationType::GitPushFailed {
                project_name,
                error,
            } => Some(serde_json::json!({ "projectName": project_name, "error": error })),
            NotificationType::SecurityScanCompleted {
                project_name,
                vulnerability_count,
            } => Some(serde_json::json!({ "projectName": project_name, "vulnerabilityCount": vulnerability_count })),
            NotificationType::DeploymentSuccess {
                project_name,
                platform,
            } => Some(serde_json::json!({ "projectName": project_name, "platform": platform })),
            NotificationType::DeploymentFailed {
                project_name,
                platform,
                error,
            } => Some(serde_json::json!({ "projectName": project_name, "platform": platform, "error": error })),
        }
    }

    /// Generate notification title and body
    pub fn to_notification(&self) -> (String, String) {
        match self {
            // Webhook notifications
            NotificationType::WebhookIncomingTriggered { workflow_name } => (
                "Workflow Triggered".to_string(),
                format!("\"{}\" started via incoming webhook", workflow_name),
            ),
            NotificationType::WebhookOutgoingSuccess { workflow_name, url } => (
                "Webhook Sent".to_string(),
                format!(
                    "\"{}\" webhook delivered to {}",
                    workflow_name,
                    truncate_url(url)
                ),
            ),
            NotificationType::WebhookOutgoingFailure {
                workflow_name,
                error,
            } => (
                "Webhook Failed".to_string(),
                format!("\"{}\" webhook failed: {}", workflow_name, error),
            ),

            // Workflow notifications
            NotificationType::WorkflowCompleted {
                workflow_name,
                duration_ms,
            } => {
                let duration_str = format_duration(*duration_ms);
                (
                    "Workflow Completed".to_string(),
                    format!("\"{}\" finished in {}", workflow_name, duration_str),
                )
            }
            NotificationType::WorkflowFailed {
                workflow_name,
                error,
            } => (
                "Workflow Failed".to_string(),
                format!("\"{}\" failed: {}", workflow_name, error),
            ),

            // Git notifications
            NotificationType::GitPushSuccess {
                project_name,
                branch,
            } => (
                "Push Successful".to_string(),
                format!("\"{}\" pushed to {}", project_name, branch),
            ),
            NotificationType::GitPushFailed {
                project_name,
                error,
            } => (
                "Push Failed".to_string(),
                format!("\"{}\" push failed: {}", project_name, error),
            ),

            // Security notifications
            NotificationType::SecurityScanCompleted {
                project_name,
                vulnerability_count,
            } => {
                let body = if *vulnerability_count == 0 {
                    format!("\"{}\" - No vulnerabilities found", project_name)
                } else {
                    format!(
                        "\"{}\" - {} {} found",
                        project_name,
                        vulnerability_count,
                        if *vulnerability_count == 1 {
                            "vulnerability"
                        } else {
                            "vulnerabilities"
                        }
                    )
                };
                ("Security Scan Complete".to_string(), body)
            }

            // Deployment notifications
            NotificationType::DeploymentSuccess {
                project_name,
                platform,
            } => (
                "Deployment Successful".to_string(),
                format!("\"{}\" deployed to {}", project_name, platform),
            ),
            NotificationType::DeploymentFailed {
                project_name,
                platform,
                error,
            } => (
                "Deployment Failed".to_string(),
                format!("\"{}\" {} deployment failed: {}", project_name, platform, error),
            ),
        }
    }
}

// ============================================================================
// Legacy Type Alias (for backward compatibility)
// ============================================================================

/// Legacy webhook notification type (deprecated, use NotificationType instead)
pub enum WebhookNotificationType {
    IncomingTriggered { workflow_name: String },
    OutgoingSuccess { workflow_name: String, url: String },
    OutgoingFailure { workflow_name: String, error: String },
}

impl From<WebhookNotificationType> for NotificationType {
    fn from(wt: WebhookNotificationType) -> Self {
        match wt {
            WebhookNotificationType::IncomingTriggered { workflow_name } => {
                NotificationType::WebhookIncomingTriggered { workflow_name }
            }
            WebhookNotificationType::OutgoingSuccess { workflow_name, url } => {
                NotificationType::WebhookOutgoingSuccess { workflow_name, url }
            }
            WebhookNotificationType::OutgoingFailure {
                workflow_name,
                error,
            } => NotificationType::WebhookOutgoingFailure {
                workflow_name,
                error,
            },
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get Database from AppHandle
fn get_db(app: &AppHandle) -> Database {
    let db_state = app.state::<DatabaseState>();
    db_state.0.as_ref().clone()
}

/// Get notification settings from database
fn get_notification_settings(app: &AppHandle) -> NotificationSettings {
    let repo = SettingsRepository::new(get_db(app));
    repo.get_notification_settings().unwrap_or_default()
}

/// Check if a specific notification category is enabled
fn is_category_enabled(settings: &NotificationSettings, category: &str) -> bool {
    match category {
        "webhooks" => settings.categories.webhooks,
        "workflow_execution" => settings.categories.workflow_execution,
        "git_operations" => settings.categories.git_operations,
        "security_scans" => settings.categories.security_scans,
        "deployments" => settings.categories.deployments,
        _ => true, // Unknown categories default to enabled
    }
}

/// Check if current time is within Do Not Disturb period
fn is_in_dnd_period(settings: &NotificationSettings) -> bool {
    if !settings.do_not_disturb.enabled {
        return false;
    }

    let start = match NaiveTime::parse_from_str(&settings.do_not_disturb.start_time, "%H:%M") {
        Ok(t) => t,
        Err(_) => return false,
    };

    let end = match NaiveTime::parse_from_str(&settings.do_not_disturb.end_time, "%H:%M") {
        Ok(t) => t,
        Err(_) => return false,
    };

    let now = Local::now().time();

    // Handle overnight periods (e.g., 22:00 - 08:00)
    if start > end {
        // DND spans midnight
        now >= start || now < end
    } else {
        // Same day period
        now >= start && now < end
    }
}

/// Truncate URL for display (show domain only)
fn truncate_url(url: &str) -> String {
    url::Url::parse(url)
        .map(|u| u.host_str().unwrap_or(url).to_string())
        .unwrap_or_else(|_| url.to_string())
}

/// Format duration in milliseconds to human-readable string
fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        format!("{}ms", ms)
    } else if ms < 60000 {
        format!("{:.1}s", ms as f64 / 1000.0)
    } else {
        let minutes = ms / 60000;
        let seconds = (ms % 60000) / 1000;
        format!("{}m {}s", minutes, seconds)
    }
}

// ============================================================================
// Public API
// ============================================================================

/// Send a notification with full settings checks
///
/// # Arguments
/// * `app` - Tauri application handle
/// * `notification_type` - Type of notification to send
///
/// # Returns
/// * `Ok(())` if notification sent successfully or was skipped (disabled/DND)
/// * `Err(String)` if notification failed to send
pub fn send_notification(
    app: &AppHandle,
    notification_type: NotificationType,
) -> Result<(), String> {
    let settings = get_notification_settings(app);
    let (title, body) = notification_type.to_notification();
    let category = notification_type.category();

    // Always store notification to database for history (regardless of settings)
    let record = NotificationRecord {
        id: Uuid::new_v4().to_string(),
        notification_type: notification_type.type_name().to_string(),
        category: category.to_string(),
        title: title.clone(),
        body: body.clone(),
        is_read: false,
        metadata: notification_type.metadata(),
        created_at: Utc::now(),
    };

    // Store to database
    let repo = NotificationRepository::new(get_db(app));
    if let Err(e) = repo.create(&record) {
        log::warn!("[notification] Failed to store notification: {}", e);
    } else {
        // Emit event to frontend for real-time updates
        let _ = app.emit("notification:new", &record);
        log::debug!("[notification] Stored and emitted: {}", record.id);

        // Prune old notifications to keep max 500
        if let Err(e) = repo.prune(MAX_NOTIFICATION_COUNT) {
            log::warn!("[notification] Failed to prune notifications: {}", e);
        }
    }

    // Check master toggle for system notification
    if !settings.enabled {
        log::debug!("[notification] Notifications disabled globally, skipping system notification");
        return Ok(());
    }

    // Check category toggle
    if !is_category_enabled(&settings, category) {
        log::debug!(
            "[notification] Category '{}' disabled, skipping system notification",
            category
        );
        return Ok(());
    }

    // Check Do Not Disturb
    if is_in_dnd_period(&settings) {
        log::debug!("[notification] In DND period, skipping system notification");
        return Ok(());
    }

    log::info!("[notification] Sending system notification: {} - {}", title, body);

    let builder = app.notification().builder().title(&title).body(&body);

    // Note: Sound setting removed - tauri_plugin_notification API changed
    let _ = settings.sound_enabled; // Suppress unused warning

    builder.show().map_err(|e| {
        log::error!("[notification] Failed to send notification: {}", e);
        e.to_string()
    })
}

/// Send a webhook-related notification (legacy API, use send_notification instead)
///
/// This function is kept for backward compatibility with existing code.
pub fn send_webhook_notification(
    app: &AppHandle,
    notification_type: WebhookNotificationType,
) -> Result<(), String> {
    send_notification(app, notification_type.into())
}

// ============================================================================
// Legacy Compatibility Check
// ============================================================================

/// Check if webhook notifications are enabled (legacy function)
///
/// Note: This function is deprecated. Use send_notification() which handles
/// all settings checks internally.
pub fn are_notifications_enabled(app: &AppHandle) -> bool {
    let settings = get_notification_settings(app);
    settings.enabled && settings.categories.webhooks
}

// ============================================================================
// Startup Cleanup
// ============================================================================

/// Clean up old notifications on app startup
///
/// This function should be called once when the app starts to:
/// 1. Delete notifications older than NOTIFICATION_RETENTION_DAYS
/// 2. Prune excess notifications beyond MAX_NOTIFICATION_COUNT
pub fn cleanup_old_notifications(app: &AppHandle) {
    let repo = NotificationRepository::new(get_db(app));

    // Delete notifications older than retention period
    match repo.delete_old(NOTIFICATION_RETENTION_DAYS) {
        Ok(count) if count > 0 => {
            log::info!("[notification] Cleaned up {} old notifications (>{} days)", count, NOTIFICATION_RETENTION_DAYS);
        }
        Err(e) => {
            log::warn!("[notification] Failed to delete old notifications: {}", e);
        }
        _ => {}
    }

    // Prune to max count
    match repo.prune(MAX_NOTIFICATION_COUNT) {
        Ok(count) if count > 0 => {
            log::info!("[notification] Pruned {} notifications (keeping max {})", count, MAX_NOTIFICATION_COUNT);
        }
        Err(e) => {
            log::warn!("[notification] Failed to prune notifications: {}", e);
        }
        _ => {}
    }
}
