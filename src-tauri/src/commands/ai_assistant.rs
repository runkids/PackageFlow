// AI Assistant Tauri Commands
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// Tauri commands for:
// - Creating and managing conversations
// - Sending messages with streaming responses
// - Cancelling active streams
// - Managing conversation history

use tauri::{AppHandle, Manager, State};

use crate::models::ai_assistant::{
    Conversation, ConversationListResponse, Message, SendMessageRequest, SendMessageResponse,
    MessageStatus, ToolCall, ToolResult, ToolCallStatus, AvailableTools, SuggestionsResponse,
    ProjectContext,
};
use crate::models::ai::{ChatMessage, ChatOptions, ChatToolCall, FinishReason};
use crate::repositories::{AIConversationRepository, AIRepository};
use crate::services::ai::{create_provider, AIKeychain};
use crate::services::ai_assistant::{StreamManager, StreamContext, MCPToolHandler, ProjectContextBuilder};
use crate::DatabaseState;

// ============================================================================
// Conversation Commands
// ============================================================================

/// Create a new conversation
#[tauri::command]
pub async fn ai_assistant_create_conversation(
    db: State<'_, DatabaseState>,
    project_path: Option<String>,
    provider_id: Option<String>,
) -> Result<Conversation, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());
    let ai_repo = AIRepository::new(db.0.as_ref().clone());

    // If no provider_id provided, use the default service
    let effective_provider_id = if provider_id.is_some() {
        provider_id
    } else {
        // Get the default AI service
        ai_repo.get_default_provider()
            .ok()
            .flatten()
            .map(|s| s.id)
    };

    let conversation = Conversation::new(project_path, effective_provider_id);
    repo.create_conversation(&conversation)?;

    Ok(conversation)
}

/// Get a conversation by ID
#[tauri::command]
pub async fn ai_assistant_get_conversation(
    db: State<'_, DatabaseState>,
    conversation_id: String,
) -> Result<Option<Conversation>, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.get_conversation(&conversation_id)
}

/// List all conversations
#[tauri::command]
pub async fn ai_assistant_list_conversations(
    db: State<'_, DatabaseState>,
    project_path: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<ConversationListResponse, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.list_conversations(
        project_path.as_deref(),
        limit.unwrap_or(50),
        offset.unwrap_or(0),
        "updated",
    )
}

/// Update a conversation
#[tauri::command]
pub async fn ai_assistant_update_conversation(
    db: State<'_, DatabaseState>,
    conversation_id: String,
    title: Option<String>,
) -> Result<(), String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.update_conversation(&conversation_id, title.as_deref(), None)
}

/// Update a conversation's AI service
#[tauri::command]
pub async fn ai_assistant_update_conversation_service(
    db: State<'_, DatabaseState>,
    conversation_id: String,
    provider_id: Option<String>,
) -> Result<(), String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.update_conversation_service(&conversation_id, provider_id.as_deref())
}

/// Delete a conversation
#[tauri::command]
pub async fn ai_assistant_delete_conversation(
    db: State<'_, DatabaseState>,
    conversation_id: String,
) -> Result<bool, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.delete_conversation(&conversation_id)
}

// ============================================================================
// Message Commands
// ============================================================================

