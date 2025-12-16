// Stream Manager for AI Assistant
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// Manages streaming responses from AI providers to the frontend
// via Tauri events. Handles:
// - Token streaming
// - Tool call events
// - Completion events
// - Error handling
// - Stream cancellation

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::models::ai_assistant::{
    AIAssistantEvent, ToolCall, ResponseStatus, ResponseTiming, StatusUpdatePayload,
};

/// Manages active streaming sessions
pub struct StreamManager {
    /// Active stream sessions (stream_id -> cancel_sender)
    sessions: Arc<RwLock<HashMap<String, mpsc::Sender<()>>>>,
}

impl StreamManager {
    /// Create a new StreamManager
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new streaming session
    /// Returns (session_id, cancel_receiver)
    pub async fn create_session(&self) -> (String, mpsc::Receiver<()>) {
        let session_id = format!("stream_{}", Uuid::new_v4().to_string().replace("-", ""));
        let (cancel_tx, cancel_rx) = mpsc::channel(1);

        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), cancel_tx);

        (session_id, cancel_rx)
    }

    /// Cancel a streaming session
    pub async fn cancel_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write().await;

        if let Some(cancel_tx) = sessions.remove(session_id) {
            // Send cancel signal
            let _ = cancel_tx.send(()).await;
            Ok(())
        } else {
            Err(format!("Session not found: {}", session_id))
        }
    }

    /// Remove a session (called when streaming completes)
    pub async fn remove_session(&self, session_id: &str) {
        let mut sessions = self.sessions.write().await;
        sessions.remove(session_id);
    }

    /// Check if a session exists
    pub async fn session_exists(&self, session_id: &str) -> bool {
        let sessions = self.sessions.read().await;
        sessions.contains_key(session_id)
    }

    /// Get number of active sessions
    pub async fn active_session_count(&self) -> usize {
        let sessions = self.sessions.read().await;
        sessions.len()
    }

    /// Emit a token event to the frontend
    pub fn emit_token(
        app: &AppHandle,
        stream_session_id: &str,
        conversation_id: &str,
        message_id: &str,
        token: &str,
        is_final: bool,
    ) -> Result<(), String> {
        let event = AIAssistantEvent::Token {
            stream_session_id: stream_session_id.to_string(),
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            token: token.to_string(),
            is_final,
        };

        app.emit("ai:chat-token", &event)
            .map_err(|e| format!("Failed to emit token event: {}", e))
    }

    /// Emit a tool call event to the frontend
    pub fn emit_tool_call(
        app: &AppHandle,
        stream_session_id: &str,
        conversation_id: &str,
        message_id: &str,
        tool_call: &ToolCall,
    ) -> Result<(), String> {
        let event = AIAssistantEvent::ToolCall {
            stream_session_id: stream_session_id.to_string(),
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            tool_call: tool_call.clone(),
        };

        app.emit("ai:chat-tool-call", &event)
            .map_err(|e| format!("Failed to emit tool call event: {}", e))
    }

    /// Emit a completion event to the frontend
    pub fn emit_complete(
        app: &AppHandle,
        stream_session_id: &str,
        conversation_id: &str,
        message_id: &str,
        full_content: &str,
        tokens_used: i64,
        model: &str,
        finish_reason: &str,
    ) -> Result<(), String> {
        let event = AIAssistantEvent::Complete {
            stream_session_id: stream_session_id.to_string(),
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            full_content: full_content.to_string(),
            tokens_used,
            model: model.to_string(),
            finish_reason: finish_reason.to_string(),
        };

        app.emit("ai:chat-complete", &event)
            .map_err(|e| format!("Failed to emit complete event: {}", e))
    }

    /// Emit an error event to the frontend
    pub fn emit_error(
        app: &AppHandle,
        stream_session_id: &str,
        conversation_id: &str,
        message_id: &str,
        code: &str,
        message: &str,
        retryable: bool,
    ) -> Result<(), String> {
        let event = AIAssistantEvent::Error {
            stream_session_id: stream_session_id.to_string(),
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            code: code.to_string(),
            message: message.to_string(),
            retryable,
        };

        app.emit("ai:chat-error", &event)
            .map_err(|e| format!("Failed to emit error event: {}", e))
    }

    /// Emit a status update event to the frontend (Feature 023)
    pub fn emit_status(
        app: &AppHandle,
        stream_session_id: &str,
        conversation_id: &str,
        status: ResponseStatus,
    ) -> Result<(), String> {
        let payload = StatusUpdatePayload {
            stream_session_id: stream_session_id.to_string(),
            conversation_id: conversation_id.to_string(),
            status,
        };

        app.emit("ai:status-update", &payload)
            .map_err(|e| format!("Failed to emit status update event: {}", e))
    }
}

impl Default for StreamManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper struct for building streaming responses
pub struct StreamContext {
    pub session_id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub app: AppHandle,
    accumulated_content: String,
    /// Timestamp when thinking started (ms) - Feature 023
    thinking_start: Option<u64>,
    /// Timestamp when generating started (ms) - Feature 023
    generating_start: Option<u64>,
    /// Timestamp when tool call started (ms) - Feature 023
    tool_start: Option<u64>,
    /// Current model name - Feature 023
    model_name: Option<String>,
}

impl StreamContext {
    /// Create a new stream context
    pub fn new(
        session_id: String,
        conversation_id: String,
        message_id: String,
        app: AppHandle,
    ) -> Self {
        Self {
            session_id,
            conversation_id,
            message_id,
            app,
            accumulated_content: String::new(),
            thinking_start: None,
            generating_start: None,
            tool_start: None,
            model_name: None,
        }
    }

