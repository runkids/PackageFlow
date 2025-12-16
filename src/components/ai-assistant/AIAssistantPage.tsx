/**
 * AIAssistantPage - Main container for AI Assistant tab
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 *
 * Enhanced features:
 * - Collapsible sidebar with keyboard shortcut (Cmd+B)
 * - Persistent QuickActions above input area
 * - ConversationHeader with model selector and token usage
 * - Keyboard shortcuts for navigation
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { ChatMessage } from './ChatMessage';
import { ChatInputArea } from './ChatInputArea';
import { AIProviderNotConfiguredState } from './AIProviderNotConfiguredState';
import { QuickActionChips } from './QuickActionChips';
import { AIAssistantSidebar } from './AIAssistantSidebar';
import { ConversationHeader } from './ConversationHeader';
import { useAIChat } from '../../hooks/useAIChat';
import { useAIQuickActions } from '../../hooks/useAIQuickActions';
import { useConversations } from '../../hooks/useConversations';
import { Bot, AlertCircle, X, Sparkles, ChevronUp, Zap } from 'lucide-react';
import type { SuggestedAction } from '../../types/ai-assistant';

/**
 * Collapsible quick actions component - hidden by default when there are messages
 * Auto-collapses after 3 seconds when mouse leaves the area
 */
function CollapsibleQuickActions({
  suggestions,
  onAction,
  disabled,
}: {
  suggestions: SuggestedAction[];
  onAction: (prompt: string) => void;
  disabled: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  // Start collapse timer when mouse leaves
  const handleMouseLeave = useCallback(() => {
    if (isExpanded) {
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 3000); // 3 seconds
    }
  }, [isExpanded]);

  // Cancel collapse timer when mouse enters
  const handleMouseEnter = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  return (
    <div
      className="px-4 pb-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Expanded view */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Quick Actions</span>
              <button
                onClick={() => setIsExpanded(false)}
                className={cn(
                  'p-1 rounded hover:bg-accent',
                  'text-muted-foreground hover:text-foreground',
                  'transition-colors'
                )}
                aria-label="Collapse quick actions"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
            <QuickActionChips
              suggestions={suggestions}
              onAction={(prompt) => {
                onAction(prompt);
                setIsExpanded(false);
              }}
              disabled={disabled}
              className="justify-start"
            />
          </div>
        </div>
      </div>

      {/* Collapsed button */}
      <div
        className={cn(
          'transition-all duration-300 ease-out',
          isExpanded ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
        )}
      >
        <button
          onClick={() => setIsExpanded(true)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5',
            'text-xs text-muted-foreground',
            'bg-muted/30 hover:bg-muted/50 rounded-full',
            'border border-border/50 hover:border-border',
            'transition-all duration-200'
          )}
          aria-label="Show quick actions"
        >
          <Zap className="w-3 h-3" />
          <span>Quick Actions</span>
          <span className="text-muted-foreground/60">({suggestions.length})</span>
        </button>
      </div>
    </div>
  );
}

interface AIAssistantPageProps {
  /** Handler to open settings page */
  onOpenSettings: () => void;
}

/**
 * Main AI Assistant page component
 * Displays sidebar with history and chat area
 */
