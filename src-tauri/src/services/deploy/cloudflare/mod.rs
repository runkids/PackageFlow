// Cloudflare Pages Provider
// Implements DeploymentProvider trait for Cloudflare Pages

pub mod api;
pub mod types;

use async_trait::async_trait;
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Emitter};

use crate::models::deploy::{DeploymentConfig, DeploymentStatus, PlatformType};

use super::error::{DeployError, DeployResult};
use super::hash::calculate_sha256_short;
use super::types::{collect_build_files, DeploymentResult, FileManifest, FileToUpload};
use super::DeploymentProvider;

use api::{POLL_INTERVAL_SECS, UPLOAD_BATCH_SIZE};

/// Deployment status event for frontend
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DeploymentStatusEvent {
    deployment_id: String,
    status: DeploymentStatus,
    url: Option<String>,
    error_message: Option<String>,
}

/// Cloudflare Pages deployment provider
pub struct CloudflareProvider {
    /// HTTP client
    client: reqwest::Client,
    /// Cloudflare API token
    api_token: String,
    /// Cloudflare account ID (hex string)
    account_id: String,
}

impl CloudflareProvider {
    /// Create a new Cloudflare provider
    pub fn new(api_token: String, account_id: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_token,
            account_id,
        }
    }

    /// Step 1: Ensure the project exists on Cloudflare Pages
    async fn ensure_project_exists(&self, project_name: &str) -> DeployResult<()> {
        let exists =
            api::check_project_exists(&self.client, &self.api_token, &self.account_id, project_name)
                .await?;

        if !exists {
            log::info!("Cloudflare Pages: Creating project '{}'", project_name);
            api::create_project(&self.client, &self.api_token, &self.account_id, project_name)
                .await?;
        }

        Ok(())
    }

    /// Step 2: Build file manifest from build directory
    fn build_file_manifest(&self, build_path: &Path) -> DeployResult<FileManifest> {
        let files = collect_build_files(build_path).map_err(|e| DeployError::BuildDirNotFound {
            path: format!("{}: {}", build_path.display(), e),
        })?;

        let mut manifest = FileManifest::new();

        for (path, content) in files {
            let hash = calculate_sha256_short(&content);
            manifest.add_file(path, hash, content);
        }

        log::info!(
            "Cloudflare Pages: {} files in manifest",
            manifest.len()
        );

        Ok(manifest)
    }

    /// Step 3: Get JWT upload token
    async fn get_upload_token(&self, project_name: &str) -> DeployResult<String> {
        let jwt =
            api::get_upload_token(&self.client, &self.api_token, &self.account_id, project_name)
                .await?;

        log::info!("Cloudflare Pages: Got upload JWT token");
        Ok(jwt)
    }

    /// Step 4: Check which files are missing on Cloudflare
    async fn check_missing_files(
        &self,
        jwt: &str,
        hashes: &[String],
    ) -> DeployResult<HashSet<String>> {
        let missing = api::check_missing_hashes(&self.client, jwt, hashes).await?;

        log::info!(
            "Cloudflare Pages: {} files missing, need to upload",
            missing.len()
        );

        Ok(missing)
    }

    /// Step 5: Upload missing files in batches
    async fn upload_files_batch(
        &self,
        jwt: &str,
        files: &[FileToUpload],
        missing: &HashSet<String>,
    ) -> DeployResult<()> {
        let files_to_upload: Vec<&FileToUpload> =
            files.iter().filter(|f| missing.contains(&f.hash)).collect();

        if files_to_upload.is_empty() {
            log::info!("Cloudflare Pages: No files to upload (all cached)");
            return Ok(());
        }

        // Upload in batches
        for chunk in files_to_upload.chunks(UPLOAD_BATCH_SIZE) {
            api::upload_files(&self.client, jwt, chunk).await?;
            log::info!("Cloudflare Pages: Uploaded batch of {} files", chunk.len());
        }

        Ok(())
    }

    /// Step 6: Register all file hashes
    async fn register_hashes(&self, jwt: &str, hashes: &[String]) -> DeployResult<()> {
        api::upsert_hashes(&self.client, jwt, hashes).await?;
        log::info!("Cloudflare Pages: All hashes registered");
        Ok(())
    }

    /// Step 7: Create deployment
    async fn create_deployment(
        &self,
        project_name: &str,
        manifest: &serde_json::Value,
    ) -> DeployResult<String> {
        let deploy_id = api::create_deployment(
            &self.client,
            &self.api_token,
            &self.account_id,
            project_name,
            manifest,
        )
        .await?;

        log::info!(
            "Cloudflare Pages: Deployment created with ID {}",
            deploy_id
        );

        Ok(deploy_id)
    }

    /// Step 8: Poll deployment status until complete
    async fn poll_deployment_status(
        &self,
        app: &AppHandle,
        deployment_id: &str,
        project_name: &str,
        cf_deploy_id: &str,
    ) -> DeployResult<DeploymentResult> {
        for _ in 0..api::MAX_POLL_ATTEMPTS {
            tokio::time::sleep(std::time::Duration::from_secs(POLL_INTERVAL_SECS)).await;

            let status = match api::get_deployment_status(
                &self.client,
                &self.api_token,
                &self.account_id,
                project_name,
                cf_deploy_id,
            )
            .await
            {
                Ok(s) => s,
                Err(_) => continue, // Retry on error
            };

            if let Some(stage) = &status.latest_stage {
                match (stage.name.as_str(), stage.status.as_str()) {
                    ("deploy", "success") => {
                        // Deployment complete!
                        let url = status.url.unwrap_or_default();
                        let alias = status
                            .aliases
                            .and_then(|a| a.into_iter().next());

                        let mut result = DeploymentResult::new(url)
                            .with_deploy_id(cf_deploy_id.to_string());

                        if let Some(alias_url) = alias {
                            result = result.with_alias(alias_url);
                        }

                        return Ok(result);
                    }
                    (_, "failure") => {
                        let message = stage
                            .message
                            .clone()
                            .unwrap_or_else(|| "Deployment failed".to_string());
                        return Err(DeployError::DeploymentFailed { message });
                    }
                    ("build", _) => {
                        let _ = app.emit(
                            "deployment:status",
                            DeploymentStatusEvent {
                                deployment_id: deployment_id.to_string(),
                                status: DeploymentStatus::Building,
                                url: None,
                                error_message: None,
                            },
                        );
                    }
                    ("deploy", _) => {
                        let _ = app.emit(
                            "deployment:status",
                            DeploymentStatusEvent {
                                deployment_id: deployment_id.to_string(),
                                status: DeploymentStatus::Deploying,
                                url: None,
                                error_message: None,
                            },
                        );
                    }
                    _ => {}
                }
            }
        }

        Err(DeployError::DeploymentTimeout {
            seconds: api::MAX_POLL_ATTEMPTS as u64 * POLL_INTERVAL_SECS,
        })
    }
}

