// AI Assistant data models
// Feature: AI Assistant Tab (022-ai-assistant-tab)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Core Entities
// ============================================================================

/// Conversation entity - represents a chat session between user and AI assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Display title (auto-generated or user-defined)
    pub title: Option<String>,
    /// Associated project path for context
    pub project_path: Option<String>,
    /// AI provider ID used for this conversation
    pub provider_id: Option<String>,
    /// Cached message count for performance
    pub message_count: i64,
    /// When conversation started
    pub created_at: DateTime<Utc>,
    /// When conversation last modified
    pub updated_at: DateTime<Utc>,
}

impl Conversation {
    /// Create a new conversation with only project and provider context
    pub fn new(project_path: Option<String>, provider_id: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            title: None,
            project_path,
            provider_id,
            message_count: 0,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a new conversation with title
    pub fn with_title(title: String, project_path: Option<String>, provider_id: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            title: Some(title),
            project_path,
            provider_id,
            message_count: 0,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Conversation summary for list display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: Option<String>,
    pub project_path: Option<String>,
    pub message_count: i64,
    pub last_message_preview: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Message entity - individual message within a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Parent conversation ID
    pub conversation_id: String,
    /// Message author role
    pub role: MessageRole,
    /// Message text content
    pub content: String,
    /// Tool calls requested by AI (JSON array)
    pub tool_calls: Option<Vec<ToolCall>>,
    /// Tool execution results (JSON array)
    pub tool_results: Option<Vec<ToolResult>>,
    /// Message delivery status
    pub status: MessageStatus,
    /// Token count (for AI messages)
    pub tokens_used: Option<i64>,
    /// Model used (for AI messages)
    pub model: Option<String>,
    /// When message was created
    pub created_at: DateTime<Utc>,
}

impl Message {
    /// Create a new user message
    pub fn user(conversation_id: String, content: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conversation_id,
            role: MessageRole::User,
            content,
            tool_calls: None,
            tool_results: None,
            status: MessageStatus::Sent,
            tokens_used: None,
            model: None,
            created_at: Utc::now(),
        }
    }

    /// Create a new assistant message (initially pending)
    pub fn assistant(conversation_id: String, initial_content: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conversation_id,
            role: MessageRole::Assistant,
            content: initial_content,
            tool_calls: None,
            tool_results: None,
            status: MessageStatus::Pending,
            tokens_used: None,
            model: None,
            created_at: Utc::now(),
        }
    }

    /// Create a system message
    pub fn system(conversation_id: String, content: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conversation_id,
            role: MessageRole::System,
            content,
            tool_calls: None,
            tool_results: None,
            status: MessageStatus::Sent,
            tokens_used: None,
            model: None,
            created_at: Utc::now(),
        }
    }

    /// Create a tool result message
    pub fn tool_result(conversation_id: String, content: String, results: Vec<ToolResult>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conversation_id,
            role: MessageRole::Tool,
            content,
            tool_calls: None,
            tool_results: Some(results),
            status: MessageStatus::Sent,
            tokens_used: None,
            model: None,
            created_at: Utc::now(),
        }
    }
}

// ============================================================================
// Enums
// ============================================================================

/// Message author role
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageRole::User => write!(f, "user"),
            MessageRole::Assistant => write!(f, "assistant"),
            MessageRole::System => write!(f, "system"),
            MessageRole::Tool => write!(f, "tool"),
        }
    }
}

impl std::str::FromStr for MessageRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(MessageRole::User),
            "assistant" => Ok(MessageRole::Assistant),
            "system" => Ok(MessageRole::System),
            "tool" => Ok(MessageRole::Tool),
            _ => Err(format!("Invalid message role: {}", s)),
        }
    }
}

/// Message delivery status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus {
    Pending,
    Sent,
    Error,
}

impl std::fmt::Display for MessageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageStatus::Pending => write!(f, "pending"),
            MessageStatus::Sent => write!(f, "sent"),
            MessageStatus::Error => write!(f, "error"),
        }
    }
}

impl std::str::FromStr for MessageStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "pending" => Ok(MessageStatus::Pending),
            "sent" => Ok(MessageStatus::Sent),
            "error" => Ok(MessageStatus::Error),
            _ => Err(format!("Invalid message status: {}", s)),
        }
    }
}

/// Tool call status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Pending,
    Approved,
    Denied,
    Completed,
    Failed,
}

impl std::fmt::Display for ToolCallStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolCallStatus::Pending => write!(f, "pending"),
            ToolCallStatus::Approved => write!(f, "approved"),
            ToolCallStatus::Denied => write!(f, "denied"),
            ToolCallStatus::Completed => write!(f, "completed"),
            ToolCallStatus::Failed => write!(f, "failed"),
        }
    }
}

// ============================================================================
// Tool Calling
// ============================================================================

