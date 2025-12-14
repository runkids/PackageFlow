// LM Studio Provider Implementation
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// LM Studio provides an OpenAI-compatible API for local LLM inference.
// No API key required.
// Default endpoint: http://127.0.0.1:1234/v1

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::{AIError, AIProvider, AIResult};
use crate::models::ai::{
    AIServiceConfig, ChatMessage, ChatOptions, ChatResponse, ModelInfo,
};

/// LM Studio Provider
pub struct LMStudioProvider {
    config: AIServiceConfig,
    client: Client,
}

impl LMStudioProvider {
    pub fn new(config: AIServiceConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn api_url(&self, path: &str) -> String {
        let base = self.config.endpoint.trim_end_matches('/');
        format!("{}{}", base, path)
    }
}

// OpenAI-compatible API types for LM Studio
#[derive(Debug, Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIChatResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    total_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<OpenAIModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAIModel {
    id: String,
    #[serde(default)]
    owned_by: Option<String>,
}

#[async_trait]
impl AIProvider for LMStudioProvider {
    fn name(&self) -> &str {
        "LM Studio"
    }

    fn config(&self) -> &AIServiceConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        let url = self.api_url("/models");

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| AIError::ConnectionFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AIError::ApiError(format!(
                "LM Studio API error ({}): {}",
                status, body
            )));
        }

        let models_response: OpenAIModelsResponse = response.json().await?;

        Ok(models_response.data.into_iter().map(|m| ModelInfo {
            name: m.id,
            size: None,
            modified_at: None,
        }).collect())
    }

    async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: ChatOptions,
    ) -> AIResult<ChatResponse> {
        let url = self.api_url("/chat/completions");

        let openai_messages: Vec<OpenAIMessage> = messages
            .into_iter()
            .map(|m| OpenAIMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let request = OpenAIChatRequest {
            model: self.config.model.clone(),
            messages: openai_messages,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            top_p: options.top_p,
            stream: false,
        };

        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| AIError::ConnectionFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            // Check for specific errors
            if body.contains("model") && (body.contains("not found") || body.contains("does not exist")) {
                return Err(AIError::ModelNotFound(self.config.model.clone()));
            }

            return Err(AIError::ApiError(format!(
                "LM Studio API error ({}): {}",
                status, body
            )));
        }

        let openai_response: OpenAIChatResponse = response.json().await?;

        let content = openai_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        let tokens_used = openai_response
            .usage
            .and_then(|u| u.total_tokens);

        Ok(ChatResponse {
            content,
            tokens_used,
            model: openai_response.model,
        })
    }

    async fn test_connection(&self) -> AIResult<bool> {
        let url = self.api_url("/models");
        let start = Instant::now();

        let response = self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else if e.is_connect() {
                    AIError::ConnectionFailed(format!(
                        "Cannot connect to LM Studio service ({}): {}",
                        self.config.endpoint, e
                    ))
                } else {
                    AIError::ConnectionFailed(e.to_string())
                }
            })?;

        let latency = start.elapsed().as_millis() as u64;

        if response.status().is_success() {
            log::info!("LM Studio connection successful, latency: {}ms", latency);
            Ok(true)
        } else {
            Err(AIError::ConnectionFailed(format!(
                "LM Studio response error: {}",
                response.status()
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AIProvider as AIProviderEnum;

    fn create_test_config() -> AIServiceConfig {
        AIServiceConfig::new(
            "Test LM Studio".to_string(),
            AIProviderEnum::LMStudio,
            "http://127.0.0.1:1234/v1".to_string(),
            "local-model".to_string(),
        )
    }

    #[test]
    fn test_lm_studio_provider_creation() {
        let config = create_test_config();
        let provider = LMStudioProvider::new(config);
        assert_eq!(provider.name(), "LM Studio");
    }

    #[test]
    fn test_api_url() {
        let config = create_test_config();
        let provider = LMStudioProvider::new(config);
        assert_eq!(
            provider.api_url("/models"),
            "http://127.0.0.1:1234/v1/models"
        );
    }

    #[test]
    fn test_api_url_chat_completions() {
        let config = create_test_config();
        let provider = LMStudioProvider::new(config);
        assert_eq!(
            provider.api_url("/chat/completions"),
            "http://127.0.0.1:1234/v1/chat/completions"
        );
    }
}