/// Send a message and get streaming response
#[tauri::command]
pub async fn ai_assistant_send_message(
    app: AppHandle,
    db: State<'_, DatabaseState>,
    stream_manager: State<'_, StreamManager>,
    request: SendMessageRequest,
) -> Result<SendMessageResponse, String> {
    let conv_repo = AIConversationRepository::new(db.0.as_ref().clone());
    let ai_repo = AIRepository::new(db.0.as_ref().clone());
    let keychain = AIKeychain::new(app.clone());

    // Get AI service config
    let service = if let Some(ref id) = request.provider_id {
        match ai_repo.get_provider(id) {
            Ok(Some(s)) if s.is_enabled => s,
            Ok(Some(_)) => return Err("The specified AI service is disabled".to_string()),
            Ok(None) => return Err(format!("AI service not found: {}", id)),
            Err(e) => return Err(e),
        }
    } else {
        match ai_repo.get_default_provider() {
            Ok(Some(s)) => s,
            Ok(None) => return Err("No default AI service configured. Please configure an AI service in Settings.".to_string()),
            Err(e) => return Err(e),
        }
    };

    // Get API key
    let api_key = match keychain.get_api_key(&service.id) {
        Ok(key) => key,
        Err(e) => {
            log::error!("Failed to get API key for service {}: {}", service.id, e);
            return Err(format!("Failed to retrieve API key: {}", e));
        }
    };

    // Create provider
    let provider = match create_provider(service.clone(), api_key) {
        Ok(p) => p,
        Err(e) => return Err(format!("Failed to create AI provider: {}", e)),
    };

    // Create or get conversation
    let (conversation_id, is_new_conversation) = if let Some(id) = request.conversation_id {
        (id, false)
    } else {
        // Auto-generate title from first message
        let title = generate_conversation_title(&request.content);
        let conversation = Conversation::with_title(
            title,
            request.project_path.clone(),
            Some(service.id.clone()),
        );
        conv_repo.create_conversation(&conversation)?;
        (conversation.id, true)
    };
    let _ = is_new_conversation; // Mark as used (for potential future use)

    // Create user message
    let user_message = Message::user(conversation_id.clone(), request.content.clone());
    conv_repo.create_message(&user_message)?;

    // Create assistant message placeholder
    let assistant_message = Message::assistant(conversation_id.clone(), String::new());
    conv_repo.create_message(&assistant_message)?;

    // Load conversation history for context
    let history = conv_repo.get_messages(&conversation_id).unwrap_or_default();

    // Build ChatMessage array from history
    let mut chat_messages: Vec<ChatMessage> = Vec::new();

    // Add system message with context
    let system_prompt = build_system_prompt(&request.project_context);
    chat_messages.push(ChatMessage::system(system_prompt));

    // Add conversation history (excluding the just-created assistant placeholder)
    for msg in history.iter() {
        if msg.id == assistant_message.id {
            continue; // Skip the placeholder
        }
        match msg.role.to_string().as_str() {
            "user" => chat_messages.push(ChatMessage::user(&msg.content)),
            "assistant" => chat_messages.push(ChatMessage::assistant(&msg.content)),
            _ => {} // Skip system/tool messages in history
        }
    }

    // Create streaming session
    let (stream_session_id, cancel_rx) = stream_manager.create_session().await;

    // Create stream context for emitting events
    let stream_ctx = StreamContext::new(
        stream_session_id.clone(),
        conversation_id.clone(),
        assistant_message.id.clone(),
        app.clone(),
    );

    // Spawn background task for AI response
    let app_clone = app.clone();
    let assistant_message_id = assistant_message.id.clone();
    let session_id = stream_session_id.clone();
    let model_name = service.model.clone();

    // Get project path for tool context
    let project_path_for_tools = request.project_path.clone();

    tokio::spawn(async move {
        let mut ctx = stream_ctx;

        // Initialize tool handler and get tool definitions
        let tool_handler = MCPToolHandler::new();
        let tool_definitions = tool_handler.get_chat_tool_definitions(project_path_for_tools.as_deref());

        // Chat options with tools
        let options = ChatOptions {
            temperature: Some(0.7),
            max_tokens: Some(4096),
            top_p: None,
            tools: if tool_definitions.is_empty() { None } else { Some(tool_definitions) },
        };

        // Agentic loop - continue until we get a final text response
        let mut messages = chat_messages;
        let mut total_tokens: i64 = 0;
        let mut final_content = String::new();
        let max_iterations = 10; // Safety limit
        let mut iteration = 0;

        loop {
            iteration += 1;
            if iteration > max_iterations {
                log::warn!("Agentic loop reached maximum iterations ({})", max_iterations);
                break;
            }

            // Check for cancellation
            if cancel_rx.is_closed() {
                return;
            }

            // Call AI provider
            match provider.chat_completion(messages.clone(), options.clone()).await {
                Ok(response) => {
                    total_tokens += response.tokens_used.unwrap_or(0) as i64;

                    // Check if AI wants to call tools
                    if let Some(ref tool_calls) = response.tool_calls {
                        if !tool_calls.is_empty() && response.finish_reason == Some(FinishReason::ToolCalls) {
                            log::info!("AI requested {} tool calls", tool_calls.len());

                            // Add assistant message with tool calls to conversation
                            messages.push(ChatMessage::assistant_with_tool_calls(
                                if response.content.is_empty() { None } else { Some(response.content.clone()) },
                                tool_calls.clone(),
                            ));

                            // Process each tool call
                            for tool_call in tool_calls {
                                // Check if tool requires confirmation
                                if tool_handler.requires_confirmation(&tool_call.function.name) {
                                    // For tools requiring confirmation, stop the loop
                                    // and let the frontend handle approval
                                    log::info!("Tool {} requires confirmation, stopping loop", tool_call.function.name);

                                    // Emit a message about the tool call
                                    let tool_msg = format!(
                                        "I'd like to execute **{}**. This action requires your approval.",
                                        tool_call.function.name
                                    );
                                    let _ = ctx.emit_token(&tool_msg);
                                    final_content = ctx.get_content().to_string();

                                    // Update message and exit loop
                                    let db_state = app_clone.state::<DatabaseState>();
                                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                    let _ = repo.update_message_completion(
                                        &assistant_message_id,
                                        &final_content,
                                        Some(total_tokens),
                                        Some(&model_name),
                                        None,
                                    );

                                    if let Err(e) = ctx.emit_complete(total_tokens, &model_name, "tool_calls") {
                                        log::error!("Failed to emit complete: {}", e);
                                    }

                                    let stream_mgr = app_clone.state::<StreamManager>();
                                    stream_mgr.remove_session(&session_id).await;
                                    return;
                                }

                                // Auto-execute read-only tools
                                let internal_tool_call = convert_chat_tool_call_to_internal(tool_call);
                                let result = tool_handler.execute_tool_call(&internal_tool_call).await;

                                log::info!(
                                    "Tool {} executed: success={}",
                                    tool_call.function.name,
                                    result.success
                                );

                                // Add tool result to messages
                                let result_content = serde_json::to_string(&result.output)
                                    .unwrap_or_else(|_| "{}".to_string());
                                messages.push(ChatMessage::tool_result(&tool_call.id, result_content));
                            }

                            // Continue the loop to get AI's response after tool execution
                            continue;
                        }
                    }

                    // No tool calls or final response - emit content
                    let content = &response.content;
                    let chars: Vec<char> = content.chars().collect();

                    for (i, chunk) in chars.chunks(5).enumerate() {
                        if cancel_rx.is_closed() {
                            break;
                        }

                        let token: String = chunk.iter().collect();
                        if let Err(e) = ctx.emit_token(&token) {
                            log::error!("Failed to emit token: {}", e);
                            break;
                        }

                        // Small delay to create streaming effect
                        if i % 5 == 0 {
                            tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
                        }
                    }

                    final_content = ctx.get_content().to_string();
                    let finish_reason = response.finish_reason
                        .map(|r| format!("{:?}", r).to_lowercase())
                        .unwrap_or_else(|| "stop".to_string());

                    if let Err(e) = ctx.emit_complete(total_tokens, &model_name, &finish_reason) {
                        log::error!("Failed to emit complete: {}", e);
                    }

                    // Update message in database
                    let db_state = app_clone.state::<DatabaseState>();
                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                    let _ = repo.update_message_completion(
                        &assistant_message_id,
                        &final_content,
                        Some(total_tokens),
                        Some(&model_name),
                        None,
                    );

                    // Exit the loop - we got a final text response
                    break;
                }
                Err(e) => {
                    log::error!("AI chat completion failed: {}", e);

                    // Emit error event
                    if let Err(emit_err) = ctx.emit_error(
                        "AI_PROVIDER_ERROR",
                        &format!("Failed to get AI response: {}", e),
                        true, // retryable
                    ) {
                        log::error!("Failed to emit error: {}", emit_err);
                    }

                    // Update message status to error
                    let db_state = app_clone.state::<DatabaseState>();
                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                    let _ = repo.update_message_status(&assistant_message_id, MessageStatus::Error);

                    break;
                }
            }
        }

        // Remove session
        let stream_mgr = app_clone.state::<StreamManager>();
        stream_mgr.remove_session(&session_id).await;
    });

    Ok(SendMessageResponse {
        stream_session_id,
        conversation_id,
        message_id: assistant_message.id,
    })
}

