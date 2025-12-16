// AI CLI Security Utilities
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Security measures for CLI tool execution:
// - Output sanitization (redact API keys)
// - Argument validation (prevent injection)
// - Working directory validation

use regex::Regex;
use std::path::Path;

/// Forbidden patterns in command arguments
const FORBIDDEN_ARG_PATTERNS: &[&str] = &[
    "--api-key",
    "--api_key",
    "--apikey",
    "--token",
    "--secret",
    "--password",
    "--key=",
    "-k=",
];

/// API key patterns to redact from output
const API_KEY_PATTERNS: &[(&str, &str)] = &[
    // Anthropic API keys
    (r"sk-ant-[a-zA-Z0-9_-]{40,}", "[REDACTED_ANTHROPIC_KEY]"),
    // OpenAI API keys
    (r"sk-[a-zA-Z0-9]{48,}", "[REDACTED_OPENAI_KEY]"),
    (r"sk-proj-[a-zA-Z0-9_-]{40,}", "[REDACTED_OPENAI_KEY]"),
    // Google API keys
    (r"AIza[a-zA-Z0-9_-]{35}", "[REDACTED_GOOGLE_KEY]"),
    // Generic patterns
    (r"(?i)api[_-]?key[:\s=]+\S{20,}", "[REDACTED_API_KEY]"),
    (r"(?i)bearer\s+[a-zA-Z0-9._-]+", "[REDACTED_BEARER_TOKEN]"),
];

/// Validate command arguments for security
pub fn validate_arguments(args: &[String]) -> Result<(), String> {
    for arg in args {
        let arg_lower = arg.to_lowercase();
        for pattern in FORBIDDEN_ARG_PATTERNS {
            if arg_lower.contains(pattern) {
                return Err(format!(
                    "Forbidden argument pattern detected: '{}'. API keys should be passed via environment variables.",
                    pattern
                ));
            }
        }
    }
    Ok(())
}

/// Sanitize CLI output to redact sensitive information
pub fn sanitize_output(output: &str) -> String {
    let mut result = output.to_string();

    for (pattern, replacement) in API_KEY_PATTERNS {
        if let Ok(re) = Regex::new(pattern) {
            result = re.replace_all(&result, *replacement).to_string();
        }
    }

    result
}

/// Validate working directory
pub fn validate_working_directory(path: &str) -> Result<(), String> {
    let path = Path::new(path);

    // Check if path exists
    if !path.exists() {
        return Err(format!("Working directory does not exist: {}", path.display()));
    }

    // Check if it's a directory
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    // Check for path traversal attempts
    let path_str = path.to_string_lossy();
    if path_str.contains("..") {
        return Err("Path traversal detected: '..' is not allowed".to_string());
    }

    // Ensure path is absolute
    if !path.is_absolute() {
        return Err("Working directory must be an absolute path".to_string());
    }

    // Check that path is within user-accessible areas
    // On macOS, typically under /Users or /tmp
    #[cfg(target_os = "macos")]
    {
        let path_str = path.to_string_lossy();
        let allowed_prefixes = ["/Users/", "/tmp/", "/var/folders/", "/private/tmp/"];
        if !allowed_prefixes.iter().any(|prefix| path_str.starts_with(prefix)) {
            return Err(format!(
                "Working directory must be within user-accessible areas: {}",
                path.display()
            ));
        }
    }

    Ok(())
}

/// Sanitize a single line of output (for streaming)
pub fn sanitize_line(line: &str) -> String {
    sanitize_output(line)
}

/// Check if a string looks like it might contain an API key
pub fn might_contain_api_key(text: &str) -> bool {
    for (pattern, _) in API_KEY_PATTERNS {
        if let Ok(re) = Regex::new(pattern) {
            if re.is_match(text) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_arguments_ok() {
        let args = vec!["--help".to_string(), "-v".to_string()];
        assert!(validate_arguments(&args).is_ok());
    }

    #[test]
    fn test_validate_arguments_forbidden() {
        let args = vec!["--api-key".to_string(), "sk-123".to_string()];
        assert!(validate_arguments(&args).is_err());
    }

    #[test]
    fn test_sanitize_output_anthropic_key() {
        let input = "Using key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789012345678";
        let output = sanitize_output(input);
        assert!(!output.contains("sk-ant"));
        assert!(output.contains("[REDACTED_ANTHROPIC_KEY]"));
    }

    #[test]
    fn test_sanitize_output_openai_key() {
        let input = "API Key: sk-proj-abcdefghijklmnopqrstuvwxyz123456789012345678901234";
        let output = sanitize_output(input);
        assert!(!output.contains("sk-proj"));
        assert!(output.contains("[REDACTED_OPENAI_KEY]"));
    }

    #[test]
    fn test_sanitize_output_google_key() {
        let input = "Key: AIzaSyAbcdefghijklmnopqrstuvwxyz12345";
        let output = sanitize_output(input);
        assert!(!output.contains("AIzaSy"));
        assert!(output.contains("[REDACTED_GOOGLE_KEY]"));
    }

    #[test]
    fn test_sanitize_output_no_keys() {
        let input = "Hello world! This is a normal message.";
        let output = sanitize_output(input);
        assert_eq!(input, output);
    }

    #[test]
    fn test_validate_working_directory_not_exist() {
        let result = validate_working_directory("/nonexistent/path/12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_working_directory_path_traversal() {
        let result = validate_working_directory("/Users/../etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn test_might_contain_api_key() {
        assert!(might_contain_api_key("sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789012345678"));
        assert!(might_contain_api_key("sk-proj-abcdefghijklmnopqrstuvwxyz123456789012345678901234"));
        assert!(!might_contain_api_key("Hello world"));
    }
}
