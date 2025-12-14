// Anthropic Provider Implementation
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Anthropic provides Claude models via their API.
// Requires API key.
// Default endpoint: https://api.anthropic.com/v1

use async_trait::async_trait;
use reqwest::{Client, header::{HeaderMap, HeaderValue, CONTENT_TYPE}};
use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::{AIError, AIProvider, AIResult};
use crate::models::ai::{
    AIServiceConfig, ChatMessage, ChatOptions, ChatResponse, ModelInfo,
};

/// Anthropic API version header value
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Anthropic Provider
pub struct AnthropicProvider {
    config: AIServiceConfig,
    client: Client,
    api_key: String,
}

impl AnthropicProvider {
    pub fn new(config: AIServiceConfig, api_key: String) -> Self {
        Self {
            config,
            client: Client::new(),
            api_key,
        }
    }

    fn api_url(&self, path: &str) -> String {
        let base = self.config.endpoint.trim_end_matches('/');
        format!("{}{}", base, path)
    }

    fn auth_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&self.api_key)
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(
            "anthropic-version",
            HeaderValue::from_static(ANTHROPIC_VERSION),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }
}

// Anthropic API types
#[derive(Debug, Serialize)]
struct AnthropicMessagesRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
    content: Vec<AnthropicContent>,
    usage: Option<AnthropicUsage>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    error: AnthropicErrorDetail,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

/// List of Claude models that are commonly used
const COMMON_MODELS: &[&str] = &[
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
];

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "Anthropic"
    }

    fn config(&self) -> &AIServiceConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        // Anthropic doesn't have a models listing endpoint
        // Return a static list of common Claude models
        Ok(COMMON_MODELS
            .iter()
            .map(|&name| ModelInfo {
                name: name.to_string(),
                size: None,
                modified_at: None,
            })
            .collect())
    }

    async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: ChatOptions,
    ) -> AIResult<ChatResponse> {
        let url = self.api_url("/messages");

        // Separate system message from user/assistant messages
        // Anthropic uses a separate `system` field
        let mut system_message: Option<String> = None;
        let mut anthropic_messages: Vec<AnthropicMessage> = Vec::new();

        for msg in messages {
            if msg.role == "system" {
                system_message = Some(msg.content);
            } else {
                anthropic_messages.push(AnthropicMessage {
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        // max_tokens is required for Anthropic
        let max_tokens = options.max_tokens.unwrap_or(4096);

        let request = AnthropicMessagesRequest {
            model: self.config.model.clone(),
            messages: anthropic_messages,
            max_tokens,
            temperature: options.temperature,
            top_p: options.top_p,
            system: system_message,
        };

        let response = self.client
            .post(&url)
            .headers(self.auth_headers())
            .json(&request)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();

            // Try to parse Anthropic error format
            if let Ok(error) = serde_json::from_str::<AnthropicError>(&body) {
                let error_type = &error.error.error_type;

                // Check for specific error types
                if status.as_u16() == 401 || error_type == "authentication_error" {
                    return Err(AIError::AuthFailed(error.error.message));
                }

                if status.as_u16() == 429 || error_type == "rate_limit_error" {
                    return Err(AIError::RateLimited);
                }

                if error_type == "not_found_error" || error.error.message.contains("model") {
                    return Err(AIError::ModelNotFound(self.config.model.clone()));
                }

                if error_type == "invalid_request_error" && error.error.message.contains("token") {
                    return Err(AIError::TokenLimitExceeded(0));
                }

                return Err(AIError::ApiError(error.error.message));
            }

            return Err(AIError::ApiError(format!(
                "Anthropic API error ({}): {}",
                status, body
            )));
        }

        let anthropic_response: AnthropicMessagesResponse = response.json().await?;

        // Extract text content from response
        let content = anthropic_response
            .content
            .iter()
            .filter(|c| c.content_type == "text")
            .filter_map(|c| c.text.clone())
            .collect::<Vec<_>>()
            .join("");

        let tokens_used = anthropic_response
            .usage
            .map(|u| {
                u.input_tokens.unwrap_or(0) + u.output_tokens.unwrap_or(0)
            });

        Ok(ChatResponse {
            content,
            tokens_used,
            model: anthropic_response.model,
        })
    }

    async fn test_connection(&self) -> AIResult<bool> {
        // Anthropic doesn't have a simple health check endpoint
        // We'll make a minimal messages request to verify the API key
        let url = self.api_url("/messages");
        let start = Instant::now();

        let request = AnthropicMessagesRequest {
            model: self.config.model.clone(),
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
            max_tokens: 1,
            temperature: None,
            top_p: None,
            system: None,
        };

        let response = self.client
            .post(&url)
            .headers(self.auth_headers())
            .json(&request)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else if e.is_connect() {
                    AIError::ConnectionFailed(format!(
                        "Cannot connect to Anthropic service ({}): {}",
                        self.config.endpoint, e
                    ))
                } else {
                    AIError::ConnectionFailed(e.to_string())
                }
            })?;

        let latency = start.elapsed().as_millis() as u64;
        let status = response.status();

        if status.is_success() {
            log::info!("Anthropic connection successful, latency: {}ms", latency);
            Ok(true)
        } else if status.as_u16() == 401 {
            let body = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<AnthropicError>(&body) {
                Err(AIError::AuthFailed(error.error.message))
            } else {
                Err(AIError::AuthFailed("Invalid API key".to_string()))
            }
        } else {
            // Non-auth errors might be OK for connection test
            // (e.g., model not found, but connection worked)
            let body = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<AnthropicError>(&body) {
                if error.error.error_type == "not_found_error" {
                    // Model not found but API is working
                    log::warn!("Anthropic connection successful, but model {} not found", self.config.model);
                    return Ok(true);
                }
            }
            Err(AIError::ConnectionFailed(format!(
                "Anthropic response error ({}): {}",
                status, body
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
            "Test Anthropic".to_string(),
            AIProviderEnum::Anthropic,
            "https://api.anthropic.com/v1".to_string(),
            "claude-3-haiku-20240307".to_string(),
        )
    }

    #[test]
    fn test_anthropic_provider_creation() {
        let config = create_test_config();
        let provider = AnthropicProvider::new(config, "test-key".to_string());
        assert_eq!(provider.name(), "Anthropic");
    }

    #[test]
    fn test_api_url() {
        let config = create_test_config();
        let provider = AnthropicProvider::new(config, "test-key".to_string());
        assert_eq!(
            provider.api_url("/messages"),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[tokio::test]
    async fn test_list_models_returns_common_models() {
        let config = create_test_config();
        let provider = AnthropicProvider::new(config, "test-key".to_string());
        let models = provider.list_models().await.unwrap();

        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.name.contains("claude-3")));
    }
}
