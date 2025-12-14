// AI API Key Secure Storage
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Manages secure storage of API keys using the existing crypto module.
// Keys are stored encrypted in tauri-plugin-store.

use std::collections::HashMap;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;

use super::{AIError, AIResult};
use crate::services::crypto::{decrypt, encrypt, EncryptedData};

const STORE_FILENAME: &str = "packageflow.json";
const KEY_AI_API_KEYS: &str = "ai_api_keys";

/// Secure API Key Storage Manager
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
    /// * `service_id` - The AI service ID
    /// * `api_key` - The API key to store
    pub fn store_api_key(&self, service_id: &str, api_key: &str) -> AIResult<()> {
        // Encrypt the API key
        let encrypted = encrypt(api_key)
            .map_err(|e| AIError::EncryptionError(e.to_string()))?;

        // Load existing keys
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let mut keys: HashMap<String, EncryptedData> = store
            .get(KEY_AI_API_KEYS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Store the encrypted key
        keys.insert(service_id.to_string(), encrypted);

        // Save
        let value = serde_json::to_value(&keys)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        store.set(KEY_AI_API_KEYS, value);
        store.save().map_err(|e| AIError::StorageError(e.to_string()))?;

        log::info!("API key stored for service: {}", service_id);
        Ok(())
    }

    /// Retrieve an API key for a service
    ///
    /// # Arguments
    /// * `service_id` - The AI service ID
    ///
    /// # Returns
    /// The decrypted API key, or None if not found
    pub fn get_api_key(&self, service_id: &str) -> AIResult<Option<String>> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let keys: HashMap<String, EncryptedData> = store
            .get(KEY_AI_API_KEYS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        match keys.get(service_id) {
            Some(encrypted) => {
                let decrypted = decrypt(encrypted)
                    .map_err(|e| AIError::EncryptionError(e.to_string()))?;
                Ok(Some(decrypted))
            }
            None => Ok(None),
        }
    }

    /// Delete an API key for a service
    ///
    /// # Arguments
    /// * `service_id` - The AI service ID
    pub fn delete_api_key(&self, service_id: &str) -> AIResult<()> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let mut keys: HashMap<String, EncryptedData> = store
            .get(KEY_AI_API_KEYS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        if keys.remove(service_id).is_some() {
            let value = serde_json::to_value(&keys)
                .map_err(|e| AIError::StorageError(e.to_string()))?;

            store.set(KEY_AI_API_KEYS, value);
            store.save().map_err(|e| AIError::StorageError(e.to_string()))?;

            log::info!("API key deleted for service: {}", service_id);
        }

        Ok(())
    }

    /// Check if an API key exists for a service
    ///
    /// # Arguments
    /// * `service_id` - The AI service ID
    pub fn has_api_key(&self, service_id: &str) -> AIResult<bool> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let keys: HashMap<String, EncryptedData> = store
            .get(KEY_AI_API_KEYS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        Ok(keys.contains_key(service_id))
    }

    /// List all service IDs that have stored API keys
    pub fn list_service_ids_with_keys(&self) -> AIResult<Vec<String>> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let keys: HashMap<String, EncryptedData> = store
            .get(KEY_AI_API_KEYS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        Ok(keys.keys().cloned().collect())
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
