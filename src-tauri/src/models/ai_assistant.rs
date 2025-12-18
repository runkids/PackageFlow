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
    /// Thought signature for Gemini 2.5+ models (preserves reasoning context)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought_signature: Option<String>,
}

impl ToolCall {
    /// Create a new pending tool call
    pub fn new(name: String, arguments: serde_json::Value) -> Self {
        Self {
            id: format!("tc_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()),
            name,
            arguments,
            status: ToolCallStatus::Pending,
            thought_signature: None,
        }
    }

    /// Create a new pending tool call with thought signature (for Gemini 2.5+)
    pub fn new_with_signature(name: String, arguments: serde_json::Value, thought_signature: Option<String>) -> Self {
        Self {
            id: format!("tc_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()),
            name,
            arguments,
            status: ToolCallStatus::Pending,
            thought_signature,
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
            output: error.clone(),
            error: Some(error),
            duration_ms: None,
            metadata: None,
        }
    }
}

// ============================================================================
// Quick Actions / Suggestions
// ============================================================================

/// Quick action execution mode
/// - Instant: Execute tool directly, display result card (no AI, zero tokens)
/// - Smart: Execute tool, then AI summarizes/analyzes (moderate tokens)
/// - Ai: Full AI conversation flow (AI decides tool usage)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum QuickActionMode {
    /// Direct execution + formatted card display (zero token)
    Instant,
    /// Execute tool + AI summary/analysis (moderate token)
    Smart,
    /// Full AI conversation flow (AI decides)
    #[default]
    Ai,
}

/// Tool specification for quick action
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickActionTool {
    /// MCP tool name to execute
    pub name: String,
    /// Tool arguments (JSON object)
    #[serde(default)]
    pub args: serde_json::Value,
}

/// Suggested quick action (ephemeral - not persisted)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedAction {
    /// Unique action identifier
    pub id: String,
    /// Display label
    pub label: String,
    /// Text to send when clicked (used for AI mode, or as fallback)
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
    /// Execution mode: instant, smart, or ai
    #[serde(default)]
    pub mode: QuickActionMode,
    /// Tool to execute (for instant/smart modes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<QuickActionTool>,
    /// Hint for AI summarization (smart mode only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_hint: Option<String>,
    /// Whether this action requires a project context to be available (Feature 024)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_project: Option<bool>,
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

// ============================================================================
// Feature 023: Enhanced AI Chat Experience
// ============================================================================

// ----------------------------------------------------------------------------
// Response Status (T007)
// ----------------------------------------------------------------------------

/// Response processing phase
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResponsePhase {
    Idle,
    Thinking,
    Generating,
    Tool,
    Complete,
    Error,
}

impl std::fmt::Display for ResponsePhase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResponsePhase::Idle => write!(f, "idle"),
            ResponsePhase::Thinking => write!(f, "thinking"),
            ResponsePhase::Generating => write!(f, "generating"),
            ResponsePhase::Tool => write!(f, "tool"),
            ResponsePhase::Complete => write!(f, "complete"),
            ResponsePhase::Error => write!(f, "error"),
        }
    }
}

/// Timing breakdown for response
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResponseTiming {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generating_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_ms: Option<u64>,
}

/// Response status tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseStatus {
    pub phase: ResponsePhase,
    pub start_time: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing: Option<ResponseTiming>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Current iteration in agentic loop (1, 2, 3...)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iteration: Option<u32>,
}

impl ResponseStatus {
    /// Create a new idle status
    pub fn idle() -> Self {
        Self {
            phase: ResponsePhase::Idle,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model: None,
            iteration: None,
        }
    }

    /// Create a new thinking status
    pub fn thinking() -> Self {
        Self {
            phase: ResponsePhase::Thinking,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model: None,
            iteration: None,
        }
    }

    /// Create a new thinking status with iteration
    pub fn thinking_with_iter(iteration: u32) -> Self {
        Self {
            phase: ResponsePhase::Thinking,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model: None,
            iteration: Some(iteration),
        }
    }

    /// Create a new generating status
    pub fn generating(model: Option<String>) -> Self {
        Self {
            phase: ResponsePhase::Generating,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model,
            iteration: None,
        }
    }

    /// Create a new generating status with iteration
    pub fn generating_with_iter(model: Option<String>, iteration: u32) -> Self {
        Self {
            phase: ResponsePhase::Generating,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model,
            iteration: Some(iteration),
        }
    }

    /// Create a new tool status
    pub fn tool(tool_name: String) -> Self {
        Self {
            phase: ResponsePhase::Tool,
            start_time: Self::now_ms(),
            tool_name: Some(tool_name),
            timing: None,
            model: None,
            iteration: None,
        }
    }

    /// Create a new tool status with iteration
    pub fn tool_with_iter(tool_name: String, iteration: u32) -> Self {
        Self {
            phase: ResponsePhase::Tool,
            start_time: Self::now_ms(),
            tool_name: Some(tool_name),
            timing: None,
            model: None,
            iteration: Some(iteration),
        }
    }

    /// Create a new complete status with timing and optional model
    pub fn complete_with_model(timing: ResponseTiming, model: Option<String>) -> Self {
        Self {
            phase: ResponsePhase::Complete,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: Some(timing),
            model,
            iteration: None,
        }
    }

    /// Create a new complete status with timing
    pub fn complete(timing: ResponseTiming) -> Self {
        Self::complete_with_model(timing, None)
    }

    /// Create a new error status
    pub fn error() -> Self {
        Self {
            phase: ResponsePhase::Error,
            start_time: Self::now_ms(),
            tool_name: None,
            timing: None,
            model: None,
            iteration: None,
        }
    }

    /// Get current time in milliseconds
    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

// ----------------------------------------------------------------------------
// Interactive Elements (T008)
// ----------------------------------------------------------------------------

/// Interactive element type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InteractiveElementType {
    Navigation,
    Action,
    Entity,
}

/// Interactive UI element embedded in AI response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveElement {
    pub id: String,
    #[serde(rename = "type")]
    pub element_type: InteractiveElementType,
    pub label: String,
    pub payload: String,
    pub requires_confirm: bool,
    pub start_index: usize,
    pub end_index: usize,
}

// ----------------------------------------------------------------------------
// Lazy Actions (T009)
// ----------------------------------------------------------------------------

/// Lazy action type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LazyActionType {
    Navigate,
    ExecuteTool,
    Copy,
}

/// Lazy action that executes directly
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LazyAction {
    #[serde(rename = "type")]
    pub action_type: LazyActionType,
    pub payload: String,
}

// ----------------------------------------------------------------------------
// Context Management (T010)
// ----------------------------------------------------------------------------

/// Entity mentioned in conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntity {
    #[serde(rename = "type")]
    pub entity_type: String,
    pub id: String,
    pub name: String,
    pub last_mentioned: usize,
}

/// Recent tool call for reference tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentToolCall {
    pub id: String,
    pub name: String,
    pub description: String,
    pub success: bool,
    pub message_index: usize,
}

/// Summarized context for long conversations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationContext {
    pub summary: String,
    pub key_entities: Vec<ContextEntity>,
    pub recent_tool_calls: Vec<RecentToolCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_context: Option<ProjectContext>,
    pub token_count: u32,
}

// ----------------------------------------------------------------------------
// Status Update Event (T011)
// ----------------------------------------------------------------------------

/// Payload for ai:status-update event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdatePayload {
    pub stream_session_id: String,
    pub conversation_id: String,
    pub status: ResponseStatus,
}
