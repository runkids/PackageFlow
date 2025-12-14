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
    AIServiceConfig, ChatMessage, ChatOptions, ChatResponse, ModelInfo,
};

/// Gemini Provider
pub struct GeminiProvider {
    config: AIServiceConfig,
    client: Client,
    api_key: String,
}

impl GeminiProvider {
    pub fn new(config: AIServiceConfig, api_key: String) -> Self {
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
}

// Gemini API types
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
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
struct GeminiCandidate {
    content: GeminiContent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiUsageMetadata {
    total_token_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GeminiModelsResponse {
    models: Vec<GeminiModelInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelInfo {
    name: String,
    display_name: Option<String>,
    supported_generation_methods: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct GeminiErrorDetail {
    code: Option<u32>,
    message: String,
    status: Option<String>,
}

/// List of Gemini models commonly used for chat
const COMMON_MODELS: &[&str] = &[
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp",
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

    fn config(&self) -> &AIServiceConfig {
        &self.config
    }

    async fn list_models(&self) -> AIResult<Vec<ModelInfo>> {
        // Return static list of common models for simplicity
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
        let url = self.api_url(&format!("/models/{}:generateContent", self.config.model));

        // Convert messages to Gemini format
        // Note: Gemini doesn't have native system message support
        // We prepend system message to the first user message
        let mut contents: Vec<GeminiContent> = Vec::new();
        let mut system_prefix = String::new();

        for msg in messages {
            if msg.role == "system" {
                system_prefix = format!("{}\n\n", msg.content);
            } else {
                let content = if !system_prefix.is_empty() && msg.role == "user" {
                    let full_content = format!("{}{}", system_prefix, msg.content);
                    system_prefix.clear();
                    full_content
                } else {
                    msg.content
                };

                contents.push(GeminiContent {
                    role: to_gemini_role(&msg.role),
                    parts: vec![GeminiPart { text: content }],
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

        let request = GeminiRequest {
            contents,
            generation_config,
        };

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
                        return Err(AIError::RateLimited);
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

        let content = gemini_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content.parts.into_iter().next())
            .map(|p| p.text)
            .unwrap_or_default();

        let tokens_used = gemini_response
            .usage_metadata
            .and_then(|u| u.total_token_count);

        Ok(ChatResponse {
            content,
            tokens_used,
            model: self.config.model.clone(),
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

    fn create_test_config() -> AIServiceConfig {
        AIServiceConfig::new(
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
    async fn test_list_models_returns_common_models() {
        let config = create_test_config();
        let provider = GeminiProvider::new(config, "test-key".to_string());
        let models = provider.list_models().await.unwrap();

        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.name == "gemini-1.5-flash"));
    }

    #[test]
    fn test_to_gemini_role() {
        assert_eq!(to_gemini_role("user"), "user");
        assert_eq!(to_gemini_role("assistant"), "model");
        assert_eq!(to_gemini_role("system"), "user");
    }
}
