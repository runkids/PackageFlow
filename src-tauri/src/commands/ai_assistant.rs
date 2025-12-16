// AI Assistant Tauri Commands
// Feature: AI Assistant Tab (022-ai-assistant-tab)
//
// Tauri commands for:
// - Creating and managing conversations
// - Sending messages with streaming responses
// - Cancelling active streams
// - Managing conversation history

use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::models::ai_assistant::{
    Conversation, ConversationListResponse, Message, SendMessageRequest, SendMessageResponse,
    MessageStatus, MessageRole, ToolCall, ToolResult, ToolCallStatus, AvailableTools, SuggestionsResponse,
    ProjectContext,
};
use crate::models::ai::{ChatMessage, ChatOptions, ChatToolCall, FinishReason};
use crate::repositories::{AIConversationRepository, AIRepository};
use crate::services::ai::{create_provider, AIKeychain};
use crate::services::ai_assistant::{StreamManager, StreamContext, MCPToolHandler, ProjectContextBuilder};
use crate::DatabaseState;

// ============================================================================
// Constants
// ============================================================================

/// Maximum number of tool call iterations to prevent infinite loops
const MAX_TOOL_ITERATIONS: usize = 10;

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
            Ok(None) => {
                // Provider was deleted, fall back to default provider
                log::warn!("AI provider {} not found, falling back to default", id);
                match ai_repo.get_default_provider() {
                    Ok(Some(s)) => s,
                    Ok(None) => return Err("No default AI service configured. Please configure an AI service in Settings.".to_string()),
                    Err(e) => return Err(e),
                }
            },
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
            "assistant" => {
                // Include tool calls if present
                if let Some(ref tool_calls) = msg.tool_calls {
                    let chat_tool_calls: Vec<ChatToolCall> = tool_calls.iter().map(|tc| {
                        ChatToolCall {
                            id: tc.id.clone(),
                            tool_type: "function".to_string(),
                            function: crate::models::ai::ChatFunctionCall {
                                name: tc.name.clone(),
                                arguments: tc.arguments.to_string(),
                            },
                        }
                    }).collect();
                    chat_messages.push(ChatMessage::assistant_with_tool_calls(
                        if msg.content.is_empty() { None } else { Some(msg.content.clone()) },
                        chat_tool_calls,
                    ));
                } else {
                    chat_messages.push(ChatMessage::assistant(&msg.content));
                }
            }
            "tool" => {
                // Include tool results from history
                if let Some(ref results) = msg.tool_results {
                    for result in results {
                        chat_messages.push(ChatMessage::tool_result(&result.call_id, result.output.clone()));
                    }
                }
            }
            _ => {} // Skip system messages in history
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
    let conversation_id_for_spawn = conversation_id.clone();

    // Get project path for tool context
    let project_path_for_tools = request.project_path.clone();

    // Clone database for the spawned task
    let db_for_tools = db.0.as_ref().clone();

    tokio::spawn(async move {
        let conversation_id = conversation_id_for_spawn;
        let mut ctx = stream_ctx;

        // Initialize tool handler with database for security validation
        let tool_handler = MCPToolHandler::with_database(db_for_tools);
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
        let mut iteration = 0;
        // Track all tool results for fallback (in case AI returns empty content)
        let mut all_tool_results: Vec<(String, bool, String)> = Vec::new(); // (name, success, output)
        // Track executed tool calls across iterations to prevent infinite loops
        // Key: function_name:arguments, Value: number of times executed
        let mut executed_tool_calls: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        const MAX_SAME_TOOL_EXECUTIONS: usize = 2; // Allow same tool call max 2 times
        // Track seen content to detect repetition loops
        let mut seen_content: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        const MAX_SAME_CONTENT: usize = 2; // If same content appears 2+ times, stop

        loop {
            iteration += 1;
            if iteration > MAX_TOOL_ITERATIONS {
                log::warn!("Agentic loop reached maximum iterations ({})", MAX_TOOL_ITERATIONS);
                // Generate a message informing the user
                let warning_msg = "I've reached the maximum number of tool calls for this response. Please let me know if you'd like me to continue with a new request.";
                let _ = ctx.emit_token(warning_msg);
                final_content = ctx.get_content().to_string();
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

                    // Check for repeated content (AI stuck in a loop)
                    if !response.content.is_empty() {
                        // Use first 200 chars as key to detect similar content
                        let content_key = response.content.chars().take(200).collect::<String>();
                        let count = seen_content.entry(content_key.clone()).or_insert(0);
                        *count += 1;
                        if *count >= MAX_SAME_CONTENT {
                            log::warn!("Detected repeated content - AI may be stuck in a loop");
                            // Don't emit the repeated content, just break
                            if ctx.get_content().is_empty() {
                                let _ = ctx.emit_token("I notice I'm repeating myself. Let me stop here.");
                            }
                            final_content = ctx.get_content().to_string();
                            break;
                        }
                    }

                    // Check if AI wants to call tools
                    // Some models may not set finish_reason to ToolCalls, so we check tool_calls presence
                    if let Some(ref tool_calls) = response.tool_calls {
                        if !tool_calls.is_empty() {
                            log::info!("AI requested {} tool calls (finish_reason: {:?})", tool_calls.len(), response.finish_reason);

                            // Get list of valid tool names
                            let valid_tools: std::collections::HashSet<String> = tool_handler
                                .get_available_tools(project_path_for_tools.as_deref())
                                .tools
                                .iter()
                                .map(|t| t.name.clone())
                                .collect();

                            // Filter out invalid tool calls (malformed responses from models that don't support function calling)
                            let valid_tool_calls: Vec<_> = tool_calls.iter()
                                .filter(|tc| {
                                    let is_valid = valid_tools.contains(&tc.function.name);
                                    if !is_valid {
                                        log::warn!(
                                            "Ignoring invalid tool call: '{}' (not in available tools). Model may not support function calling properly.",
                                            tc.function.name
                                        );
                                    }
                                    is_valid
                                })
                                .collect();

                            // If no valid tool calls, treat as regular text response
                            if valid_tool_calls.is_empty() {
                                log::warn!("All tool calls were invalid - treating as text response");
                                // Fall through to text response handling below
                            } else {
                                // Deduplicate tool calls by function name + arguments (within this response)
                                let mut seen_tools: std::collections::HashSet<String> = std::collections::HashSet::new();
                                let unique_tool_calls: Vec<_> = valid_tool_calls.iter()
                                    .filter(|tc| {
                                        let key = format!("{}:{}", tc.function.name, tc.function.arguments);
                                        seen_tools.insert(key)
                                    })
                                    .cloned()
                                    .collect();

                                // Filter out tool calls that have been executed too many times across iterations
                                let filtered_tool_calls: Vec<_> = unique_tool_calls.iter()
                                    .filter(|tc| {
                                        let key = format!("{}:{}", tc.function.name, tc.function.arguments);
                                        let count = executed_tool_calls.get(&key).copied().unwrap_or(0);
                                        if count >= MAX_SAME_TOOL_EXECUTIONS {
                                            log::warn!(
                                                "Skipping repeated tool call '{}' (already executed {} times)",
                                                tc.function.name, count
                                            );
                                            false
                                        } else {
                                            true
                                        }
                                    })
                                    .cloned()
                                    .collect();

                                log::info!("After validation and deduplication: {} tool calls (filtered from {})",
                                    filtered_tool_calls.len(), unique_tool_calls.len());

                                // If all tool calls were filtered out, break the loop
                                if filtered_tool_calls.is_empty() && !unique_tool_calls.is_empty() {
                                    log::warn!("All tool calls were filtered as duplicates - breaking loop");
                                    let warning_msg = "I notice I'm trying to repeat the same action. Let me provide you with the results I already have.";
                                    let _ = ctx.emit_token(warning_msg);
                                    final_content = ctx.get_content().to_string();
                                    break;
                                }

                                // Replace unique_tool_calls with filtered ones
                                let unique_tool_calls = filtered_tool_calls;

                                // Add assistant message with tool calls to conversation (in-memory for AI context)
                                // Use only valid tool calls, not the original ones
                                let valid_chat_tool_calls: Vec<ChatToolCall> = unique_tool_calls.iter()
                                    .map(|tc| (*tc).clone())
                                    .collect();
                                messages.push(ChatMessage::assistant_with_tool_calls(
                                    if response.content.is_empty() { None } else { Some(response.content.clone()) },
                                    valid_chat_tool_calls,
                                ));

                            // Check if any tool requires confirmation
                            let has_confirmation_required = unique_tool_calls.iter()
                                .any(|tc| tool_handler.requires_confirmation(&tc.function.name));

                            // If all tools can be auto-executed, prepare to save the assistant message with tool_calls to DB
                            // This preserves the tool call history for future context
                            // We'll save with correct statuses AFTER execution
                            let tool_call_msg_id = if !has_confirmation_required {
                                Some(format!("msg_{}_tc_{}", Utc::now().timestamp_millis(), iteration))
                            } else {
                                None
                            };

                            // Track execution results for status updates
                            let mut execution_results: std::collections::HashMap<String, bool> = std::collections::HashMap::new();

                            // Process each unique tool call
                            for tool_call in &unique_tool_calls {
                                // Check if tool requires confirmation
                                if tool_handler.requires_confirmation(&tool_call.function.name) {
                                    // For tools requiring confirmation, stop the loop
                                    // and let the frontend handle approval
                                    log::info!("Tool {} requires confirmation, stopping loop", tool_call.function.name);

                                    // Convert ChatToolCall to internal ToolCall format for storage and event
                                    let internal_tool_call = convert_chat_tool_call_to_internal(tool_call);

                                    // Emit a message about the tool call
                                    let tool_msg = format!(
                                        "I'd like to execute **{}**. This action requires your approval.",
                                        tool_call.function.name
                                    );
                                    let _ = ctx.emit_token(&tool_msg);
                                    final_content = ctx.get_content().to_string();

                                    // Emit tool_call event to frontend so it shows the approval UI
                                    if let Err(e) = ctx.emit_tool_call(&internal_tool_call) {
                                        log::error!("Failed to emit tool call: {}", e);
                                    }

                                    // Store tool call in the message for persistence
                                    let tool_calls_for_db = vec![internal_tool_call];

                                    // Update message with tool calls
                                    let db_state = app_clone.state::<DatabaseState>();
                                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                    let _ = repo.update_message_completion(
                                        &assistant_message_id,
                                        &final_content,
                                        Some(total_tokens),
                                        Some(&model_name),
                                        Some(&tool_calls_for_db),
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

                                // Track this tool call as executed (for cross-iteration deduplication)
                                let tool_key = format!("{}:{}", tool_call.function.name, tool_call.function.arguments);
                                *executed_tool_calls.entry(tool_key).or_insert(0) += 1;

                                log::info!(
                                    "Tool {} executed: success={}, output_len={}",
                                    tool_call.function.name,
                                    result.success,
                                    result.output.len()
                                );
                                log::debug!("Tool output: {}", &result.output);

                                // Track execution result for status update
                                execution_results.insert(tool_call.id.clone(), result.success);

                                // Add tool result to messages for AI context (output is already a string)
                                messages.push(ChatMessage::tool_result(&tool_call.id, result.output.clone()));

                                // Track tool result for fallback (in case AI returns empty content)
                                all_tool_results.push((
                                    tool_call.function.name.clone(),
                                    result.success,
                                    result.output.clone(),
                                ));

                                // Save tool result to database for history persistence
                                {
                                    let tool_result = ToolResult {
                                        call_id: tool_call.id.clone(),
                                        success: result.success,
                                        output: result.output.clone(),
                                        error: if result.success { None } else { Some(result.output.clone()) },
                                        duration_ms: None,
                                        metadata: None,
                                    };
                                    let tool_message = Message::tool_result(
                                        conversation_id.clone(),
                                        String::new(), // content is empty for tool result messages
                                        vec![tool_result],
                                    );
                                    let db_state = app_clone.state::<DatabaseState>();
                                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                    if let Err(e) = repo.create_message(&tool_message) {
                                        log::error!("Failed to save tool result message: {}", e);
                                    }
                                }
                            }

                            // After all auto-executed tools, save the assistant message with correct statuses
                            if let Some(ref msg_id) = tool_call_msg_id {
                                // Create tool calls with correct statuses based on execution results
                                let internal_tool_calls: Vec<ToolCall> = unique_tool_calls.iter()
                                    .map(|tc| {
                                        let success = execution_results.get(&tc.id).copied().unwrap_or(false);
                                        ToolCall {
                                            id: tc.id.clone(),
                                            name: tc.function.name.clone(),
                                            arguments: serde_json::from_str(&tc.function.arguments)
                                                .unwrap_or(serde_json::json!({})),
                                            status: if success { ToolCallStatus::Completed } else { ToolCallStatus::Failed },
                                        }
                                    })
                                    .collect();

                                // Create and save the assistant message with tool_calls
                                let tool_call_msg = Message {
                                    id: msg_id.clone(),
                                    conversation_id: conversation_id.clone(),
                                    role: MessageRole::Assistant,
                                    content: response.content.clone(),
                                    tool_calls: Some(internal_tool_calls),
                                    tool_results: None,
                                    status: MessageStatus::Sent,
                                    tokens_used: response.tokens_used.map(|t| t as i64),
                                    model: Some(model_name.clone()),
                                    created_at: Utc::now(),
                                };

                                let db_state = app_clone.state::<DatabaseState>();
                                let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                if let Err(e) = repo.create_message(&tool_call_msg) {
                                    log::error!("Failed to save assistant tool call message: {}", e);
                                }
                            }

                            // Continue the loop to get AI's response after tool execution
                            continue;
                            } // end else (valid tool calls)
                        } // end if !tool_calls.is_empty()
                    } // end if let Some(tool_calls)

                    // No tool calls or final response - emit content
                    let mut content = response.content.clone();

                    log::info!(
                        "AI response: content_len={}, finish_reason={:?}, tokens={}",
                        content.len(),
                        response.finish_reason,
                        response.tokens_used.unwrap_or(0)
                    );

                    // If content is empty but we have tool results, use them as fallback
                    // This handles models that don't properly respond after tool execution
                    if content.is_empty() && !all_tool_results.is_empty() {
                        log::info!("AI returned empty content, generating fallback summary for {} tool(s)", all_tool_results.len());
                        content = generate_tool_results_summary(&all_tool_results);
                    } else if content.is_empty() {
                        log::warn!("AI returned empty content with no tool results");
                    }

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
    db: State<'_, DatabaseState>,
    project_path: Option<String>,
) -> Result<AvailableTools, String> {
    let handler = MCPToolHandler::with_database(db.0.as_ref().clone());
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
    let _ = conversation_id; // Mark as used (for potential future use like audit logging)
    let repo = AIConversationRepository::new(db.0.as_ref().clone());
    // Use with_database for path security validation
    let handler = MCPToolHandler::with_database(db.0.as_ref().clone());

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

    // Execute the confirmed tool call (bypasses confirmation check)
    let result = handler.execute_confirmed_tool_call(tool_call).await;

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

/// Stop an executing tool call process
/// This kills the background process associated with the tool call
#[tauri::command]
pub async fn ai_assistant_stop_tool_execution(
    tool_call_id: String,
) -> Result<(), String> {
    use crate::services::ai_assistant::PROCESS_MANAGER;

    log::info!("Stopping tool execution: {}", tool_call_id);

    // Try to stop the process
    PROCESS_MANAGER.stop_process(&tool_call_id).await?;

    log::info!("Tool execution stopped: {}", tool_call_id);
    Ok(())
}

/// Continue AI conversation after tool call approval
/// This resumes the agentic loop with the tool result in context
#[tauri::command]
pub async fn ai_assistant_continue_after_tool(
    app: AppHandle,
    db: State<'_, DatabaseState>,
    stream_manager: State<'_, StreamManager>,
    conversation_id: String,
    project_path: Option<String>,
    provider_id: Option<String>,
) -> Result<SendMessageResponse, String> {
    let conv_repo = AIConversationRepository::new(db.0.as_ref().clone());
    let ai_repo = AIRepository::new(db.0.as_ref().clone());
    let keychain = AIKeychain::new(app.clone());

    // Verify conversation exists
    let conversation = conv_repo.get_conversation(&conversation_id)?
        .ok_or_else(|| "Conversation not found".to_string())?;

    // Get AI provider
    let effective_provider_id = provider_id
        .or(conversation.provider_id.clone())
        .ok_or_else(|| "No AI provider configured for this conversation".to_string())?;

    let service = ai_repo.get_provider(&effective_provider_id)?
        .ok_or_else(|| "AI provider not found".to_string())?;

    // Get API key
    let api_key = keychain.get_api_key(&service.id)
        .map_err(|e| format!("Failed to retrieve API key: {}", e))?;

    // Create provider
    let provider = create_provider(service.clone(), api_key)
        .map_err(|e| format!("Failed to create AI provider: {}", e))?;

    // Load conversation history
    let history = conv_repo.get_messages(&conversation_id).unwrap_or_default();

    // Build project context if available
    let project_context = if let Some(ref path) = project_path {
        ProjectContextBuilder::build_from_path(path).ok()
    } else {
        None
    };

    // Build ChatMessage array from history
    let mut chat_messages: Vec<ChatMessage> = Vec::new();

    // Add system message with context
    let system_prompt = build_system_prompt(&project_context);
    chat_messages.push(ChatMessage::system(system_prompt));

    // Add conversation history
    for msg in history.iter() {
        match msg.role.to_string().as_str() {
            "user" => chat_messages.push(ChatMessage::user(&msg.content)),
            "assistant" => {
                if let Some(ref tool_calls) = msg.tool_calls {
                    let chat_tool_calls: Vec<ChatToolCall> = tool_calls.iter().map(|tc| {
                        ChatToolCall {
                            id: tc.id.clone(),
                            tool_type: "function".to_string(),
                            function: crate::models::ai::ChatFunctionCall {
                                name: tc.name.clone(),
                                arguments: tc.arguments.to_string(),
                            },
                        }
                    }).collect();
                    chat_messages.push(ChatMessage::assistant_with_tool_calls(
                        if msg.content.is_empty() { None } else { Some(msg.content.clone()) },
                        chat_tool_calls,
                    ));
                } else {
                    chat_messages.push(ChatMessage::assistant(&msg.content));
                }
            }
            "tool" => {
                if let Some(ref results) = msg.tool_results {
                    for result in results {
                        chat_messages.push(ChatMessage::tool_result(&result.call_id, result.output.clone()));
                    }
                }
            }
            _ => {}
        }
    }

    // Create new assistant message placeholder for continuation response
    let assistant_message = Message::assistant(conversation_id.clone(), String::new());
    conv_repo.create_message(&assistant_message)?;

    // Create streaming session
    let (stream_session_id, cancel_rx) = stream_manager.create_session().await;

    // Create stream context
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
    let conversation_id_for_spawn = conversation_id.clone();
    let project_path_for_tools = project_path.clone();
    let db_for_tools = db.0.as_ref().clone();

    tokio::spawn(async move {
        let conversation_id = conversation_id_for_spawn;
        let mut ctx = stream_ctx;

        // Initialize tool handler
        let tool_handler = MCPToolHandler::with_database(db_for_tools);
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
        let mut final_content = String::new();
        let mut total_tokens: i64 = 0;
        let mut iteration = 0;
        // Track all tool results for fallback (in case AI returns empty content)
        let mut all_tool_results: Vec<(String, bool, String)> = Vec::new();
        // Track executed tool calls across iterations to prevent infinite loops
        let mut executed_tool_calls: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        const MAX_SAME_TOOL_EXECUTIONS: usize = 2;
        // Track seen content to detect repetition loops
        let mut seen_content: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        const MAX_SAME_CONTENT: usize = 2;

        loop {
            iteration += 1;
            if iteration > MAX_TOOL_ITERATIONS {
                log::warn!("Continuation loop reached maximum iterations ({})", MAX_TOOL_ITERATIONS);
                // Generate a message informing the user
                let warning_msg = "I've reached the maximum number of tool calls for this response. Please let me know if you'd like me to continue with a new request.";
                let _ = ctx.emit_token(warning_msg);
                final_content = ctx.get_content().to_string();
                break;
            }

            if cancel_rx.is_closed() {
                log::info!("Continuation stream cancelled");
                break;
            }

            // Emit status update
            let _ = ctx.emit_generating(Some(model_name.clone()));

            match provider.chat_completion(messages.clone(), options.clone()).await {
                Ok(response) => {
                    total_tokens += response.tokens_used.unwrap_or(0) as i64;

                    // Check for repeated content (AI stuck in a loop)
                    if !response.content.is_empty() {
                        let content_key = response.content.chars().take(200).collect::<String>();
                        let count = seen_content.entry(content_key.clone()).or_insert(0);
                        *count += 1;
                        if *count >= MAX_SAME_CONTENT {
                            log::warn!("Detected repeated content in continuation - AI may be stuck in a loop");
                            if ctx.get_content().is_empty() {
                                let _ = ctx.emit_token("I notice I'm repeating myself. Let me stop here.");
                            }
                            final_content = ctx.get_content().to_string();
                            break;
                        }
                    }

                    // Check for tool calls
                    if let Some(ref tool_calls) = response.tool_calls {
                        if !tool_calls.is_empty() {
                            // Emit the assistant message content if any
                            if !response.content.is_empty() {
                                let _ = ctx.emit_token(&response.content);
                            }

                            // Filter out tool calls that have been executed too many times
                            let filtered_tool_calls: Vec<&ChatToolCall> = tool_calls.iter()
                                .filter(|tc| {
                                    let key = format!("{}:{}", tc.function.name, tc.function.arguments);
                                    let count = executed_tool_calls.get(&key).copied().unwrap_or(0);
                                    if count >= MAX_SAME_TOOL_EXECUTIONS {
                                        log::warn!(
                                            "Skipping repeated tool call '{}' (already executed {} times)",
                                            tc.function.name, count
                                        );
                                        false
                                    } else {
                                        true
                                    }
                                })
                                .collect();

                            // If all tool calls were filtered out, break the loop
                            if filtered_tool_calls.is_empty() {
                                log::warn!("All tool calls were filtered as duplicates - breaking continuation loop");
                                let warning_msg = "I notice I'm trying to repeat the same action. Let me provide you with the results I already have.";
                                let _ = ctx.emit_token(warning_msg);
                                final_content = ctx.get_content().to_string();
                                break;
                            }

                            // Process tool calls (deduplication within this response)
                            let mut unique_tool_calls: Vec<&ChatToolCall> = Vec::new();
                            let mut seen_ids = std::collections::HashSet::new();
                            for tool_call in filtered_tool_calls.iter() {
                                if seen_ids.insert(tool_call.id.clone()) {
                                    unique_tool_calls.push(tool_call);
                                }
                            }

                            let mut execution_results: std::collections::HashMap<String, bool> = std::collections::HashMap::new();

                            for tool_call in unique_tool_calls.iter() {
                                let internal_tool_call = convert_chat_tool_call_to_internal(tool_call);

                                // Check if tool requires confirmation
                                if tool_handler.requires_confirmation(&tool_call.function.name) {
                                    // Emit tool call event and stop - wait for user approval
                                    let tool_msg = format!(
                                        "\n\nI'd like to execute **{}**. This action requires your approval.",
                                        tool_call.function.name
                                    );
                                    let _ = ctx.emit_token(&tool_msg);
                                    final_content = ctx.get_content().to_string();

                                    if let Err(e) = ctx.emit_tool_call(&internal_tool_call) {
                                        log::error!("Failed to emit tool call: {}", e);
                                    }

                                    // Store tool call in message
                                    let tool_calls_for_db = vec![internal_tool_call];
                                    let db_state = app_clone.state::<DatabaseState>();
                                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                    let _ = repo.update_message_completion(
                                        &assistant_message_id,
                                        &final_content,
                                        Some(total_tokens),
                                        Some(&model_name),
                                        Some(&tool_calls_for_db),
                                    );

                                    if let Err(e) = ctx.emit_complete(total_tokens, &model_name, "tool_calls") {
                                        log::error!("Failed to emit complete: {}", e);
                                    }

                                    let stream_mgr = app_clone.state::<StreamManager>();
                                    stream_mgr.remove_session(&session_id).await;
                                    return;
                                }

                                // Auto-execute read-only tools
                                let result = tool_handler.execute_tool_call(&internal_tool_call).await;
                                execution_results.insert(tool_call.id.clone(), result.success);

                                // Track this tool call as executed (for cross-iteration deduplication)
                                let tool_key = format!("{}:{}", tool_call.function.name, tool_call.function.arguments);
                                *executed_tool_calls.entry(tool_key).or_insert(0) += 1;

                                // Add tool result to messages
                                messages.push(ChatMessage::tool_result(&tool_call.id, result.output.clone()));

                                // Track tool result for fallback
                                all_tool_results.push((
                                    tool_call.function.name.clone(),
                                    result.success,
                                    result.output.clone(),
                                ));

                                // Save tool result to database
                                {
                                    let tool_result = ToolResult {
                                        call_id: tool_call.id.clone(),
                                        success: result.success,
                                        output: result.output.clone(),
                                        error: if result.success { None } else { Some(result.output.clone()) },
                                        duration_ms: None,
                                        metadata: None,
                                    };
                                    let tool_message = Message::tool_result(
                                        conversation_id.clone(),
                                        String::new(),
                                        vec![tool_result],
                                    );
                                    let db_state = app_clone.state::<DatabaseState>();
                                    let repo = AIConversationRepository::new(db_state.0.as_ref().clone());
                                    if let Err(e) = repo.create_message(&tool_message) {
                                        log::error!("Failed to save tool result message: {}", e);
                                    }
                                }
                            }

                            // Continue the loop to get AI's response
                            continue;
                        }
                    }

                    // No tool calls or final response - emit content
                    let mut content = response.content.clone();

                    // Fallback if content is empty but we have tool results
                    if content.is_empty() && !all_tool_results.is_empty() {
                        log::info!("AI returned empty content, generating fallback summary for {} tool(s)", all_tool_results.len());
                        content = generate_tool_results_summary(&all_tool_results);
                    } else if content.is_empty() {
                        log::warn!("AI returned empty content with no tool results");
                    }

                    // Stream the content
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

                    break;
                }
                Err(e) => {
                    log::error!("AI continuation failed: {}", e);
                    if let Err(emit_err) = ctx.emit_error("AI_PROVIDER_ERROR", &e.to_string(), true) {
                        log::error!("Failed to emit error: {}", emit_err);
                    }
                    break;
                }
            }
        }

        // Clean up session
        let stream_mgr = app_clone.state::<StreamManager>();
        stream_mgr.remove_session(&session_id).await;
    });

    Ok(SendMessageResponse {
        stream_session_id,
        conversation_id,
        message_id: assistant_message.id,
    })
}

/// Get suggestions for the current context
#[tauri::command]
pub async fn ai_assistant_get_suggestions(
    conversation_id: Option<String>,
    project_path: Option<String>,
) -> Result<SuggestionsResponse, String> {
    use crate::models::ai_assistant::SuggestedAction;

    let mut suggestions = Vec::new();

    // Project-specific suggestions based on actual MCP tools
    if let Some(ref path) = project_path {
        let project_path = std::path::Path::new(path);

        // Git suggestions (maps to get_git_status, get_staged_diff, list_worktrees)
        if project_path.join(".git").exists() {
            suggestions.push(SuggestedAction {
                id: "git-status".to_string(),
                label: "Git Status".to_string(),
                prompt: "Use get_git_status for this project".to_string(),
                icon: Some("GitBranch".to_string()),
                variant: Some("default".to_string()),
                category: Some("git".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "staged-diff".to_string(),
                label: "Staged Diff".to_string(),
                prompt: "Use get_staged_diff to show staged changes".to_string(),
                icon: Some("FileDiff".to_string()),
                variant: Some("default".to_string()),
                category: Some("git".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "worktrees".to_string(),
                label: "Worktrees".to_string(),
                prompt: "Use list_worktrees for this project".to_string(),
                icon: Some("GitFork".to_string()),
                variant: Some("default".to_string()),
                category: Some("git".to_string()),
            });
        }

        // Node.js project suggestions (maps to list_project_scripts, run_npm_script)
        if project_path.join("package.json").exists() {
            suggestions.push(SuggestedAction {
                id: "scripts".to_string(),
                label: "Scripts".to_string(),
                prompt: "Use list_project_scripts to show available npm scripts".to_string(),
                icon: Some("Terminal".to_string()),
                variant: Some("default".to_string()),
                category: Some("project".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "run-dev".to_string(),
                label: "npm dev".to_string(),
                prompt: "Use run_npm_script with scriptName \"dev\"".to_string(),
                icon: Some("Play".to_string()),
                variant: Some("primary".to_string()),
                category: Some("project".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "run-build".to_string(),
                label: "npm build".to_string(),
                prompt: "Use run_npm_script with scriptName \"build\"".to_string(),
                icon: Some("Hammer".to_string()),
                variant: Some("default".to_string()),
                category: Some("project".to_string()),
            });

            suggestions.push(SuggestedAction {
                id: "run-test".to_string(),
                label: "npm test".to_string(),
                prompt: "Use run_npm_script with scriptName \"test\"".to_string(),
                icon: Some("TestTube".to_string()),
                variant: Some("default".to_string()),
                category: Some("project".to_string()),
            });
        }
    }

    // Default suggestions when no project context (maps to list_projects, list_workflows, list_actions)
    if suggestions.is_empty() {
        suggestions.push(SuggestedAction {
            id: "list-projects".to_string(),
            label: "Projects".to_string(),
            prompt: "Use list_projects to show all registered projects".to_string(),
            icon: Some("FolderOpen".to_string()),
            variant: Some("primary".to_string()),
            category: Some("project".to_string()),
        });

        suggestions.push(SuggestedAction {
            id: "list-workflows".to_string(),
            label: "Workflows".to_string(),
            prompt: "Use list_workflows to show all available workflows".to_string(),
            icon: Some("Workflow".to_string()),
            variant: Some("default".to_string()),
            category: Some("workflow".to_string()),
        });

        suggestions.push(SuggestedAction {
            id: "list-actions".to_string(),
            label: "Actions".to_string(),
            prompt: "Use list_actions to show all MCP actions".to_string(),
            icon: Some("Zap".to_string()),
            variant: Some("default".to_string()),
            category: Some("workflow".to_string()),
        });
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

/// Generate a human-readable summary of tool execution results
/// Used as fallback when AI returns empty content after tool execution
fn generate_tool_results_summary(results: &[(String, bool, String)]) -> String {
    let mut summary = String::from("Here are the results from the executed tools:\n\n");

    for (name, success, output) in results {
        if *success {
            // Try to parse as JSON for better formatting
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(output) {
                // Format JSON nicely
                let formatted = serde_json::to_string_pretty(&json)
                    .unwrap_or_else(|_| output.clone());
                summary.push_str(&format!("**{}** completed successfully:\n```json\n{}\n```\n\n", name, formatted));
            } else {
                summary.push_str(&format!("**{}** completed successfully:\n```\n{}\n```\n\n", name, output));
            }
        } else {
            summary.push_str(&format!("**{}** failed:\n```\n{}\n```\n\n", name, output));
        }
    }

    summary.push_str("Is there anything specific you'd like me to help you with based on these results?");
    summary
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

// ============================================================================
// Interactive Element Commands (Feature 023 - US3)
// ============================================================================

use crate::models::ai_assistant::{InteractiveElement, LazyAction, LazyActionType};
use crate::services::ai_assistant::{parse_interactive_elements, get_clean_content};

/// Parse interactive elements from AI response content (T066)
/// Returns the list of interactive elements found in the content
#[tauri::command]
pub fn ai_assistant_parse_interactive(content: String) -> ParseInteractiveResponse {
    let elements = parse_interactive_elements(&content);
    let clean_content = get_clean_content(&content);

    ParseInteractiveResponse {
        elements,
        clean_content,
    }
}

/// Response type for parse_interactive command
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseInteractiveResponse {
    /// Parsed interactive elements
    pub elements: Vec<InteractiveElement>,
    /// Content with markers stripped (labels only)
    pub clean_content: String,
}

/// Execute a lazy action (T067)
/// Handles navigation, tool execution, and clipboard copy actions
#[tauri::command]
pub async fn ai_assistant_execute_lazy_action(
    app: AppHandle,
    action: LazyAction,
) -> Result<LazyActionResult, String> {
    match action.action_type {
        LazyActionType::Navigate => {
            // Navigation is handled by frontend via emit
            app.emit("ai:navigate", &action.payload)
                .map_err(|e| format!("Failed to emit navigation: {}", e))?;

            Ok(LazyActionResult {
                success: true,
                message: Some(format!("Navigating to {}", action.payload)),
                data: None,
            })
        }
        LazyActionType::ExecuteTool => {
            // Tool execution requires confirmation - emit event for frontend to handle
            app.emit("ai:execute-tool-request", &action.payload)
                .map_err(|e| format!("Failed to emit tool request: {}", e))?;

            Ok(LazyActionResult {
                success: true,
                message: Some("Tool execution requested".to_string()),
                data: Some(action.payload),
            })
        }
        LazyActionType::Copy => {
            // Copy to clipboard - handled by frontend
            app.emit("ai:copy-to-clipboard", &action.payload)
                .map_err(|e| format!("Failed to emit copy request: {}", e))?;

            Ok(LazyActionResult {
                success: true,
                message: Some("Copied to clipboard".to_string()),
                data: None,
            })
        }
    }
}

/// Result type for lazy action execution
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LazyActionResult {
    /// Whether the action was successful
    pub success: bool,
    /// Optional message
    pub message: Option<String>,
    /// Optional data returned by the action
    pub data: Option<String>,
}

// ============================================================================
// Autocomplete Commands (Feature 023 - US5)
// ============================================================================

/// Autocomplete suggestion
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutocompleteSuggestion {
    /// Suggested text to insert
    pub text: String,
    /// Source of the suggestion
    pub source: AutocompleteSource,
    /// Display label (may be truncated)
    pub label: String,
    /// Optional icon hint
    pub icon: Option<String>,
}

/// Source of autocomplete suggestion
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutocompleteSource {
    /// From recent prompts
    RecentPrompt,
    /// From tool description
    ToolDescription,
    /// From conversation context
    Context,
}

/// Get autocomplete suggestions for input (T109-T112)
#[tauri::command]
pub async fn ai_assistant_get_autocomplete(
    db: State<'_, DatabaseState>,
    conversation_id: String,
    input: String,
    limit: Option<usize>,
) -> Result<Vec<AutocompleteSuggestion>, String> {
    let limit = limit.unwrap_or(5);
    let input_lower = input.to_lowercase();

    if input_lower.len() < 2 {
        return Ok(vec![]);
    }

    let mut suggestions: Vec<AutocompleteSuggestion> = Vec::new();

    // T110: Recent prompts matching
    let repo = AIConversationRepository::new(db.0.as_ref().clone());
    if let Ok(messages) = repo.get_messages(&conversation_id) {
        for msg in messages.iter().rev() {
            if msg.role == crate::models::ai_assistant::MessageRole::User {
                let content_lower = msg.content.to_lowercase();
                if content_lower.contains(&input_lower) && msg.content != input {
                    suggestions.push(AutocompleteSuggestion {
                        text: msg.content.clone(),
                        source: AutocompleteSource::RecentPrompt,
                        label: if msg.content.len() > 50 {
                            format!("{}...", &msg.content[..50])
                        } else {
                            msg.content.clone()
                        },
                        icon: Some("clock".to_string()),
                    });

                    if suggestions.len() >= limit {
                        break;
                    }
                }
            }
        }
    }

    // T111: Tool description matching
    let tool_suggestions = get_tool_suggestions(&input_lower);
    for suggestion in tool_suggestions {
        if suggestions.len() >= limit {
            break;
        }
        suggestions.push(suggestion);
    }

    // T112: Context-based suggestions
    if suggestions.len() < limit {
        let context_suggestions = get_context_suggestions(&input_lower);
        for suggestion in context_suggestions {
            if suggestions.len() >= limit {
                break;
            }
            suggestions.push(suggestion);
        }
    }

    Ok(suggestions)
}

/// Get tool-based autocomplete suggestions (T111)
fn get_tool_suggestions(input: &str) -> Vec<AutocompleteSuggestion> {
    let mut suggestions = Vec::new();

    // Common tool-related prompts
    let tool_prompts = vec![
        ("list", "List all projects using list_projects", "folder"),
        ("show", "Show git status using get_worktree_status", "git-branch"),
        ("run", "Run npm script using run_npm_script", "play"),
        ("workflow", "List workflows using list_workflows", "workflow"),
        ("create", "Create a new workflow using create_workflow", "plus"),
        ("status", "Get git status using get_worktree_status", "git-branch"),
    ];

    for (keyword, prompt, icon) in tool_prompts {
        if keyword.contains(input) || input.contains(keyword) {
            suggestions.push(AutocompleteSuggestion {
                text: prompt.to_string(),
                source: AutocompleteSource::ToolDescription,
                label: prompt.to_string(),
                icon: Some(icon.to_string()),
            });
        }
    }

    suggestions
}

/// Get context-based autocomplete suggestions (T112)
fn get_context_suggestions(input: &str) -> Vec<AutocompleteSuggestion> {
    let mut suggestions = Vec::new();

    // Common follow-up patterns
    let follow_ups = vec![
        ("again", "Run the same command again"),
        ("more", "Show more details"),
        ("explain", "Explain the last result"),
        ("fix", "Fix the issue mentioned above"),
        ("continue", "Continue with the previous task"),
    ];

    for (keyword, suggestion) in follow_ups {
        if keyword.contains(input) || input.contains(keyword) {
            suggestions.push(AutocompleteSuggestion {
                text: suggestion.to_string(),
                source: AutocompleteSource::Context,
                label: suggestion.to_string(),
                icon: Some("message-circle".to_string()),
            });
        }
    }

    suggestions
}

/// Context summary result
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSummaryResult {
    /// Summary text
    pub summary: String,
    /// Key entities extracted
    pub key_entities: Vec<String>,
    /// Recent tool calls
    pub recent_tool_calls: Vec<crate::services::ai_assistant::ToolCallSummary>,
    /// Number of messages summarized
    pub messages_summarized: usize,
}

/// Summarize conversation context (T114)
#[tauri::command]
pub async fn ai_assistant_summarize_context(
    db: State<'_, DatabaseState>,
    conversation_id: String,
) -> Result<ContextSummaryResult, String> {
    use crate::services::ai_assistant::{ContextManager, ContextConfig};

    let repo = AIConversationRepository::new(db.0.as_ref().clone());
    let messages = repo.get_messages(&conversation_id)?;

    let config = ContextConfig {
        max_messages: 50,
        recent_to_keep: 10,
        summarization_threshold: 15,
    };
    let manager = ContextManager::new(config);

    let prepared = manager.prepare_context(&messages);
    let summary = if prepared.was_summarized {
        prepared.system_context.unwrap_or_default()
    } else {
        manager.summarize_messages(&messages)
    };

    Ok(ContextSummaryResult {
        summary,
        key_entities: prepared.key_entities,
        recent_tool_calls: prepared.recent_tool_calls,
        messages_summarized: messages.len(),
    })
}
