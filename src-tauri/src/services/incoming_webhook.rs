/**
 * Incoming Webhook Server
 * HTTP server for receiving external webhook triggers
 * @see specs/012-workflow-webhook-support
 */
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::post,
    Router,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use tokio::sync::{oneshot, RwLock};

use crate::models::{IncomingWebhookServerStatus, WebhookTriggerResponse, Workflow};
use crate::services::notification::{send_webhook_notification, WebhookNotificationType};

/// Server shared state
pub struct IncomingWebhookServerState {
    /// Tauri AppHandle for invoking commands
    pub app: AppHandle,
    /// Token -> Workflow ID mapping for quick lookup
    pub token_map: RwLock<HashMap<String, String>>,
}

/// Incoming Webhook Server Manager
/// Manages the lifecycle of the HTTP server
pub struct IncomingWebhookManager {
    /// Shutdown signal sender
    shutdown_tx: RwLock<Option<oneshot::Sender<()>>>,
    /// Current port
    port: RwLock<u16>,
    /// Whether server is running
    running: RwLock<bool>,
}

impl Default for IncomingWebhookManager {
    fn default() -> Self {
        Self::new()
    }
}

impl IncomingWebhookManager {
    pub fn new() -> Self {
        Self {
            shutdown_tx: RwLock::new(None),
            port: RwLock::new(9876),
            running: RwLock::new(false),
        }
    }

    /// Check if any workflow has incoming webhook enabled
    fn has_active_webhooks(workflows: &[Workflow]) -> bool {
        workflows.iter().any(|w| {
            w.incoming_webhook
                .as_ref()
                .map(|c| c.enabled)
                .unwrap_or(false)
        })
    }

    /// Build workflow_id -> token mapping
    fn build_token_map(workflows: &[Workflow]) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for workflow in workflows {
            if let Some(config) = &workflow.incoming_webhook {
                if config.enabled {
                    // Key is workflow_id, value is token
                    // This prevents issues if tokens somehow collide
                    map.insert(workflow.id.clone(), config.token.clone());
                }
            }
        }
        map
    }

    /// Sync server state based on workflow configurations
    /// Starts server if any workflow has incoming webhook enabled
    /// Stops server if no workflow has incoming webhook enabled
    pub async fn sync_server_state(&self, app: &AppHandle, workflows: &[Workflow], port: u16) {
        let has_active = Self::has_active_webhooks(workflows);
        let currently_running = *self.running.read().await;
        let current_port = *self.port.read().await;

        if has_active && (!currently_running || current_port != port) {
            // Need to start or restart server
            if currently_running {
                self.stop_server().await;
            }
            self.start_server(app.clone(), workflows, port).await;
        } else if !has_active && currently_running {
            // No active webhooks, stop server
            self.stop_server().await;
        } else if has_active && currently_running {
            // Server running, just update token map
            self.update_token_map(app, workflows).await;
        }
    }

    /// Update token map without restarting server
    async fn update_token_map(&self, app: &AppHandle, workflows: &[Workflow]) {
        if let Some(state) = app.try_state::<Arc<IncomingWebhookServerState>>() {
            let new_map = Self::build_token_map(workflows);
            *state.token_map.write().await = new_map;
            log::info!("[incoming-webhook] Token map updated");
        }
    }

    /// Start the HTTP server
    async fn start_server(&self, app: AppHandle, workflows: &[Workflow], port: u16) {
        let token_map = Self::build_token_map(workflows);

        let state = Arc::new(IncomingWebhookServerState {
            app: app.clone(),
            token_map: RwLock::new(token_map),
        });

        // Store state in app for later access
        app.manage(state.clone());

        // Build router
        let router = Router::new()
            .route("/webhook/{workflow_id}", post(handle_webhook_trigger))
            .with_state(state);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        // Store shutdown sender
        *self.shutdown_tx.write().await = Some(shutdown_tx);
        *self.port.write().await = port;
        *self.running.write().await = true;

        // Spawn server task
        tokio::spawn(async move {
            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => l,
                Err(e) => {
                    log::error!("[incoming-webhook] Failed to bind to {}: {}", addr, e);
                    return;
                }
            };

            log::info!("[incoming-webhook] Server started on http://{}", addr);

            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    shutdown_rx.await.ok();
                })
                .await
                .ok();

            log::info!("[incoming-webhook] Server stopped");
        });
    }

    /// Stop the HTTP server
    pub async fn stop_server(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
        *self.running.write().await = false;
        log::info!("[incoming-webhook] Server shutdown requested");
    }

    /// Check if server is running
    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    /// Get current port
    pub async fn get_port(&self) -> u16 {
        *self.port.read().await
    }

    /// Get server status
    pub async fn get_status(&self, workflows: &[Workflow]) -> IncomingWebhookServerStatus {
        let active_count = workflows
            .iter()
            .filter(|w| {
                w.incoming_webhook
                    .as_ref()
                    .map(|c| c.enabled)
                    .unwrap_or(false)
            })
            .count();

        IncomingWebhookServerStatus {
            running: *self.running.read().await,
            port: *self.port.read().await,
            active_webhooks_count: active_count as u32,
        }
    }
}

