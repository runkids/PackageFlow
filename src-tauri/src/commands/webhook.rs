// Webhook commands
// Test and validate webhook configurations
// @see specs/012-workflow-webhook-support

use chrono::Utc;
use std::collections::HashMap;

use crate::models::webhook::{WebhookTestResult, DEFAULT_PAYLOAD_TEMPLATE, SUPPORTED_VARIABLES};

/// Test a webhook by sending a test request
/// Returns the result including status code, response time, and any errors
#[tauri::command]
pub async fn test_webhook(
    url: String,
    headers: Option<HashMap<String, String>>,
    payload_template: Option<String>,
) -> Result<WebhookTestResult, String> {
    println!("[webhook] Testing webhook URL: {}", url);

    let start = std::time::Instant::now();

    // Validate URL
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    if parsed_url.scheme() != "https" {
        return Err("Only HTTPS URLs are supported".to_string());
    }

    // Build test payload with sample data
    let template = payload_template
        .as_deref()
        .unwrap_or(DEFAULT_PAYLOAD_TEMPLATE);
    let payload = render_test_template(template);

    // Build HTTP client with 10 second timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Build request
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(payload);

    // Add custom headers
    if let Some(h) = &headers {
        for (key, value) in h {
            request = request.header(key, value);
        }
    }

    // Send request
    match request.send().await {
        Ok(response) => {
            let status_code = response.status().as_u16();
            let success = response.status().is_success();

            // Get response body (truncated to 1000 chars, handle UTF-8)
            let body = match response.text().await {
                Ok(text) => {
                    let char_count = text.chars().count();
                    if char_count > 1000 {
                        let truncated: String = text.chars().take(1000).collect();
                        Some(format!("{}...", truncated))
                    } else {
                        Some(text)
                    }
                }
                Err(_) => None,
            };

            let response_time = start.elapsed().as_millis() as u64;
            println!(
                "[webhook] Test response: {} ({}ms)",
                status_code, response_time
            );

            Ok(WebhookTestResult {
                success,
                status_code: Some(status_code),
                response_body: body,
                error: if success {
                    None
                } else {
                    Some(format!("HTTP {}", status_code))
                },
                response_time,
            })
        }
        Err(e) => {
            let response_time = start.elapsed().as_millis() as u64;
            let error_msg = if e.is_timeout() {
                "Request timed out (10s)".to_string()
            } else if e.is_connect() {
                "Connection failed".to_string()
            } else {
                e.to_string()
            };

            println!("[webhook] Test error: {} ({}ms)", error_msg, response_time);

            Ok(WebhookTestResult {
                success: false,
                status_code: None,
                response_body: None,
                error: Some(error_msg),
                response_time,
            })
        }
    }
}

/// Render template with sample test data
fn render_test_template(template: &str) -> String {
    let now = Utc::now().to_rfc3339();

    // Use regex for variable substitution with test values
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();

    re.replace_all(template, |caps: &regex::Captures| {
        match &caps[1] {
            "workflow_id" => "test-workflow-id".to_string(),
            "workflow_name" => "Test Workflow".to_string(),
            "execution_id" => "test-execution-id".to_string(),
            "status" => "completed".to_string(),
            "duration" => "1234".to_string(),
            "timestamp" => now.clone(),
            "error_message" => "".to_string(),
            _ => caps[0].to_string(), // Keep unknown variables as-is
        }
    })
    .to_string()
}

/// Validate payload template variables
/// Returns list of invalid variables found in the template
#[tauri::command]
pub fn validate_template_variables(template: String) -> Vec<String> {
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();
    let mut invalid_vars: Vec<String> = Vec::new();

    for caps in re.captures_iter(&template) {
        let var_name = &caps[1];
        if !SUPPORTED_VARIABLES.contains(&var_name) {
            invalid_vars.push(var_name.to_string());
        }
    }

    invalid_vars
}