/// Generate a conversation title from the first user message
fn generate_conversation_title(message: &str) -> String {
    let trimmed = message.trim();

    // If message is short enough, use it directly
    if trimmed.len() <= 50 {
        return trimmed.to_string();
    }

    // Find a good breaking point (space, punctuation)
    let max_len = 47; // Leave room for "..."
    let truncated = &trimmed[..max_len];

    // Try to find a word boundary
    if let Some(last_space) = truncated.rfind(' ') {
        if last_space > 20 {
            return format!("{}...", &truncated[..last_space]);
        }
    }

    // Fall back to character truncation
    format!("{}...", truncated)
}

/// Build system prompt with project context and available tools
fn build_system_prompt(project_context: &Option<ProjectContext>) -> String {
    let mut prompt = String::from(
r#"You are an AI assistant integrated into PackageFlow, a development workflow management tool.

## Your Capabilities
- Running project scripts and workflows
- Generating commit messages
- Reviewing code changes
- Answering questions about projects
- Getting git status and staged changes

## Available Tools
You have access to these MCP tools. When you need to perform an action, tell the user which tool you would use and wait for their confirmation.

### Execution Tools (Require User Approval)
1. **run_script**: Run an npm/pnpm/yarn script from package.json
   - Parameters: script_name (required), project_path (required)
   - Example: "I'll use run_script to execute the 'build' script"

2. **run_workflow**: Execute a PackageFlow workflow
   - Parameters: workflow_id (required)
   - Example: "I'll use run_workflow to run the deployment workflow"

3. **trigger_webhook**: Trigger a configured webhook
   - Parameters: webhook_id (required), payload (optional)

### Read-Only Tools (Auto-Approved)
4. **get_git_status**: Get current git status of a repository
   - Parameters: project_path (required)

5. **get_staged_diff**: Get diff of staged changes
   - Parameters: project_path (required)

6. **list_project_scripts**: List available scripts from package.json
   - Parameters: project_path (required)

## Guidelines
- **Always respond in the same language as the user's message** (e.g., if user writes in Chinese, respond in Chinese; if in English, respond in English)
- Be helpful, concise, and provide actionable responses
- When you want to run a tool, clearly state which tool and parameters you'll use
- For execution tools, wait for user approval before proceeding
- If asked to do something outside these tools, explain what's possible
- Do NOT make up commands or tools that don't exist
- Format code examples in code blocks
"#
    );

    if let Some(ctx) = project_context {
        prompt.push_str("\n## Current Project Context\n");
        prompt.push_str(&format!("- **Project**: {}\n", ctx.project_name));
        prompt.push_str(&format!("- **Path**: {}\n", ctx.project_path));
        prompt.push_str(&format!("- **Type**: {}\n", ctx.project_type));
        prompt.push_str(&format!("- **Package Manager**: {}\n", ctx.package_manager));
        if !ctx.available_scripts.is_empty() {
            prompt.push_str(&format!(
                "- **Available Scripts**: {}\n",
                ctx.available_scripts.join(", ")
            ));
        }
        prompt.push_str("\nUse this project path when calling tools that require project_path.\n");
    }

    prompt
}

