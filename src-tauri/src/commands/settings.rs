// Settings commands for data persistence
// Implements US7: Data Persistence Across Sessions

use crate::models::{Project, Workflow};
use crate::utils::store::{AppSettings, StoreData, STORE_FILE};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// Config file name for storing custom store path
const STORE_CONFIG_FILE: &str = "store-config.json";

/// Store path configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoreConfig {
    pub custom_store_path: Option<String>,
}

/// Response for get_store_path command
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorePathInfo {
    pub current_path: String,
    pub default_path: String,
    pub is_custom: bool,
}

/// Get the default store directory path
fn get_default_store_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

/// Load store config from the fixed config file location
fn load_store_config(app: &tauri::AppHandle) -> Result<StoreConfig, String> {
    let config_store = app.store(STORE_CONFIG_FILE).map_err(|e| e.to_string())?;

    let config: StoreConfig = config_store
        .get("config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(config)
}

/// Save store config to the fixed config file location
fn save_store_config(app: &tauri::AppHandle, config: &StoreConfig) -> Result<(), String> {
    let config_store = app.store(STORE_CONFIG_FILE).map_err(|e| e.to_string())?;

    config_store.set(
        "config",
        serde_json::to_value(config).map_err(|e| e.to_string())?,
    );
    config_store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the actual store file path (custom or default)
fn get_actual_store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config = load_store_config(app)?;

    if let Some(custom_path) = config.custom_store_path {
        let path = PathBuf::from(&custom_path);
        // Verify the custom path exists and is a file
        if path.exists() && path.is_file() {
            return Ok(path);
        }
        // If custom path doesn't exist yet but parent dir exists, allow it
        if let Some(parent) = path.parent() {
            if parent.exists() {
                return Ok(path);
            }
        }
        // Fall back to default if custom path is invalid
        log::warn!(
            "Custom store path invalid, falling back to default: {}",
            custom_path
        );
    }

    let default_dir = get_default_store_dir(app)?;
    Ok(default_dir.join(STORE_FILE))
}

/// Read store data from file (custom or default)
fn read_store_data_from_path(path: &PathBuf) -> Result<StoreData, String> {
    if !path.exists() {
        return Ok(StoreData::default());
    }

    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read store file: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse store data: {}", e))
}

/// Write store data to file
fn write_store_data_to_path(path: &PathBuf, data: &StoreData) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize store data: {}", e))?;

    std::fs::write(path, content).map_err(|e| format!("Failed to write store file: {}", e))?;

    Ok(())
}

/// Application state for caching settings
pub struct SettingsState {
    pub settings: Mutex<AppSettings>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(AppSettings::default()),
        }
    }
}

/// Load settings from store
#[tauri::command]
pub async fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Try to load settings from store
    let settings: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(settings)
}

