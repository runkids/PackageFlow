// Gemini Provider Implementation
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Google Gemini provides advanced language models via their API.
// Requires API key.
// Default endpoint: https://generativelanguage.googleapis.com/v1beta

use async_trait::async_trait;
use reqwest::{Client, header::{HeaderMap, HeaderValue, CONTENT_TYPE}};
use serde::{Deserialize, Serialize};
use std::time::Instant;

use super::{AIError, AIProvider, AIResult};
use crate::models::ai::{
    AIProviderConfig, ChatMessage, ChatOptions, ChatResponse, ChatToolCall, ChatFunctionCall,
    FinishReason, ModelInfo,
};

/// Gemini Provider
pub struct GeminiProvider {
    config: AIProviderConfig,
    client: Client,
    api_key: String,
}

impl GeminiProvider {
    pub fn new(config: AIProviderConfig, api_key: String) -> Self {
        Self {
            config,
            client: Client::new(),
            api_key,
        }
    }

    fn api_url(&self, path: &str) -> String {
        let base = self.config.endpoint.trim_end_matches('/');
        format!("{}{}?key={}", base, path, self.api_key)
    }

    fn content_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    fn fallback_models() -> Vec<ModelInfo> {
        FALLBACK_MODELS
            .iter()
            .map(|&name| ModelInfo {
                name: name.to_string(),
                size: None,
                modified_at: None,
            })
            .collect()
    }
}

// Gemini API types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

/// Gemini part can be text, functionCall, or functionResponse
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    function_call: Option<GeminiFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    function_response: Option<GeminiFunctionResponse>,
    /// Thought signature for preserving reasoning context (Gemini 2.5+ requirement)
    #[serde(skip_serializing_if = "Option::is_none")]
    thought_signature: Option<String>,
}

/// Tool definition for Gemini
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GeminiTool {
    function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize, Clone)]
struct GeminiFunctionDeclaration {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

/// Function call in response
#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

/// Function response to send back
#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeminiFunctionResponse {
    name: String,
    response: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    usage_metadata: Option<GeminiUsageMetadata>,
    error: Option<GeminiErrorDetail>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiCandidate {
    content: GeminiContent,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    total_token_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GeminiErrorDetail {
    code: Option<u32>,
    message: String,
    status: Option<String>,
}

/// Response from GET /models endpoint
#[derive(Debug, Deserialize)]
struct GeminiModelsResponse {
    models: Option<Vec<GeminiModelInfo>>,
}

/// Model info from API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelInfo {
    /// Resource name like "models/gemini-1.5-flash"
    name: String,
    /// Supported generation methods (e.g., "generateContent")
    supported_generation_methods: Option<Vec<String>>,
}

/// Fallback static list if API call fails
const FALLBACK_MODELS: &[&str] = &[
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
];

/// Convert ChatMessage role to Gemini role
fn to_gemini_role(role: &str) -> String {
    match role {
        "assistant" => "model".to_string(),
        "system" => "user".to_string(), // Gemini handles system as user with special formatting
        _ => role.to_string(),
    }
}

#[async_trait]
impl AIProvider for GeminiProvider {
    fn name(&self) -> &str {
        "Gemini"
    }

    fn config(&self) -> &AIProviderConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        let url = self.api_url("/models");

        let response = self.client
            .get(&url)
            .headers(self.content_headers())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let body = resp.text().await.unwrap_or_default();
                if let Ok(models_response) = serde_json::from_str::<GeminiModelsResponse>(&body) {
                    let models: Vec<ModelInfo> = models_response
                        .models
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|m| {
                            // Only include models that support generateContent (chat)
                            m.supported_generation_methods
                                .as_ref()
                                .map(|methods| methods.iter().any(|method| method == "generateContent"))
                                .unwrap_or(false)
                        })
                        .map(|m| {
                            // Extract model ID from "models/gemini-1.5-flash" format
                            let model_id = m.name.strip_prefix("models/").unwrap_or(&m.name);
                            ModelInfo {
                                name: model_id.to_string(),
                                size: None,
                                modified_at: None,
                            }
                        })
                        .collect();

