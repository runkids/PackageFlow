// AI API Key Secure Storage
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Manages secure storage of API keys using the existing crypto module.
// Keys are stored encrypted in SQLite database.

use tauri::{AppHandle, Wry};

use super::{AIError, AIResult};
use crate::repositories::AIRepository;
use crate::services::crypto::{decrypt, encrypt, EncryptedData};
use crate::utils::database::Database;
use crate::DatabaseState;

/// Get Database from AppHandle
fn get_db(app: &AppHandle<Wry>) -> Database {
    use tauri::Manager;
    let db_state = app.state::<DatabaseState>();
    db_state.0.as_ref().clone()
}

/// Get AIRepository from AppHandle
fn get_ai_repo(app: &AppHandle<Wry>) -> AIRepository {
    AIRepository::new(get_db(app))
}

/// Secure API Key Storage Manager
/// Uses SQLite for encrypted storage.
pub struct AIKeychain {
    app_handle: AppHandle<Wry>,
}

impl AIKeychain {
    pub fn new(app_handle: AppHandle<Wry>) -> Self {
        Self { app_handle }
    }

    /// Store an API key for a provider
    ///
    /// # Arguments
    /// * `provider_id` - The AI provider ID
    /// * `api_key` - The API key to store
    pub fn store_api_key(&self, provider_id: &str, api_key: &str) -> AIResult<()> {
        // Encrypt the API key
        let encrypted = encrypt(api_key)
            .map_err(|e| AIError::EncryptionError(e.to_string()))?;

        let repo = get_ai_repo(&self.app_handle);

        // Store in SQLite
        repo.store_api_key(provider_id, &encrypted.ciphertext, &encrypted.nonce)
            .map_err(|e| AIError::StorageError(e))?;

        log::info!("API key stored for provider: {}", provider_id);
        Ok(())
    }

    /// Retrieve an API key for a provider
    ///
    /// # Arguments
    /// * `provider_id` - The AI provider ID
    ///
    /// # Returns
    /// The decrypted API key, or None if not found
    pub fn get_api_key(&self, provider_id: &str) -> AIResult<Option<String>> {
        let repo = get_ai_repo(&self.app_handle);

        if let Ok(Some((ciphertext, nonce))) = repo.get_api_key(provider_id) {
            let encrypted = EncryptedData { ciphertext, nonce };
            let decrypted = decrypt(&encrypted)
                .map_err(|e| AIError::EncryptionError(e.to_string()))?;
            return Ok(Some(decrypted));
        }

        Ok(None)
    }

    /// Delete an API key for a provider
    ///
    /// # Arguments
    /// * `provider_id` - The AI provider ID
    pub fn delete_api_key(&self, provider_id: &str) -> AIResult<()> {
        let repo = get_ai_repo(&self.app_handle);

        repo.delete_api_key(provider_id)
            .map_err(|e| AIError::StorageError(e))?;

        log::info!("API key deleted for provider: {}", provider_id);
        Ok(())
    }

    /// Check if an API key exists for a provider
    ///
    /// # Arguments
    /// * `provider_id` - The AI provider ID
    pub fn has_api_key(&self, provider_id: &str) -> AIResult<bool> {
        let repo = get_ai_repo(&self.app_handle);
        repo.has_api_key(provider_id)
            .map_err(|e| AIError::StorageError(e))
    }

    /// List all provider IDs that have stored API keys
    pub fn list_provider_ids_with_keys(&self) -> AIResult<Vec<String>> {
        let repo = get_ai_repo(&self.app_handle);
        repo.list_provider_ids_with_keys()
            .map_err(|e| AIError::StorageError(e))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_keychain_module_compiles() {
        assert!(true);
    }
}
