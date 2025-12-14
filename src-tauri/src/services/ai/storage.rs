// AI Config Storage
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Manages persistent storage of AI service configurations and prompt templates
// using tauri-plugin-store.

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;

use super::{AIError, AIResult};
use crate::models::ai::{
    AIServiceConfig, ProjectAISettings, PromptTemplate, TemplateCategory,
};

const STORE_FILENAME: &str = "packageflow.json";
const KEY_AI_SERVICES: &str = "ai_services";
const KEY_PROMPT_TEMPLATES: &str = "prompt_templates";
const KEY_PROJECT_AI_SETTINGS: &str = "project_ai_settings";

/// AI Configuration Storage Manager
pub struct AIStorage {
    app_handle: AppHandle<Wry>,
    /// In-memory cache of services
    services_cache: Arc<RwLock<Option<Vec<AIServiceConfig>>>>,
    /// In-memory cache of templates
    templates_cache: Arc<RwLock<Option<Vec<PromptTemplate>>>>,
}

impl AIStorage {
    pub fn new(app_handle: AppHandle<Wry>) -> Self {
        Self {
            app_handle,
            services_cache: Arc::new(RwLock::new(None)),
            templates_cache: Arc::new(RwLock::new(None)),
        }
    }

    // =========================================================================
    // AI Services
    // =========================================================================

    /// List all AI service configurations
    pub async fn list_services(&self) -> AIResult<Vec<AIServiceConfig>> {
        // Check cache first
        {
            let cache = self.services_cache.read().await;
            if let Some(ref services) = *cache {
                return Ok(services.clone());
            }
        }

        // Load from store
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let services: Vec<AIServiceConfig> = store
            .get(KEY_AI_SERVICES)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Update cache
        {
            let mut cache = self.services_cache.write().await;
            *cache = Some(services.clone());
        }

        Ok(services)
    }

    /// Get a specific AI service by ID
    pub async fn get_service(&self, id: &str) -> AIResult<Option<AIServiceConfig>> {
        let services = self.list_services().await?;
        Ok(services.into_iter().find(|s| s.id == id))
    }

    /// Get the default AI service
    pub async fn get_default_service(&self) -> AIResult<Option<AIServiceConfig>> {
        let services = self.list_services().await?;
        Ok(services.into_iter().find(|s| s.is_default && s.is_enabled))
    }

    /// Add a new AI service configuration
    pub async fn add_service(&self, service: AIServiceConfig) -> AIResult<AIServiceConfig> {
        let mut services = self.list_services().await?;

        // Check for duplicate name
        if services.iter().any(|s| s.name == service.name) {
            return Err(AIError::ServiceAlreadyExists(service.name));
        }

        services.push(service.clone());
        self.save_services(&services).await?;

        Ok(service)
    }

    /// Update an existing AI service configuration
    pub async fn update_service(&self, updated: AIServiceConfig) -> AIResult<AIServiceConfig> {
        let mut services = self.list_services().await?;

        let index = services
            .iter()
            .position(|s| s.id == updated.id)
            .ok_or_else(|| AIError::ServiceNotFound(updated.id.clone()))?;

        // Check for duplicate name (excluding self)
        if services.iter().any(|s| s.id != updated.id && s.name == updated.name) {
            return Err(AIError::ServiceAlreadyExists(updated.name));
        }

        services[index] = updated.clone();
        self.save_services(&services).await?;

        Ok(updated)
    }

    /// Delete an AI service configuration
    pub async fn delete_service(&self, id: &str) -> AIResult<()> {
        let mut services = self.list_services().await?;

        let index = services
            .iter()
            .position(|s| s.id == id)
            .ok_or_else(|| AIError::ServiceNotFound(id.to_string()))?;

        services.remove(index);
        self.save_services(&services).await?;

        Ok(())
    }

    /// Set a service as the default
    pub async fn set_default_service(&self, id: &str) -> AIResult<()> {
        let mut services = self.list_services().await?;

        // Verify service exists
        if !services.iter().any(|s| s.id == id) {
            return Err(AIError::ServiceNotFound(id.to_string()));
        }

        // Update default flags
        for service in &mut services {
            service.is_default = service.id == id;
        }

        self.save_services(&services).await?;

        Ok(())
    }

    async fn save_services(&self, services: &[AIServiceConfig]) -> AIResult<()> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let value = serde_json::to_value(services)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        store.set(KEY_AI_SERVICES, value);
        store.save().map_err(|e| AIError::StorageError(e.to_string()))?;

        // Update cache
        {
            let mut cache = self.services_cache.write().await;
            *cache = Some(services.to_vec());
        }

