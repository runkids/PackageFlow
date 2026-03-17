// Settings commands for data persistence
// Implements US7: Data Persistence Across Sessions
// Updated to use SQLite database for storage

use crate::models::Workflow;
use crate::repositories::{SettingsRepository, WorkflowRepository};
use crate::utils::database::get_database_path;
use crate::utils::store::{AppSettings, NotificationSettings, StoreData};
use crate::DatabaseState;

/// Response for get_store_path command
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorePathInfo {
    pub current_path: String,
    pub default_path: String,
    pub is_custom: bool,
}

/// Load settings from SQLite database
#[tauri::command]
pub async fn load_settings(db: tauri::State<'_, DatabaseState>) -> Result<AppSettings, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.get_app_settings()
}

/// Save settings to SQLite database
#[tauri::command]
pub async fn save_settings(
    db: tauri::State<'_, DatabaseState>,
    settings: AppSettings,
) -> Result<(), String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.save_app_settings(&settings)
}

// ============================================================================
// Notification Settings Commands
// ============================================================================

/// Load notification settings from SQLite database
#[tauri::command]
pub async fn load_notification_settings(
    db: tauri::State<'_, DatabaseState>,
) -> Result<NotificationSettings, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.get_notification_settings()
}

/// Save notification settings to SQLite database
#[tauri::command]
pub async fn save_notification_settings(
    db: tauri::State<'_, DatabaseState>,
    settings: NotificationSettings,
) -> Result<(), String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.save_notification_settings(&settings)
}

/// Load all projects from SQLite database
/// Stub: Projects feature has been removed
#[tauri::command]
pub async fn load_projects(_db: tauri::State<'_, DatabaseState>) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

/// Save projects to SQLite database
/// Stub: Projects feature has been removed
#[tauri::command]
pub async fn save_projects(
    _db: tauri::State<'_, DatabaseState>,
    _projects: Vec<serde_json::Value>,
) -> Result<(), String> {
    Ok(())
}

/// Load all workflows from SQLite database
#[tauri::command]
pub async fn load_workflows(db: tauri::State<'_, DatabaseState>) -> Result<Vec<Workflow>, String> {
    let repo = WorkflowRepository::new(db.0.as_ref().clone());
    let workflows = repo.list()?;
    Ok(workflows)
}

/// Save workflows to SQLite database
#[tauri::command]
pub async fn save_workflows(
    db: tauri::State<'_, DatabaseState>,
    workflows: Vec<Workflow>,
) -> Result<(), String> {
    let repo = WorkflowRepository::new(db.0.as_ref().clone());

    // Get existing workflows to determine which ones to delete
    let existing = repo.list()?;
    let new_ids: std::collections::HashSet<_> = workflows.iter().map(|w| w.id.as_str()).collect();

    // Delete workflows that are no longer in the new list
    for existing_workflow in &existing {
        if !new_ids.contains(existing_workflow.id.as_str()) {
            repo.delete(&existing_workflow.id)?;
        }
    }

    // Save all workflows (insert or update)
    for workflow in &workflows {
        repo.save(workflow)?;
    }

    Ok(())
}

/// Load complete store data from SQLite database
/// Used for data export and backup functionality
#[tauri::command]
pub async fn load_store_data(db: tauri::State<'_, DatabaseState>) -> Result<StoreData, String> {
    let workflow_repo = WorkflowRepository::new(db.0.as_ref().clone());
    let settings_repo = SettingsRepository::new(db.0.as_ref().clone());

    let workflows = workflow_repo.list()?;
    let settings = settings_repo.get_app_settings()?;

    Ok(StoreData {
        version: String::from("3.0.0"),
        workflows,
        running_executions: std::collections::HashMap::new(),
        settings,
    })
}

// ============================================================================
// Store Path Management Commands
// Note: These commands now report SQLite database location.
// Custom path functionality is deprecated with SQLite storage.
// ============================================================================

/// Get current store path information
/// Returns the SQLite database file path
#[tauri::command]
pub async fn get_store_path(_app: tauri::AppHandle) -> Result<StorePathInfo, String> {
    let db_path = get_database_path()?;
    let path_str = db_path.to_string_lossy().to_string();

    Ok(StorePathInfo {
        current_path: path_str.clone(),
        default_path: path_str,
        is_custom: false, // SQLite always uses fixed location
    })
}

/// Set custom store path
/// Deprecated: SQLite databases use a fixed location for WAL mode compatibility
#[tauri::command]
pub async fn set_store_path(
    _app: tauri::AppHandle,
    _new_path: String,
) -> Result<StorePathInfo, String> {
    Err("Custom storage path is not supported with SQLite database. \
         The database uses a fixed location for optimal performance and WAL mode compatibility."
        .to_string())
}

/// Reset to default store path
/// No-op with SQLite: database already uses default location
#[tauri::command]
pub async fn reset_store_path(_app: tauri::AppHandle) -> Result<StorePathInfo, String> {
    let db_path = get_database_path()?;
    let path_str = db_path.to_string_lossy().to_string();

    Ok(StorePathInfo {
        current_path: path_str.clone(),
        default_path: path_str,
        is_custom: false,
    })
}

/// Open store file location in file explorer
/// Opens the SQLite database file location
#[tauri::command]
pub async fn open_store_location(_app: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_database_path()?;

    if db_path.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&db_path)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    } else if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        tauri_plugin_opener::open_path(parent.to_string_lossy().to_string(), None::<&str>)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

