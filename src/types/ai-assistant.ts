// AI Assistant TypeScript types
// Feature: AI Assistant Tab (022-ai-assistant-tab)

// ============================================================================
// Core Entities
// ============================================================================

/** Conversation entity - represents a chat session */
export interface Conversation {
  id: string;
  title: string | null;
  projectPath: string | null;
  providerId: string | null;
  messageCount: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Conversation summary for list display */
export interface ConversationSummary {
  id: string;
  title: string | null;
  projectPath: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Message entity - individual chat message */
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCall[] | null;
  toolResults: ToolResult[] | null;
  status: MessageStatus;
  tokensUsed: number | null;
  model: string | null;
  createdAt: string; // ISO 8601
}

/** Message author role */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Message delivery status */
export type MessageStatus = 'pending' | 'sent' | 'error';

// ============================================================================
// Tool Calling
// ============================================================================

/** Tool call requested by AI */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
}

/** Tool call status */
export type ToolCallStatus = 'pending' | 'approved' | 'denied' | 'completed' | 'failed';

/** Tool execution result */
export interface ToolResult {
  callId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** Tool definition for AI providers */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  requiresConfirmation: boolean;
  category: 'script' | 'workflow' | 'git' | 'info';
}

/** Parameter definition for tool */
export interface ParameterDefinition {
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

// ============================================================================
// Quick Actions / Suggestions
// ============================================================================

/** Suggested quick action */
export interface SuggestedAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
  variant?: 'default' | 'primary' | 'warning';
  category?: 'git' | 'project' | 'workflow' | 'general';
}

// ============================================================================
// Project Context
// ============================================================================

/** Safe project context for AI prompts */
export interface ProjectContext {
  projectName: string;
  projectPath: string;
  projectType: string;
  packageManager: string;
  availableScripts: string[];
}

// ============================================================================
// Streaming Events
// ============================================================================

/** Streaming event types */
export type AIAssistantEventType = 'token' | 'tool_call' | 'complete' | 'error';

/** Chat token event payload */
export interface ChatTokenPayload {
  streamSessionId: string;
  conversationId: string;
  messageId: string;
  token: string;
  isFinal: boolean;
}

/** Tool call event payload */
export interface ToolCallPayload {
  streamSessionId: string;
  conversationId: string;
  messageId: string;
  toolCall: ToolCall;
}

/** Chat complete event payload */
export interface ChatCompletePayload {
  streamSessionId: string;
  conversationId: string;
  messageId: string;
  fullContent: string;
  tokensUsed: number;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/** Chat error event payload */
export interface ChatErrorPayload {
  streamSessionId: string;
  conversationId: string;
  messageId: string;
  code: string;
  message: string;
  retryable: boolean;
}

/** Union type for all streaming event payloads */
export type StreamingEventPayload =
  | { type: 'token'; payload: ChatTokenPayload }
  | { type: 'tool_call'; payload: ToolCallPayload }
  | { type: 'complete'; payload: ChatCompletePayload }
  | { type: 'error'; payload: ChatErrorPayload };

// ============================================================================
// Request/Response Types
// ============================================================================

/** Request to create a new conversation */
export interface CreateConversationRequest {
  title?: string;
  projectPath?: string;
  providerId?: string;
}

/** Request to list conversations */
export interface ListConversationsRequest {
  projectPath?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'created' | 'updated';
}

/** Response for list conversations */
export interface ConversationListResponse {
  conversations: ConversationSummary[];
  total: number;
  hasMore: boolean;
}

/** Request to get a conversation */
export interface GetConversationRequest {
  conversationId: string;
}

/** Response for get conversation */
export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

/** Request to update a conversation */
export interface UpdateConversationRequest {
  conversationId: string;
  title?: string;
  projectPath?: string | null;
}

/** Request to delete a conversation */
export interface DeleteConversationRequest {
  conversationId: string;
}

/** Request to send a message */
export interface SendMessageRequest {
  conversationId: string;
  content: string;
  projectContext?: ProjectContext;
}

/** Response for send message */
export interface SendMessageResponse {
  userMessageId: string;
  assistantMessageId: string;
  streamSessionId: string;
}

/** Request to cancel a stream */
export interface CancelStreamRequest {
  streamSessionId: string;
}

/** Request to regenerate a response */
export interface RegenerateRequest {
  conversationId: string;
  messageId: string;
}

/** Response for regenerate */
export interface RegenerateResponse {
  newMessageId: string;
  streamSessionId: string;
}

/** Request to approve a tool call */
export interface ApproveToolCallRequest {
  conversationId: string;
  messageId: string;
  toolCallId: string;
}

/** Response for tool call approval */
export interface ToolCallResponse {
  result: ToolResult;
  continueStreamSessionId?: string;
}

/** Request to deny a tool call */
export interface DenyToolCallRequest {
  conversationId: string;
  messageId: string;
  toolCallId: string;
  reason?: string;
}

/** Request to get available tools */
export interface GetToolsRequest {
  projectPath?: string;
}

/** Response for available tools */
export interface AvailableTools {
  tools: ToolDefinition[];
}

/** Request to get suggestions */
export interface GetSuggestionsRequest {
  conversationId: string;
  projectPath?: string;
}

/** Response for suggestions */
export interface SuggestionsResponse {
  suggestions: SuggestedAction[];
}

// ============================================================================
// Error Types
// ============================================================================

/** AI Assistant error codes */
export type AIAssistantErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'MESSAGE_NOT_FOUND'
  | 'INVALID_PROJECT_PATH'
  | 'INVALID_SERVICE_ID'
  | 'NO_AI_SERVICE_CONFIGURED'
  | 'AI_SERVICE_DISABLED'
  | 'STREAM_CANCELLED'
  | 'TOOL_CALL_NOT_FOUND'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_PERMISSION_DENIED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_TOKEN_LIMIT'
  | 'INTERNAL_ERROR';

/** AI Assistant error */
export interface AIAssistantError {
  code: AIAssistantErrorCode;
  message: string;
  recoverable: boolean;
  suggestion?: string;
  retryAfter?: number;
}

// ============================================================================
// UI State Types
// ============================================================================

/** Chat status for UI */
export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'waiting_tool_confirmation' | 'error';

/** Pending action for confirmation UI */
export interface PendingAction {
  executionId: string;
  actionType: 'script' | 'webhook' | 'workflow';
  actionName: string;
  description: string;
  parameters: Record<string, unknown>;
  sourceClient?: string;
  projectContext?: string;
  requestedAt: Date;
}
