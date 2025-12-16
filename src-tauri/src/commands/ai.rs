// AI Commands
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Tauri commands for AI service management and commit message generation.
// Now using AIRepository for SQLite-based storage.

use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::models::ai::{
    AIProvider, AIProviderConfig, AddProviderRequest, AddTemplateRequest, ChatMessage, ChatOptions,
    FinishReason, GenerateCodeReviewRequest, GenerateCodeReviewResult, GenerateCommitMessageRequest,
    GenerateResult, GenerateStagedReviewRequest, GenerateSecurityAnalysisRequest,
    GenerateSecurityAnalysisResult, GenerateSecuritySummaryRequest, ModelInfo, PromptTemplate,
    ProjectAISettings, TemplateCategory, TestConnectionResult, UpdateProjectSettingsRequest,
    UpdateProviderRequest, UpdateTemplateRequest,
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
pub async fn ai_list_providers(
    app: AppHandle,
) -> Result<ApiResponse<Vec<AIProviderConfig>>, String> {
    let repo = get_ai_repo(&app);
    match repo.list_providers() {
        Ok(services) => Ok(ApiResponse::success(services)),
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Add a new AI service configuration
#[tauri::command]
pub async fn ai_add_service(
    app: AppHandle,
    config: AddProviderRequest,
) -> Result<ApiResponse<AIProviderConfig>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Check for duplicate name
    if repo.provider_name_exists(&config.name, None).unwrap_or(false) {
        return Ok(ApiResponse::error(format!("Service name '{}' already exists", config.name)));
    }

    // Create service config
    let service = AIProviderConfig::new(
        config.name,
        config.provider.clone(),
        config.endpoint,
        config.model,
    );

    // Save service config first (required for API key foreign key constraint)
    if let Err(e) = repo.save_provider(&service) {
        return Ok(ApiResponse::error(e));
    }

    // Store API key if provided (after service is saved due to foreign key constraint)
    if let Some(ref api_key) = config.api_key {
        if !api_key.is_empty() {
            if let Err(e) = keychain.store_api_key(&service.id, api_key) {
                // Rollback: delete the service if API key storage fails
                let _ = repo.delete_provider(&service.id);
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
    config: UpdateProviderRequest,
) -> Result<ApiResponse<AIProviderConfig>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Get existing service
    let existing = match repo.get_provider(&config.id) {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", config.id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Check for duplicate name (excluding self)
    if let Some(ref name) = config.name {
        if repo.provider_name_exists(name, Some(&config.id)).unwrap_or(false) {
            return Ok(ApiResponse::error(format!("Service name '{}' already exists", name)));
        }
    }

    // Update fields
    let updated = AIProviderConfig {
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
    match repo.save_provider(&updated) {
        Ok(()) => {
            let _ = app.emit("ai:services-updated", ());
            Ok(ApiResponse::success(updated))
        }
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Delete an AI service configuration
#[tauri::command]
pub async fn ai_delete_provider(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app.clone());

    // Delete API key
    let _ = keychain.delete_api_key(&id);

    // Delete service config
    match repo.delete_provider(&id) {
        Ok(_) => {
            let _ = app.emit("ai:services-updated", ());
            Ok(ApiResponse::success(()))
        }
        Err(e) => Ok(ApiResponse::error(e)),
    }
}

/// Set a service as the default
#[tauri::command]
pub async fn ai_set_default_provider(
    app: AppHandle,
    id: String,
) -> Result<ApiResponse<()>, String> {
    let repo = get_ai_repo(&app);
    match repo.set_default_provider(&id) {
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
    let service = match repo.get_provider(&id) {
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
    provider_id: String,
) -> Result<ApiResponse<Vec<ModelInfo>>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get service config
    let service = match repo.get_provider(&provider_id) {
        Ok(Some(s)) => s,
        Ok(None) => return Ok(ApiResponse::error(format!("Service not found: {}", provider_id))),
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    // Get API key if needed
    let api_key = match keychain.get_api_key(&provider_id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", provider_id, e);
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
    let config = AIProviderConfig::new(
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

    // Ensure built-in templates exist in database
    let builtins = PromptTemplate::all_builtins();
    for builtin in builtins {
        if !templates.iter().any(|t| t.id == builtin.id) {
            // Save built-in template to database
            match repo.save_template(&builtin) {
                Ok(()) => {
                    templates.insert(0, builtin);
                }
                Err(e) => {
                    // Log error but don't fail the entire operation
                    eprintln!("Warning: Failed to save built-in template '{}': {}", builtin.name, e);
                    // Still add to list for display (will be in memory only)
                    templates.insert(0, builtin);
                }
            }
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
        preferred_provider_id: settings.preferred_provider_id,
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
    let provider_id = request.provider_id
        .or(project_settings.preferred_provider_id);

    let service = if let Some(id) = provider_id {
        match repo.get_provider(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_provider() {
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
        tools: None,
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
// Code Review Generation
// ============================================================================

/// Get raw diff text for a specific file (staged or unstaged)
fn get_file_diff_text(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<String, String> {
    use crate::utils::path_resolver;

    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--", file_path]
    } else {
        vec!["diff", "--", file_path]
    };

    let output = path_resolver::create_command("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Estimate the number of tokens in a text string
/// Using a rough approximation: ~4 characters per token for English/code
fn estimate_tokens(text: &str) -> u32 {
    (text.len() as f64 / 4.0).ceil() as u32
}

/// Calculate appropriate max_tokens for output based on input size and provider limits
fn calculate_max_output_tokens(
    prompt: &str,
    provider: &AIProvider,
    min_output: u32,
    max_output: u32,
) -> u32 {
    let estimated_input = estimate_tokens(prompt);
    let context_window = provider.context_window();
    let provider_max_output = provider.max_output_tokens();

    // Calculate available space for output
    // Leave 10% buffer for safety
    let available = context_window
        .saturating_sub(estimated_input)
        .saturating_mul(90) / 100;

    // Clamp between min_output and the smaller of max_output or provider limit
    let upper_limit = max_output.min(provider_max_output);
    available.clamp(min_output, upper_limit)
}

/// Generate a code review using AI
#[tauri::command]
pub async fn ai_generate_code_review(
    app: AppHandle,
    request: GenerateCodeReviewRequest,
) -> Result<ApiResponse<GenerateCodeReviewResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get the file diff
    let diff_text = match get_file_diff_text(
        Path::new(&request.project_path),
        &request.file_path,
        request.staged,
    ) {
        Ok(diff) => diff,
        Err(e) => return Ok(ApiResponse::error(e)),
    };

    if diff_text.is_empty() {
        return Ok(ApiResponse::error("No changes to review for this file"));
    }

    // Get project settings for preferred service/template
    let project_settings = repo.get_project_settings(&request.project_path)
        .unwrap_or_default();

    // Determine which service to use
    let provider_id = request.provider_id
        .or(project_settings.preferred_provider_id);

    let service = if let Some(id) = provider_id {
        match repo.get_provider(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Determine which template to use - default to CodeReview category
    let template = if let Some(id) = request.template_id {
        match repo.get_template(&id) {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_template(Some(&TemplateCategory::CodeReview)) {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_code_review(),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Prepare the prompt with variables
    let mut vars = std::collections::HashMap::new();
    vars.insert("diff".to_string(), diff_text);
    vars.insert("file_path".to_string(), request.file_path);
    let prompt = template.render(&vars);

    // Calculate dynamic max_tokens based on input size and provider limits
    let max_tokens = calculate_max_output_tokens(
        &prompt,
        &service.provider,
        2000,  // minimum output tokens
        8000,  // maximum output tokens for code review
    );

    // Create provider (after calculating max_tokens since it consumes service)
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Call the AI service
    let messages = vec![ChatMessage::user(prompt)];
    let options = ChatOptions {
        temperature: Some(0.5),
        max_tokens: Some(max_tokens),
        top_p: None,
        tools: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            // Check if response was truncated due to token limit
            let is_truncated = response.finish_reason
                .as_ref()
                .map(|r| *r == FinishReason::Length)
                .unwrap_or(false);

            Ok(ApiResponse::success(GenerateCodeReviewResult {
                review: response.content.trim().to_string(),
                tokens_used: response.tokens_used,
                is_truncated,
            }))
        }
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Generate a code review for all staged changes
#[tauri::command]
pub async fn ai_generate_staged_review(
    app: AppHandle,
    request: GenerateStagedReviewRequest,
) -> Result<ApiResponse<GenerateCodeReviewResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get all staged changes using the existing diff utility
    let diff_result = match get_staged_diff(Path::new(&request.project_path)) {
        Ok(diff) => diff,
        Err(AIError::NoStagedChanges) => {
            return Ok(ApiResponse::error("No staged changes to review"));
        }
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Get project settings for preferred service/template
    let project_settings = repo.get_project_settings(&request.project_path)
        .unwrap_or_default();

    // Determine which service to use
    let provider_id = request.provider_id
        .or(project_settings.preferred_provider_id);

    let service = if let Some(id) = provider_id {
        match repo.get_provider(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Determine which template to use - default to CodeReview category
    let template = if let Some(id) = request.template_id {
        match repo.get_template(&id) {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_template(Some(&TemplateCategory::CodeReview)) {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_code_review(),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Prepare the prompt with variables
    // For staged review, we use "all staged files" as the file_path context
    let mut vars = std::collections::HashMap::new();
    vars.insert("diff".to_string(), diff_result.diff);
    vars.insert("file_path".to_string(), format!(
        "{} files changed (+{} -{})",
        diff_result.files_changed,
        diff_result.insertions,
        diff_result.deletions
    ));
    let prompt = template.render(&vars);

    // Calculate dynamic max_tokens based on input size and provider limits
    // Staged reviews may need more output for multiple files
    let max_tokens = calculate_max_output_tokens(
        &prompt,
        &service.provider,
        2000,   // minimum output tokens
        12000,  // higher maximum for staged review (multiple files)
    );

    // Create provider (after calculating max_tokens since it consumes service)
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Call the AI service
    let messages = vec![ChatMessage::user(prompt)];
    let options = ChatOptions {
        temperature: Some(0.5),
        max_tokens: Some(max_tokens),
        top_p: None,
        tools: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            // Check if response was truncated due to token limit
            let is_truncated = response.finish_reason
                .as_ref()
                .map(|r| *r == FinishReason::Length)
                .unwrap_or(false);

            Ok(ApiResponse::success(GenerateCodeReviewResult {
                review: response.content.trim().to_string(),
                tokens_used: response.tokens_used,
                is_truncated,
            }))
        }
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

// ============================================================================
// Security Analysis Commands
// ============================================================================

/// Generate AI security analysis for a single vulnerability
#[tauri::command]
pub async fn ai_generate_security_analysis(
    app: AppHandle,
    request: GenerateSecurityAnalysisRequest,
) -> Result<ApiResponse<GenerateSecurityAnalysisResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Get project settings for preferred service/template
    let project_settings = repo.get_project_settings(&request.project_path)
        .unwrap_or_default();

    // Determine which service to use
    let provider_id = request.provider_id
        .or(project_settings.preferred_provider_id);

    let service = if let Some(id) = provider_id {
        match repo.get_provider(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Determine which template to use - default to SecurityAdvisory category
    let template = if let Some(id) = request.template_id {
        match repo.get_template(&id) {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_template(Some(&TemplateCategory::SecurityAdvisory)) {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_security_advisory(),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Format vulnerability as pretty JSON
    let vulnerability_json = serde_json::to_string_pretty(&request.vulnerability)
        .unwrap_or_else(|_| "{}".to_string());

    // Build project context
    let project_context = format!(
        "Project: {}\nPackage Manager: {}",
        request.project_name,
        request.package_manager
    );

    // Single vulnerability - no summary needed
    let severity_summary = "Analyzing single vulnerability.".to_string();

    // Prepare the prompt with variables
    let mut vars = std::collections::HashMap::new();
    vars.insert("vulnerability_json".to_string(), vulnerability_json);
    vars.insert("project_context".to_string(), project_context);
    vars.insert("severity_summary".to_string(), severity_summary);
    let prompt = template.render(&vars);

    // Calculate dynamic max_tokens
    let max_tokens = calculate_max_output_tokens(
        &prompt,
        &service.provider,
        2000,  // minimum output tokens
        8000,  // maximum output tokens for security analysis
    );

    // Create provider
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Call the AI service
    let messages = vec![ChatMessage::user(prompt)];
    let options = ChatOptions {
        temperature: Some(0.5),
        max_tokens: Some(max_tokens),
        top_p: None,
        tools: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            let is_truncated = response.finish_reason
                .as_ref()
                .map(|r| *r == FinishReason::Length)
                .unwrap_or(false);

            Ok(ApiResponse::success(GenerateSecurityAnalysisResult {
                analysis: response.content.trim().to_string(),
                tokens_used: response.tokens_used,
                is_truncated,
            }))
        }
        Err(e) => Ok(ApiResponse::error(e.to_string())),
    }
}

/// Generate AI security summary for all vulnerabilities
#[tauri::command]
pub async fn ai_generate_security_summary(
    app: AppHandle,
    request: GenerateSecuritySummaryRequest,
) -> Result<ApiResponse<GenerateSecurityAnalysisResult>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    if request.vulnerabilities.is_empty() {
        return Ok(ApiResponse::error("No vulnerabilities to analyze"));
    }

    // Get project settings for preferred service/template
    let project_settings = repo.get_project_settings(&request.project_path)
        .unwrap_or_default();

    // Determine which service to use
    let provider_id = request.provider_id
        .or(project_settings.preferred_provider_id);

    let service = if let Some(id) = provider_id {
        match repo.get_provider(&id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Ok(ApiResponse::error("The specified AI service is disabled")),
            Ok(None) => return Ok(ApiResponse::error(format!("AI service not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(ApiResponse::error("No default AI service configured")),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Determine which template to use - default to SecurityAdvisory category
    let template = if let Some(id) = request.template_id {
        match repo.get_template(&id) {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(ApiResponse::error(format!("Template not found: {}", id))),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    } else {
        match repo.get_default_template(Some(&TemplateCategory::SecurityAdvisory)) {
            Ok(Some(t)) => t,
            Ok(None) => PromptTemplate::builtin_security_advisory(),
            Err(e) => return Ok(ApiResponse::error(e)),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Ok(ApiResponse::error(format!("Failed to retrieve API key: {}", e)));
        }
    };

    // Format all vulnerabilities as pretty JSON
    let vulnerability_json = serde_json::to_string_pretty(&request.vulnerabilities)
        .unwrap_or_else(|_| "[]".to_string());

    // Build project context
    let project_context = format!(
        "Project: {}\nPackage Manager: {}",
        request.project_name,
        request.package_manager
    );

    // Build severity summary from the provided summary JSON
    let severity_summary = if let Some(obj) = request.summary.as_object() {
        format!(
            "Total: {} vulnerabilities\n- Critical: {}\n- High: {}\n- Moderate: {}\n- Low: {}\n- Info: {}",
            obj.get("total").and_then(|v| v.as_u64()).unwrap_or(0),
            obj.get("critical").and_then(|v| v.as_u64()).unwrap_or(0),
            obj.get("high").and_then(|v| v.as_u64()).unwrap_or(0),
            obj.get("moderate").and_then(|v| v.as_u64()).unwrap_or(0),
            obj.get("low").and_then(|v| v.as_u64()).unwrap_or(0),
            obj.get("info").and_then(|v| v.as_u64()).unwrap_or(0)
        )
    } else {
        format!("Total: {} vulnerabilities", request.vulnerabilities.len())
    };

    // Prepare the prompt with variables
    let mut vars = std::collections::HashMap::new();
    vars.insert("vulnerability_json".to_string(), vulnerability_json);
    vars.insert("project_context".to_string(), project_context);
    vars.insert("severity_summary".to_string(), severity_summary);
    let prompt = template.render(&vars);

    // Calculate dynamic max_tokens - larger for summary of multiple vulnerabilities
    let max_tokens = calculate_max_output_tokens(
        &prompt,
        &service.provider,
        3000,   // minimum output tokens
        12000,  // higher maximum for summary (multiple vulnerabilities)
    );

    // Create provider
    let provider = match create_provider(service, api_key) {
        Ok(p) => p,
        Err(e) => return Ok(ApiResponse::error(e.to_string())),
    };

    // Call the AI service
    let messages = vec![ChatMessage::user(prompt)];
    let options = ChatOptions {
        temperature: Some(0.5),
        max_tokens: Some(max_tokens),
        top_p: None,
        tools: None,
    };

    match provider.chat_completion(messages, options).await {
        Ok(response) => {
            let is_truncated = response.finish_reason
                .as_ref()
                .map(|r| *r == FinishReason::Length)
                .unwrap_or(false);

            Ok(ApiResponse::success(GenerateSecurityAnalysisResult {
                analysis: response.content.trim().to_string(),
                tokens_used: response.tokens_used,
                is_truncated,
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
    pub provider_id: String,
    pub exists_in_db: bool,
    pub can_decrypt: bool,
    pub key_prefix: Option<String>,
    pub error: Option<String>,
}

/// Manually store an API key for a service (diagnostic command)
#[tauri::command]
pub async fn ai_store_api_key(
    app: AppHandle,
    provider_id: String,
    api_key: String,
) -> Result<ApiResponse<String>, String> {
    let keychain = AIKeychain::new(app);

    match keychain.store_api_key(&provider_id, &api_key) {
        Ok(()) => Ok(ApiResponse::success("API key stored successfully".to_string())),
        Err(e) => Ok(ApiResponse::error(format!("Failed to store API key: {}", e))),
    }
}

/// Check API key status for a service (diagnostic command)
#[tauri::command]
pub async fn ai_check_api_key_status(
    app: AppHandle,
    provider_id: String,
) -> Result<ApiResponse<ApiKeyStatus>, String> {
    let repo = get_ai_repo(&app);
    let keychain = AIKeychain::new(app);

    // Check if key exists in database
    let exists_in_db = repo.has_api_key(&provider_id).unwrap_or(false);

    if !exists_in_db {
        return Ok(ApiResponse::success(ApiKeyStatus {
            provider_id,
            exists_in_db: false,
            can_decrypt: false,
            key_prefix: None,
            error: Some("API key not found in database".to_string()),
        }));
    }

    // Try to decrypt
    match keychain.get_api_key(&provider_id) {
        Ok(Some(key)) => {
            // Show first 4 chars of key for verification
            let prefix = if key.len() >= 4 {
                Some(format!("{}...", &key[..4]))
            } else {
                Some("****".to_string())
            };
            Ok(ApiResponse::success(ApiKeyStatus {
                provider_id,
                exists_in_db: true,
                can_decrypt: true,
                key_prefix: prefix,
                error: None,
            }))
        }
        Ok(None) => Ok(ApiResponse::success(ApiKeyStatus {
            provider_id,
            exists_in_db: true,
            can_decrypt: false,
            key_prefix: None,
            error: Some("Key exists but could not be retrieved".to_string()),
        })),
        Err(e) => Ok(ApiResponse::success(ApiKeyStatus {
            provider_id,
            exists_in_db: true,
            can_decrypt: false,
            key_prefix: None,
            error: Some(format!("Decryption error: {}", e)),
        })),
    }
}
