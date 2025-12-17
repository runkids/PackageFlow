// Context Manager for AI Assistant
// Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
// User Story 5: Conversation Flow Optimization
//
// Manages conversation context for long conversations:
// - Summarizes old messages to reduce token usage
// - Extracts key entities and tool calls
// - Prepares optimized context for AI requests

use crate::models::ai_assistant::{Message, MessageRole};

/// Configuration for context management
#[derive(Debug, Clone)]
pub struct ContextConfig {
    /// Maximum messages to include in context
    pub max_messages: usize,
    /// Number of recent messages to always keep in full
    pub recent_to_keep: usize,
    /// Threshold to trigger summarization
    pub summarization_threshold: usize,
}

impl Default for ContextConfig {
    fn default() -> Self {
        Self {
            max_messages: 50,
            recent_to_keep: 10,
            summarization_threshold: 20,
        }
    }
}

/// Prepared context for AI request
#[derive(Debug, Clone)]
pub struct PreparedContext {
    /// System message with context summary
    pub system_context: Option<String>,
    /// Messages to send (possibly summarized)
    pub messages: Vec<Message>,
    /// Extracted key entities from conversation
    pub key_entities: Vec<String>,
    /// Recent tool calls for reference
    pub recent_tool_calls: Vec<ToolCallSummary>,
    /// Whether context was summarized
    pub was_summarized: bool,
}

/// Summary of a tool call for context
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallSummary {
    pub tool_name: String,
    pub description: String,
    pub timestamp: i64,
}

/// Context manager for handling long conversations
pub struct ContextManager {
    config: ContextConfig,
}

impl ContextManager {
    /// Create a new context manager with config
    pub fn new(config: ContextConfig) -> Self {
        Self { config }
    }

    /// Create with default configuration
    pub fn with_defaults() -> Self {
        Self::new(ContextConfig::default())
    }

    /// Prepare context from message history (T102)
    /// Returns optimized context for AI request
    pub fn prepare_context(&self, messages: &[Message]) -> PreparedContext {
        let message_count = messages.len();

        // If under threshold, return all messages
        if message_count <= self.config.summarization_threshold {
            return PreparedContext {
                system_context: None,
                messages: messages.to_vec(),
                key_entities: self.extract_key_entities(messages),
                recent_tool_calls: self.extract_recent_tool_calls(messages),
                was_summarized: false,
            };
        }

        // Split into old and recent messages
        let split_point = message_count.saturating_sub(self.config.recent_to_keep);
        let (old_messages, recent_messages) = messages.split_at(split_point);

        // Generate summary of old messages
        let summary = self.summarize_messages(old_messages);

        // Extract entities and tool calls
        let key_entities = self.extract_key_entities(messages);
        let recent_tool_calls = self.extract_recent_tool_calls(messages);

        // Build system context with summary
        let system_context = Some(format!(
            "Previous conversation summary:\n{}\n\nKey entities: {}",
            summary,
            key_entities.join(", ")
        ));

        PreparedContext {
            system_context,
            messages: recent_messages.to_vec(),
            key_entities,
            recent_tool_calls,
            was_summarized: true,
        }
    }

