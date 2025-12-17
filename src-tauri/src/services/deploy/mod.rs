// Deploy Service Module
// Refactored deployment logic from commands/deploy.rs
//
// This module provides:
// - DeploymentProvider trait for platform-specific implementations
// - Common utilities (hash, types, error)
// - Platform providers (cloudflare, netlify, github)

pub mod cloudflare;
pub mod error;
pub mod hash;
pub mod types;

use async_trait::async_trait;
use std::path::Path;
use tauri::AppHandle;

pub use error::{DeployError, DeployErrorCode, DeployResult};
pub use hash::{calculate_sha1, calculate_sha256_short, HashAlgorithm};
pub use types::{
    collect_build_files, get_mime_type, DeploymentResult, FileManifest, FileToUpload,
    UploadSummary,
};

use crate::models::deploy::{DeploymentConfig, DeploymentStatus, PlatformType};

/// Trait for deployment providers
/// All deployment platforms (Cloudflare, Netlify, GitHub Pages) implement this trait
#[async_trait]
pub trait DeploymentProvider: Send + Sync {
    /// Get the provider name
    fn name(&self) -> &str;

    /// Get the platform type
    fn platform(&self) -> PlatformType;

    /// Validate the deployment configuration
    async fn validate_config(&self, config: &DeploymentConfig) -> DeployResult<()>;

    /// Execute the deployment
    ///
    /// # Arguments
    /// * `app` - Tauri AppHandle for emitting events
    /// * `deployment_id` - Unique deployment ID for tracking
    /// * `config` - Deployment configuration
    /// * `build_path` - Path to the build output directory
    ///
    /// # Returns
    /// DeploymentResult with URL and optional alias
    async fn deploy(
        &self,
        app: &AppHandle,
        deployment_id: &str,
        config: &DeploymentConfig,
        build_path: &Path,
    ) -> DeployResult<DeploymentResult>;

    /// Get the current deployment status (if supported)
    async fn get_status(&self, deployment_id: &str) -> DeployResult<DeploymentStatus> {
        // Default implementation - not all providers support this
        let _ = deployment_id;
        Err(DeployError::ApiError {
            platform: self.name().to_string(),
            message: "Status check not supported".to_string(),
        })
    }
}

/// Boxed deployment provider type
pub type BoxedDeploymentProvider = Box<dyn DeploymentProvider>;

/// Factory function to create a deployment provider
///
/// # Arguments
/// * `platform` - The target platform
/// * `api_token` - API token for authentication
/// * `account_id` - Platform-specific account ID (e.g., Cloudflare account ID)
///
/// # Returns
/// A boxed deployment provider instance
pub fn create_provider(
    platform: PlatformType,
    api_token: String,
    account_id: Option<String>,
) -> DeployResult<BoxedDeploymentProvider> {
    match platform {
        PlatformType::CloudflarePages => {
            let cf_account_id = account_id.ok_or_else(|| DeployError::InvalidConfig {
                message: "Cloudflare account ID is required".to_string(),
            })?;
            Ok(Box::new(cloudflare::CloudflareProvider::new(
                api_token,
                cf_account_id,
            )))
        }
        PlatformType::Netlify => {
            // TODO: Implement NetlifyProvider in Phase 4
            Err(DeployError::InvalidConfig {
                message: "Netlify provider not yet migrated to new architecture".to_string(),
            })
        }
        PlatformType::GithubPages => {
            // TODO: Implement GitHubPagesProvider in Phase 4
            Err(DeployError::InvalidConfig {
                message: "GitHub Pages provider not yet migrated to new architecture".to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_cloudflare_provider() {
        let result = create_provider(
            PlatformType::CloudflarePages,
            "test-token".to_string(),
            Some("account-123".to_string()),
        );
        assert!(result.is_ok());

        let provider = result.unwrap();
        assert_eq!(provider.name(), "Cloudflare Pages");
        assert_eq!(provider.platform(), PlatformType::CloudflarePages);
    }

    #[test]
    fn test_create_cloudflare_provider_without_account_id() {
        let result = create_provider(
            PlatformType::CloudflarePages,
            "test-token".to_string(),
            None,
        );
        assert!(result.is_err());

        if let Err(DeployError::InvalidConfig { message }) = result {
            assert!(message.contains("account ID"));
        } else {
            panic!("Expected InvalidConfig error");
        }
    }

    #[test]
    fn test_create_netlify_provider_not_implemented() {
        let result = create_provider(PlatformType::Netlify, "test-token".to_string(), None);
        assert!(result.is_err());
    }
}
