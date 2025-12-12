use chrono::Utc;
/**
 * Incoming Webhook Commands
 * Tauri IPC commands for managing incoming webhooks
 * @see specs/012-workflow-webhook-support
 */
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use crate::models::{
    IncomingWebhookConfig, IncomingWebhookServerSettings, IncomingWebhookServerStatus, Workflow,
};
use crate::services::IncomingWebhookManager;
use crate::utils::store::STORE_FILE;

/// Generate a new API token
#[tauri::command]
pub async fn generate_incoming_webhook_token() -> Result<String, String> {
    Ok(Uuid::new_v4().to_string())
}

/// Get incoming webhook server status
#[tauri::command]
pub async fn get_incoming_webhook_status(
    app: AppHandle,
) -> Result<IncomingWebhookServerStatus, String> {
    let manager = app.state::<IncomingWebhookManager>();
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let workflows: Vec<Workflow> = store
        .get("workflows")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(manager.get_status(&workflows).await)
}

/// Get incoming webhook server settings
#[tauri::command]
pub async fn get_incoming_webhook_settings(
    app: AppHandle,
) -> Result<IncomingWebhookServerSettings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let settings: IncomingWebhookServerSettings = store
        .get("incomingWebhookServer")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(settings)
}

/// Save incoming webhook server settings
#[tauri::command]
pub async fn save_incoming_webhook_settings(
    app: AppHandle,
    settings: IncomingWebhookServerSettings,
) -> Result<(), String> {
    // Stop existing server first before changing port
    let manager = app.state::<IncomingWebhookManager>();
    manager.stop_server().await;

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(
        "incomingWebhookServer",
        serde_json::to_value(&settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    // Don't sync here - let workflow save trigger the sync
    // This ensures we read the latest workflow data (including incoming webhook enabled state)

    Ok(())
}

/// Create default incoming webhook config with new token
#[tauri::command]
pub async fn create_incoming_webhook_config() -> Result<IncomingWebhookConfig, String> {
    Ok(IncomingWebhookConfig {
        enabled: false,
        token: Uuid::new_v4().to_string(),
        token_created_at: Utc::now().to_rfc3339(),
    })
}

/// Regenerate token for an incoming webhook config
#[tauri::command]
pub async fn regenerate_incoming_webhook_token(
    mut config: IncomingWebhookConfig,
) -> Result<IncomingWebhookConfig, String> {
    config.token = Uuid::new_v4().to_string();
    config.token_created_at = Utc::now().to_rfc3339();
    Ok(config)
}

/// Port status for availability check
#[derive(Debug, Clone, serde::Serialize)]
pub enum PortStatus {
    /// Port is available for use
    Available,
    /// Port is in use by our webhook server
    InUseByWebhook,
    /// Port is in use by another service
    InUseByOther,
}

/// Check if a port is available for use
#[tauri::command]
pub async fn check_port_available(app: AppHandle, port: u16) -> Result<PortStatus, String> {
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::time::Duration;

    // Check if our server is running on this port
    let manager = app.state::<IncomingWebhookManager>();
    if manager.is_running().await && manager.get_port().await == port {
        return Ok(PortStatus::InUseByWebhook);
    }

    // Try to connect to the port - if something is listening, it's in use
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
    if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok() {
        return Ok(PortStatus::InUseByOther);
    }

    // Try to bind to make sure we can use it
    match TcpListener::bind(addr) {
        Ok(_) => Ok(PortStatus::Available),
        Err(_) => Ok(PortStatus::InUseByOther),
    }
}

/// Sync incoming webhook server state
/// Called after workflow save to start/stop server as needed
pub async fn sync_incoming_webhook_server(app: &AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let workflows: Vec<Workflow> = store
        .get("workflows")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let settings: IncomingWebhookServerSettings = store
        .get("incomingWebhookServer")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let manager = app.state::<IncomingWebhookManager>();
    manager
        .sync_server_state(app, &workflows, settings.port)
        .await;

    Ok(())
}
