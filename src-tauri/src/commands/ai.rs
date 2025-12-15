// AI Commands
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Tauri commands for AI service management and commit message generation.
// Now using AIRepository for SQLite-based storage.

use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::models::ai::{
    AIProvider, AIServiceConfig, AddServiceRequest, AddTemplateRequest, ChatMessage, ChatOptions,
    GenerateCommitMessageRequest, GenerateResult, ModelInfo, PromptTemplate, ProjectAISettings,
    TemplateCategory, TestConnectionResult, UpdateProjectSettingsRequest, UpdateServiceRequest,
    UpdateTemplateRequest,
};
use crate::repositories::AIRepository;
use crate::services::ai::{
    create_provider, AIKeychain, AIError,
};
use crate::services::ai::diff::get_staged_diff;
use crate::utils::database::Database;
use crate::DatabaseState;

// ============================================================================
// Helper Functions
// ============================================================================

/// Get Database from AppHandle
fn get_db(app: &AppHandle) -> Database {
    let db_state = app.state::<DatabaseState>();
    db_state.0.as_ref().clone()
}

/// Get AIRepository from AppHandle
fn get_ai_repo(app: &AppHandle) -> AIRepository {
    AIRepository::new(get_db(app))
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

// ============================================================================
// AI Service Commands
// ============================================================================

/// List all AI service configurations
#[tauri::command]
pub async fn ai_list_services(
    app: AppHandle,
) -> Result<ApiResponse<Vec<AIServiceConfig>>, String> {
    let repo = get_ai_repo(&app);
    match repo.list_services() {
        Ok(services) => Ok(ApiResponse::success(services)),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Add a new AI service configuration
#[tauri::command]
pub async fn ai_add_service(
    app: AppHandle,
    config: AddServiceRequest,
) -> Result<ApiResponse<AIServiceConfig>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Check for duplicate name
    if repo.service_name_exists(&config.name, None).unwrap_or(false) {
        return Ok(ApiResponse::error(format!("Service name '{}' already exists", config.name)));
    }

    // Create service config
    let service = AIServiceConfig::new(
        config.name,
        config.provider.clone(),
        config.endpoint,
        config.model,
    );

    // Save service config first (required for API key foreign key constraint)
    if let Err(e) = repo.save_service(&service) {
        return Ok(ApiResponse::error(e));
    }

    // Store API key if provided (after service is saved due to foreign key constraint)
    if let Some(ref api_key) = config.api_key {
        if !api_key.is_empty() {
            if let Err(e) = keychain.store_api_key(&service.id, api_key) {
                // Rollback: delete the service if API key storage fails
                let _ = repo.delete_service(&service.id);
                return Ok(ApiResponse::error(format!("Failed to store API key: {}", e)));
            }
        }
    }

    let _ = app.emit("ai:services-updated", ());

    Ok(ApiResponse::success(service))
}

/// Update an AI service configuration
#[tauri::command]
pub async fn ai_update_service(
    app: AppHandle,
    config: UpdateServiceRequest,
) -> Result<ApiResponse<AIServiceConfig>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Get existing service
    let existing = match repo.get_service(&config.id) {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", config.id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Check for duplicate name (excluding self)
    if let Some(ref name) = config.name {
        if repo.service_name_exists(name, Some(&config.id)).unwrap_or(false) {
            return Ok(ApiResponse::error(format!("Service name '{}' already exists", name)));
        }
    }

    // Update fields
    let updated = AIServiceConfig {
        id: existing.id,
        name: config.name.unwrap_or(existing.name),
        provider: existing.provider,
        endpoint: config.endpoint.unwrap_or(existing.endpoint),
        model: config.model.unwrap_or(existing.model),
        is_default: existing.is_default,
        is_enabled: config.is_enabled.unwrap_or(existing.is_enabled),
        created_at: existing.created_at,
        updated_at: chrono::Utc::now(),
    };

    // Update API key if provided
    if let Some(api_key) = config.api_key {
        if !api_key.is_empty() {
            if let Err(e) = keychain.store_api_key(&updated.id, &api_key) {
                return Ok(ApiResponse::error(e.to_string()));
            }
        }
    }

    // Save updated config
    match repo.save_service(&updated) {
        Ok(()) => {
            let _ = app.emit("ai:services-updated", ());
            Ok(ApiResponse::success(updated))
        }
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Delete an AI service configuration
#[tauri::command]
pub async fn ai_delete_service(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Delete API key
    let _ = keychain.delete_api_key(&id);

    // Delete service config
    match repo.delete_service(&id) {
        Ok(_) => {
            let _ = app.emit("ai:services-updated", ());
            Ok(ApiResponse::success(()))
        }
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Set a service as the default
#[tauri::command]
pub async fn ai_set_default_service(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);
    match repo.set_default_service(&id) {
        Ok(()) => {
            let _ = app.emit("ai:services-updated", ());
            Ok(ApiResponse::success(()))
        }
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Test connection to an AI service
#[tauri::command]
pub async fn ai_test_connection(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<TestConnectionResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get service config
    let service = match repo.get_service(&id) {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Get API key if needed
    let api_key = match keychain.get_api_key(&id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", id, e);
            return Ok(ApiResponse::success(TestConnectionResult {
                success: false,
                latency_ms: None,
                models: None,
                error: Some(format!("Failed to retrieve API key: {}", e)),
            }));
        }
    };

    // Create provider
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ApiResponse::success(TestConnectionResult {
                success: false,
                latency_ms: None,
                models: None,
                error: Some(e.to_string()),
            }));
        }
    };

    // Test connection
    let start = std::time::Instant::now();
    match provider.test_connection().await {
        Ok(true) => {
            let latency = start.elapsed().as_millis() as u64;

            // Try to list models
            let models = provider.list_models().await.ok().map(|m| {
                m.into_iter().map(|info| info.name).collect()
            });

            Ok(ApiResponse::success(TestConnectionResult {
                success: true,
                latency_ms: Some(latency),
                models,
                error: None,
            }))
        }
        Ok(false) => Ok(ApiResponse::success(TestConnectionResult {
            success: false,
            latency_ms: None,
            models: None,
            error: Some("Connection test failed".to_string()),
        })),
        Err(e) => Ok(ApiResponse::success(TestConnectionResult {
            success: false,
            latency_ms: None,
            models: None,
            error: Some(e.to_string()),
        })),
    }
}

/// List available models for a service (Ollama/LMStudio)
#[tauri::command]
pub async fn ai_list_models(
    app: AppHandle,
    service_id: String,
) -> Result<ApiResponse<Vec<ModelInfo>>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get service config
    let service = match repo.get_service(&service_id) {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", service_id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Get API key if needed
    let api_key = match keychain.get_api_key(&service_id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service_id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Create provider
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // List models
    match provider.list_models().await {
        Ok(models) => Ok(ApiResponse::success(models)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Probe available models for a provider/endpoint without saving a service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeModelsRequest {
    pub provider: AIProvider,
    pub endpoint: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[tauri::command]
pub async fn ai_probe_models(
    _app: AppHandle,
    request: ProbeModelsRequest,
) -> Result<ApiResponse<Vec<ModelInfo>>, String> {
    // Build a temporary config to reuse provider implementations
    let config = AIServiceConfig::new(
        "Temporary".to_string(),
        request.provider.clone(),
        request.endpoint,
        request
            .model
            .unwrap_or_else(|| request.provider.default_model().to_string()),
    );

    let provider = match create_provider(config, request.api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    match provider.list_models().await {
        Ok(models) => Ok(ApiResponse::success(models)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

// ============================================================================
// Prompt Template Commands
// ============================================================================

/// List all prompt templates
#[tauri::command]
pub async fn ai_list_templates(
    app: AppHandle,
) -> Result<ApiResponse<Vec<PromptTemplate>>, String> {
    let repo = get_ai_repo(&app);

    // Get templates from SQLite
    let mut templates = match repo.list_templates() {
        Ok(t) => t,
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Ensure built-in templates exist
    let builtins = PromptTemplate::all_builtins();
    for builtin in builtins {
        if !templates.iter().any(|t| t.id == builtin.id) {
            // Save built-in template to database
            let _ = repo.save_template(&builtin);
            templates.insert(0, builtin);
        }
    }

    Ok(ApiResponse::success(templates))
}

/// Add a new prompt template
#[tauri::command]
pub async fn ai_add_template(
    app: AppHandle,
    template: AddTemplateRequest,
) -> Result<ApiResponse<PromptTemplate>, String> {
    let repo = get_ai_repo(&app);

    // Check for duplicate name
    if repo.template_name_exists(&template.name, None).unwrap_or(false) {
        return Ok(ApiResponse::error(format!("Template name '{}' already exists", template.name)));
    }

    let new_template = PromptTemplate::new(
        template.name,
        template.description,
        template.category,
        template.template,
        template.output_format,
    );

    // Validate template has required variables for its category
    if let Err(msg) = new_template.validate_variables() {
        return Ok(ApiResponse::error(msg));
    }

    match repo.save_template(&new_template) {
        Ok(()) => Ok(ApiResponse::success(new_template)),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Update a prompt template
#[tauri::command]
pub async fn ai_update_template(
    app: AppHandle,
    template: UpdateTemplateRequest,
) -> Result<ApiResponse<PromptTemplate>, String> {
    let repo = get_ai_repo(&app);

    // Get existing template
    let existing = match repo.get_template(&template.id) {
        Ok(Some(t)) => t,
        Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", template.id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Cannot modify built-in templates
    if existing.is_builtin {
        return Ok(ApiResponse::error(format!("Cannot modify built-in template: {}", existing.name)));
    }

    // Check for duplicate name (excluding self)
    if let Some(ref name) = template.name {
        if repo.template_name_exists(name, Some(&template.id)).unwrap_or(false) {
            return Ok(ApiResponse::error(format!("Template name '{}' already exists", name)));
        }
    }

    // Update fields
    let updated = PromptTemplate {
        id: existing.id,
        name: template.name.unwrap_or(existing.name),
        description: template.description.or(existing.description),
        category: existing.category,
        template: template.template.unwrap_or(existing.template),
        output_format: template.output_format.or(existing.output_format),
        is_default: existing.is_default,
        is_builtin: existing.is_builtin,
        created_at: existing.created_at,
        updated_at: chrono::Utc::now(),
    };

    // Validate template has required variables for its category
    if let Err(msg) = updated.validate_variables() {
        return Ok(ApiResponse::error(msg));
    }

    match repo.save_template(&updated) {
        Ok(()) => Ok(ApiResponse::success(updated)),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Delete a prompt template
#[tauri::command]
pub async fn ai_delete_template(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);

    // Check if template exists and is not built-in
    if let Ok(Some(template)) = repo.get_template(&id) {
        if template.is_builtin {
            return Ok(ApiResponse::error(format!("Cannot delete built-in template: {}", template.name)));
        }
    }

    match repo.delete_template(&id) {
        Ok(_) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Set a template as the default
#[tauri::command]
pub async fn ai_set_default_template(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);
    match repo.set_default_template(&id) {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

// ============================================================================
// Project AI Settings Commands
// ============================================================================

/// Get project-specific AI settings
#[tauri::command]
pub async fn ai_get_project_settings(
    app: AppHandle,
    project_path: String,
) -> Result<ApiResponse<ProjectAISettings>, String> {
    let repo = get_ai_repo(&app);
    match repo.get_project_settings(&project_path) {
        Ok(settings) => Ok(ApiResponse::success(settings)),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Update project-specific AI settings
#[tauri::command]
pub async fn ai_update_project_settings(
    app: AppHandle,
    settings: UpdateProjectSettingsRequest,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);

    let project_settings = ProjectAISettings {
        project_path: settings.project_path,
        preferred_service_id: settings.preferred_service_id,
        preferred_template_id: settings.preferred_template_id,
    };

    match repo.save_project_settings(&project_settings) {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

// ============================================================================
// Commit Message Generation Commands
// ============================================================================

/// Generate a commit message using AI
#[tauri::command]
pub async fn ai_generate_commit_message(
    app: AppHandle,
    request: GenerateCommitMessageRequest,
) -> Result<ApiResponse<GenerateResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get the diff from the project
    let diff_result = match get_staged_diff(Path::new(&request.project_path)) {
        Ok(diff) => diff,
        Err(AIError::NoStagedChanges) => {
            return Ok(ApiResponse::error("No staged changes, please stage files first"));
        }
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Get project settings for preferred service/template
    let project_settings = repo.get_project_settings(&request.project_path)
        .unwrap_or_default();

    // Determine which service to use
    let service_id = request.service_id
        .or(project_settings.preferred_service_id);

    let service = if let Some(id) = service_id {
        match repo.get_service(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_service() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Determine which template to use
    let template_id = request.template_id
        .or(project_settings.preferred_template_id);

    let template = if let Some(id) = template_id {
        match repo.get_template(&id) {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        // Get default template for GitCommit category
        match repo.get_default_template(Some(&TemplateCategory::GitCommit)) {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_git_conventional(),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Get API key if needed
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Create provider
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Prepare the prompt
    let prompt = template.render_with_diff(&diff_result.diff);

    // Call the AI service
    let messages = vec![ChatMessage::user(prompt)];
    let options = ChatOptions {
        temperature: Some(0.3), // Lower temperature for more consistent output
        max_tokens: Some(500),  // Commit messages should be concise
        top_p: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            // Clean up the response (remove quotes, extra whitespace)
            let message = response.content
                .trim()
                .trim_matches('"')
                .trim_matches('`')
                .to_string();

            Ok(ApiResponse::success(GenerateResult {
                message,
                tokens_used: response.tokens_used,
            }))
        }
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

// ============================================================================
// Diagnostic Commands
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub service_id: String,
    pub exists_in_db: bool,
    pub can_decrypt: bool,
    pub key_prefix: Option<String>,
    pub error: Option<String>,
}

/// Manually store an API key for a service (diagnostic command)
#[tauri::command]
pub async fn ai_store_api_key(
    app: AppHandle,
    service_id: String,
    api_key: String,
) -> Result<ApiResponse<String>, String> {
    let keychain = AIKeychain::new(app);

    match keychain.store_api_key(&service_id, &api_key) {
        Ok(()) => Ok(ApiResponse::success("API key stored successfully".to_string())),
        Err(e) => Ok(ApiResponse::error(format!("Failed to store API key: {}", e))),
    }
}

/// Check API key status for a service (diagnostic command)
#[tauri::command]
pub async fn ai_check_api_key_status(
    app: AppHandle,
    service_id: String,
) -> Result<ApiResponse<ApiKeyStatus>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Check if key exists in database
    let exists_in_db = repo.has_api_key(&service_id).unwrap_or(false);

    if !exists_in_db {
        return Ok(ApiResponse::success(ApiKeyStatus {
            service_id,
            exists_in_db: false,
            can_decrypt: false,
            key_prefix: None,
            error: Some("API key not found in database".to_string()),
        }));
    }

    // Try to decrypt
    match keychain.get_api_key(&service_id) {
        Ok(Some(key)) => {
            // Show first 4 chars of key for verification
            let prefix = if key.len() >= 4 {
                Some(format!("{}...", &key[..4]))
            } else {
                Some("****".to_string())
            };
            Ok(ApiResponse::success(ApiKeyStatus {
                service_id,
                exists_in_db: true,
                can_decrypt: true,
                key_prefix: prefix,
                error: None,
            }))
        }
        Ok(None) => Ok(ApiResponse::success(ApiKeyStatus {
            service_id,
            exists_in_db: true,
            can_decrypt: false,
            key_prefix: None,
            error: Some("Key exists but could not be retrieved".to_string()),
        })),
        Err(e) => Ok(ApiResponse::success(ApiKeyStatus {
            service_id,
            exists_in_db: true,
            can_decrypt: false,
            key_prefix: None,
            error: Some(format!("Decryption error: {}", e)),
        })),
    }
}
