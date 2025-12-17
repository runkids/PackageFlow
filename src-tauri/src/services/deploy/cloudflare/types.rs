// Cloudflare Pages API Types
// Response structures for Cloudflare API

use serde::{Deserialize, Serialize};

/// Cloudflare API response wrapper
#[derive(Debug, Deserialize)]
pub struct CloudflareResponse<T> {
    pub success: bool,
    pub result: Option<T>,
    pub errors: Vec<CloudflareError>,
    pub messages: Vec<String>,
}

/// Cloudflare API error
#[derive(Debug, Deserialize)]
pub struct CloudflareError {
    pub code: i32,
    pub message: String,
}

/// Upload token response
#[derive(Debug, Deserialize)]
pub struct UploadTokenResult {
    pub jwt: String,
}

/// Check missing files response
#[derive(Debug, Deserialize)]
#[serde(transparent)]
pub struct MissingHashesResult(pub Vec<String>);

/// Deployment creation result
#[derive(Debug, Deserialize)]
pub struct DeploymentCreateResult {
    pub id: String,
    pub url: Option<String>,
    pub aliases: Option<Vec<String>>,
}

/// Deployment status result
#[derive(Debug, Deserialize)]
pub struct DeploymentStatusResult {
    pub id: String,
    pub url: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub latest_stage: Option<DeploymentStage>,
}

/// Deployment stage information
#[derive(Debug, Deserialize)]
pub struct DeploymentStage {
    pub name: String,
    pub status: String,
    pub message: Option<String>,
}

/// File upload payload
#[derive(Debug, Serialize)]
pub struct FileUploadPayload {
    pub key: String,
    pub value: String,
    pub metadata: FileUploadMetadata,
    pub base64: bool,
}

/// File upload metadata
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileUploadMetadata {
    pub content_type: String,
}

/// Hash upsert payload
#[derive(Debug, Serialize)]
pub struct HashUpsertPayload {
    pub hashes: Vec<String>,
}

/// Project creation payload
#[derive(Debug, Serialize)]
pub struct ProjectCreatePayload {
    pub name: String,
    pub production_branch: String,
}

impl<T> CloudflareResponse<T> {
    /// Check if the response indicates success
    pub fn is_success(&self) -> bool {
        self.success && self.errors.is_empty()
    }

    /// Get error message if any
    pub fn error_message(&self) -> Option<String> {
        if self.errors.is_empty() {
            None
        } else {
            Some(
                self.errors
                    .iter()
                    .map(|e| format!("[{}] {}", e.code, e.message))
                    .collect::<Vec<_>>()
                    .join("; "),
            )
        }
    }
}