    /// Get current time in milliseconds
    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    /// Emit status update and track timing (Feature 023)
    pub fn emit_status(&mut self, status: ResponseStatus) -> Result<(), String> {
        StreamManager::emit_status(
            &self.app,
            &self.session_id,
            &self.conversation_id,
            status,
        )
    }

    /// Emit thinking status (Feature 023)
    pub fn emit_thinking(&mut self) -> Result<(), String> {
        self.thinking_start = Some(Self::now_ms());
        self.emit_status(ResponseStatus::thinking())
    }

    /// Emit generating status (Feature 023)
    pub fn emit_generating(&mut self, model: Option<String>) -> Result<(), String> {
        self.generating_start = Some(Self::now_ms());
        self.model_name = model.clone();
        self.emit_status(ResponseStatus::generating(model))
    }

    /// Emit tool status (Feature 023)
    pub fn emit_tool_status(&mut self, tool_name: &str) -> Result<(), String> {
        self.tool_start = Some(Self::now_ms());
        self.emit_status(ResponseStatus::tool(tool_name.to_string()))
    }

    /// Emit complete status with timing (Feature 023)
    pub fn emit_complete_status(&mut self) -> Result<(), String> {
        let now = Self::now_ms();

        let timing = ResponseTiming {
            thinking_ms: self.thinking_start.map(|start| {
                self.generating_start.unwrap_or(now).saturating_sub(start)
            }),
            generating_ms: self.generating_start.map(|start| {
                now.saturating_sub(start)
            }),
            tool_ms: self.tool_start.map(|start| {
                now.saturating_sub(start)
            }),
            total_ms: self.thinking_start.map(|start| {
                now.saturating_sub(start)
            }),
        };

        self.emit_status(ResponseStatus::complete_with_model(timing, self.model_name.clone()))
    }

    /// Emit error status (Feature 023)
    pub fn emit_error_status(&mut self) -> Result<(), String> {
        self.emit_status(ResponseStatus::error())
    }

    /// Emit a token and accumulate content
    pub fn emit_token(&mut self, token: &str) -> Result<(), String> {
        self.accumulated_content.push_str(token);
        StreamManager::emit_token(
            &self.app,
            &self.session_id,
            &self.conversation_id,
            &self.message_id,
            token,
            false,
        )
    }

    /// Emit a tool call event
    pub fn emit_tool_call(&self, tool_call: &ToolCall) -> Result<(), String> {
        StreamManager::emit_tool_call(
            &self.app,
            &self.session_id,
            &self.conversation_id,
            &self.message_id,
            tool_call,
        )
    }

    /// Emit completion event with accumulated content
    pub fn emit_complete(
        &self,
        tokens_used: i64,
        model: &str,
        finish_reason: &str,
    ) -> Result<(), String> {
        StreamManager::emit_complete(
            &self.app,
            &self.session_id,
            &self.conversation_id,
            &self.message_id,
            &self.accumulated_content,
            tokens_used,
            model,
            finish_reason,
        )
    }

    /// Emit an error event
    pub fn emit_error(&self, code: &str, message: &str, retryable: bool) -> Result<(), String> {
        StreamManager::emit_error(
            &self.app,
            &self.session_id,
            &self.conversation_id,
            &self.message_id,
            code,
            message,
            retryable,
        )
    }

    /// Get accumulated content
    pub fn get_content(&self) -> &str {
        &self.accumulated_content
    }

    /// Set content directly (for non-streaming responses)
    pub fn set_content(&mut self, content: String) {
        self.accumulated_content = content;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_session() {
        let manager = StreamManager::new();

        let (session_id, _cancel_rx) = manager.create_session().await;

        assert!(session_id.starts_with("stream_"));
        assert!(manager.session_exists(&session_id).await);
        assert_eq!(manager.active_session_count().await, 1);
    }

    #[tokio::test]
    async fn test_cancel_session() {
        let manager = StreamManager::new();

        let (session_id, mut cancel_rx) = manager.create_session().await;

        // Cancel should succeed
        let result = manager.cancel_session(&session_id).await;
        assert!(result.is_ok());

        // Cancel receiver should get the signal
        let received = cancel_rx.try_recv();
        assert!(received.is_ok());

        // Session should be removed
        assert!(!manager.session_exists(&session_id).await);
    }

    #[tokio::test]
    async fn test_cancel_nonexistent_session() {
        let manager = StreamManager::new();

        let result = manager.cancel_session("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_remove_session() {
        let manager = StreamManager::new();

        let (session_id, _cancel_rx) = manager.create_session().await;
        assert!(manager.session_exists(&session_id).await);

        manager.remove_session(&session_id).await;
        assert!(!manager.session_exists(&session_id).await);
    }

    #[tokio::test]
    async fn test_multiple_sessions() {
        let manager = StreamManager::new();

        let (session1, _) = manager.create_session().await;
        let (session2, _) = manager.create_session().await;
        let (session3, _) = manager.create_session().await;

        assert_eq!(manager.active_session_count().await, 3);

        manager.remove_session(&session2).await;
        assert_eq!(manager.active_session_count().await, 2);

        assert!(manager.session_exists(&session1).await);
        assert!(!manager.session_exists(&session2).await);
        assert!(manager.session_exists(&session3).await);
    }
}