    /// Summarize older messages into a concise summary (T103)
    /// Note: For full AI-based summarization, this should call the AI provider
    /// This is a simplified local implementation for now
    pub fn summarize_messages(&self, messages: &[Message]) -> String {
        if messages.is_empty() {
            return String::new();
        }

        let mut summary_parts: Vec<String> = Vec::new();
        let mut current_topic: Option<String> = None;
        let mut message_count = 0;

        for msg in messages {
            message_count += 1;

            // Extract topic indicators from messages
            if msg.role == MessageRole::User {
                // Look for key phrases that indicate topic
                let content_lower = msg.content.to_lowercase();
                if content_lower.contains("help") || content_lower.contains("how") {
                    current_topic = Some("User asked for help".to_string());
                } else if content_lower.contains("create") || content_lower.contains("new") {
                    current_topic = Some("User requested creation".to_string());
                } else if content_lower.contains("fix") || content_lower.contains("error") {
                    current_topic = Some("User reported an issue".to_string());
                } else if content_lower.contains("show") || content_lower.contains("list") {
                    current_topic = Some("User requested information".to_string());
                }
            }

            // Capture tool usage
            if let Some(ref tool_calls) = msg.tool_calls {
                for tool in tool_calls {
                    summary_parts.push(format!("- Used tool: {}", tool.name));
                }
            }
        }

        // Build summary
        let mut summary = format!(
            "Conversation had {} messages.",
            message_count
        );

        if let Some(topic) = current_topic {
            summary.push_str(&format!(" Main topic: {}.", topic));
        }

        if !summary_parts.is_empty() {
            summary.push_str("\nTool usage:\n");
            // Keep only unique tool mentions
            let unique_parts: Vec<_> = summary_parts
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .take(5)
                .collect();
            for part in unique_parts {
                summary.push_str(&format!("{}\n", part));
            }
        }

        summary
    }

