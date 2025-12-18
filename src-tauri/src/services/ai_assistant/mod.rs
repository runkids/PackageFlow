// AI Assistant Service Module
// Feature: AI Assistant Tab (022-ai-assistant-tab)
// Enhancement: Enhanced AI Chat Experience (023-enhanced-ai-chat)
//
// This module provides the core AI assistant functionality including:
// - Chat conversation management
// - Streaming response handling
// - Tool/function calling for MCP operations
// - Input sanitization for security
// - Path security and project boundary enforcement
// - Structured system prompt building (023)
// - Interactive element parsing (023-US3)
// - Context management for long conversations (023-US5)

pub mod background_process;
pub mod context_manager;
pub mod interactive;
pub mod process_manager;
pub mod prompt_builder;
pub mod sanitizer;
pub mod security;
pub mod service;
pub mod stream;
pub mod tools;

// Re-export main types
pub use context_manager::{ContextManager, ContextConfig, PreparedContext, ToolCallSummary};
pub use interactive::{parse_interactive_elements, get_clean_content, has_interactive_elements, get_element_positions};
pub use process_manager::{ProcessManager, ProcessStatus, PROCESS_MANAGER};
pub use prompt_builder::{SystemPromptBuilder, build_system_prompt_with_tools};
pub use sanitizer::InputSanitizer;
pub use security::{PathSecurityValidator, ToolPermissionChecker, OutputSanitizer, SecurityError};
pub use service::{AIAssistantService, ProjectContextBuilder, build_system_prompt};
pub use stream::{StreamManager, StreamContext, ActiveStreamInfo, StreamInfoRef};
pub use tools::MCPToolHandler;