/// Save settings to store
#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Save to store
    store.set(
        "settings",
        serde_json::to_value(&settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Load all projects from store
#[tauri::command]
pub async fn load_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let projects: Vec<Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(projects)
}

/// Save projects to store
#[tauri::command]
pub async fn save_projects(app: tauri::AppHandle, projects: Vec<Project>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Load all workflows from store
#[tauri::command]
pub async fn load_workflows(app: tauri::AppHandle) -> Result<Vec<Workflow>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let workflows: Vec<Workflow> = store
        .get("workflows")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(workflows)
}

/// Save workflows to store
#[tauri::command]
pub async fn save_workflows(app: tauri::AppHandle, workflows: Vec<Workflow>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(
        "workflows",
        serde_json::to_value(&workflows).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Load complete store data
#[tauri::command]
pub async fn load_store_data(app: tauri::AppHandle) -> Result<StoreData, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Load each field separately for flexibility
    let version: String = store
        .get("version")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_else(|| String::from("2.0.0"));

    let settings: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let projects = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let workflows = store
        .get("workflows")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let running_executions = store
        .get("runningExecutions")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let security_scans = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(StoreData {
        version,
        projects,
        workflows,
        running_executions,
        settings,
        security_scans,
    })
}

// ============================================================================
// Store Path Management Commands
// ============================================================================

/// Get current store path information
#[tauri::command]
pub async fn get_store_path(app: tauri::AppHandle) -> Result<StorePathInfo, String> {
    let config = load_store_config(&app)?;
    let default_dir = get_default_store_dir(&app)?;
    let default_path = default_dir.join(STORE_FILE);

    let (current_path, is_custom) = if let Some(custom_path) = &config.custom_store_path {
        let path = PathBuf::from(custom_path);
        // Verify the path is valid
        if path.exists() || path.parent().map(|p| p.exists()).unwrap_or(false) {
            (custom_path.clone(), true)
        } else {
            (default_path.to_string_lossy().to_string(), false)
        }
    } else {
        (default_path.to_string_lossy().to_string(), false)
    };

    Ok(StorePathInfo {
        current_path,
        default_path: default_path.to_string_lossy().to_string(),
        is_custom,
    })
}

/// Set custom store path and migrate data
#[tauri::command]
pub async fn set_store_path(
    app: tauri::AppHandle,
    new_path: String,
) -> Result<StorePathInfo, String> {
    let new_path_buf = PathBuf::from(&new_path);

    // Validate the new path
    if let Some(parent) = new_path_buf.parent() {
        if !parent.exists() {
            return Err(format!("Directory does not exist: {}", parent.display()));
        }
    } else {
        return Err("Invalid path".to_string());
    }

    // Get current store data from default location (tauri-plugin-store)
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Build current store data
    let current_data = StoreData {
        version: store
            .get("version")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_else(|| String::from("2.0.0")),
        settings: store
            .get("settings")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        projects: store
            .get("projects")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        workflows: store
            .get("workflows")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        running_executions: store
            .get("runningExecutions")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
        security_scans: store
            .get("securityScans")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default(),
    };

    // Write data to new location
    write_store_data_to_path(&new_path_buf, &current_data)?;

    // Update config to point to new path
    let config = StoreConfig {
        custom_store_path: Some(new_path.clone()),
    };
    save_store_config(&app, &config)?;

    let default_dir = get_default_store_dir(&app)?;
    let default_path = default_dir.join(STORE_FILE);

    Ok(StorePathInfo {
        current_path: new_path,
        default_path: default_path.to_string_lossy().to_string(),
        is_custom: true,
    })
}

/// Reset to default store path
#[tauri::command]
pub async fn reset_store_path(app: tauri::AppHandle) -> Result<StorePathInfo, String> {
    let config = load_store_config(&app)?;
    let default_dir = get_default_store_dir(&app)?;
    let default_path = default_dir.join(STORE_FILE);

    // If there's custom data, migrate it back to default location
    if let Some(custom_path) = &config.custom_store_path {
        let custom_path_buf = PathBuf::from(custom_path);
        if custom_path_buf.exists() {
            // Read custom data
            let custom_data = read_store_data_from_path(&custom_path_buf)?;

            // Write to default location using tauri-plugin-store
            let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
            store.set(
                "version",
                serde_json::to_value(&custom_data.version).map_err(|e| e.to_string())?,
            );
            store.set(
                "settings",
                serde_json::to_value(&custom_data.settings).map_err(|e| e.to_string())?,
            );
            store.set(
                "projects",
                serde_json::to_value(&custom_data.projects).map_err(|e| e.to_string())?,
            );
            store.set(
                "workflows",
                serde_json::to_value(&custom_data.workflows).map_err(|e| e.to_string())?,
            );
            store.set(
                "runningExecutions",
                serde_json::to_value(&custom_data.running_executions).map_err(|e| e.to_string())?,
            );
            store.set(
                "securityScans",
                serde_json::to_value(&custom_data.security_scans).map_err(|e| e.to_string())?,
            );
            store.save().map_err(|e| e.to_string())?;
        }
    }

    // Clear custom path from config
    let new_config = StoreConfig {
        custom_store_path: None,
    };
    save_store_config(&app, &new_config)?;

    let current_path = default_path.to_string_lossy().to_string();

    Ok(StorePathInfo {
        current_path: current_path.clone(),
        default_path: current_path,
        is_custom: false,
    })
}

/// Open store file location in file explorer
#[tauri::command]
pub async fn open_store_location(app: tauri::AppHandle) -> Result<(), String> {
    let path_info = get_store_path(app.clone()).await?;
    let path = PathBuf::from(&path_info.current_path);

    // reveal_item_in_dir expects the file path, not directory
    // It will open Finder and highlight the file
    if path.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&path)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    } else if let Some(parent) = path.parent() {
        // Ensure the parent directory exists before opening
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        // If file doesn't exist, open the parent directory
        tauri_plugin_opener::open_path(parent.to_string_lossy().to_string(), None::<&str>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}