/// Cancel an active stream
#[tauri::command]
pub async fn ai_assistant_cancel_stream(
    stream_manager: State<'_, StreamManager>,
    session_id: String,
) -> Result<(), String> {
    stream_manager.cancel_session(&session_id).await
}

/// Get messages for a conversation
#[tauri::command]
pub async fn ai_assistant_get_messages(
    db: State<'_, DatabaseState>,
    conversation_id: String,
) -> Result<Vec<Message>, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    repo.get_messages(&conversation_id)
}

// ============================================================================
// Tool Call Commands
// ============================================================================

/// Get available tools for AI
#[tauri::command]
pub async fn ai_assistant_get_tools(
    project_path: Option<String>,
) -> Result<AvailableTools, String> {
    let handler = MCPToolHandler::new();
    Ok(handler.get_available_tools(project_path.as_deref()))
}

/// Approve a tool call and execute it
#[tauri::command]
pub async fn ai_assistant_approve_tool_call(
    db: State<'_, DatabaseState>,
    conversation_id: String,
    message_id: String,
    tool_call_id: String,
) -> Result<ToolResult, String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());
    let handler = MCPToolHandler::new();

    // Get the message with tool calls
    let message = repo.get_message(&message_id)?
        .ok_or_else(|| "MESSAGE_NOT_FOUND".to_string())?;

    // Find the tool call
    let tool_calls = message.tool_calls
        .ok_or_else(|| "NO_TOOL_CALLS".to_string())?;

    let tool_call = tool_calls.iter()
        .find(|tc| tc.id == tool_call_id)
        .ok_or_else(|| "TOOL_CALL_NOT_FOUND".to_string())?;

    // Validate the tool call
    handler.validate_tool_call(tool_call)?;

    // Execute the tool call
    let result = handler.execute_tool_call(tool_call).await;

    // Update tool call status in the message
    let updated_tool_calls: Vec<ToolCall> = tool_calls.iter()
        .map(|tc| {
            if tc.id == tool_call_id {
                ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    arguments: tc.arguments.clone(),
                    status: if result.success {
                        ToolCallStatus::Completed
                    } else {
                        ToolCallStatus::Failed
                    },
                }
            } else {
                tc.clone()
            }
        })
        .collect();

    // Store tool result in message
    let tool_results = vec![result.clone()];
    let _ = repo.update_message_tool_data(
        &message_id,
        Some(&updated_tool_calls),
        Some(&tool_results),
    );

    Ok(result)
}

