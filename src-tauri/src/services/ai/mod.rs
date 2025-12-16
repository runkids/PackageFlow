// AI Service Module
// Feature: AI CLI Integration (020-ai-cli-integration)

pub mod anthropic;
pub mod diff;
pub mod error;
pub mod gemini;
pub mod keychain;
pub mod lm_studio;
pub mod ollama;
pub mod openai;
pub mod storage;

use async_trait::async_trait;

pub use anthropic::AnthropicProvider;
pub use error::{AIError, AIErrorCode, AIResult};
pub use gemini::GeminiProvider;
pub use keychain::AIKeychain;
pub use lm_studio::LMStudioProvider;
pub use ollama::OllamaProvider;
pub use openai::OpenAIProvider;
pub use storage::AIStorage;

use crate::models::ai::{
    AIProvider as AIProviderType, AIProviderConfig, ChatMessage, ChatOptions, ChatResponse,
    ModelInfo,
};

/// Trait for AI providers
/// All AI providers (OpenAI, Anthropic, Ollama, LMStudio) implement this trait
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// Get the provider name
    fn name(&self) -> &str;

    /// Get the current configuration
    fn config(&self) -> &AIProviderConfig;

    /// List available models
    /// For cloud providers, returns a static list
    /// For local providers (Ollama/LMStudio), fetches from the server
    async fn list_models(&self) -> AIResult<Vec<ModelInfo>>;

    /// Perform a chat completion request
    async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: ChatOptions,
    ) -> AIResult<ChatResponse>;

    /// Test the connection to the AI service
    async fn test_connection(&self) -> AIResult<bool>;
}

/// Boxed AI provider type
pub type BoxedAIProvider = Box<dyn AIProvider>;

/// Factory function to create an AI provider from config
///
/// # Arguments
/// * `config` - The AI service configuration
/// * `api_key` - The API key (required for OpenAI, Anthropic, and Gemini)
///
/// # Returns
/// A boxed AI provider instance
pub fn create_provider(config: AIProviderConfig, api_key: Option<String>) -> AIResult<BoxedAIProvider> {
    match config.provider {
        AIProviderType::Ollama => Ok(Box::new(OllamaProvider::new(config))),
        AIProviderType::LMStudio => Ok(Box::new(LMStudioProvider::new(config))),
        AIProviderType::OpenAI => {
            let key = api_key.ok_or_else(|| {
                AIError::InvalidConfig("OpenAI requires an API key".to_string())
            })?;
            if key.is_empty() {
                return Err(AIError::InvalidConfig("OpenAI API key cannot be empty".to_string()));
            }
            Ok(Box::new(OpenAIProvider::new(config, key)))
        }
        AIProviderType::Anthropic => {
            let key = api_key.ok_or_else(|| {
                AIError::InvalidConfig("Anthropic requires an API key".to_string())
            })?;
            if key.is_empty() {
                return Err(AIError::InvalidConfig("Anthropic API key cannot be empty".to_string()));
            }
            Ok(Box::new(AnthropicProvider::new(config, key)))
        }
        AIProviderType::Gemini => {
            let key = api_key.ok_or_else(|| {
                AIError::InvalidConfig("Gemini requires an API key".to_string())
            })?;
            if key.is_empty() {
                return Err(AIError::InvalidConfig("Gemini API key cannot be empty".to_string()));
            }
            Ok(Box::new(GeminiProvider::new(config, key)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Basic tests to ensure the module compiles
    #[test]
    fn test_ai_error_code_str() {
        assert_eq!(AIErrorCode::ServiceNotFound.as_str(), "AI_SERVICE_NOT_FOUND");
        assert_eq!(AIErrorCode::NoStagedChanges.as_str(), "AI_NO_STAGED_CHANGES");
    }

    #[test]
    fn test_ai_error_message() {
        let err = AIError::NoStagedChanges;
        assert!(err.to_string().contains("staged"));
    }

    #[test]
    fn test_create_ollama_provider() {
        let config = AIProviderConfig::new(
            "Test".to_string(),
            AIProviderType::Ollama,
            "http://127.0.0.1:11434".to_string(),
            "llama3.2".to_string(),
        );
        let provider = create_provider(config, None);
        assert!(provider.is_ok());
    }

    #[test]
    fn test_create_openai_provider_without_key() {
        let config = AIProviderConfig::new(
            "Test".to_string(),
            AIProviderType::OpenAI,
            "https://api.openai.com/v1".to_string(),
            "gpt-4o-mini".to_string(),
        );
        let provider = create_provider(config, None);
        assert!(provider.is_err());
    }

    #[test]
    fn test_create_openai_provider_with_key() {
        let config = AIProviderConfig::new(
            "Test".to_string(),
            AIProviderType::OpenAI,
            "https://api.openai.com/v1".to_string(),
            "gpt-4o-mini".to_string(),
        );
        let provider = create_provider(config, Some("test-key".to_string()));
        assert!(provider.is_ok());
    }
}
