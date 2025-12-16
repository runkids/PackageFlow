/**
 * AIAssistantPage - Main container for AI Assistant tab
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 *
 * Enhanced features:
 * - Collapsible sidebar with keyboard shortcut (Cmd+B)
 * - Persistent QuickActions above input area
 * - ConversationHeader with model selector and token usage
 * - Keyboard shortcuts for navigation
 * - Real-time response status indicator (Feature 023)
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { ChatMessage } from './ChatMessage';
import { ChatInputArea } from './ChatInputArea';
import { AIProviderNotConfiguredState } from './AIProviderNotConfiguredState';
import { QuickActionChips } from './QuickActionChips';
import { AIAssistantSidebar } from './AIAssistantSidebar';
import { ConversationHeader } from './ConversationHeader';
import { ResponseStatusIndicator } from './ResponseStatusIndicator';
import { useAIChat } from '../../hooks/useAIChat';
import { useAIQuickActions } from '../../hooks/useAIQuickActions';
import { useConversations } from '../../hooks/useConversations';
import { Bot, AlertCircle, X, Sparkles, Zap, FolderGit2, Workflow, Terminal, GitBranch } from 'lucide-react';
import type { SuggestedAction } from '../../types/ai-assistant';

/**
 * Collapsible quick actions component - horizontal expand on hover
 * Badge always visible, chips expand horizontally to the right on hover
 * Uses overflow hidden to maintain fixed height
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
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay configurations (in milliseconds)
  const EXPAND_DELAY = 100;
  const COLLAPSE_DELAY = 300;

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
      }
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  // Handle mouse enter on the entire container
  const handleMouseEnter = useCallback(() => {
    // Cancel any pending collapse
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    // Start expand timer if not already expanded
    if (!isExpanded && !expandTimerRef.current) {
      expandTimerRef.current = setTimeout(() => {
        setIsExpanded(true);
        expandTimerRef.current = null;
      }, EXPAND_DELAY);
    }
  }, [isExpanded]);

  // Handle mouse leave from the entire container
  const handleMouseLeave = useCallback(() => {
    // Cancel any pending expand
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }

    // Start collapse timer if expanded
    if (isExpanded && !collapseTimerRef.current) {
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
        collapseTimerRef.current = null;
      }, COLLAPSE_DELAY);
    }
  }, [isExpanded]);

  return (
    <div
      className="px-4 h-9 overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Horizontal flex container - badge + chips */}
      <div className="flex items-center gap-2 h-full">
        {/* Badge - always visible */}
        <div
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5',
            'text-xs text-muted-foreground',
            'bg-muted/40 rounded-full',
            'border border-border/50',
            'transition-colors duration-200',
            isExpanded && 'bg-muted/60 border-border/70'
          )}
        >
          <Zap className="w-3 h-3" />
          <span className="font-medium">Quick Actions</span>
          <span className="text-muted-foreground/60">({suggestions.length})</span>
        </div>

        {/* Chips container - expands horizontally */}
        <QuickActionChips
          suggestions={suggestions}
          onAction={(prompt) => {
            onAction(prompt);
            setIsExpanded(false);
          }}
          disabled={disabled}
          isVisible={isExpanded}
          horizontal
        />
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
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

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
    stopToolExecution,
    isExecutingTool,
    responseStatus, // Feature 023
  } = useAIChat({ providerId: selectedProviderId ?? undefined });

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

  // Filter messages to hide internal/intermediate messages
  // - Hide 'tool' role messages (tool results are shown inline in assistant messages)
  // - Hide assistant messages that have no content and only have tool_calls (intermediate state)
  // - But don't hide the last message if it's currently streaming (may be empty temporarily)
  const visibleMessages = useMemo(() => {
    return messages.filter((msg, index) => {
      // Always hide tool role messages (displayed inline via ActionConfirmationCard)
      if (msg.role === 'tool') {
        return false;
      }

      // For assistant messages with no content but with tool calls:
      // Hide if there's a subsequent assistant message (this is an intermediate message)
      // Show if it's the last message and currently streaming
      if (msg.role === 'assistant' && !msg.content && msg.toolCalls && msg.toolCalls.length > 0) {
        const isLastMessage = index === messages.length - 1;
        const hasSubsequentAssistantMessage = messages.slice(index + 1).some(
          (m) => m.role === 'assistant' && m.content
        );
        // Hide if there's a subsequent assistant message with content
        if (hasSubsequentAssistantMessage) {
          return false;
        }
        // Show only if it's the last message (may be waiting for approval)
        return isLastMessage;
      }

      return true;
    });
  }, [messages]);

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

  // Sync selectedProviderId when conversation changes
  // This ensures the provider dropdown shows the correct provider for each conversation
  useEffect(() => {
    if (conversation?.providerId) {
      setSelectedProviderId(conversation.providerId);
    }
  }, [conversation?.providerId]);

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

  // Handle stopping tool execution
  const handleStopToolExecution = useCallback(async (toolCallId: string) => {
    await stopToolExecution(toolCallId);
  }, [stopToolExecution]);

  // Handle sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Show empty state if AI service is not configured
  if (!isLoading && !isConfigured) {
    return <AIProviderNotConfiguredState onOpenSettings={onOpenSettings} />;
  }

  // Determine if we should show welcome state (no visible messages)
  const showWelcome = visibleMessages.length === 0;

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
          selectedProviderId={selectedProviderId}
          onProviderSelect={setSelectedProviderId}
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
            <WelcomeState onAction={handleQuickAction} />
          ) : (
            <>
              {visibleMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    isGenerating &&
                    message.role === 'assistant' &&
                    index === visibleMessages.length - 1
                  }
                  onApproveToolCall={handleApproveToolCall}
                  onDenyToolCall={handleDenyToolCall}
                  onStopToolExecution={handleStopToolExecution}
                  executingToolIds={executingToolIds}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Response status indicator - Feature 023 */}
        {responseStatus && (
          <div className="px-4 pb-2">
            <ResponseStatusIndicator status={responseStatus} />
          </div>
        )}

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
  onAction: (prompt: string) => void;
}

