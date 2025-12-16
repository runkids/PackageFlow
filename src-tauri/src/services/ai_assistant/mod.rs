// AI Assistant Service Module
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// This module provides the core AI assistant functionality including:
// - Chat conversation management
// - Streaming response handling
// - Tool/function calling for MCP operations
// - Input sanitization for security
// - Path security and project boundary enforcement

pub mod sanitizer;
pub mod security;
pub mod service;
pub mod stream;
pub mod tools;

// Re-export main types
pub use sanitizer::InputSanitizer;
pub use security::{PathSecurityValidator, ToolPermissionChecker, OutputSanitizer, SecurityError};
pub use service::{AIAssistantService, ProjectContextBuilder, build_system_prompt};
pub use stream::{StreamManager, StreamContext};
pub use tools::MCPToolHandler;