    /// Extract key entities from messages (T104)
    /// Looks for project names, workflow names, file paths, etc.
    pub fn extract_key_entities(&self, messages: &[Message]) -> Vec<String> {
        let mut entities: Vec<String> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

        for msg in messages {
            // Extract file paths (look for patterns like /path/to/file or ./path)
            let path_re = regex::Regex::new(r#"(?:^|[\s"'`])([./][^\s"'`]+)"#).ok();
            if let Some(re) = path_re {
                for cap in re.captures_iter(&msg.content) {
                    let path = cap[1].to_string();
                    if path.len() > 3 && !seen.contains(&path) {
                        seen.insert(path.clone());
                        entities.push(format!("path:{}", path));
                    }
                }
            }

            // Extract project/workflow mentions from tool calls
            if let Some(ref tool_calls) = msg.tool_calls {
                for tool in tool_calls {
                    // Look for projectPath, workflowId, etc. in arguments
                    if let Some(project) = tool.arguments.get("projectPath").and_then(|v| v.as_str()) {
                        let key = format!("project:{}", project);
                        if !seen.contains(&key) {
                            seen.insert(key.clone());
                            entities.push(key);
                        }
                    }
                    if let Some(workflow) = tool.arguments.get("workflowId").and_then(|v| v.as_str()) {
                        let key = format!("workflow:{}", workflow);
                        if !seen.contains(&key) {
                            seen.insert(key.clone());
                            entities.push(key);
                        }
                    }
                }
            }
        }

        // Limit to most relevant entities
        entities.into_iter().take(10).collect()
    }

    /// Extract recent tool calls for reference (T105)
    pub fn extract_recent_tool_calls(&self, messages: &[Message]) -> Vec<ToolCallSummary> {
        let mut tool_calls: Vec<ToolCallSummary> = Vec::new();

        // Process messages in reverse to get most recent first
        for msg in messages.iter().rev() {
            if let Some(ref calls) = msg.tool_calls {
                for call in calls {
                    // Convert arguments to string for description
                    let args_str = call.arguments.to_string();
                    let description = if args_str.len() > 100 {
                        // UTF-8 safe truncation: find valid character boundary
                        let truncate_at = args_str
                            .char_indices()
                            .take_while(|(i, _)| *i < 100)
                            .last()
                            .map(|(i, c)| i + c.len_utf8())
                            .unwrap_or(args_str.len().min(100));
                        format!("{}...", &args_str[..truncate_at])
                    } else {
                        args_str
                    };

                    tool_calls.push(ToolCallSummary {
                        tool_name: call.name.clone(),
                        description,
                        timestamp: msg.created_at.timestamp_millis(),
                    });

                    // Limit to last 5 tool calls
                    if tool_calls.len() >= 5 {
                        return tool_calls;
                    }
                }
            }
        }

        tool_calls
    }

    /// Check if summarization is needed
    pub fn needs_summarization(&self, message_count: usize) -> bool {
        message_count > self.config.summarization_threshold
    }

    /// Get recent messages only (for quick context)
    pub fn get_recent_messages(&self, messages: &[Message]) -> Vec<Message> {
        let skip = messages.len().saturating_sub(self.config.recent_to_keep);
        messages.iter().skip(skip).cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai_assistant::{ToolCall, ToolCallStatus};

    fn create_test_message(role: MessageRole, content: &str) -> Message {
        Message {
            id: format!("msg_{}", rand::random::<u32>()),
            conversation_id: "test_conv".to_string(),
            role,
            content: content.to_string(),
            model: None,
            tokens_used: None,
            status: crate::models::ai_assistant::MessageStatus::Sent,
            created_at: chrono::Utc::now(),
            tool_calls: None,
            tool_results: None,
        }
    }

    fn create_message_with_tools(role: MessageRole, content: &str, tool_name: &str) -> Message {
        let mut msg = create_test_message(role, content);
        msg.tool_calls = Some(vec![ToolCall {
            id: format!("call_{}", rand::random::<u32>()),
            name: tool_name.to_string(),
            arguments: serde_json::json!({"projectPath": "/test/project"}),
            status: ToolCallStatus::Completed,
        }]);
        msg
    }

    #[test]
    fn test_prepare_context_under_threshold() {
        let manager = ContextManager::with_defaults();
        let messages: Vec<Message> = (0..5)
            .map(|i| create_test_message(MessageRole::User, &format!("Message {}", i)))
            .collect();

        let context = manager.prepare_context(&messages);

        assert!(!context.was_summarized);
        assert!(context.system_context.is_none());
        assert_eq!(context.messages.len(), 5);
    }

    #[test]
    fn test_prepare_context_over_threshold() {
        let config = ContextConfig {
            max_messages: 50,
            recent_to_keep: 5,
            summarization_threshold: 10,
        };
        let manager = ContextManager::new(config);

        let messages: Vec<Message> = (0..15)
            .map(|i| create_test_message(MessageRole::User, &format!("Message {}", i)))
            .collect();

        let context = manager.prepare_context(&messages);

        assert!(context.was_summarized);
        assert!(context.system_context.is_some());
        assert_eq!(context.messages.len(), 5); // recent_to_keep
    }

    #[test]
    fn test_extract_key_entities() {
        let manager = ContextManager::with_defaults();
        let messages = vec![
            create_test_message(MessageRole::User, "Help with /path/to/project"),
            create_message_with_tools(MessageRole::Assistant, "Sure!", "list_projects"),
        ];

        let entities = manager.extract_key_entities(&messages);

        assert!(!entities.is_empty());
    }

    #[test]
    fn test_extract_recent_tool_calls() {
        let manager = ContextManager::with_defaults();
        let messages = vec![
            create_message_with_tools(MessageRole::Assistant, "Done", "tool_a"),
            create_message_with_tools(MessageRole::Assistant, "Done", "tool_b"),
        ];

        let tool_calls = manager.extract_recent_tool_calls(&messages);

        assert_eq!(tool_calls.len(), 2);
        // Most recent first (reversed order)
        assert_eq!(tool_calls[0].tool_name, "tool_b");
        assert_eq!(tool_calls[1].tool_name, "tool_a");
    }

    #[test]
    fn test_summarize_messages() {
        let manager = ContextManager::with_defaults();
        let messages = vec![
            create_test_message(MessageRole::User, "How do I create a new project?"),
            create_test_message(MessageRole::Assistant, "You can use the create project button."),
            create_message_with_tools(MessageRole::Assistant, "Created", "create_project"),
        ];

        let summary = manager.summarize_messages(&messages);

        assert!(summary.contains("3 messages"));
        assert!(summary.contains("tool"));
    }

    #[test]
    fn test_needs_summarization() {
        let config = ContextConfig {
            summarization_threshold: 10,
            ..Default::default()
        };
        let manager = ContextManager::new(config);

        assert!(!manager.needs_summarization(5));
        assert!(!manager.needs_summarization(10));
        assert!(manager.needs_summarization(11));
    }
}
