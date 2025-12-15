// Settings commands for data persistence
// Implements US7: Data Persistence Across Sessions
// Updated to use SQLite database for storage

use crate::models::{Project, Workflow};
use crate::repositories::{ProjectRepository, SettingsRepository, WorkflowRepository};
use crate::services::crypto;
use crate::utils::database::get_database_path;
use crate::utils::store::{AppSettings, StoreData};
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

/// Load all projects from SQLite database
#[tauri::command]
pub async fn load_projects(db: tauri::State<'_, DatabaseState>) -> Result<Vec<Project>, String> {
    let repo = ProjectRepository::new(db.0.as_ref().clone());
    repo.list()
}

/// Save projects to SQLite database
/// Note: This replaces ALL projects - use save_project for single project updates
#[tauri::command]
pub async fn save_projects(
    db: tauri::State<'_, DatabaseState>,
    projects: Vec<Project>,
) -> Result<(), String> {
    let repo = ProjectRepository::new(db.0.as_ref().clone());

    // Get existing projects to determine which ones to delete
    let existing = repo.list()?;
    let new_ids: std::collections::HashSet<_> = projects.iter().map(|p| p.id.as_str()).collect();

    // Delete projects that are no longer in the new list
    for existing_project in &existing {
        if !new_ids.contains(existing_project.id.as_str()) {
            repo.delete(&existing_project.id)?;
        }
    }

    // Save all projects (insert or update)
    for project in &projects {
        repo.save(project)?;
    }

    Ok(())
}

/// Load all workflows from SQLite database
/// Decrypts webhook tokens from separate encrypted storage
#[tauri::command]
pub async fn load_workflows(db: tauri::State<'_, DatabaseState>) -> Result<Vec<Workflow>, String> {
    let repo = WorkflowRepository::new(db.0.as_ref().clone());
    let mut workflows = repo.list()?;

    // Decrypt webhook tokens for each workflow
    for workflow in &mut workflows {
        if let Some(ref mut incoming_webhook) = workflow.incoming_webhook {
            println!(
                "[load_workflows] Workflow {} has incoming_webhook: enabled={}, token_len={}, token_created_at={}",
                workflow.id,
                incoming_webhook.enabled,
                incoming_webhook.token.len(),
                incoming_webhook.token_created_at
            );
            // Try to get encrypted token
            match repo.get_webhook_token(&workflow.id) {
                Ok(Some((ciphertext, nonce))) => {
                    println!(
                        "[load_workflows] Found encrypted token for workflow {}, decrypting...",
                        workflow.id
                    );
                    let encrypted = crypto::EncryptedData { ciphertext, nonce };
                    match crypto::decrypt(&encrypted) {
                        Ok(decrypted) => {
                            println!(
                                "[load_workflows] Successfully decrypted token for workflow {}, len={}",
                                workflow.id,
                                decrypted.len()
                            );
                            incoming_webhook.token = decrypted;
                        }
                        Err(e) => {
                            println!(
                                "[load_workflows] Failed to decrypt token for workflow {}: {}",
                                workflow.id, e
                            );
                            // Decryption failed - token is unusable, reset enabled to false
                            if incoming_webhook.enabled {
                                println!(
                                    "[load_workflows] Workflow {} has enabled=true but decryption failed, resetting enabled to false",
                                    workflow.id
                                );
                                incoming_webhook.enabled = false;
                            }
                        }
                    }
                }
                Ok(None) => {
                    println!(
                        "[load_workflows] No encrypted token found in webhook_tokens table for workflow {}",
                        workflow.id
                    );
                    if !incoming_webhook.token.is_empty() {
                        // Legacy: token is still in plaintext in JSON, migrate it
                        log::info!(
                            "Migrating webhook token for workflow {} to encrypted storage",
                            workflow.id
                        );
                        if let Ok(encrypted) = crypto::encrypt(&incoming_webhook.token) {
                            let _ = repo.store_webhook_token(
                                &workflow.id,
                                &encrypted.ciphertext,
                                &encrypted.nonce,
                            );
                            // Note: We keep the token in the workflow for this load,
                            // it will be cleared on next save
                        }
                    } else if incoming_webhook.enabled {
                        // Token is missing but enabled is true - this is an invalid state
                        // (likely caused by a previous bug where token wasn't saved properly)
                        // Reset enabled to false to reflect the actual state
                        println!(
                            "[load_workflows] Workflow {} has enabled=true but no token, resetting enabled to false",
                            workflow.id
                        );
                        incoming_webhook.enabled = false;
                    }
                }
                Err(e) => {
                    println!(
                        "[load_workflows] Error getting webhook token for workflow {}: {}",
                        workflow.id, e
                    );
                }
            }
        } else {
            println!(
                "[load_workflows] Workflow {} has no incoming_webhook",
                workflow.id
            );
        }
    }

    // DEBUG: Log project_id for each workflow before returning
    println!("=== [load_workflows] RETURNING {} workflows ===", workflows.len());
    for w in &workflows {
        println!("[load_workflows] - id={}, name={}, project_id={:?}", w.id, w.name, w.project_id);
    }

    Ok(workflows)
}

