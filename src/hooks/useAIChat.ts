/**
 * useAIChat - Custom hook for AI chat state and streaming management
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type {
  Message,
  Conversation,
  ChatTokenPayload,
  ChatCompletePayload,
  ChatErrorPayload,
  ToolCallPayload,
  ToolCall,
  ToolResult,
  ToolCallStatus,
  ResponseStatus,
  StatusUpdatePayload,
} from '../types/ai-assistant';

interface UseAIChatOptions {
  /** Project path for context (optional) */
  projectPath?: string;
  /** AI service ID to use (optional, uses default if not specified) */
  providerId?: string;
}

interface UseAIChatReturn {
  /** Current conversation */
  conversation: Conversation | null;
  /** Messages in current conversation */
  messages: Message[];
  /** Current input value */
  inputValue: string;
  /** Set input value */
  setInputValue: (value: string) => void;
  /** Send a message */
  sendMessage: (content: string) => Promise<void>;
  /** Stop current generation */
  stopGeneration: () => void;
  /** Whether AI is currently generating */
  isGenerating: boolean;
  /** Whether AI service is configured */
  isConfigured: boolean;
  /** Whether initial loading is in progress */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Create a new conversation */
  createNewConversation: () => Promise<void>;
  /** Load an existing conversation by ID */
  loadConversation: (conversationId: string) => Promise<void>;
  /** Clear messages in current conversation */
  clearMessages: () => void;
  /** Pending tool calls awaiting user approval */
  pendingToolCalls: Map<string, ToolCall>;
  /** Approve a pending tool call */
  approveToolCall: (toolCallId: string) => Promise<ToolResult>;
  /** Deny a pending tool call */
  denyToolCall: (toolCallId: string, reason?: string) => Promise<void>;
  /** Stop/cancel an executing tool call */
  stopToolExecution: (toolCallId: string) => Promise<void>;
  /** Whether a tool is currently being executed */
  isExecutingTool: boolean;
  /** Current response status (Feature 023) */
  responseStatus: ResponseStatus | null;
}

/**
 * Helper to send desktop notification
 */
