// Notification Center Commands
// Handles notification history retrieval and management

use tauri::State;

use crate::repositories::{NotificationListResponse, NotificationRepository};
use crate::DatabaseState;

/// Get recent notifications with pagination
#[tauri::command]
pub async fn get_notifications(
    db: State<'_, DatabaseState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<NotificationListResponse, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.get_recent(limit.unwrap_or(20), offset.unwrap_or(0))
}

/// Get unread notification count
#[tauri::command]
pub async fn get_unread_notification_count(
    db: State<'_, DatabaseState>,
) -> Result<u32, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.get_unread_count()
}

/// Mark a notification as read
#[tauri::command]
pub async fn mark_notification_read(
    db: State<'_, DatabaseState>,
    id: String,
) -> Result<bool, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.mark_as_read(&id)
}

/// Mark all notifications as read
#[tauri::command]
pub async fn mark_all_notifications_read(
    db: State<'_, DatabaseState>,
) -> Result<u32, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.mark_all_as_read()
}

/// Delete a notification
#[tauri::command]
pub async fn delete_notification(
    db: State<'_, DatabaseState>,
    id: String,
) -> Result<bool, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.delete(&id)
}

/// Cleanup old notifications (default: older than 30 days)
#[tauri::command]
pub async fn cleanup_old_notifications(
    db: State<'_, DatabaseState>,
    retention_days: Option<u32>,
) -> Result<u32, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.delete_old(retention_days.unwrap_or(30))
}

/// Clear all notifications
#[tauri::command]
pub async fn clear_all_notifications(
    db: State<'_, DatabaseState>,
) -> Result<u32, String> {
    let repo = NotificationRepository::new(db.0.as_ref().clone());
    repo.clear_all()
}