                    if !models.is_empty() {
                        return Ok(models);
                    }
                }
                // Fallback to static list if parsing failed or no models returned
                log::warn!("Failed to parse Gemini models response, using fallback list");
                Ok(Self::fallback_models())
            }
            Ok(resp) => {
                log::warn!("Gemini models API returned {}, using fallback list", resp.status());
                Ok(Self::fallback_models())
            }
            Err(e) => {
                log::warn!("Failed to fetch Gemini models: {}, using fallback list", e);
                Ok(Self::fallback_models())
            }
        }
    }

    async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        options: ChatOptions,
    ) -> AIResult<ChatResponse> {
        let url = self.api_url(&format!("/models/{}:generateContent", self.config.model));

        // Convert messages to Gemini format
        // Note: Gemini doesn't have native system message support
        // We prepend system message to the first user message
        let mut contents: Vec<GeminiContent> = Vec::new();
        let mut system_prefix = String::new();

        for msg in messages {
            if msg.role == "system" {
                system_prefix = format!("{}\n\n", msg.content.unwrap_or_default());
            } else if msg.role == "tool" {
                // Tool result - send as functionResponse
                let tool_call_id = msg.tool_call_id.unwrap_or_default();
                // Extract function name from tool_call_id (we encode it as "funcname_id")
                let func_name = tool_call_id.split('_').next().unwrap_or(&tool_call_id).to_string();

                contents.push(GeminiContent {
                    role: "user".to_string(),
                    parts: vec![GeminiPart {
                        text: None,
                        function_call: None,
                        function_response: Some(GeminiFunctionResponse {
                            name: func_name,
                            response: serde_json::json!({ "result": msg.content.unwrap_or_default() }),
                        }),
                        thought_signature: None,
                    }],
                });
            } else if msg.role == "assistant" && msg.tool_calls.is_some() {
                // Assistant message with function calls
                let mut parts = Vec::new();

                // Add text if present
                if let Some(ref text) = msg.content {
                    if !text.is_empty() {
                        parts.push(GeminiPart {
                            text: Some(text.clone()),
                            function_call: None,
                            function_response: None,
                            thought_signature: None,
                        });
                    }
                }

                // Add function calls with thought_signature if present
                for tc in msg.tool_calls.unwrap_or_default() {
                    let args: serde_json::Value = serde_json::from_str(&tc.function.arguments)
                        .unwrap_or(serde_json::json!({}));
                    parts.push(GeminiPart {
                        text: None,
                        function_call: Some(GeminiFunctionCall {
                            name: tc.function.name,
                            args,
                        }),
                        function_response: None,
                        // Include thought_signature for Gemini 2.5+ models
                        thought_signature: tc.thought_signature,
                    });
                }

                contents.push(GeminiContent {
                    role: "model".to_string(),
                    parts,
                });
            } else {
                // Regular text message
                let msg_content = msg.content.unwrap_or_default();
                let content = if !system_prefix.is_empty() && msg.role == "user" {
                    let full_content = format!("{}{}", system_prefix, msg_content);
                    system_prefix.clear();
                    full_content
                } else {
                    msg_content
                };

                contents.push(GeminiContent {
                    role: to_gemini_role(&msg.role),
                    parts: vec![GeminiPart {
                        text: Some(content),
                        function_call: None,
                        function_response: None,
                        thought_signature: None,
                    }],
                });
            }
        }

        let generation_config = if options.temperature.is_some()
            || options.max_tokens.is_some()
            || options.top_p.is_some()
        {
            Some(GeminiGenerationConfig {
                temperature: options.temperature,
                max_output_tokens: options.max_tokens,
                top_p: options.top_p,
            })
        } else {
            None
        };

        // Convert tools to Gemini format
        let gemini_tools: Option<Vec<GeminiTool>> = options.tools.map(|tools| {
            vec![GeminiTool {
                function_declarations: tools.into_iter().map(|t| GeminiFunctionDeclaration {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                }).collect(),
            }]
        });

        let request = GeminiRequest {
            contents,
            generation_config,
            tools: gemini_tools,
        };

        log::debug!("Gemini request: {:?}", serde_json::to_string(&request));

        let response = self.client
            .post(&url)
            .headers(self.content_headers())
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            // Try to parse Gemini error format
            if let Ok(error_response) = serde_json::from_str::<GeminiResponse>(&body) {
                if let Some(error) = error_response.error {
                    let error_code = error.code.unwrap_or(status.as_u16() as u32);
                    let error_status = error.status.as_deref().unwrap_or("");

                    if error_code == 401 || error_status == "UNAUTHENTICATED" {
                        return Err(AIError::AuthFailed(error.message));
                    }

                    if error_code == 429 || error_status == "RESOURCE_EXHAUSTED" {
                        // Log the actual message for debugging
                        log::warn!("Gemini RESOURCE_EXHAUSTED: {}", error.message);
                        // Include actual message - could be quota, billing, or rate limit
                        return Err(AIError::ApiError(format!(
                            "Gemini API limit: {}",
                            error.message
                        )));
                    }

                    if error_status == "NOT_FOUND" || error.message.contains("not found") {
                        return Err(AIError::ModelNotFound(self.config.model.clone()));
                    }

                    return Err(AIError::ApiError(error.message));
                }
            }

            return Err(AIError::ApiError(format!(
                "Gemini API error ({}): {}",
                status, body
            )));
        }

        let gemini_response: GeminiResponse = serde_json::from_str(&body)?;

        log::debug!("Gemini response: {:?}", gemini_response);

        let first_candidate = gemini_response.candidates.and_then(|c| c.into_iter().next());

        // Extract text content and function calls
        let mut text_content = String::new();
        let mut tool_calls: Vec<ChatToolCall> = Vec::new();

        if let Some(ref candidate) = first_candidate {
            for part in &candidate.content.parts {
                if let Some(ref text) = part.text {
                    text_content.push_str(text);
                }
                if let Some(ref fc) = part.function_call {
                    // Generate a unique ID for the tool call
                    let id = format!("{}_{}", fc.name, uuid::Uuid::new_v4().to_string().replace("-", "")[..8].to_string());
                    tool_calls.push(ChatToolCall {
                        id,
                        tool_type: "function".to_string(),
                        function: ChatFunctionCall {
                            name: fc.name.clone(),
                            arguments: fc.args.to_string(),
                        },
                        // Capture thought_signature for Gemini 2.5+ models
                        thought_signature: part.thought_signature.clone(),
                    });
                }
            }
        }

        let tokens_used = gemini_response
            .usage_metadata
            .and_then(|u| u.total_token_count);

        // Parse finish_reason from Gemini response
        let finish_reason = first_candidate
            .and_then(|c| c.finish_reason)
            .map(|r| match r.as_str() {
                "STOP" => FinishReason::Stop,
                "MAX_TOKENS" => FinishReason::Length,
                "SAFETY" => FinishReason::ContentFilter,
                "RECITATION" => FinishReason::ContentFilter,
                _ => FinishReason::Unknown,
            });

        // If we have tool calls, the finish reason should be ToolCalls
        let finish_reason = if !tool_calls.is_empty() {
            Some(FinishReason::ToolCalls)
        } else {
            finish_reason
        };

        Ok(ChatResponse {
            content: text_content,
            tokens_used,
            model: self.config.model.clone(),
            finish_reason,
            tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
        })
    }

    async fn test_connection(&self) -> AIResult<bool> {
        let url = self.api_url("/models");
        let start = Instant::now();

        let response = self.client
            .get(&url)
            .headers(self.content_headers())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else if e.is_connect() {
                    AIError::ConnectionFailed(format!(
                        "Cannot connect to Gemini service ({}): {}",
                        self.config.endpoint, e
                    ))
                } else {
                    AIError::ConnectionFailed(e.to_string())
                }
            })?;

        let latency = start.elapsed().as_millis() as u64;
        let status = response.status();

        if status.is_success() {
            log::info!("Gemini connection successful, latency: {}ms", latency);
            Ok(true)
        } else if status.as_u16() == 400 || status.as_u16() == 401 {
            let body = response.text().await.unwrap_or_default();
            if let Ok(error_response) = serde_json::from_str::<GeminiResponse>(&body) {
                if let Some(error) = error_response.error {
                    return Err(AIError::AuthFailed(error.message));
                }
            }
            Err(AIError::AuthFailed("Invalid API key".to_string()))
        } else {
            Err(AIError::ConnectionFailed(format!(
                "Gemini response error: {}",
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
            "Test Gemini".to_string(),
            AIProviderEnum::Gemini,
            "https://generativelanguage.googleapis.com/v1beta".to_string(),
            "gemini-1.5-flash".to_string(),
        )
    }

    #[test]
    fn test_gemini_provider_creation() {
        let config = create_test_config();
        let provider = GeminiProvider::new(config, "test-key".to_string());
        assert_eq!(provider.name(), "Gemini");
    }

    #[test]
    fn test_api_url() {
        let config = create_test_config();
        let provider = GeminiProvider::new(config, "test-key".to_string());
        assert!(provider.api_url("/models").contains("key=test-key"));
    }

    #[tokio::test]
    async fn test_list_models_returns_fallback_on_invalid_key() {
        let config = create_test_config();
        let provider = GeminiProvider::new(config, "invalid-test-key".to_string());
        // With an invalid key, it should fall back to static list
        let models = provider.list_models().await.unwrap();

        assert!(!models.is_empty());
        // Should contain fallback models
        assert!(models.iter().any(|m| m.name == "gemini-1.5-flash" || m.name == "gemini-2.5-flash"));
    }

    #[test]
    fn test_fallback_models() {
        let models = GeminiProvider::fallback_models();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.name == "gemini-2.5-flash"));
        assert!(models.iter().any(|m| m.name == "gemini-1.5-flash"));
    }

    #[test]
    fn test_to_gemini_role() {
        assert_eq!(to_gemini_role("user"), "user");
        assert_eq!(to_gemini_role("assistant"), "model");
        assert_eq!(to_gemini_role("system"), "user");
    }
}