#[async_trait]
impl DeploymentProvider for CloudflareProvider {
    fn name(&self) -> &str {
        "Cloudflare Pages"
    }

    fn platform(&self) -> PlatformType {
        PlatformType::CloudflarePages
    }

    async fn validate_config(&self, config: &DeploymentConfig) -> DeployResult<()> {
        if config.cloudflare_project_name.is_none() {
            return Err(DeployError::InvalidConfig {
                message: "Cloudflare project name is required".to_string(),
            });
        }
        Ok(())
    }

    async fn deploy(
        &self,
        app: &AppHandle,
        deployment_id: &str,
        config: &DeploymentConfig,
        build_path: &Path,
    ) -> DeployResult<DeploymentResult> {
        // Get project name from config
        let project_name = config
            .cloudflare_project_name
            .clone()
            .ok_or_else(|| DeployError::InvalidConfig {
                message: "Cloudflare project name is required".to_string(),
            })?;

        // Emit deploying status
        let _ = app.emit(
            "deployment:status",
            DeploymentStatusEvent {
                deployment_id: deployment_id.to_string(),
                status: DeploymentStatus::Deploying,
                url: None,
                error_message: None,
            },
        );

        // Step 1: Ensure project exists
        self.ensure_project_exists(&project_name).await?;

        // Step 2: Build file manifest
        let manifest = self.build_file_manifest(build_path)?;

        // Step 3: Get upload token
        let jwt = self.get_upload_token(&project_name).await?;

        // Step 4: Check missing files
        let hashes = manifest.hashes();
        let missing = self.check_missing_files(&jwt, &hashes).await?;

        // Step 5: Upload missing files
        self.upload_files_batch(&jwt, &manifest.file_data, &missing)
            .await?;

        // Step 6: Register all hashes
        self.register_hashes(&jwt, &hashes).await?;

        // Step 7: Create deployment
        let manifest_json = manifest.to_cloudflare_json();
        let cf_deploy_id = self.create_deployment(&project_name, &manifest_json).await?;

        // Step 8: Poll for completion
        self.poll_deployment_status(app, deployment_id, &project_name, &cf_deploy_id)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        let provider = CloudflareProvider::new("token".to_string(), "account".to_string());
        assert_eq!(provider.name(), "Cloudflare Pages");
    }

    #[test]
    fn test_provider_platform() {
        let provider = CloudflareProvider::new("token".to_string(), "account".to_string());
        assert_eq!(provider.platform(), PlatformType::CloudflarePages);
    }
}
