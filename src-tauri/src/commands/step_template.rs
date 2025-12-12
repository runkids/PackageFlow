// Step Template commands for custom template management
// Stores custom templates in the Tauri store

use crate::models::step_template::{
    CustomStepTemplate, CustomTemplateResponse, ListCustomTemplatesResponse,
};
use crate::utils::store::STORE_FILE;
use tauri_plugin_store::StoreExt;

const CUSTOM_TEMPLATES_KEY: &str = "customStepTemplates";

/// Load all custom templates from store
#[tauri::command]
pub async fn load_custom_step_templates(
    app: tauri::AppHandle,
) -> Result<ListCustomTemplatesResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let templates: Vec<CustomStepTemplate> = store
        .get(CUSTOM_TEMPLATES_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(ListCustomTemplatesResponse {
        success: true,
        templates: Some(templates),
        error: None,
    })
}

/// Save a custom template to store
#[tauri::command]
pub async fn save_custom_step_template(
    app: tauri::AppHandle,
    template: CustomStepTemplate,
) -> Result<CustomTemplateResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Load existing templates
    let mut templates: Vec<CustomStepTemplate> = store
        .get(CUSTOM_TEMPLATES_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Check if template with same ID exists and update, otherwise add
    if let Some(index) = templates.iter().position(|t| t.id == template.id) {
        templates[index] = template.clone();
    } else {
        templates.push(template.clone());
    }

    // Save to store
    store.set(
        CUSTOM_TEMPLATES_KEY,
        serde_json::to_value(&templates).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(CustomTemplateResponse {
        success: true,
        template: Some(template),
        error: None,
    })
}

/// Delete a custom template from store
#[tauri::command]
pub async fn delete_custom_step_template(
    app: tauri::AppHandle,
    template_id: String,
) -> Result<CustomTemplateResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Load existing templates
    let mut templates: Vec<CustomStepTemplate> = store
        .get(CUSTOM_TEMPLATES_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Find and remove template
    let original_len = templates.len();
    templates.retain(|t| t.id != template_id);

    if templates.len() == original_len {
        return Ok(CustomTemplateResponse {
            success: false,
            template: None,
            error: Some(format!("Template with ID '{}' not found", template_id)),
        });
    }

    // Save to store
    store.set(
        CUSTOM_TEMPLATES_KEY,
        serde_json::to_value(&templates).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(CustomTemplateResponse {
        success: true,
        template: None,
        error: None,
    })
}