/// Query parameters for webhook trigger
#[derive(serde::Deserialize)]
struct TriggerQueryParams {
    token: Option<String>,
}

/// Get workflow name from store by workflow ID
fn get_workflow_name(app: &AppHandle, workflow_id: &str) -> Option<String> {
    use crate::utils::store::STORE_FILE;

    let store = app.store(STORE_FILE).ok()?;
    let workflows_value = store.get("workflows")?;
    let workflows = workflows_value.as_array()?;

    workflows.iter().find_map(|w| {
        let id = w.get("id")?.as_str()?;
        if id == workflow_id {
            w.get("name")?.as_str().map(String::from)
        } else {
            None
        }
    })
}

/// Handle incoming webhook trigger request
/// POST /webhook/{workflow_id}?token={token}
async fn handle_webhook_trigger(
    State(state): State<Arc<IncomingWebhookServerState>>,
    Path(workflow_id): Path<String>,
    Query(params): Query<TriggerQueryParams>,
) -> (StatusCode, Json<WebhookTriggerResponse>) {
    // Validate token
    let token = params.token.unwrap_or_default();

    // token_map is now workflow_id -> token
    let token_map = state.token_map.read().await;
    let is_valid = token_map
        .get(&workflow_id)
        .map(|expected_token| expected_token == &token)
        .unwrap_or(false);

    if !is_valid {
        log::warn!(
            "[incoming-webhook] Invalid token for workflow {}",
            workflow_id
        );
        return (
            StatusCode::UNAUTHORIZED,
            Json(WebhookTriggerResponse {
                success: false,
                execution_id: None,
                message: "Invalid token or workflow ID".to_string(),
            }),
        );
    }

    drop(token_map);

    // Trigger workflow execution
    log::info!(
        "[incoming-webhook] Triggering workflow {} via webhook",
        workflow_id
    );

    match crate::commands::workflow::execute_workflow(
        state.app.clone(),
        workflow_id.clone(),
        None,
        None,
    )
    .await
    {
        Ok(execution_id) => {
            log::info!(
                "[incoming-webhook] Workflow {} triggered, execution_id: {}",
                workflow_id,
                execution_id
            );

            // Send desktop notification for incoming webhook
            if let Some(workflow_name) = get_workflow_name(&state.app, &workflow_id) {
                let _ = send_webhook_notification(
                    &state.app,
                    WebhookNotificationType::IncomingTriggered { workflow_name },
                );
            }

            (
                StatusCode::OK,
                Json(WebhookTriggerResponse {
                    success: true,
                    execution_id: Some(execution_id),
                    message: "Workflow triggered successfully".to_string(),
                }),
            )
        }
        Err(e) => {
            log::error!(
                "[incoming-webhook] Failed to trigger workflow {}: {}",
                workflow_id,
                e
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(WebhookTriggerResponse {
                    success: false,
                    execution_id: None,
                    message: format!("Failed to trigger workflow: {}", e),
                }),
            )
        }
    }
}
