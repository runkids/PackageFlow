/**
 * useAIChat - Custom hook for AI chat state and streaming management
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
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
  /** Whether a tool is currently being executed */
  isExecutingTool: boolean;
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

  // Refs for stream handling
  const currentStreamIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Check if AI service is configured
  const checkConfiguration = useCallback(async () => {
    try {
      // Check if there's at least one AI service configured
      // ai_list_services returns ApiResponse<Vec<AIProviderConfig>>
      const response = await invoke<{
        success: boolean;
        data?: Array<{ id: string }>;
        error?: string;
      }>('ai_list_services');

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
      const unlistenComplete = await listen<ChatCompletePayload>('ai:chat-complete', (event) => {
        const { streamSessionId, fullContent, messageId, tokensUsed, model } = event.payload;

        if (streamSessionId !== currentStreamIdRef.current) return;

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

        setIsGenerating(false);
        currentStreamIdRef.current = null;
        streamingMessageIdRef.current = null;
      });
      unlisteners.push(unlistenComplete);

      // Error event - handle streaming errors
      const unlistenError = await listen<ChatErrorPayload>('ai:chat-error', (event) => {
        const { streamSessionId, message, messageId } = event.payload;

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
      const unlistenToolCall = await listen<ToolCallPayload>('ai:tool-call', (event) => {
        const { streamSessionId, messageId, toolCall } = event.payload;

        if (streamSessionId !== currentStreamIdRef.current) return;

        currentMessageIdRef.current = messageId;

        // Add to pending tool calls
        setPendingToolCalls((prev) => {
          const updated = new Map(prev);
          updated.set(toolCall.id, toolCall);
          return updated;
        });

        // Update message with tool call
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === messageId) {
              const existingCalls = msg.toolCalls || [];
              return {
                ...msg,
                toolCalls: [...existingCalls, toolCall],
              };
            }
            return msg;
          });
        });
      });
      unlisteners.push(unlistenToolCall);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isGenerating) return;

    setError(null);

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
          providerId: providerId,
        },
      });

      // Store stream session ID for event handling
      currentStreamIdRef.current = response.streamSessionId;

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
    currentStreamIdRef.current = null;
    streamingMessageIdRef.current = null;
  }, []);

  // Create a new conversation
  const createNewConversation = useCallback(async () => {
    setConversation(null);
    setMessages([]);
    setError(null);
    setPendingToolCalls(new Map());
  }, []);

  // Load an existing conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    setError(null);
    setPendingToolCalls(new Map());

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
  }, []);

  // Approve a tool call
  const approveToolCall = useCallback(async (toolCallId: string): Promise<ToolResult> => {
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
      const result = await invoke<ToolResult>('ai_assistant_approve_tool_call', {
        conversationId: conversation.id,
        messageId,
        toolCallId,
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

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute tool';
      setError(errorMsg);
      throw err;
    } finally {
      setIsExecutingTool(false);
    }
  }, [conversation]);

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
    isExecutingTool,
  };
}
