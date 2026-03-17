// Global config commands
// Exposes config load/save to the frontend via Tauri IPC

use crate::local_models::config::SpecForgeConfig;
use crate::services::config_service;

/// Load the global SpecForge config (returns defaults if file is missing)
#[tauri::command]
pub async fn get_config() -> Result<SpecForgeConfig, String> {
    Ok(config_service::load_config())
}

/// Save/update the global SpecForge config
#[tauri::command]
pub async fn update_config(config: SpecForgeConfig) -> Result<(), String> {
    config_service::save_config(&config)
}
