// Cloudflare Pages API Operations
// Low-level API functions for Cloudflare Pages

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use std::collections::HashSet;

use super::types::*;
use crate::services::deploy::error::{DeployError, DeployResult};
use crate::services::deploy::types::FileToUpload;

/// Cloudflare API base URL
pub const API_BASE: &str = "https://api.cloudflare.com/client/v4";

/// Batch size for file uploads
pub const UPLOAD_BATCH_SIZE: usize = 100;

/// Maximum polling attempts (5 minutes with 5 second intervals)
pub const MAX_POLL_ATTEMPTS: u32 = 60;

/// Polling interval in seconds
pub const POLL_INTERVAL_SECS: u64 = 5;

/// Check if a project exists on Cloudflare Pages
pub async fn check_project_exists(
    client: &Client,
    api_token: &str,
    account_id: &str,
    project_name: &str,
) -> DeployResult<bool> {
    let url = format!(
        "{}/accounts/{}/pages/projects/{}",
        API_BASE, account_id, project_name
    );

    let response = client
        .get(&url)
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    Ok(response.status().is_success())
}

/// Create a new Cloudflare Pages project
pub async fn create_project(
    client: &Client,
    api_token: &str,
    account_id: &str,
    project_name: &str,
) -> DeployResult<()> {
    let url = format!("{}/accounts/{}/pages/projects", API_BASE, account_id);

    let payload = ProjectCreatePayload {
        name: project_name.to_string(),
        production_branch: "main".to_string(),
    };

    let response = client
        .post(&url)
        .bearer_auth(api_token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::ProjectCreationFailed {
            project_name: project_name.to_string(),
            message: error_text,
        });
    }

    Ok(())
}

/// Get JWT upload token for file uploads
pub async fn get_upload_token(
    client: &Client,
    api_token: &str,
    account_id: &str,
    project_name: &str,
) -> DeployResult<String> {
    let url = format!(
        "{}/accounts/{}/pages/projects/{}/upload-token",
        API_BASE, account_id, project_name
    );

    let response = client
        .get(&url)
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::ApiError {
            platform: "Cloudflare".to_string(),
            message: format!("Failed to get upload token: {}", error_text),
        });
    }

    // Use serde_json::Value for flexible parsing
    let data: serde_json::Value = response.json().await.map_err(|e| DeployError::ApiError {
        platform: "Cloudflare".to_string(),
        message: format!("Failed to parse upload token response: {}", e),
    })?;

    data["result"]["jwt"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| DeployError::ApiError {
            platform: "Cloudflare".to_string(),
            message: "No JWT in upload token response".to_string(),
        })
}

/// Check which file hashes are missing on Cloudflare
pub async fn check_missing_hashes(
    client: &Client,
    jwt: &str,
    hashes: &[String],
) -> DeployResult<HashSet<String>> {
    let url = format!("{}/pages/assets/check-missing", API_BASE);

    let response = client
        .post(&url)
        .bearer_auth(jwt)
        .json(&serde_json::json!({ "hashes": hashes }))
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::ApiError {
            platform: "Cloudflare".to_string(),
            message: format!("Failed to check missing files: {}", error_text),
        });
    }

    // Use serde_json::Value for flexible parsing (API response format varies)
    let data: serde_json::Value = response.json().await.map_err(|e| DeployError::ApiError {
        platform: "Cloudflare".to_string(),
        message: format!("Failed to parse check-missing response: {}", e),
    })?;

    // Extract missing hashes from result array
    let missing_hashes: HashSet<String> = data["result"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(missing_hashes)
}

/// Upload a batch of files to Cloudflare
pub async fn upload_files(
    client: &Client,
    jwt: &str,
    files: &[&FileToUpload],
) -> DeployResult<()> {
    let url = format!("{}/pages/assets/upload", API_BASE);

    let payload: Vec<FileUploadPayload> = files
        .iter()
        .map(|f| FileUploadPayload {
            key: f.hash.clone(),
            value: BASE64.encode(&f.content),
            metadata: FileUploadMetadata {
                content_type: f.content_type.clone(),
            },
            base64: true,
        })
        .collect();

    let response = client
        .post(&url)
        .bearer_auth(jwt)
        .json(&payload)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::UploadFailed {
            file_path: format!("{} files", files.len()),
            message: error_text,
        });
    }

    Ok(())
}

/// Register file hashes with Cloudflare (upsert)
pub async fn upsert_hashes(client: &Client, jwt: &str, hashes: &[String]) -> DeployResult<()> {
    let url = format!("{}/pages/assets/upsert-hashes", API_BASE);

    let response = client
        .post(&url)
        .bearer_auth(jwt)
        .json(&HashUpsertPayload {
            hashes: hashes.to_vec(),
        })
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::ApiError {
            platform: "Cloudflare".to_string(),
            message: format!("Failed to upsert hashes: {}", error_text),
        });
    }

    Ok(())
}

/// Create a deployment on Cloudflare Pages
pub async fn create_deployment(
    client: &Client,
    api_token: &str,
    account_id: &str,
    project_name: &str,
    manifest: &serde_json::Value,
) -> DeployResult<String> {
    let url = format!(
        "{}/accounts/{}/pages/projects/{}/deployments",
        API_BASE, account_id, project_name
    );

    let manifest_json = manifest.to_string();
    let form = reqwest::multipart::Form::new()
        .text("manifest", manifest_json)
        .text("branch", "main");

    let response = client
        .post(&url)
        .bearer_auth(api_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::DeploymentCreationFailed {
            message: error_text,
        });
    }

    // Use serde_json::Value for flexible parsing
    let data: serde_json::Value = response.json().await.map_err(|e| DeployError::ApiError {
        platform: "Cloudflare".to_string(),
        message: format!("Failed to parse deployment response: {}", e),
    })?;

    data["result"]["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| DeployError::DeploymentCreationFailed {
            message: "No deployment ID in response".to_string(),
        })
}

/// Get deployment status from Cloudflare
pub async fn get_deployment_status(
    client: &Client,
    api_token: &str,
    account_id: &str,
    project_name: &str,
    deployment_id: &str,
) -> DeployResult<DeploymentStatusResult> {
    let url = format!(
        "{}/accounts/{}/pages/projects/{}/deployments/{}",
        API_BASE, account_id, project_name, deployment_id
    );

    let response = client
        .get(&url)
        .bearer_auth(api_token)
        .send()
        .await
        .map_err(|e| DeployError::ConnectionFailed {
            platform: "Cloudflare".to_string(),
            message: e.to_string(),
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(DeployError::ApiError {
            platform: "Cloudflare".to_string(),
            message: format!("Failed to get deployment status: {}", error_text),
        });
    }

    // Use serde_json::Value for flexible parsing
    let data: serde_json::Value = response.json().await.map_err(|e| DeployError::ApiError {
        platform: "Cloudflare".to_string(),
        message: format!("Failed to parse status response: {}", e),
    })?;

    let result = &data["result"];

    // Extract latest_stage info
    let latest_stage = if result["latest_stage"].is_object() {
        Some(DeploymentStage {
            name: result["latest_stage"]["name"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            status: result["latest_stage"]["status"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            message: result["latest_stage"]["message"]
                .as_str()
                .map(|s| s.to_string()),
        })
    } else {
        None
    };

    // Extract aliases array
    let aliases = result["aliases"].as_array().map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    });

    Ok(DeploymentStatusResult {
        id: result["id"].as_str().unwrap_or("").to_string(),
        url: result["url"].as_str().map(|s| s.to_string()),
        aliases,
        latest_stage,
    })
}