export function AIAssistantPage({ onOpenSettings }: AIAssistantPageProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat state
  const {
    messages,
    inputValue,
    setInputValue,
    sendMessage,
    stopGeneration,
    isGenerating,
    isConfigured,
    isLoading,
    error: chatError,
    conversation,
    createNewConversation,
    loadConversation,
    pendingToolCalls,
    approveToolCall,
    denyToolCall,
    isExecutingTool,
  } = useAIChat();

  // Local error state for dismissing
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const displayError = chatError && chatError !== dismissedError ? chatError : null;

  // Conversation history management
  const {
    conversations,
    isLoading: isLoadingConversations,
    hasMore,
    renameConversation,
    deleteConversation,
    loadMore,
    refresh: refreshConversations,
  } = useConversations();

  // Get quick actions based on project context
  const { suggestions } = useAIQuickActions({
    conversationId: conversation?.id,
    projectPath: conversation?.projectPath ?? undefined,
  });

  // Track executing tool IDs
  const executingToolIds = useMemo(() => {
    const ids = new Set<string>();
    if (isExecutingTool) {
      pendingToolCalls.forEach((_, id) => ids.add(id));
    }
    return ids;
  }, [isExecutingTool, pendingToolCalls]);

  // Calculate total tokens used in conversation
  const totalTokensUsed = useMemo(() => {
    return messages.reduce((sum, msg) => sum + (msg.tokensUsed ?? 0), 0);
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }

      // Cmd/Ctrl + N: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }

      // Cmd/Ctrl + [: Previous conversation
      if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        navigateConversation(-1);
      }

      // Cmd/Ctrl + ]: Next conversation
      if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        navigateConversation(1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [conversations, conversation]);

  // Navigate to previous/next conversation
  const navigateConversation = useCallback((direction: -1 | 1) => {
    if (conversations.length === 0) return;

    const currentIndex = conversation
      ? conversations.findIndex((c) => c.id === conversation.id)
      : -1;

    let newIndex: number;
    if (currentIndex === -1) {
      newIndex = direction === 1 ? 0 : conversations.length - 1;
    } else {
      newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = conversations.length - 1;
      if (newIndex >= conversations.length) newIndex = 0;
    }

    loadConversation(conversations[newIndex].id);
  }, [conversations, conversation, loadConversation]);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    await createNewConversation();
  }, [createNewConversation]);

  // Handle conversation selection
  const handleSelectConversation = useCallback(async (conversationId: string) => {
    await loadConversation(conversationId);
  }, [loadConversation]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (inputValue.trim()) {
      setDismissedError(null);
      await sendMessage(inputValue);
      setInputValue('');
      await refreshConversations();
    }
  }, [inputValue, sendMessage, setInputValue, refreshConversations]);

  // Handle quick action click
  const handleQuickAction = useCallback(async (prompt: string) => {
    setDismissedError(null);
    await sendMessage(prompt);
    await refreshConversations();
  }, [sendMessage, refreshConversations]);

  // Handle tool call approval
  const handleApproveToolCall = useCallback(async (toolCallId: string) => {
    await approveToolCall(toolCallId);
  }, [approveToolCall]);

  // Handle tool call denial
  const handleDenyToolCall = useCallback(async (toolCallId: string, reason?: string) => {
    await denyToolCall(toolCallId, reason);
  }, [denyToolCall]);

  // Handle sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Show empty state if AI service is not configured
  if (!isLoading && !isConfigured) {
    return <AIProviderNotConfiguredState onOpenSettings={onOpenSettings} />;
  }

  // Determine if we should show welcome state (no messages)
  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar with conversation history */}
      <AIAssistantSidebar
        conversations={conversations}
        selectedId={conversation?.id ?? null}
        isLoading={isLoadingConversations}
        hasMore={hasMore}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onRename={renameConversation}
        onDelete={deleteConversation}
        onLoadMore={loadMore}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Conversation header */}
        <ConversationHeader
          conversation={conversation}
          tokensUsed={totalTokensUsed}
          isGenerating={isGenerating}
          onSettingsClick={onOpenSettings}
          onServiceChange={() => conversation && loadConversation(conversation.id)}
        />

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {showWelcome ? (
            <WelcomeState suggestions={suggestions} onAction={handleQuickAction} />
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    isGenerating &&
                    message.role === 'assistant' &&
                    index === messages.length - 1
                  }
                  onApproveToolCall={handleApproveToolCall}
                  onDenyToolCall={handleDenyToolCall}
                  executingToolIds={executingToolIds}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {displayError && (
          <div
            className={cn(
              'mx-4 mb-2 px-4 py-3 rounded-xl',
              'bg-destructive/10 border border-destructive/20',
              'flex items-start gap-3',
              'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
            )}
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-destructive font-medium">Error</p>
              <p className="text-sm text-destructive/80 mt-0.5">{displayError}</p>
            </div>
            <button
              onClick={() => setDismissedError(chatError)}
              className={cn(
                'p-1.5 rounded-lg hover:bg-destructive/10',
                'text-destructive/60 hover:text-destructive',
                'transition-colors'
              )}
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick actions - collapsible when there are messages */}
        {!showWelcome && suggestions.length > 0 && !isGenerating && (
          <CollapsibleQuickActions
            suggestions={suggestions}
            onAction={handleQuickAction}
            disabled={isGenerating}
          />
        )}

        {/* Input area */}
        <ChatInputArea
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={isLoading || !isConfigured}
          autoFocus
        />
      </div>
    </div>
  );
}

interface WelcomeStateProps {
  suggestions: import('../../types/ai-assistant').SuggestedAction[];
  onAction: (prompt: string) => void;
}

/**
 * Welcome state when no messages exist - Enhanced design
 */
function WelcomeState({ suggestions, onAction }: WelcomeStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      {/* Icon - Enhanced with gradient */}
      <div
        className={cn(
          'w-20 h-20 rounded-3xl',
          'bg-gradient-to-br from-purple-500/20 via-blue-500/15 to-cyan-500/10',
          'dark:from-purple-500/30 dark:via-blue-500/20 dark:to-cyan-500/15',
          'border border-purple-500/20',
          'flex items-center justify-center',
          'mb-6',
          'shadow-lg shadow-purple-500/10'
        )}
      >
        <div className="relative">
          <Bot className="w-10 h-10 text-purple-500 dark:text-purple-400" />
          <Sparkles className="w-4 h-4 text-blue-500 absolute -top-1 -right-1" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Welcome to AI Assistant
      </h2>

      {/* Description */}
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
        I can help you with your development workflow. Try asking me to run scripts,
        generate commit messages, or answer questions about your project.
      </p>

      {/* Quick action chips */}
      <QuickActionChips
        suggestions={suggestions}
        onAction={onAction}
        className="justify-center max-w-lg"
      />

      {/* Keyboard shortcuts hint */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Cmd+B</kbd>
          <span>Toggle sidebar</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Cmd+N</kbd>
          <span>New chat</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd>
          <span>Send message</span>
        </span>
      </div>
    </div>
  );
}
