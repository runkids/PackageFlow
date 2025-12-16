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
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatToolCall, ChatFunctionCall,
    FinishReason, ModelInfo,
};

/// Anthropic API version header value
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Anthropic Provider
pub struct AnthropicProvider {
    config: AIProviderConfig,
    client: Client,
    api_key: String,
}

impl AnthropicProvider {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicMessageContent,
}

/// Anthropic message content can be a string or array of content blocks
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum AnthropicMessageContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

/// Content block for messages (tool_use, tool_result, text)
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type")]
enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
    },
}

/// Tool definition for Anthropic
#[derive(Debug, Serialize, Clone)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
    content: Vec<AnthropicResponseContent>,
    usage: Option<AnthropicUsage>,
    model: String,
    stop_reason: Option<String>,
}

/// Response content can be text or tool_use
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicResponseContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
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

    fn config(&self) -> &AIProviderConfig {
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
                system_message = msg.content;
            } else if msg.role == "tool" {
                // Tool result message - convert to user message with tool_result content
                let tool_use_id = msg.tool_call_id.unwrap_or_default();
                anthropic_messages.push(AnthropicMessage {
                    role: "user".to_string(),
                    content: AnthropicMessageContent::Blocks(vec![
                        AnthropicContentBlock::ToolResult {
                            tool_use_id,
                            content: msg.content.unwrap_or_default(),
                        }
                    ]),
                });
            } else if msg.role == "assistant" && msg.tool_calls.is_some() {
                // Assistant message with tool calls
                let mut blocks = Vec::new();

                // Add text if present
                if let Some(ref text) = msg.content {
                    if !text.is_empty() {
                        blocks.push(AnthropicContentBlock::Text { text: text.clone() });
                    }
                }

                // Add tool_use blocks
                for tc in msg.tool_calls.unwrap_or_default() {
                    let input: serde_json::Value = serde_json::from_str(&tc.function.arguments)
                        .unwrap_or(serde_json::json!({}));
                    blocks.push(AnthropicContentBlock::ToolUse {
                        id: tc.id,
                        name: tc.function.name,
                        input,
                    });
                }

                anthropic_messages.push(AnthropicMessage {
                    role: "assistant".to_string(),
                    content: AnthropicMessageContent::Blocks(blocks),
                });
            } else {
                // Regular text message
                anthropic_messages.push(AnthropicMessage {
                    role: msg.role,
                    content: AnthropicMessageContent::Text(msg.content.unwrap_or_default()),
                });
            }
        }

        // max_tokens is required for Anthropic
        let max_tokens = options.max_tokens.unwrap_or(4096);

        // Convert tools to Anthropic format
        let anthropic_tools: Option<Vec<AnthropicTool>> = options.tools.map(|tools| {
            tools.into_iter().map(|t| AnthropicTool {
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters,
            }).collect()
        });

        let request = AnthropicMessagesRequest {
            model: self.config.model.clone(),
            messages: anthropic_messages,
            max_tokens,
            temperature: options.temperature,
            top_p: options.top_p,
            system: system_message,
            tools: anthropic_tools,
        };

        log::debug!("Anthropic request: {:?}", serde_json::to_string(&request));

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
                    log::warn!("Anthropic rate limit: {}", error.error.message);
                    return Err(AIError::ApiError(format!(
                        "Anthropic API limit: {}",
                        error.error.message
                    )));
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

        log::debug!("Anthropic response: {:?}", anthropic_response);

        // Extract text content and tool_use from response
        let mut text_content = String::new();
        let mut tool_calls: Vec<ChatToolCall> = Vec::new();

        for content_block in &anthropic_response.content {
            match content_block {
                AnthropicResponseContent::Text { text } => {
                    text_content.push_str(text);
                }
                AnthropicResponseContent::ToolUse { id, name, input } => {
                    tool_calls.push(ChatToolCall {
                        id: id.clone(),
                        tool_type: "function".to_string(),
                        function: ChatFunctionCall {
                            name: name.clone(),
                            arguments: input.to_string(),
                        },
                    });
                }
            }
        }

        let tokens_used = anthropic_response
            .usage
            .map(|u| {
                u.input_tokens.unwrap_or(0) + u.output_tokens.unwrap_or(0)
            });

        // Parse stop_reason from Anthropic response
        let finish_reason = anthropic_response.stop_reason.map(|r| match r.as_str() {
            "end_turn" => FinishReason::Stop,
            "stop_sequence" => FinishReason::Stop,
            "max_tokens" => FinishReason::Length,
            "tool_use" => FinishReason::ToolCalls,
            _ => FinishReason::Unknown,
        });

        Ok(ChatResponse {
            content: text_content,
            tokens_used,
            model: anthropic_response.model,
            finish_reason,
            tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
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
                content: AnthropicMessageContent::Text("Hello".to_string()),
            }],
            max_tokens: 1,
            temperature: None,
            top_p: None,
            system: None,
            tools: None,
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

    fn create_test_config() -> AIProviderConfig {
        AIProviderConfig::new(
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
