/**
 * useConversations - Hook for managing AI conversations CRUD
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  Conversation,
  ConversationSummary,
  ConversationListResponse,
  Message,
} from '../types/ai-assistant';

interface UseConversationsOptions {
  /** Filter by project path */
  projectPath?: string;
  /** Initial limit for pagination */
  initialLimit?: number;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface UseConversationsReturn {
  /** List of conversation summaries */
  conversations: ConversationSummary[];
  /** Currently selected conversation */
  selectedConversation: Conversation | null;
  /** Messages for selected conversation */
  messages: Message[];
  /** Whether conversations are loading */
  isLoading: boolean;
  /** Whether messages are loading */
  isLoadingMessages: boolean;
  /** Error message if any */
  error: string | null;
  /** Total count of conversations */
  total: number;
  /** Whether there are more conversations to load */
  hasMore: boolean;
  /** Create a new conversation */
  createConversation: (projectPath?: string, providerId?: string) => Promise<Conversation>;
  /** Select a conversation and load its messages */
  selectConversation: (conversationId: string) => Promise<void>;
  /** Clear the selected conversation */
  clearSelection: () => void;
  /** Rename a conversation */
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  /** Delete a conversation */
  deleteConversation: (conversationId: string) => Promise<void>;
  /** Load more conversations */
  loadMore: () => Promise<void>;
  /** Refresh the conversation list */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing AI conversations
 */
export function useConversations(options: UseConversationsOptions = {}): UseConversationsReturn {
  const { projectPath, initialLimit = 20, autoFetch = true } = options;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Fetch conversations
  const fetchConversations = useCallback(
    async (reset = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const currentOffset = reset ? 0 : offset;
        const response = await invoke<ConversationListResponse>('ai_assistant_list_conversations', {
          projectPath,
          limit: initialLimit,
          offset: currentOffset,
        });

        if (reset) {
          setConversations(response.conversations);
          setOffset(initialLimit);
        } else {
          setConversations((prev) => [...prev, ...response.conversations]);
          setOffset(currentOffset + initialLimit);
        }
        setTotal(response.total);
        setHasMore(response.hasMore);
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath, initialLimit, offset]
  );

  // Auto-fetch on mount and when projectPath changes
  useEffect(() => {
    if (autoFetch) {
      // Clear existing conversations immediately when projectPath changes
      setConversations([]);
      setTotal(0);
      setHasMore(false);
      setOffset(0);
      fetchConversations(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, projectPath]); // Re-fetch when projectPath changes

  // Create a new conversation
  const createConversation = useCallback(
    async (newProjectPath?: string, providerId?: string): Promise<Conversation> => {
      try {
        const conversation = await invoke<Conversation>('ai_assistant_create_conversation', {
          projectPath: newProjectPath ?? projectPath,
          providerId,
        });

        // Add to list at the beginning
        setConversations((prev) => {
          const summary: ConversationSummary = {
            id: conversation.id,
            title: conversation.title,
            projectPath: conversation.projectPath,
            messageCount: 0,
            lastMessagePreview: null,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
          };
          return [summary, ...prev];
        });
        setTotal((prev) => prev + 1);

        return conversation;
      } catch (err) {
        console.error('Failed to create conversation:', err);
        throw err;
      }
    },
    [projectPath]
  );

  // Select a conversation and load its messages
  const selectConversation = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    setError(null);

    try {
      // Fetch conversation details
      const conversation = await invoke<Conversation | null>('ai_assistant_get_conversation', {
        conversationId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Fetch messages
      const conversationMessages = await invoke<Message[]>('ai_assistant_get_messages', {
        conversationId,
      });

      setSelectedConversation(conversation);
      setMessages(conversationMessages);
    } catch (err) {
      console.error('Failed to select conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Clear the selected conversation
  const clearSelection = useCallback(() => {
    setSelectedConversation(null);
    setMessages([]);
  }, []);

  // Rename a conversation
  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      try {
        await invoke('ai_assistant_update_conversation', {
          conversationId,
          title,
        });

        // Update local state
        setConversations((prev) =>
          prev.map((conv) => (conv.id === conversationId ? { ...conv, title } : conv))
        );

        // Update selected conversation if it's the one being renamed
        if (selectedConversation?.id === conversationId) {
          setSelectedConversation((prev) => (prev ? { ...prev, title } : null));
        }
      } catch (err) {
        console.error('Failed to rename conversation:', err);
        throw err;
      }
    },
    [selectedConversation?.id]
  );

  // Delete a conversation
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await invoke('ai_assistant_delete_conversation', { conversationId });

        // Remove from local state
        setConversations((prev) => prev.filter((conv) => conv.id !== conversationId));
        setTotal((prev) => prev - 1);

        // Clear selection if deleted conversation was selected
        if (selectedConversation?.id === conversationId) {
          setSelectedConversation(null);
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
        throw err;
      }
    },
    [selectedConversation?.id]
  );

  // Load more conversations
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    await fetchConversations(false);
  }, [hasMore, isLoading, fetchConversations]);

  // Refresh the conversation list
  const refresh = useCallback(async () => {
    await fetchConversations(true);
  }, [fetchConversations]);

  return {
    conversations,
    selectedConversation,
    messages,
    isLoading,
    isLoadingMessages,
    error,
    total,
    hasMore,
    createConversation,
    selectConversation,
    clearSelection,
    renameConversation,
    deleteConversation,
    loadMore,
    refresh,
  };
}