/// Deny a tool call
#[tauri::command]
pub async fn ai_assistant_deny_tool_call(
    db: State<'_, DatabaseState>,
    conversation_id: String,
    message_id: String,
    tool_call_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    let repo = AIConversationRepository::new(db.0.as_ref().clone());

    // Get the message with tool calls
    let message = repo.get_message(&message_id)?
        .ok_or_else(|| "MESSAGE_NOT_FOUND".to_string())?;

    // Find and update the tool call
    let tool_calls = message.tool_calls
        .ok_or_else(|| "NO_TOOL_CALLS".to_string())?;

    let updated_tool_calls: Vec<ToolCall> = tool_calls.iter()
        .map(|tc| {
            if tc.id == tool_call_id {
                ToolCall {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    arguments: tc.arguments.clone(),
                    status: ToolCallStatus::Denied,
                }
            } else {
                tc.clone()
            }
        })
        .collect();

    // Create a denial result
    let denial_result = ToolResult::failure(
        tool_call_id,
        reason.unwrap_or_else(|| "User denied the action".to_string()),
    );

    // Update message with denied status
    let _ = repo.update_message_tool_data(
        &message_id,
        Some(&updated_tool_calls),
        Some(&vec![denial_result]),
    );

    Ok(())
}

/// Get suggestions for the current context
#[tauri::command]
pub async fn ai_assistant_get_suggestions(
    conversation_id: Option<String>,
    project_path: Option<String>,
) -> Result<SuggestionsResponse, String> {
    use crate::models::ai_assistant::SuggestedAction;

    let mut suggestions = Vec::new();

    // Default suggestions
    suggestions.push(SuggestedAction {
        id: "explain".to_string(),
        label: "Explain this".to_string(),
        prompt: "Please explain what this code does".to_string(),
        icon: Some("HelpCircle".to_string()),
        variant: Some("default".to_string()),
        category: Some("general".to_string()),
    });

    // Project-specific suggestions
    if let Some(ref path) = project_path {
        let project_path = std::path::Path::new(path);

        // Git suggestions
        if project_path.join(".git").exists() {
            suggestions.push(SuggestedAction {
                id: "commit".to_string(),
                label: "Generate commit".to_string(),
                prompt: "Generate a commit message for the staged changes".to_string(),
                icon: Some("GitCommit".to_string()),
                variant: Some("primary".to_string()),
                category: Some("git".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "review".to_string(),
                label: "Review changes".to_string(),
                prompt: "Review the staged changes and suggest improvements".to_string(),
                icon: Some("FileSearch".to_string()),
                variant: Some("default".to_string()),
                category: Some("git".to_string()),
            });
        }

        // Node.js project suggestions
        if project_path.join("package.json").exists() {
            suggestions.push(SuggestedAction {
                id: "run-tests".to_string(),
                label: "Run tests".to_string(),
                prompt: "Run the test suite for this project".to_string(),
                icon: Some("TestTube".to_string()),
                variant: Some("default".to_string()),
                category: Some("project".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "build".to_string(),
                label: "Build project".to_string(),
                prompt: "Build the project".to_string(),
                icon: Some("Hammer".to_string()),
                variant: Some("default".to_string()),
                category: Some("project".to_string()),
            });
        }
    }

    Ok(SuggestionsResponse { suggestions })
}

// ============================================================================
// Project Context Commands
// ============================================================================

/// Get project context for AI assistant
#[tauri::command]
pub async fn ai_assistant_get_project_context(
    project_path: String,
) -> Result<ProjectContext, String> {
    let context = ProjectContextBuilder::build_from_path(&project_path)?;
    let sanitized = ProjectContextBuilder::sanitize_context(&context);
    Ok(sanitized)
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Convert ChatToolCall (from AI response) to internal ToolCall format
fn convert_chat_tool_call_to_internal(chat_tool_call: &ChatToolCall) -> ToolCall {
    // Parse the arguments JSON string
    let arguments: serde_json::Value = serde_json::from_str(&chat_tool_call.function.arguments)
        .unwrap_or(serde_json::json!({}));

    // Preserve the original ID from the AI response
    ToolCall {
        id: chat_tool_call.id.clone(),
        name: chat_tool_call.function.name.clone(),
        arguments,
        status: ToolCallStatus::Pending,
    }
}

/// Generate placeholder response for Phase 1 testing
fn generate_placeholder_response(user_message: &str) -> String {
    let lower = user_message.to_lowercase();

    if lower.contains("hello") || lower.contains("hi") {
        return "Hello! I'm the AI Assistant for PackageFlow. I can help you with:\n\n- Running project scripts\n- Managing workflows\n- Generating commit messages\n- Answering questions about your project\n\nWhat would you like help with today?".to_string();
    }

    if lower.contains("what can you") || lower.contains("help") {
        return "I can assist you with various development tasks:\n\n**Project Management**\n- Run npm/yarn/pnpm scripts\n- Execute workflows\n- Check project status\n\n**Git Operations**\n- Generate commit messages\n- Review staged changes\n- Analyze code changes\n\n**General Assistance**\n- Answer questions about your project\n- Suggest optimizations\n- Help with troubleshooting\n\nJust ask me what you need!".to_string();
    }

    if lower.contains("commit") || lower.contains("message") {
        return "I'd be happy to help generate a commit message! To do this effectively, I'll need to:\n\n1. Check your staged changes using `git diff --staged`\n2. Analyze the modifications\n3. Generate a descriptive commit message\n\nWould you like me to proceed with analyzing your staged changes?".to_string();
    }

    if lower.contains("test") || lower.contains("run") {
        return "I can help you run tests or scripts. Here are some common options:\n\n```bash\n# Run tests\nnpm test\n\n# Run build\nnpm run build\n\n# Run development server\nnpm run dev\n```\n\nWhich script would you like me to run? I'll need your confirmation before executing any commands.".to_string();
    }

    // Default response (handle UTF-8 for message truncation)
    let truncated_msg = if user_message.chars().count() > 50 {
        let truncated: String = user_message.chars().take(50).collect();
        format!("{}...", truncated)
    } else {
        user_message.to_string()
    };
    format!(
        "I received your message: \"{}\"\n\nThis is a placeholder response from Phase 1 implementation. In the full version, I'll be connected to your configured AI service and can:\n\n- Provide intelligent responses based on your project context\n- Execute MCP actions with your approval\n- Remember our conversation history\n\nFor now, try asking me about what I can help with!",
        truncated_msg
    )
}
