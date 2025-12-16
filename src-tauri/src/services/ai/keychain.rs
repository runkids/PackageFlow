// AI API Key Secure Storage
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Manages secure storage of API keys using the existing crypto module.
// Keys are stored encrypted in SQLite database.

use std::collections::HashMap;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;

use super::{AIError, AIResult};
use crate::repositories::AIRepository;
use crate::services::crypto::{decrypt, encrypt, EncryptedData};
use crate::utils::database::Database;
use crate::DatabaseState;

const STORE_FILENAME: &str = "packageflow.json";
const KEY_AI_API_KEYS: &str = "ai_api_keys";

/// Get Database from AppHandle
fn get_db(app: &AppHandle<Wry>) -> Database {
    let db_state = app.state::<DatabaseState>();
    db_state.0.as_ref().clone()
}

/// Get AIRepository from AppHandle
fn get_ai_repo(app: &AppHandle<Wry>) -> AIRepository {
    AIRepository::new(get_db(app))
}

/// Secure API Key Storage Manager
/// Now uses SQLite for storage instead of JSON store.
pub struct AIKeychain {
    app_handle: AppHandle<Wry>,
}

impl AIKeychain {
    pub fn new(app_handle: AppHandle<Wry>) -> Self {
        Self { app_handle }
    }

    /// Store an API key for a service
    ///
    /// # Arguments
    /// * `provider_id` - The AI service ID
    /// * `api_key` - The API key to store
    pub fn store_api_key(&self, provider_id: &str, api_key: &str) -> AIResult<()> {
        // Encrypt the API key
        let encrypted = encrypt(api_key)
            .map_err(|e| AIError::EncryptionError(e.to_string()))?;

        let repo = get_ai_repo(&self.app_handle);

        // Store in SQLite
        repo.store_api_key(provider_id, &encrypted.ciphertext, &encrypted.nonce)
            .map_err(|e| AIError::StorageError(e))?;

        log::info!("API key stored for service: {}", provider_id);
        Ok(())
    }

    /// Retrieve an API key for a service
    ///
    /// # Arguments
    /// * `provider_id` - The AI service ID
    ///
    /// # Returns
    /// The decrypted API key, or None if not found
    pub fn get_api_key(&self, provider_id: &str) -> AIResult<Option<String>> {
        let repo = get_ai_repo(&self.app_handle);

        // Try SQLite first
        if let Ok(Some((ciphertext, nonce))) = repo.get_api_key(provider_id) {
            let encrypted = EncryptedData { ciphertext, nonce };
            let decrypted = decrypt(&encrypted)
                .map_err(|e| AIError::EncryptionError(e.to_string()))?;
            return Ok(Some(decrypted));
        }

        // Fallback: Try legacy JSON store for migration
        if let Ok(store) = self.app_handle.store(STORE_FILENAME) {
            let keys: HashMap<String, EncryptedData> = store
                .get(KEY_AI_API_KEYS)
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            if let Some(encrypted) = keys.get(provider_id) {
                let decrypted = decrypt(encrypted)
                    .map_err(|e| AIError::EncryptionError(e.to_string()))?;

                // Migrate to SQLite
                let _ = repo.store_api_key(provider_id, &encrypted.ciphertext, &encrypted.nonce);
                log::info!("Migrated API key for service {} to SQLite", provider_id);

                return Ok(Some(decrypted));
            }
        }

        Ok(None)
    }

    /// Delete an API key for a service
    ///
    /// # Arguments
    /// * `provider_id` - The AI service ID
    pub fn delete_api_key(&self, provider_id: &str) -> AIResult<()> {
        let repo = get_ai_repo(&self.app_handle);

        // Delete from SQLite
        repo.delete_api_key(provider_id)
            .map_err(|e| AIError::StorageError(e))?;

        // Also delete from legacy JSON store if exists
        if let Ok(store) = self.app_handle.store(STORE_FILENAME) {
            let mut keys: HashMap<String, EncryptedData> = store
                .get(KEY_AI_API_KEYS)
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            if keys.remove(provider_id).is_some() {
                if let Ok(value) = serde_json::to_value(&keys) {
                    store.set(KEY_AI_API_KEYS, value);
                    let _ = store.save();
                }
            }
        }

        log::info!("API key deleted for service: {}", provider_id);
        Ok(())
    }

    /// Check if an API key exists for a service
    ///
    /// # Arguments
    /// * `provider_id` - The AI service ID
    pub fn has_api_key(&self, provider_id: &str) -> AIResult<bool> {
        let repo = get_ai_repo(&self.app_handle);

        // Check SQLite first
        if repo.has_api_key(provider_id).unwrap_or(false) {
            return Ok(true);
        }

        // Fallback: Check legacy JSON store
        if let Ok(store) = self.app_handle.store(STORE_FILENAME) {
            let keys: HashMap<String, EncryptedData> = store
                .get(KEY_AI_API_KEYS)
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            return Ok(keys.contains_key(provider_id));
        }

        Ok(false)
    }

    /// List all service IDs that have stored API keys
    pub fn list_provider_ids_with_keys(&self) -> AIResult<Vec<String>> {
        let repo = get_ai_repo(&self.app_handle);

        repo.list_provider_ids_with_keys()
            .map_err(|e| AIError::StorageError(e))
    }
}

#[cfg(test)]
mod tests {
    // Note: These tests require a running Tauri app context
    // They should be run as integration tests

    #[test]
    fn test_keychain_module_compiles() {
        // Basic compile test
        assert!(true);
    }
}