/**
 * Feature tip item for welcome state
 */
interface FeatureTip {
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
  color: string;
}

/**
 * PackageFlow feature tips - show what the AI can actually do
 */
const FEATURE_TIPS: FeatureTip[] = [
  {
    icon: <FolderGit2 className="w-5 h-5" />,
    title: 'Project Management',
    description: 'List projects, get project details, run npm scripts',
    prompt: 'List all projects registered in PackageFlow',
    color: 'from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-500',
  },
  {
    icon: <Workflow className="w-5 h-5" />,
    title: 'Workflow Automation',
    description: 'Create, run, and manage workflows and templates',
    prompt: 'What workflows are available?',
    color: 'from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-500',
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    title: 'Git Operations',
    description: 'Check status, view diff, manage worktrees',
    prompt: 'Show git status of the current project',
    color: 'from-orange-500/20 to-orange-500/5 border-orange-500/20 text-orange-500',
  },
  {
    icon: <Terminal className="w-5 h-5" />,
    title: 'Script Execution',
    description: 'Run MCP actions, execute scripts with permissions',
    prompt: 'Show me all available MCP actions',
    color: 'from-green-500/20 to-green-500/5 border-green-500/20 text-green-500',
  },
];

/**
 * Welcome state when no messages exist - Feature-focused design
 */
function WelcomeState({ onAction }: WelcomeStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-8 px-4">
      {/* Header with icon - centered and prominent */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <div
          className={cn(
            'w-16 h-16 rounded-2xl',
            'bg-gradient-to-br from-purple-500/20 via-blue-500/15 to-cyan-500/10',
            'dark:from-purple-500/30 dark:via-blue-500/20 dark:to-cyan-500/15',
            'border border-purple-500/20 dark:border-purple-500/30',
            'flex items-center justify-center',
            'shadow-lg shadow-purple-500/10',
            'relative'
          )}
        >
          <Bot className="w-8 h-8 text-purple-500 dark:text-purple-400" />
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500/20 dark:bg-blue-500/30 border border-blue-500/30 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-1">
            PackageFlow AI
          </h2>
          <p className="text-sm text-muted-foreground">
            Automate workflows with MCP-powered tools
          </p>
        </div>
      </div>

      {/* Feature tips grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mb-8">
        {FEATURE_TIPS.map((tip) => (
          <button
            key={tip.title}
            onClick={() => onAction(tip.prompt)}
            className={cn(
              'group p-4 rounded-xl text-left',
              'bg-gradient-to-br border',
              tip.color,
              'hover:scale-[1.02] hover:shadow-lg',
              'active:scale-[0.98]',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'p-2.5 rounded-xl bg-background/60',
                'group-hover:bg-background/90 transition-colors',
                'shadow-sm'
              )}>
                {tip.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground text-sm mb-1">
                  {tip.title}
                </h3>
                <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                  {tip.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Example prompts - contextual tips */}
      <div className="w-full max-w-xl text-center">
        <p className="text-xs text-muted-foreground/70 mb-3 uppercase tracking-wide font-medium">
          Quick Start
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            'How many projects are registered?',
            'Run build script for current project',
            'Create a workflow to build and test',
          ].map((example) => (
            <button
              key={example}
              onClick={() => onAction(example)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg',
                'bg-muted/40 hover:bg-muted/70',
                'text-muted-foreground hover:text-foreground',
                'border border-border/40 hover:border-border/70',
                'hover:shadow-sm',
                'active:scale-[0.98]',
                'transition-all duration-200'
              )}
            >
              <span className="opacity-50 mr-0.5">"</span>
              {example}
              <span className="opacity-50 ml-0.5">"</span>
            </button>
          ))}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="mt-8 pt-6 border-t border-border/30 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">Cmd+B</kbd>
          <span>sidebar</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">Cmd+N</kbd>
          <span>new chat</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">Cmd+[/]</kbd>
          <span>navigate history</span>
        </span>
      </div>
    </div>
  );
}
