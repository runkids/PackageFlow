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
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatToolCall, ChatFunctionCall,
    FinishReason, ModelInfo,
};

/// LM Studio Provider
pub struct LMStudioProvider {
    config: AIProviderConfig,
    client: Client,
}

impl LMStudioProvider {
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

// OpenAI-compatible API types for LM Studio
#[derive(Debug, Serialize, Clone)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
}

#[derive(Debug, Serialize, Clone)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

/// Tool definition for OpenAI-compatible API
#[derive(Debug, Serialize, Clone)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunctionDef,
}

#[derive(Debug, Serialize, Clone)]
struct OpenAIFunctionDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

/// Tool call in request/response
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
    #[serde(default)]
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

#[async_trait]
impl AIProvider for LMStudioProvider {
    fn name(&self) -> &str {
        "LM Studio"
    }

    fn config(&self) -> &AIProviderConfig {
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

        // Convert messages to OpenAI format
        let openai_messages: Vec<OpenAIMessage> = messages
            .into_iter()
            .map(|m| {
                // Convert tool_calls if present
                let tool_calls = m.tool_calls.map(|calls| {
                    calls.into_iter().map(|tc| OpenAIToolCall {
                        id: tc.id,
                        tool_type: tc.tool_type,
                        function: OpenAIFunctionCall {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    }).collect()
                });

                OpenAIMessage {
                    role: m.role,
                    content: m.content,
                    tool_calls,
                    tool_call_id: m.tool_call_id,
                }
            })
            .collect();

        // Convert tools to OpenAI format
        let openai_tools: Option<Vec<OpenAITool>> = options.tools.map(|tools| {
            tools.into_iter().map(|t| OpenAITool {
                tool_type: t.tool_type,
                function: OpenAIFunctionDef {
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
            stream: false,
            tools: openai_tools,
        };

        log::debug!("LM Studio request: {:?}", serde_json::to_string(&request));

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

            // Check if it's a tool-related error - retry without tools
            if (body.contains("tool") || body.contains("function")) &&
               (body.contains("invalid") || body.contains("error") || body.contains("not supported")) {
                log::warn!(
                    "LM Studio model {} doesn't support function calling properly, retrying without tools",
                    self.config.model
                );

                // Retry without tools
                let retry_request = OpenAIChatRequest {
                    model: request.model.clone(),
                    messages: request.messages.clone(),
                    temperature: request.temperature,
                    max_tokens: request.max_tokens,
                    top_p: request.top_p,
                    stream: false,
                    tools: None, // Remove tools
                };

                let retry_response = self.client
                    .post(&url)
                    .json(&retry_request)
                    .send()
                    .await
                    .map_err(|e| AIError::ConnectionFailed(e.to_string()))?;

                if !retry_response.status().is_success() {
                    let retry_body = retry_response.text().await.unwrap_or_default();
                    return Err(AIError::ApiError(format!(
                        "LM Studio API error ({}): {}",
                        status, retry_body
                    )));
                }

                let openai_response: OpenAIChatResponse = retry_response.json().await?;
                let first_choice = openai_response.choices.first();
                return Ok(ChatResponse {
                    content: first_choice.and_then(|c| c.message.content.clone()).unwrap_or_default(),
                    tokens_used: openai_response.usage.and_then(|u| u.total_tokens),
                    model: openai_response.model,
                    finish_reason: first_choice
                        .and_then(|c| c.finish_reason.as_ref())
                        .map(|r| match r.as_str() {
                            "stop" => FinishReason::Stop,
                            "length" => FinishReason::Length,
                            _ => FinishReason::Unknown,
                        }),
                    tool_calls: None,
                });
            }

            return Err(AIError::ApiError(format!(
                "LM Studio API error ({}): {}",
                status, body
            )));
        }

        let openai_response: OpenAIChatResponse = response.json().await?;

        log::debug!("LM Studio response: {:?}", openai_response);

        let first_choice = openai_response.choices.first();

        let content = first_choice
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        let tokens_used = openai_response
            .usage
            .and_then(|u| u.total_tokens);

        // Parse finish_reason from OpenAI-compatible response
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

    fn create_test_config() -> AIProviderConfig {
        AIProviderConfig::new(
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
