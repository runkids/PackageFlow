// OpenAI Provider Implementation
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// OpenAI provides GPT-4o and other models via their API.
// Requires API key.
// Default endpoint: https://api.openai.com/v1

use async_trait::async_trait;
use reqwest::{Client, header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE}};
use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::{AIError, AIProvider, AIResult};
use crate::models::ai::{
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatToolCall, ChatFunctionCall,
    FinishReason, ModelInfo,
};

/// OpenAI Provider
pub struct OpenAIProvider {
    config: AIProviderConfig,
    client: Client,
    api_key: String,
}

impl OpenAIProvider {
    pub fn new(config: AIProviderConfig, api_key: String) -> Self {
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
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }
}

// OpenAI API types
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
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OpenAIFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OpenAIToolCall {
    id: String,
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
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
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponseMessage {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OpenAIToolCall>>,
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

#[derive(Debug, Deserialize)]
struct OpenAIError {
    error: OpenAIErrorDetail,
}

#[derive(Debug, Deserialize)]
struct OpenAIErrorDetail {
    message: String,
    #[serde(rename = "type")]
    error_type: Option<String>,
    code: Option<String>,
}

/// List of GPT models that are commonly used for chat
const COMMON_MODELS: &[&str] = &[
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
];

#[async_trait]
impl AIProvider for OpenAIProvider {
    fn name(&self) -> &str {
        "OpenAI"
    }

    fn config(&self) -> &AIProviderConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        // For OpenAI, we return a static list of common chat models
        // The full /models endpoint returns many models (including embeddings, etc.)
        // which isn't useful for chat completion
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
        let url = self.api_url("/chat/completions");

        // Convert messages to OpenAI format
        let openai_messages: Vec<OpenAIMessage> = messages
            .into_iter()
            .map(|m| OpenAIMessage {
                role: m.role,
                content: m.content,
                tool_calls: m.tool_calls.map(|calls| {
                    calls.into_iter().map(|tc| OpenAIToolCall {
                        id: tc.id,
                        tool_type: tc.tool_type,
                        function: OpenAIFunctionCall {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    }).collect()
                }),
                tool_call_id: m.tool_call_id,
            })
            .collect();

        // Convert tools to OpenAI format
        let openai_tools = options.tools.map(|tools| {
            tools.into_iter().map(|t| OpenAITool {
                tool_type: t.tool_type,
                function: OpenAIFunction {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }).collect()
        });

        let request = OpenAIChatRequest {
            model: self.config.model.clone(),
            messages: openai_messages,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            top_p: options.top_p,
            tools: openai_tools,
            stream: false,
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

            // Try to parse OpenAI error format
            if let Ok(error) = serde_json::from_str::<OpenAIError>(&body) {
                let error_type = error.error.error_type.as_deref().unwrap_or("");
                let code = error.error.code.as_deref().unwrap_or("");

                // Check for specific error types
                if status.as_u16() == 401 || error_type == "invalid_api_key" {
                    return Err(AIError::AuthFailed(error.error.message));
                }

                if status.as_u16() == 429 || error_type == "rate_limit_exceeded" {
                    return Err(AIError::RateLimited);
                }

                if code == "model_not_found" || error.error.message.contains("does not exist") {
                    return Err(AIError::ModelNotFound(self.config.model.clone()));
                }

                if error.error.message.contains("maximum context length") {
                    return Err(AIError::TokenLimitExceeded(0)); // Token count unknown
                }

                return Err(AIError::ApiError(error.error.message));
            }

            return Err(AIError::ApiError(format!(
                "OpenAI API error ({}): {}",
                status, body
            )));
        }

        let openai_response: OpenAIChatResponse = response.json().await?;

        let first_choice = openai_response.choices.first();

        let content = first_choice
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        let tokens_used = openai_response
            .usage
            .and_then(|u| u.total_tokens);

        // Parse finish_reason from OpenAI response
        let finish_reason = first_choice
            .and_then(|c| c.finish_reason.as_ref())
            .map(|r| match r.as_str() {
                "stop" => FinishReason::Stop,
                "length" => FinishReason::Length,
                "content_filter" => FinishReason::ContentFilter,
                "tool_calls" | "function_call" => FinishReason::ToolCalls,
                _ => FinishReason::Unknown,
            });

        // Convert tool_calls to our format
        let tool_calls = first_choice
            .and_then(|c| c.message.tool_calls.clone())
            .map(|calls| {
                calls.into_iter().map(|tc| ChatToolCall {
                    id: tc.id,
                    tool_type: tc.tool_type,
                    function: ChatFunctionCall {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                }).collect()
            });

        Ok(ChatResponse {
            content,
            tokens_used,
            model: openai_response.model,
            finish_reason,
            tool_calls,
        })
    }

    async fn test_connection(&self) -> AIResult<bool> {
        let url = self.api_url("/models");
        let start = Instant::now();

        let response = self.client
            .get(&url)
            .headers(self.auth_headers())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else if e.is_connect() {
                    AIError::ConnectionFailed(format!(
                        "Cannot connect to OpenAI service ({}): {}",
                        self.config.endpoint, e
                    ))
                } else {
                    AIError::ConnectionFailed(e.to_string())
                }
            })?;

        let latency = start.elapsed().as_millis() as u64;
        let status = response.status();

        if status.is_success() {
            log::info!("OpenAI connection successful, latency: {}ms", latency);
            Ok(true)
        } else if status.as_u16() == 401 {
            let body = response.text().await.unwrap_or_default();
            if let Ok(error) = serde_json::from_str::<OpenAIError>(&body) {
                Err(AIError::AuthFailed(error.error.message))
            } else {
                Err(AIError::AuthFailed("Invalid API key".to_string()))
            }
        } else {
            Err(AIError::ConnectionFailed(format!(
                "OpenAI response error: {}",
                status
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
            "Test OpenAI".to_string(),
            AIProviderEnum::OpenAI,
            "https://api.openai.com/v1".to_string(),
            "gpt-4o-mini".to_string(),
        )
    }

    #[test]
    fn test_openai_provider_creation() {
        let config = create_test_config();
        let provider = OpenAIProvider::new(config, "test-key".to_string());
        assert_eq!(provider.name(), "OpenAI");
    }

    #[test]
    fn test_api_url() {
        let config = create_test_config();
        let provider = OpenAIProvider::new(config, "test-key".to_string());
        assert_eq!(
            provider.api_url("/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[tokio::test]
    async fn test_list_models_returns_common_models() {
        let config = create_test_config();
        let provider = OpenAIProvider::new(config, "test-key".to_string());
        let models = provider.list_models().await.unwrap();

        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.name == "gpt-4o-mini"));
    }
}
