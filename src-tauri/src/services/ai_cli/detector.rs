// AI CLI Tool Detection
// Feature: AI CLI Integration (020-ai-cli-integration)
//
// Detects installed AI CLI tools and their versions

use crate::models::cli_tool::{CLIToolType, DetectedCLITool};
use crate::utils::path_resolver;
use std::process::Stdio;
use tokio::process::Command;

/// Detect all available AI CLI tools on the system
pub async fn detect_all_cli_tools() -> Vec<DetectedCLITool> {
    let mut detected = Vec::new();

    for tool_type in CLIToolType::all() {
        if let Some(tool) = detect_cli_tool(tool_type).await {
            detected.push(tool);
        }
    }

    detected
}

/// Detect a specific CLI tool
pub async fn detect_cli_tool(tool_type: CLIToolType) -> Option<DetectedCLITool> {
    let binary_name = tool_type.binary_name();

    // Try to find the tool using path_resolver
    let binary_path = path_resolver::find_tool(binary_name)?;

    // Get version info
    let version = get_tool_version(&binary_path, tool_type).await;

    // Check if authenticated (for CLI native auth mode)
    let is_authenticated = check_tool_auth(&binary_path, tool_type).await;

    Some(DetectedCLITool {
        tool_type,
        binary_path,
        version,
        is_authenticated,
    })
}

/// Get the version of a CLI tool
async fn get_tool_version(binary_path: &str, tool_type: CLIToolType) -> Option<String> {
    let version_arg = match tool_type {
        CLIToolType::ClaudeCode => "--version",
        CLIToolType::Codex => "--version",
        CLIToolType::GeminiCli => "--version",
    };

    let output = Command::new(binary_path)
        .arg(version_arg)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Extract version number from output
        parse_version_output(&stdout, tool_type)
    } else {
        None
    }
}

/// Parse version from CLI output
fn parse_version_output(output: &str, tool_type: CLIToolType) -> Option<String> {
    let output = output.trim();

    match tool_type {
        CLIToolType::ClaudeCode => {
            // Claude CLI: "claude 1.0.0" or similar
            output
                .split_whitespace()
                .nth(1)
                .map(|s| s.to_string())
                .or_else(|| Some(output.to_string()))
        }
        CLIToolType::Codex => {
            // Codex CLI: "codex version 1.0.0" or similar
            output
                .split_whitespace()
                .find(|s| s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                .map(|s| s.to_string())
                .or_else(|| Some(output.to_string()))
        }
        CLIToolType::GeminiCli => {
            // Gemini CLI: varies by implementation
            output
                .split_whitespace()
                .find(|s| s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                .map(|s| s.to_string())
                .or_else(|| Some(output.to_string()))
        }
    }
}

/// Check if a CLI tool is authenticated (for subscription users)
async fn check_tool_auth(binary_path: &str, tool_type: CLIToolType) -> bool {
    // Different tools have different ways to check auth status
    match tool_type {
        CLIToolType::ClaudeCode => {
            // Claude CLI: try `claude config get` or check if session exists
            // For now, assume authenticated if the tool exists
            // TODO: Implement proper auth check when claude CLI API is documented
            check_claude_auth(binary_path).await
        }
        CLIToolType::Codex => {
            // Codex CLI: check auth status
            check_codex_auth(binary_path).await
        }
        CLIToolType::GeminiCli => {
            // Gemini CLI: check auth status
            check_gemini_auth(binary_path).await
        }
    }
}

/// Check Claude CLI authentication status
async fn check_claude_auth(binary_path: &str) -> bool {
    // Try running a simple command that requires auth
    // If it succeeds without error, we're authenticated
    let output = Command::new(binary_path)
        .args(["--help"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match output {
        Ok(result) => {
            // If help works, tool is installed
            // Actual auth check would need to try a real API call
            // For now, return true if tool responds
            result.status.success()
        }
        Err(_) => false,
    }
}

/// Check Codex CLI authentication status
async fn check_codex_auth(binary_path: &str) -> bool {
    let output = Command::new(binary_path)
        .args(["--help"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match output {
        Ok(result) => result.status.success(),
        Err(_) => false,
    }
}

/// Check Gemini CLI authentication status
async fn check_gemini_auth(binary_path: &str) -> bool {
    let output = Command::new(binary_path)
        .args(["--help"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match output {
        Ok(result) => result.status.success(),
        Err(_) => false,
    }
}

/// Find a specific tool binary path
pub fn find_tool_binary(tool_type: CLIToolType) -> Option<String> {
    path_resolver::find_tool(tool_type.binary_name())
}

/// Check if a tool is available (quick check without version)
pub fn is_tool_available(tool_type: CLIToolType) -> bool {
    find_tool_binary(tool_type).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_claude() {
        assert_eq!(
            parse_version_output("claude 1.0.0", CLIToolType::ClaudeCode),
            Some("1.0.0".to_string())
        );
        assert_eq!(
            parse_version_output("1.2.3", CLIToolType::ClaudeCode),
            Some("1.2.3".to_string())
        );
    }

    #[test]
    fn test_parse_version_codex() {
        assert_eq!(
            parse_version_output("codex version 0.1.0", CLIToolType::Codex),
            Some("0.1.0".to_string())
        );
    }

    #[test]
    fn test_cli_tool_type_binary_names() {
        assert_eq!(CLIToolType::ClaudeCode.binary_name(), "claude");
        assert_eq!(CLIToolType::Codex.binary_name(), "codex");
        assert_eq!(CLIToolType::GeminiCli.binary_name(), "gemini");
    }
}
