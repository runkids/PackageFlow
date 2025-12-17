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

/**
 * Quick action execution mode
 * - instant: Execute tool directly, display result card (zero tokens)
 * - smart: Execute tool, then AI summarizes/analyzes (moderate tokens)
 * - ai: Full AI conversation flow (AI decides tool usage)
 */
export type QuickActionMode = 'instant' | 'smart' | 'ai';

/** Tool specification for quick action */
export interface QuickActionTool {
  /** MCP tool name to execute */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
}

/** Suggested quick action */
export interface SuggestedAction {
  id: string;
  label: string;
  /** Prompt text (used for AI mode, or as display text) */
  prompt: string;
  icon?: string;
  variant?: 'default' | 'primary' | 'warning';
  category?: 'git' | 'project' | 'workflow' | 'general' | 'security' | 'system' | 'process';
  /** Execution mode: instant (zero token), smart (AI summary), ai (full flow) */
  mode: QuickActionMode;
  /** Tool to execute (for instant/smart modes) */
  tool?: QuickActionTool;
  /** Hint for AI summarization (smart mode only) */
  summaryHint?: string;
  /** Whether this action requires a project context to be available */
  requiresProject?: boolean;
}

// ============================================================================
// AI Project Context (Feature 024: Context-Aware AI)
// ============================================================================

/** Source of project context */
export type AIContextSource = 'navigation' | 'manual' | 'conversation';

/** AI project context state */
export interface AIProjectContext {
  /** Project path (null = no project selected) */
  projectPath: string | null;
  /** How the context was set */
  source: AIContextSource | null;
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

/** Stream resume response for reconnection after page switch */
export interface StreamResumeResponse {
  streamSessionId: string;
  conversationId: string;
  messageId: string;
  accumulatedContent: string;
  status: 'thinking' | 'generating' | 'tool';
  model: string | null;
  isActive: boolean;
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

// ============================================================================
// Feature 023: Enhanced AI Chat Experience
// ============================================================================

// ----------------------------------------------------------------------------
// Response Status Types (T001)
// ----------------------------------------------------------------------------

/** Current processing phase of AI response */
export type ResponsePhase = 'idle' | 'thinking' | 'generating' | 'tool' | 'complete' | 'error';

/** Detailed timing breakdown for response */
export interface ResponseTiming {
  /** Time spent before first token (ms) */
  thinkingMs?: number;
  /** Time spent generating response (ms) */
  generatingMs?: number;
  /** Time spent on tool execution (ms) */
  toolMs?: number;
  /** Total response time (ms) */
  totalMs?: number;
}

/** Response status tracking */
export interface ResponseStatus {
  /** Current processing phase */
  phase: ResponsePhase;
  /** Timestamp when this phase started (Unix ms) */
  startTime: number;
  /** Tool name if phase is 'tool' */
  toolName?: string;
  /** Detailed timing breakdown */
  timing?: ResponseTiming;
  /** Model being used */
  model?: string;
  /** Current iteration in agentic loop (1, 2, 3...) */
  iteration?: number;
}

// ----------------------------------------------------------------------------
// Interactive Element Types (T002)
// ----------------------------------------------------------------------------

/** Type of interactive element */
export type InteractiveElementType = 'navigation' | 'action' | 'entity';

/** Interactive UI element embedded in AI response */
export interface InteractiveElement {
  /** Unique identifier */
  id: string;
  /** Element type */
  type: InteractiveElementType;
  /** Display label */
  label: string;
  /** Type-specific payload */
  payload: string;
  /** Whether action requires confirmation */
  requiresConfirm: boolean;
  /** Start position in content string */
  startIndex: number;
  /** End position in content string */
  endIndex: number;
}

// ----------------------------------------------------------------------------
// Conversation Context Types (T004)
// ----------------------------------------------------------------------------

/** Entity type for context tracking */
export type ContextEntityType = 'project' | 'workflow' | 'script' | 'file';

/** Entity mentioned in conversation */
export interface ContextEntity {
  /** Entity type */
  type: ContextEntityType;
  /** Entity identifier */
  id: string;
  /** Display name */
  name: string;
  /** Last mentioned in message index */
  lastMentioned: number;
}

/** Recent tool call for reference tracking */
export interface RecentToolCall {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Brief description of what was done */
  description: string;
  /** Whether it succeeded */
  success: boolean;
  /** Message index where this occurred */
  messageIndex: number;
}

/** Summarized context for long conversations */
export interface ConversationContext {
  /** AI-generated summary of earlier conversation */
  summary: string;
  /** Key entities mentioned */
  keyEntities: ContextEntity[];
  /** Recent tool calls (for reference tracking) */
  recentToolCalls: RecentToolCall[];
  /** Active project context if any */
  projectContext?: ProjectContext;
  /** Token count of summarized content */
  tokenCount: number;
}

// ----------------------------------------------------------------------------
// Autocomplete Types (T005)
// ----------------------------------------------------------------------------

/** Source of autocomplete suggestion */
export type AutocompleteSource = 'recent' | 'tool' | 'context';

/** Autocomplete suggestion for input */
export interface AutocompleteSuggestion {
  /** Display text */
  text: string;
  /** Full prompt to insert */
  fullPrompt: string;
  /** Source of suggestion */
  source: AutocompleteSource;
  /** Relevance score (0-1) */
  score: number;
}

// ----------------------------------------------------------------------------
// Status Update Event (T006)
// ----------------------------------------------------------------------------

/** Payload for ai:status-update event */
export interface StatusUpdatePayload {
  /** Stream session ID for matching */
  streamSessionId: string;
  /** Conversation ID */
  conversationId: string;
  /** Response status */
  status: ResponseStatus;
}
