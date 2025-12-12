//! Desktop notification service
//! Provides system-level notifications for webhook events

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::utils::store::STORE_FILE;

/// Notification types for webhook events
pub enum WebhookNotificationType {
    /// Incoming webhook triggered a workflow
    IncomingTriggered { workflow_name: String },
    /// Outgoing webhook sent successfully
    OutgoingSuccess { workflow_name: String, url: String },
    /// Outgoing webhook failed to send
    OutgoingFailure {
        workflow_name: String,
        error: String,
    },
}

/// Check if webhook notifications are enabled in settings
fn are_notifications_enabled(app: &AppHandle) -> bool {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return true, // Default to enabled if store fails
    };

    let settings = match store.get("settings") {
        Some(v) => v,
        None => return true, // Default to enabled if no settings
    };

    settings
        .get("webhookNotificationsEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true) // Default to enabled
}

/// Truncate URL for display (show domain only)
fn truncate_url(url: &str) -> String {
    url::Url::parse(url)
        .map(|u| u.host_str().unwrap_or(url).to_string())
        .unwrap_or_else(|_| url.to_string())
}

/// Send a webhook-related notification
///
/// # Arguments
/// * `app` - Tauri application handle
/// * `notification_type` - Type of webhook notification to send
///
/// # Returns
/// * `Ok(())` if notification sent successfully or notifications are disabled
/// * `Err(String)` if notification failed to send
pub fn send_webhook_notification(
    app: &AppHandle,
    notification_type: WebhookNotificationType,
) -> Result<(), String> {
    // Early return if notifications are disabled
    if !are_notifications_enabled(app) {
        log::debug!("[notification] Webhook notifications disabled, skipping");
        return Ok(());
    }

    let (title, body) = match notification_type {
        WebhookNotificationType::IncomingTriggered { workflow_name } => (
            "Workflow Triggered".to_string(),
            format!("\"{}\" started via incoming webhook", workflow_name),
        ),
        WebhookNotificationType::OutgoingSuccess { workflow_name, url } => (
            "Webhook Sent".to_string(),
            format!(
                "\"{}\" webhook delivered to {}",
                workflow_name,
                truncate_url(&url)
            ),
        ),
        WebhookNotificationType::OutgoingFailure {
            workflow_name,
            error,
        } => (
            "Webhook Failed".to_string(),
            format!("\"{}\" webhook failed: {}", workflow_name, error),
        ),
    };

    log::info!("[notification] Sending notification: {} - {}", title, body);

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| {
            log::error!("[notification] Failed to send notification: {}", e);
            e.to_string()
        })
}