// ============================================================================
// Template Preferences Commands
// Manages favorites, recently used, collapsed categories, and view mode
// ============================================================================

use crate::repositories::{TemplatePreferences, TemplateViewMode};

/// Get template preferences
#[tauri::command]
pub async fn get_template_preferences(
    db: tauri::State<'_, DatabaseState>,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.get_template_preferences()
}

/// Toggle a template favorite (add if not exists, remove if exists)
#[tauri::command]
pub async fn toggle_template_favorite(
    db: tauri::State<'_, DatabaseState>,
    template_id: String,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.toggle_template_favorite(&template_id)
}

/// Add a template to favorites
#[tauri::command]
pub async fn add_template_favorite(
    db: tauri::State<'_, DatabaseState>,
    template_id: String,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.add_template_favorite(&template_id)
}

/// Remove a template from favorites
#[tauri::command]
pub async fn remove_template_favorite(
    db: tauri::State<'_, DatabaseState>,
    template_id: String,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.remove_template_favorite(&template_id)
}

/// Record template usage (adds to recently used list)
#[tauri::command]
pub async fn record_template_usage(
    db: tauri::State<'_, DatabaseState>,
    template_id: String,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.record_template_usage(&template_id)
}

/// Clear recently used templates
#[tauri::command]
pub async fn clear_recently_used_templates(
    db: tauri::State<'_, DatabaseState>,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.clear_recently_used_templates()
}

/// Toggle category collapse state
#[tauri::command]
pub async fn toggle_template_category_collapse(
    db: tauri::State<'_, DatabaseState>,
    category_id: String,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.toggle_template_category_collapse(&category_id)
}

/// Expand all categories
#[tauri::command]
pub async fn expand_all_template_categories(
    db: tauri::State<'_, DatabaseState>,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.expand_all_template_categories()
}

/// Collapse specific categories
#[tauri::command]
pub async fn collapse_template_categories(
    db: tauri::State<'_, DatabaseState>,
    category_ids: Vec<String>,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.collapse_template_categories(category_ids)
}

/// Set preferred view mode
#[tauri::command]
pub async fn set_template_preferred_view(
    db: tauri::State<'_, DatabaseState>,
    view: TemplateViewMode,
) -> Result<TemplatePreferences, String> {
    let repo = SettingsRepository::new(db.0.as_ref().clone());
    repo.set_template_preferred_view(view)
}