/// Tool call requested by AI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    /// Unique call identifier
    pub id: String,
    /// Tool/function name
    pub name: String,
    /// Tool parameters
    pub arguments: serde_json::Value,
    /// Call status
    pub status: ToolCallStatus,
}

impl ToolCall {
    /// Create a new pending tool call
    pub fn new(name: String, arguments: serde_json::Value) -> Self {
        Self {
            id: format!("tc_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()),
            name,
            arguments,
            status: ToolCallStatus::Pending,
        }
    }
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    /// Matches ToolCall.id
    pub call_id: String,
    /// Execution success
    pub success: bool,
    /// Formatted output
    pub output: String,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Execution duration in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl ToolResult {
    /// Create a success result
    pub fn success(call_id: String, output: String, duration_ms: Option<i64>) -> Self {
        Self {
            call_id,
            success: true,
            output,
            error: None,
            duration_ms,
            metadata: None,
        }
    }

    /// Create a failure result
    pub fn failure(call_id: String, error: String) -> Self {
        Self {
            call_id,
            success: false,
            output: String::new(),
            error: Some(error),
            duration_ms: None,
            metadata: None,
        }
    }
}

// ============================================================================
// Quick Actions / Suggestions
// ============================================================================

/// Suggested quick action (ephemeral - not persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedAction {
    /// Unique action identifier
    pub id: String,
    /// Display label
    pub label: String,
    /// Text to send when clicked
    pub prompt: String,
    /// Lucide icon name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Visual variant
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    /// Action category for grouping
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

// ============================================================================
// Project Context
// ============================================================================

/// Safe project context for AI prompts (sensitive data filtered)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    pub project_name: String,
    pub project_path: String,
    pub project_type: String,
    pub package_manager: String,
    pub available_scripts: Vec<String>,
}

// ============================================================================
// Streaming Events
// ============================================================================

/// AI Assistant streaming event (sent via Tauri events)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AIAssistantEvent {
    /// Streaming token received
    #[serde(rename = "token")]
    Token {
        #[serde(rename = "streamSessionId")]
        stream_session_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        token: String,
        #[serde(rename = "isFinal")]
        is_final: bool,
    },
    /// Tool call requested
    #[serde(rename = "tool_call")]
    ToolCall {
        #[serde(rename = "streamSessionId")]
        stream_session_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolCall")]
        tool_call: ToolCall,
    },
    /// Response complete
    #[serde(rename = "complete")]
    Complete {
        #[serde(rename = "streamSessionId")]
        stream_session_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "fullContent")]
        full_content: String,
        #[serde(rename = "tokensUsed")]
        tokens_used: i64,
        model: String,
        #[serde(rename = "finishReason")]
        finish_reason: String,
    },
    /// Error occurred
    #[serde(rename = "error")]
    Error {
        #[serde(rename = "streamSessionId")]
        stream_session_id: String,
        #[serde(rename = "conversationId")]
        conversation_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        code: String,
        message: String,
        retryable: bool,
    },
}

// ============================================================================
// Request/Response Types
// ============================================================================

/// Request to create a new conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationRequest {
    pub title: Option<String>,
    pub project_path: Option<String>,
    pub provider_id: Option<String>,
}

/// Request to list conversations
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListConversationsRequest {
    pub project_path: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub order_by: Option<String>,
}

/// Response for list conversations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationListResponse {
    pub conversations: Vec<ConversationSummary>,
    pub total: i64,
    pub has_more: bool,
}

/// Response for get conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub conversation: Conversation,
    pub messages: Vec<Message>,
}

/// Request to send a message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    /// Existing conversation ID (None to create new)
    pub conversation_id: Option<String>,
    /// Message content
    pub content: String,
    /// Project path for context (used when creating new conversation)
    pub project_path: Option<String>,
    /// AI provider ID to use (used when creating new conversation)
    pub provider_id: Option<String>,
    /// Project context for AI prompts
    pub project_context: Option<ProjectContext>,
}

/// Response for send message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResponse {
    /// Stream session ID for event listening
    pub stream_session_id: String,
    /// Conversation ID (new or existing)
    pub conversation_id: String,
    /// Assistant message ID that will receive streamed content
    pub message_id: String,
}

/// Request to approve a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveToolCallRequest {
    pub conversation_id: String,
    pub message_id: String,
    pub tool_call_id: String,
}

/// Request to deny a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DenyToolCallRequest {
    pub conversation_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub reason: Option<String>,
}

/// Response for suggestions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionsResponse {
    pub suggestions: Vec<SuggestedAction>,
}

// ============================================================================
// Tool Definitions
// ============================================================================

/// Tool definition for AI providers
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub requires_confirmation: bool,
    pub category: String,
}

/// Available tools response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableTools {
    pub tools: Vec<ToolDefinition>,
}