        Ok(())
    }

    // =========================================================================
    // Prompt Templates
    // =========================================================================

    /// List all prompt templates (including built-in)
    pub async fn list_templates(&self) -> AIResult<Vec<PromptTemplate>> {
        // Check cache first
        {
            let cache = self.templates_cache.read().await;
            if let Some(ref templates) = *cache {
                return Ok(templates.clone());
            }
        }

        // Load from store
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let mut templates: Vec<PromptTemplate> = store
            .get(KEY_PROMPT_TEMPLATES)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Ensure built-in templates exist
        let builtins = PromptTemplate::all_builtins();
        for builtin in builtins {
            if !templates.iter().any(|t| t.id == builtin.id) {
                templates.insert(0, builtin);
            }
        }

        // Update cache
        {
            let mut cache = self.templates_cache.write().await;
            *cache = Some(templates.clone());
        }

        Ok(templates)
    }

    /// Get a specific template by ID
    pub async fn get_template(&self, id: &str) -> AIResult<Option<PromptTemplate>> {
        let templates = self.list_templates().await?;
        Ok(templates.into_iter().find(|t| t.id == id))
    }

    /// Get the default template for a specific category
    /// If no category is specified, returns the first default template found (for backwards compatibility)
    pub async fn get_default_template(&self, category: Option<&TemplateCategory>) -> AIResult<Option<PromptTemplate>> {
        let templates = self.list_templates().await?;
        Ok(templates.into_iter().find(|t| {
            t.is_default && category.map_or(true, |c| &t.category == c)
        }))
    }

    /// Add a new prompt template
    pub async fn add_template(&self, template: PromptTemplate) -> AIResult<PromptTemplate> {
        // Validate template has required variables for its category
        if let Err(msg) = template.validate_variables() {
            return Err(AIError::InvalidTemplateVariables(msg));
        }

        let mut templates = self.list_templates().await?;

        // Check for duplicate name
        if templates.iter().any(|t| t.name == template.name) {
            return Err(AIError::TemplateAlreadyExists(template.name));
        }

        templates.push(template.clone());
        self.save_templates(&templates).await?;

        Ok(template)
    }

    /// Update an existing prompt template
    pub async fn update_template(&self, updated: PromptTemplate) -> AIResult<PromptTemplate> {
        let mut templates = self.list_templates().await?;

        let index = templates
            .iter()
            .position(|t| t.id == updated.id)
            .ok_or_else(|| AIError::TemplateNotFound(updated.id.clone()))?;

        // Cannot modify built-in templates
        if templates[index].is_builtin {
            return Err(AIError::TemplateIsBuiltin(updated.name));
        }

        // Validate template has required variables for its category
        if let Err(msg) = updated.validate_variables() {
            return Err(AIError::InvalidTemplateVariables(msg));
        }

        // Check for duplicate name (excluding self)
        if templates.iter().any(|t| t.id != updated.id && t.name == updated.name) {
            return Err(AIError::TemplateAlreadyExists(updated.name));
        }

        templates[index] = updated.clone();
        self.save_templates(&templates).await?;

        Ok(updated)
    }

    /// Delete a prompt template
    pub async fn delete_template(&self, id: &str) -> AIResult<()> {
        let mut templates = self.list_templates().await?;

        let index = templates
            .iter()
            .position(|t| t.id == id)
            .ok_or_else(|| AIError::TemplateNotFound(id.to_string()))?;

        // Cannot delete built-in templates
        if templates[index].is_builtin {
            return Err(AIError::TemplateIsBuiltin(templates[index].name.clone()));
        }

        templates.remove(index);
        self.save_templates(&templates).await?;

        Ok(())
    }

    /// Set a template as the default for its category
    /// Each category can have its own default template
    pub async fn set_default_template(&self, id: &str) -> AIResult<()> {
        let mut templates = self.list_templates().await?;

        // Find target template and get its category
        let target_category = templates
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.category.clone())
            .ok_or_else(|| AIError::TemplateNotFound(id.to_string()))?;

        // Update default flags only within the same category
        for template in &mut templates {
            if template.category == target_category {
                template.is_default = template.id == id;
            }
        }

        self.save_templates(&templates).await?;

        Ok(())
    }

    async fn save_templates(&self, templates: &[PromptTemplate]) -> AIResult<()> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        // Only save non-builtin templates (built-ins are always regenerated)
        let custom_templates: Vec<_> = templates.iter()
            .filter(|t| !t.is_builtin)
            .cloned()
            .collect();

        let value = serde_json::to_value(&custom_templates)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        store.set(KEY_PROMPT_TEMPLATES, value);
        store.save().map_err(|e| AIError::StorageError(e.to_string()))?;

        // Update cache with all templates (including built-ins)
        {
            let mut cache = self.templates_cache.write().await;
            *cache = Some(templates.to_vec());
        }

        Ok(())
    }

    // =========================================================================
    // Project AI Settings
    // =========================================================================

    /// Get project-specific AI settings
    pub async fn get_project_settings(&self, project_path: &str) -> AIResult<ProjectAISettings> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let settings_map: HashMap<String, ProjectAISettings> = store
            .get(KEY_PROJECT_AI_SETTINGS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        Ok(settings_map.get(project_path).cloned().unwrap_or_else(|| {
            ProjectAISettings {
                project_path: project_path.to_string(),
                preferred_service_id: None,
                preferred_template_id: None,
            }
        }))
    }

    /// Update project-specific AI settings
    pub async fn update_project_settings(&self, settings: ProjectAISettings) -> AIResult<()> {
        let store = self.app_handle
            .store(STORE_FILENAME)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        let mut settings_map: HashMap<String, ProjectAISettings> = store
            .get(KEY_PROJECT_AI_SETTINGS)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        settings_map.insert(settings.project_path.clone(), settings);

        let value = serde_json::to_value(&settings_map)
            .map_err(|e| AIError::StorageError(e.to_string()))?;

        store.set(KEY_PROJECT_AI_SETTINGS, value);
        store.save().map_err(|e| AIError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Clear caches (call when store is modified externally)
    pub async fn clear_caches(&self) {
        {
            let mut cache = self.services_cache.write().await;
            *cache = None;
        }
        {
            let mut cache = self.templates_cache.write().await;
            *cache = None;
        }
    }
}