/// Save workflows to SQLite database
///
/// # Important: Data Integrity Warning
/// This function REPLACES ALL workflows in the database with the provided list.
/// If the workflows parameter contains stale data (e.g., missing project_id),
/// it will OVERWRITE the correct data in the database.
///
/// # Recommended Usage
/// - For single workflow updates, use `save_workflow` instead
/// - Only use this function for bulk operations like import/export
/// - Always ensure workflows loaded from `load_workflows` are used immediately
///   without modification to avoid data loss
///
/// # Token Encryption
/// Encrypts webhook tokens to separate storage for security
#[tauri::command]
pub async fn save_workflows(
    db: tauri::State<'_, DatabaseState>,
    workflows: Vec<Workflow>,
) -> Result<(), String> {
    // DEBUG: Track who is calling save_workflows and with what data
    println!("=== [save_workflows] CALLED ===");
    println!("[save_workflows] workflow count: {}", workflows.len());
    for w in &workflows {
        println!("[save_workflows] - id={}, name={}, project_id={:?}", w.id, w.name, w.project_id);
    }
    println!("=== [save_workflows] END ===");

    let repo = WorkflowRepository::new(db.0.as_ref().clone());

    // Get existing workflows to determine which ones to delete
    let existing = repo.list()?;
    let new_ids: std::collections::HashSet<_> = workflows.iter().map(|w| w.id.as_str()).collect();

    // Delete workflows that are no longer in the new list
    for existing_workflow in &existing {
        if !new_ids.contains(existing_workflow.id.as_str()) {
            repo.delete(&existing_workflow.id)?;
            // Also delete the webhook token
            let _ = repo.delete_webhook_token(&existing_workflow.id);
        }
    }

    // Save all workflows (insert or update) with token encryption
    // IMPORTANT: Save workflow FIRST, then token
    // This is because webhook_tokens has ON DELETE CASCADE reference to workflows.
    // INSERT OR REPLACE on workflows triggers DELETE + INSERT, which would cascade
    // delete any existing token if we saved the token first.
    for workflow in &workflows {
        let mut workflow_to_save = workflow.clone();

        // Extract token before clearing it (we'll save it after workflow)
        let token_to_save = if let Some(ref mut iw) = workflow_to_save.incoming_webhook {
            if !iw.token.is_empty() {
                let token = iw.token.clone();
                iw.token = String::new(); // Clear from JSON
                Some(token)
            } else {
                None
            }
        } else {
            None
        };

        // Step 1: Save workflow first
        repo.save(&workflow_to_save)?;

        // Step 2: Now save the token (after workflow exists in DB)
        if let Some(token) = token_to_save {
            let encrypted = crypto::encrypt(&token)
                .map_err(|e| format!("Failed to encrypt webhook token: {}", e))?;
            repo.store_webhook_token(&workflow.id, &encrypted.ciphertext, &encrypted.nonce)?;
        }
    }

    Ok(())
}

/// Load complete store data from SQLite database
/// Used for data export and backup functionality
#[tauri::command]
pub async fn load_store_data(db: tauri::State<'_, DatabaseState>) -> Result<StoreData, String> {
    use crate::repositories::{ExecutionRepository, SecurityRepository};

    let project_repo = ProjectRepository::new(db.0.as_ref().clone());
    let workflow_repo = WorkflowRepository::new(db.0.as_ref().clone());
    let settings_repo = SettingsRepository::new(db.0.as_ref().clone());
    let security_repo = SecurityRepository::new(db.0.as_ref().clone());
    let execution_repo = ExecutionRepository::new(db.0.as_ref().clone());

    // Load all data from repositories
    let projects = project_repo.list()?;
    let workflows = workflow_repo.list()?;
    let settings = settings_repo.get_app_settings()?;
    let security_scans = security_repo.list_all()?;
    let running_executions = execution_repo.list_running_as_map()?;

    Ok(StoreData {
        version: String::from("3.0.0"), // SQLite version
        projects,
        workflows,
        running_executions,
        settings,
        security_scans,
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

    // reveal_item_in_dir expects the file path, not directory
    // It will open Finder and highlight the file
    if db_path.exists() {
        tauri_plugin_opener::reveal_item_in_dir(&db_path)
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    } else if let Some(parent) = db_path.parent() {
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
