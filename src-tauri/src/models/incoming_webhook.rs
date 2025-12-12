/**
 * Incoming Webhook Models
 * Data structures for incoming webhook configuration
 * @see specs/012-workflow-webhook-support
 */
use serde::{Deserialize, Serialize};

/// Incoming Webhook configuration (per workflow)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingWebhookConfig {
    /// Whether incoming webhook is enabled
    pub enabled: bool,
    /// API Token for authentication (UUID v4)
    pub token: String,
    /// Token creation timestamp (ISO 8601)
    pub token_created_at: String,
}

/// Global incoming webhook server settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingWebhookServerSettings {
    /// Server listening port (default: 9876)
    pub port: u16,
}

impl Default for IncomingWebhookServerSettings {
    fn default() -> Self {
        Self { port: 9876 }
    }
}

/// Incoming webhook server status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingWebhookServerStatus {
    /// Whether server is running
    pub running: bool,
    /// Current listening port
    pub port: u16,
    /// Number of active incoming webhooks
    pub active_webhooks_count: u32,
}

/// Webhook trigger response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookTriggerResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
    pub message: String,
}
