// Ollama Provider Implementation
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Ollama is a local LLM server that provides an OpenAI-compatible API.
// No API key required.
// Default endpoint: http://127.0.0.1:11434

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::{AIError, AIProvider, AIResult};
use crate::models::ai::{
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, FinishReason, ModelInfo,
};

/// Ollama Provider
pub struct OllamaProvider {
    config: AIProviderConfig,
    client: Client,
}

impl OllamaProvider {
    pub fn new(config: AIProviderConfig) -> Self {
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

// Ollama API types
#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaResponseMessage,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    done_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
    size: Option<u64>,
    modified_at: Option<String>,
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn name(&self) -> &str {
        "Ollama"
    }

    fn config(&self) -> &AIProviderConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        let url = self.api_url("/api/tags");

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| AIError::ConnectionFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AIError::ApiError(format!(
                "Ollama API error ({}): {}",
                status, body
            )));
        }

        let tags: OllamaTagsResponse = response.json().await?;

        Ok(tags.models.into_iter().map(|m| ModelInfo {
            name: m.name,
            size: m.size,
            modified_at: m.modified_at,
        }).collect())
    }

    async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: ChatOptions,
    ) -> AIResult<ChatResponse> {
        let url = self.api_url("/api/chat");

        let ollama_messages: Vec<OllamaMessage> = messages
            .into_iter()
            .map(|m| OllamaMessage {
                role: m.role,
                content: m.content.unwrap_or_default(),
            })
            .collect();

        let ollama_options = if options.temperature.is_some()
            || options.max_tokens.is_some()
            || options.top_p.is_some()
        {
            Some(OllamaOptions {
                temperature: options.temperature,
                num_predict: options.max_tokens,
                top_p: options.top_p,
            })
        } else {
            None
        };

        let request = OllamaChatRequest {
            model: self.config.model.clone(),
            messages: ollama_messages,
            stream: false,
            options: ollama_options,
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
            if body.contains("model") && body.contains("not found") {
                return Err(AIError::ModelNotFound(self.config.model.clone()));
            }

            return Err(AIError::ApiError(format!(
                "Ollama API error ({}): {}",
                status, body
            )));
        }

        let ollama_response: OllamaChatResponse = response.json().await?;

        // Parse done_reason from Ollama response
        let finish_reason = ollama_response.done_reason.map(|r| match r.as_str() {
            "stop" => FinishReason::Stop,
            "length" => FinishReason::Length,
            _ => FinishReason::Unknown,
        });

        Ok(ChatResponse {
            content: ollama_response.message.content,
            tokens_used: ollama_response.eval_count,
            model: self.config.model.clone(),
            finish_reason,
            tool_calls: None, // Ollama tool calling not yet implemented
        })
    }

    async fn test_connection(&self) -> AIResult<bool> {
        let url = self.api_url("/api/tags");
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
                        "Cannot connect to Ollama service ({}): {}",
                        self.config.endpoint, e
                    ))
                } else {
                    AIError::ConnectionFailed(e.to_string())
                }
            })?;

        let latency = start.elapsed().as_millis() as u64;

        if response.status().is_success() {
            log::info!("Ollama connection successful, latency: {}ms", latency);
            Ok(true)
        } else {
            Err(AIError::ConnectionFailed(format!(
                "Ollama response error: {}",
                response.status()
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AIProvider as AIProviderEnum;

    fn create_test_config() -> AIProviderConfig {
        AIProviderConfig::new(
            "Test Ollama".to_string(),
            AIProviderEnum::Ollama,
            "http://127.0.0.1:11434".to_string(),
            "llama3.2".to_string(),
        )
    }

    #[test]
    fn test_ollama_provider_creation() {
        let config = create_test_config();
        let provider = OllamaProvider::new(config);
        assert_eq!(provider.name(), "Ollama");
    }

    #[test]
    fn test_api_url() {
        let config = create_test_config();
        let provider = OllamaProvider::new(config);
        assert_eq!(
            provider.api_url("/api/tags"),
            "http://127.0.0.1:11434/api/tags"
        );
    }

    #[test]
    fn test_api_url_with_trailing_slash() {
        let mut config = create_test_config();
        config.endpoint = "http://127.0.0.1:11434/".to_string();
        let provider = OllamaProvider::new(config);
        assert_eq!(
            provider.api_url("/api/tags"),
            "http://127.0.0.1:11434/api/tags"
        );
    }
}
