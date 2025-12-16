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
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatToolCall, ChatFunctionCall,
    FinishReason, ModelInfo,
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
#[derive(Debug, Serialize, Clone)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OllamaTool>>,
}

#[derive(Debug, Serialize, Clone)]
struct OllamaMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OllamaToolCall>>,
    /// For tool result messages
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
}

/// Tool definition for Ollama
#[derive(Debug, Serialize, Clone)]
struct OllamaTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OllamaFunctionDef,
}

#[derive(Debug, Serialize, Clone)]
struct OllamaFunctionDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

/// Tool call in response
#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaToolCall {
    #[serde(rename = "type", default = "default_function_type")]
    tool_type: String,
    function: OllamaFunctionCall,
}

fn default_function_type() -> String {
    "function".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaFunctionCall {
    #[serde(default)]
    index: Option<i32>,
    name: String,
    arguments: serde_json::Value,
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
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<OllamaToolCall>>,
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

        // Convert messages to Ollama format
        let ollama_messages: Vec<OllamaMessage> = messages
            .into_iter()
            .map(|m| {
                // Convert tool_calls if present
                let tool_calls = m.tool_calls.map(|calls| {
                    calls.into_iter().map(|tc| OllamaToolCall {
                        tool_type: tc.tool_type,
                        function: OllamaFunctionCall {
                            index: None,
                            name: tc.function.name,
                            arguments: serde_json::from_str(&tc.function.arguments)
                                .unwrap_or(serde_json::json!({})),
                        },
                    }).collect()
                });

                OllamaMessage {
                    role: m.role,
                    content: m.content,
                    tool_calls,
                    tool_call_id: m.tool_call_id,
                }
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

        // Convert tools to Ollama format
        let ollama_tools: Option<Vec<OllamaTool>> = options.tools.map(|tools| {
            tools.into_iter().map(|t| OllamaTool {
                tool_type: t.tool_type,
                function: OllamaFunctionDef {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }).collect()
        });

        let request = OllamaChatRequest {
            model: self.config.model.clone(),
            messages: ollama_messages,
            stream: false,
            options: ollama_options,
            tools: ollama_tools,
        };

        log::debug!("Ollama request: {:?}", serde_json::to_string(&request));

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

            // Check if it's a tool parsing error - retry without tools
            if body.contains("error parsing tool call") || body.contains("tool") && body.contains("invalid") {
                log::warn!(
                    "Ollama model {} doesn't support function calling properly, retrying without tools",
                    self.config.model
                );

                // Retry without tools
                let retry_request = OllamaChatRequest {
                    model: request.model.clone(),
                    messages: request.messages.clone(),
                    stream: false,
                    options: request.options.clone(),
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
                        "Ollama API error ({}): {}",
                        status, retry_body
                    )));
                }

                let ollama_response: OllamaChatResponse = retry_response.json().await?;
                return Ok(ChatResponse {
                    content: ollama_response.message.content.unwrap_or_default(),
                    tokens_used: ollama_response.eval_count,
                    model: self.config.model.clone(),
                    finish_reason: ollama_response.done_reason.map(|r| match r.as_str() {
                        "stop" => FinishReason::Stop,
                        "length" => FinishReason::Length,
                        _ => FinishReason::Unknown,
                    }),
                    tool_calls: None,
                });
            }

            return Err(AIError::ApiError(format!(
                "Ollama API error ({}): {}",
                status, body
            )));
        }

        let ollama_response: OllamaChatResponse = response.json().await?;

        log::debug!("Ollama response message: {:?}", ollama_response.message);

        // Parse done_reason from Ollama response
        let finish_reason = if ollama_response.message.tool_calls.is_some() {
            Some(FinishReason::ToolCalls)
        } else {
            ollama_response.done_reason.map(|r| match r.as_str() {
                "stop" => FinishReason::Stop,
                "length" => FinishReason::Length,
                _ => FinishReason::Unknown,
            })
        };

        // Convert tool_calls to our format
        let tool_calls = ollama_response.message.tool_calls.map(|calls| {
            calls.into_iter().enumerate().map(|(idx, tc)| {
                // Generate a unique ID for the tool call
                let id = format!("call_ollama_{}", uuid::Uuid::new_v4().to_string().replace("-", "")[..12].to_string());

                ChatToolCall {
                    id,
                    tool_type: tc.tool_type,
                    function: ChatFunctionCall {
                        name: tc.function.name,
                        arguments: tc.function.arguments.to_string(),
                    },
                }
            }).collect()
        });

        Ok(ChatResponse {
            content: ollama_response.message.content.unwrap_or_default(),
            tokens_used: ollama_response.eval_count,
            model: self.config.model.clone(),
            finish_reason,
            tool_calls,
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