async function sendDesktopNotification(title: string, body: string) {
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (permissionGranted) {
      sendNotification({ title, body });
    }
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

/**
 * Custom hook for managing AI chat state and streaming
 */
export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const { projectPath, providerId } = options;

  // State
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingToolCalls, setPendingToolCalls] = useState<Map<string, ToolCall>>(new Map());
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [responseStatus, setResponseStatus] = useState<ResponseStatus | null>(null);

  // Refs for stream handling
  const currentStreamIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const notifiedToolCallsRef = useRef<Set<string>>(new Set());

  // Check if AI service is configured
  const checkConfiguration = useCallback(async () => {
    try {
      // Check if there's at least one AI provider configured
      // ai_list_providers returns ApiResponse<Vec<AIProviderConfig>>
      const response = await invoke<{
        success: boolean;
        data?: Array<{ id: string }>;
        error?: string;
      }>('ai_list_providers');

      if (response.success && response.data) {
        setIsConfigured(response.data.length > 0);
      } else {
        setIsConfigured(false);
      }
    } catch (err) {
      console.error('Failed to check AI services:', err);
      setIsConfigured(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial check and listen for AI service changes
  useEffect(() => {
    checkConfiguration();

    // Listen for AI service updates (add/edit/delete)
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen('ai:services-updated', () => {
        checkConfiguration();
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [checkConfiguration]);

  // Set up event listeners for streaming
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Token event - append content to streaming message
      const unlistenToken = await listen<ChatTokenPayload>('ai:chat-token', (event) => {
        const { streamSessionId, token, messageId } = event.payload;

        // Only process events for our current stream
        if (streamSessionId !== currentStreamIdRef.current) return;

        // Log first token for debugging
        if (token.length > 0) {
          console.debug('[AI Chat] Receiving tokens for message:', messageId);
        }

        streamingMessageIdRef.current = messageId;

        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.id === messageId) {
            // Update existing message
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, content: lastMessage.content + token },
            ];
          }
          return prev;
        });
      });
      unlisteners.push(unlistenToken);

      // Complete event - finalize the message
      const unlistenComplete = await listen<ChatCompletePayload>('ai:chat-complete', async (event) => {
        const { streamSessionId, fullContent, messageId, tokensUsed, model, finishReason, conversationId } = event.payload;

        if (streamSessionId !== currentStreamIdRef.current) return;

        console.log('[AI Chat] Response complete:', {
          messageId,
          tokensUsed,
          model,
          finishReason,
          contentLength: fullContent.length,
        });

        // Reload messages from database to sync all intermediate messages
        // (tool call messages, tool result messages, etc.)
        if (conversationId) {
          try {
            const dbMessages = await invoke<Message[]>(
              'ai_assistant_get_messages',
              { conversationId }
            );
            setMessages(dbMessages);
          } catch (err) {
            console.error('[AI Chat] Failed to reload messages:', err);
            // Fallback: update the streaming message only
            setMessages((prev) => {
              return prev.map((msg) => {
                if (msg.id === messageId) {
                  return {
                    ...msg,
                    content: fullContent,
                    status: 'sent',
                    tokensUsed,
                    model,
                  };
                }
                return msg;
              });
            });
          }
        } else {
          // No conversation ID, just update the message
          setMessages((prev) => {
            return prev.map((msg) => {
              if (msg.id === messageId) {
                return {
                  ...msg,
                  content: fullContent,
                  status: 'sent',
                  tokensUsed,
                  model,
                };
              }
              return msg;
            });
          });
        }

        setIsGenerating(false);
        currentStreamIdRef.current = null;
        streamingMessageIdRef.current = null;
      });
      unlisteners.push(unlistenComplete);

      // Error event - handle streaming errors
      const unlistenError = await listen<ChatErrorPayload>('ai:chat-error', (event) => {
        const { streamSessionId, message, messageId, code, retryable } = event.payload;

        console.error('[AI Chat] Error received:', {
          code,
          message,
          retryable,
          messageId,
        });

        if (streamSessionId !== currentStreamIdRef.current) return;

        setError(message);

        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === messageId) {
              return { ...msg, status: 'error' };
            }
            return msg;
          });
        });

        setIsGenerating(false);
        currentStreamIdRef.current = null;
        streamingMessageIdRef.current = null;
      });
      unlisteners.push(unlistenError);

      // Tool call event - AI is requesting a tool execution
      const unlistenToolCall = await listen<ToolCallPayload>('ai:chat-tool-call', (event) => {
        const { streamSessionId, messageId, toolCall } = event.payload;

        console.log('[AI Chat] Tool call received:', {
          toolName: toolCall.name,
          toolId: toolCall.id,
          status: toolCall.status,
          arguments: toolCall.arguments,
        });

        if (streamSessionId !== currentStreamIdRef.current) return;

        currentMessageIdRef.current = messageId;

        // Check if we've already notified about this tool call (using ref for synchronous check)
        const alreadyNotified = notifiedToolCallsRef.current.has(toolCall.id);

        // Add to pending tool calls (only if not already present)
        setPendingToolCalls((prev) => {
          if (prev.has(toolCall.id)) return prev;
          const updated = new Map(prev);
          updated.set(toolCall.id, toolCall);
          return updated;
        });

        // Update message with tool call (only if not already present)
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === messageId) {
              const existingCalls = msg.toolCalls || [];
              // Check if tool call already exists by ID
              if (existingCalls.some((tc) => tc.id === toolCall.id)) {
                return msg; // Already exists, don't add again
              }
              return {
                ...msg,
                toolCalls: [...existingCalls, toolCall],
              };
            }
            return msg;
          });
        });

        // Send desktop notification for tool approval request (only once per tool call)
        if (!alreadyNotified) {
          notifiedToolCallsRef.current.add(toolCall.id);
          sendDesktopNotification(
            'AI Assistant - Action Required',
            `AI wants to execute: ${toolCall.name}. Click to review and approve.`
          );
        }
      });
      unlisteners.push(unlistenToolCall);

      // Status update event - Feature 023: Real-time status tracking
      const unlistenStatus = await listen<StatusUpdatePayload>('ai:status-update', (event) => {
        const { streamSessionId, status } = event.payload;

        if (streamSessionId !== currentStreamIdRef.current) return;

        setResponseStatus(status);

        // Auto-clear status when complete or error
        if (status.phase === 'complete' || status.phase === 'error') {
          setTimeout(() => {
            setResponseStatus(null);
          }, 1500); // Keep visible for 1.5s after completion
        }
      });
      unlisteners.push(unlistenStatus);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isGenerating) return;

    console.log('[AI Chat] Sending message:', {
      content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      conversationId: conversation?.id,
      projectPath,
      providerId,
    });

    setError(null);
    setResponseStatus(null); // Clear previous status (Feature 023)

    // Create user message
    const userMessageId = `msg_${Date.now()}_user`;
    const userMessage: Message = {
      id: userMessageId,
      conversationId: conversation?.id || '',
      role: 'user',
      content: content.trim(),
      toolCalls: null,
      toolResults: null,
      status: 'sent',
      tokensUsed: null,
      model: null,
      createdAt: new Date().toISOString(),
    };

    // Create placeholder assistant message
    const assistantMessageId = `msg_${Date.now()}_assistant`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversationId: conversation?.id || '',
      role: 'assistant',
      content: '',
      toolCalls: null,
      toolResults: null,
      status: 'pending',
      tokensUsed: null,
      model: null,
      createdAt: new Date().toISOString(),
    };

    // Add both messages to state
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsGenerating(true);

    try {
      // Call Tauri command to send message
      const response = await invoke<{
        streamSessionId: string;
        conversationId: string;
        messageId: string;
      }>('ai_assistant_send_message', {
        request: {
          conversationId: conversation?.id,
          content: content.trim(),
          projectPath: projectPath,
          // Use conversation's providerId if available, otherwise use the hook's providerId
          providerId: conversation?.providerId ?? providerId,
        },
      });

      // Store stream session ID for event handling
      currentStreamIdRef.current = response.streamSessionId;

      console.log('[AI Chat] Stream started:', {
        streamSessionId: response.streamSessionId,
        conversationId: response.conversationId,
        messageId: response.messageId,
      });

      // Update assistant message with real ID
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return { ...msg, id: response.messageId };
          }
          return msg;
        });
      });

      // Update conversation if it was created
      if (!conversation && response.conversationId) {
        setConversation({
          id: response.conversationId,
          title: null,
          projectPath: projectPath || null,
          providerId: providerId || null,
          messageCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');

      // Mark assistant message as error
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return { ...msg, status: 'error', content: 'Failed to get response' };
          }
          return msg;
        });
      });

      setIsGenerating(false);
    }
  }, [conversation, isGenerating, projectPath, providerId]);

  // Stop current generation
  const stopGeneration = useCallback(async () => {
    if (!currentStreamIdRef.current) return;

    try {
      await invoke('ai_assistant_cancel_stream', {
        sessionId: currentStreamIdRef.current,
      });
    } catch (err) {
      console.error('Failed to cancel stream:', err);
    }

    setIsGenerating(false);
    setResponseStatus(null); // Clear status indicator when stopping
    currentStreamIdRef.current = null;
    streamingMessageIdRef.current = null;
  }, []);

  // Create a new conversation
  const createNewConversation = useCallback(async () => {
    setConversation(null);
    setMessages([]);
    setError(null);
    setPendingToolCalls(new Map());
    setResponseStatus(null); // Clear status (Feature 023)
    notifiedToolCallsRef.current.clear(); // Clear notification tracking
  }, []);

  // Load an existing conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    setError(null);
    setPendingToolCalls(new Map());
    setResponseStatus(null); // Clear status (Feature 023)
    notifiedToolCallsRef.current.clear(); // Clear notification tracking

    try {
      // Fetch conversation details
      const conv = await invoke<Conversation | null>(
        'ai_assistant_get_conversation',
        { conversationId }
      );

      if (!conv) {
        throw new Error('Conversation not found');
      }

      // Fetch messages
      const conversationMessages = await invoke<Message[]>(
        'ai_assistant_get_messages',
        { conversationId }
      );

      setConversation(conv);
      setMessages(conversationMessages);
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  }, []);

  // Clear messages in current conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setPendingToolCalls(new Map());
    notifiedToolCallsRef.current.clear(); // Clear notification tracking
  }, []);

  // Continue conversation after tool approval
  const continueAfterToolApproval = useCallback(async (): Promise<void> => {
    if (!conversation) {
      console.warn('[AI Chat] Cannot continue: no conversation');
      return;
    }

    console.log('[AI Chat] Continuing conversation after tool approval...');

    try {
      // Create placeholder message for continuation response
      const continuationMessageId = `msg_${Date.now()}_continuation`;
      const continuationMessage: Message = {
        id: continuationMessageId,
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        toolCalls: null,
        toolResults: null,
        status: 'pending',
        tokensUsed: null,
        model: null,
        createdAt: new Date().toISOString(),
      };

      // Add placeholder message
      setMessages((prev) => [...prev, continuationMessage]);
      setIsGenerating(true);
      setResponseStatus({ phase: 'generating', startTime: Date.now() });

      // Call continuation command
      const response = await invoke<{
        streamSessionId: string;
        conversationId: string;
        messageId: string;
      }>('ai_assistant_continue_after_tool', {
        conversationId: conversation.id,
        projectPath: projectPath,
        providerId: providerId,
      });

      console.log('[AI Chat] Continuation stream started:', {
        streamSessionId: response.streamSessionId,
        messageId: response.messageId,
      });

      // Update stream session for event handling
      currentStreamIdRef.current = response.streamSessionId;
      currentMessageIdRef.current = response.messageId;

      // Update placeholder with real message ID
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === continuationMessageId
            ? { ...msg, id: response.messageId }
            : msg
        )
      );
    } catch (err) {
      console.error('[AI Chat] Continuation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to continue conversation');
      setIsGenerating(false);
      setResponseStatus(null);
    }
  }, [conversation, projectPath, providerId]);

  // Approve a tool call
  const approveToolCall = useCallback(async (toolCallId: string): Promise<ToolResult> => {
    console.log('[AI Chat] Approving tool call:', toolCallId);

    if (!conversation) {
      throw new Error('No active conversation');
    }

    const messageId = currentMessageIdRef.current;
    if (!messageId) {
      throw new Error('No active message');
    }

    setIsExecutingTool(true);
    setError(null);

    try {
      console.log('[AI Chat] Executing tool via backend...');
      const result = await invoke<ToolResult>('ai_assistant_approve_tool_call', {
        conversationId: conversation.id,
        messageId,
        toolCallId,
      });

      console.log('[AI Chat] Tool execution result:', {
        callId: result.callId,
        success: result.success,
        outputLength: result.output?.length || 0,
        error: result.error,
      });

      // Remove from pending
      setPendingToolCalls((prev) => {
        const updated = new Map(prev);
        updated.delete(toolCallId);
        return updated;
      });

      // Update message with result
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === messageId) {
            const existingResults = msg.toolResults || [];
            const newStatus: ToolCallStatus = result.success ? 'completed' : 'failed';
            const updatedCalls: ToolCall[] | null = msg.toolCalls?.map((tc) =>
              tc.id === toolCallId
                ? { ...tc, status: newStatus }
                : tc
            ) ?? null;
            return {
              ...msg,
              toolCalls: updatedCalls,
              toolResults: [...existingResults, result],
            };
          }
          return msg;
        });
      });

      // Continue conversation after successful tool execution
      // This allows AI to respond with a summary of the tool result
      setIsExecutingTool(false);
      await continueAfterToolApproval();

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute tool';
      setError(errorMsg);
      setIsExecutingTool(false);
      throw err;
    }
  }, [conversation, continueAfterToolApproval]);

  // Deny a tool call
  const denyToolCall = useCallback(async (toolCallId: string, reason?: string): Promise<void> => {
    if (!conversation) {
      throw new Error('No active conversation');
    }

    const messageId = currentMessageIdRef.current;
    if (!messageId) {
      throw new Error('No active message');
    }

    try {
      await invoke('ai_assistant_deny_tool_call', {
        conversationId: conversation.id,
        messageId,
        toolCallId,
        reason,
      });

      // Remove from pending
      setPendingToolCalls((prev) => {
        const updated = new Map(prev);
        updated.delete(toolCallId);
        return updated;
      });

      // Update message with denied status
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === messageId) {
            const deniedStatus: ToolCallStatus = 'denied';
            const updatedCalls: ToolCall[] | null = msg.toolCalls?.map((tc) =>
              tc.id === toolCallId ? { ...tc, status: deniedStatus } : tc
            ) ?? null;
            return {
              ...msg,
              toolCalls: updatedCalls,
            };
          }
          return msg;
        });
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to deny tool';
      setError(errorMsg);
      throw err;
    }
  }, [conversation]);

  // Stop/cancel an executing tool call
  const stopToolExecution = useCallback(async (toolCallId: string): Promise<void> => {
    console.log('[AI Chat] Stopping tool execution:', toolCallId);

    const messageId = currentMessageIdRef.current;

    try {
      // Call backend to actually stop the process
      await invoke('ai_assistant_stop_tool_execution', { toolCallId });
      console.log('[AI Chat] Backend process stopped successfully');
    } catch (err) {
      // Process might not exist (already finished) - still update UI
      console.warn('[AI Chat] Could not stop backend process:', err);
    }

    // Stop executing state
    setIsExecutingTool(false);

    // Remove from pending
    setPendingToolCalls((prev) => {
      const updated = new Map(prev);
      updated.delete(toolCallId);
      return updated;
    });

    // Update message with failed status (cancelled)
    if (messageId) {
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === messageId) {
            const failedStatus: ToolCallStatus = 'failed';
            const updatedCalls: ToolCall[] | null = msg.toolCalls?.map((tc) =>
              tc.id === toolCallId ? { ...tc, status: failedStatus } : tc
            ) ?? null;
            const existingResults = msg.toolResults || [];
            const cancelledResult: ToolResult = {
              callId: toolCallId,
              success: false,
              output: '',
              error: 'Cancelled by user',
            };
            return {
              ...msg,
              toolCalls: updatedCalls,
              toolResults: [...existingResults, cancelledResult],
            };
          }
          return msg;
        });
      });
    }

    // Clear response status
    setResponseStatus(null);
  }, []);

  return {
    conversation,
    messages,
    inputValue,
    setInputValue,
    sendMessage,
    stopGeneration,
    isGenerating,
    isConfigured,
    isLoading,
    error,
    createNewConversation,
    loadConversation,
    clearMessages,
    pendingToolCalls,
    approveToolCall,
    denyToolCall,
    stopToolExecution,
    isExecutingTool,
    responseStatus,
  };
}
