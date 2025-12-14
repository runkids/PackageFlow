// AI Commands
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Tauri commands for AI service management and commit message generation.

use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::models::ai::{
    AIServiceConfig, AddServiceRequest, AddTemplateRequest, GenerateCommitMessageRequest,
    GenerateResult, ModelInfo, PromptTemplate, ProjectAISettings, TemplateCategory,
    TestConnectionResult, UpdateProjectSettingsRequest, UpdateServiceRequest,
    UpdateTemplateRequest, ChatMessage, ChatOptions,
};
use crate::services::ai::{
    create_provider, AIKeychain, AIStorage, AIResult, AIError,
};
use crate::services::ai::diff::{get_staged_diff, DiffAnalysis};

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
    let storage = AIStorage::new(app);
    match storage.list_services().await {
        Ok(services) => Ok(ApiResponse::success(services)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Add a new AI service configuration
#[tauri::command]
pub async fn ai_add_service(
    app: AppHandle,
    config: AddServiceRequest,
) -> Result<ApiResponse<AIServiceConfig>, String> {
    let storage = AIStorage::new(app.clone());
    let keychain = AIKeychain::new(app);

    // Create service config
    let service = AIServiceConfig::new(
        config.name,
        config.provider.clone(),
        config.endpoint,
        config.model,
    );

    // Store API key if provided
    if let Some(api_key) = config.api_key {
        if !api_key.is_empty() {
            if let Err(e) = keychain.store_api_key(&service.id, &api_key) {
                return Ok(ApiResponse::error(e.to_string()));
            }
        }
    }

    // Save service config
    match storage.add_service(service).await {
        Ok(saved) => Ok(ApiResponse::success(saved)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Update an AI service configuration
#[tauri::command]
pub async fn ai_update_service(
    app: AppHandle,
    config: UpdateServiceRequest,
) -> Result<ApiResponse<AIServiceConfig>, String> {
    let storage = AIStorage::new(app.clone());
    let keychain = AIKeychain::new(app);

    // Get existing service
    let existing = match storage.get_service(&config.id).await {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", config.id))),
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

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
    match storage.update_service(updated).await {
        Ok(saved) => Ok(ApiResponse::success(saved)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Delete an AI service configuration
#[tauri::command]
pub async fn ai_delete_service(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let storage = AIStorage::new(app.clone());
    let keychain = AIKeychain::new(app);

    // Delete API key
    let _ = keychain.delete_api_key(&id);

    // Delete service config
    match storage.delete_service(&id).await {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Set a service as the default
#[tauri::command]
pub async fn ai_set_default_service(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let storage = AIStorage::new(app);
    match storage.set_default_service(&id).await {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Test connection to an AI service
#[tauri::command]
pub async fn ai_test_connection(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<TestConnectionResult>, String> {
    let storage = AIStorage::new(app.clone());
    let keychain = AIKeychain::new(app);

    // Get service config
    let service = match storage.get_service(&id).await {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", id))),
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Get API key if needed
    let api_key = keychain.get_api_key(&id).unwrap_or(None);

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
    let storage = AIStorage::new(app.clone());
    let keychain = AIKeychain::new(app);

    // Get service config
    let service = match storage.get_service(&service_id).await {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", service_id))),
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Get API key if needed
    let api_key = keychain.get_api_key(&service_id).unwrap_or(None);

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

// ============================================================================
// Prompt Template Commands
// ============================================================================

/// List all prompt templates
#[tauri::command]
pub async fn ai_list_templates(
    app: AppHandle,
) -> Result<ApiResponse<Vec<PromptTemplate>>, String> {
    let storage = AIStorage::new(app);
    match storage.list_templates().await {
        Ok(templates) => Ok(ApiResponse::success(templates)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Add a new prompt template
#[tauri::command]
pub async fn ai_add_template(
    app: AppHandle,
    template: AddTemplateRequest,
) -> Result<ApiResponse<PromptTemplate>, String> {
    let storage = AIStorage::new(app);

    let new_template = PromptTemplate::new(
        template.name,
        template.description,
        template.category,
        template.template,
        template.output_format,
    );

    match storage.add_template(new_template).await {
        Ok(saved) => Ok(ApiResponse::success(saved)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Update a prompt template
#[tauri::command]
pub async fn ai_update_template(
    app: AppHandle,
    template: UpdateTemplateRequest,
) -> Result<ApiResponse<PromptTemplate>, String> {
    let storage = AIStorage::new(app);

    // Get existing template
    let existing = match storage.get_template(&template.id).await {
        Ok(Some(t)) => t,
        Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", template.id))),
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

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

    match storage.update_template(updated).await {
        Ok(saved) => Ok(ApiResponse::success(saved)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Delete a prompt template
#[tauri::command]
pub async fn ai_delete_template(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let storage = AIStorage::new(app);
    match storage.delete_template(&id).await {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Set a template as the default
#[tauri::command]
pub async fn ai_set_default_template(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let storage = AIStorage::new(app);
    match storage.set_default_template(&id).await {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
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
    let storage = AIStorage::new(app);
    match storage.get_project_settings(&project_path).await {
        Ok(settings) => Ok(ApiResponse::success(settings)),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Update project-specific AI settings
#[tauri::command]
pub async fn ai_update_project_settings(
    app: AppHandle,
    settings: UpdateProjectSettingsRequest,
) -> Result<ApiResponse<()>, String> {
    let storage = AIStorage::new(app);

    let project_settings = ProjectAISettings {
        project_path: settings.project_path,
        preferred_service_id: settings.preferred_service_id,
        preferred_template_id: settings.preferred_template_id,
    };

    match storage.update_project_settings(project_settings).await {
        Ok(()) => Ok(ApiResponse::success(())),
        Err(e) => Ok(ApiResponse::error(e.to_string())),
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
    let storage = AIStorage::new(app.clone());
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
    let project_settings = storage.get_project_settings(&request.project_path).await
        .unwrap_or_default();

    // Determine which service to use
    let service_id = request.service_id
        .or(project_settings.preferred_service_id);

    let service = if let Some(id) = service_id {
        match storage.get_service(&id).await {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e.to_string())),
        }
    } else {
        match storage.get_default_service().await {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e.to_string())),
        }
    };

    // Determine which template to use
    let template_id = request.template_id
        .or(project_settings.preferred_template_id);

    let template = if let Some(id) = template_id {
        match storage.get_template(&id).await {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e.to_string())),
        }
    } else {
        // Get default template for GitCommit category
        match storage.get_default_template(Some(&TemplateCategory::GitCommit)).await {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_git_conventional(),
            Err(e) => return Ok(ApiResponse::error(e.to_string())),
        }
    };

    // Get API key if needed
    let api_key = keychain.get_api_key(&service.id).unwrap_or(None);

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
