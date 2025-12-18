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
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { ChatMessage } from './ChatMessage';
import { ChatInputContainer } from './chat-input';
import { AIProviderNotConfiguredState } from './AIProviderNotConfiguredState';
import { QuickActionsPopover } from './QuickActionsPopover';
import { AIAssistantSidebar } from './AIAssistantSidebar';
import { ConversationHeader } from './ConversationHeader';
import { BackgroundProcessStatusBar } from './BackgroundProcessStatusBar';
import { BackgroundProcessPanel } from './background-process/BackgroundProcessPanel';
import { BackgroundProcessOutputDialog } from './background-process/BackgroundProcessOutputDialog';
import { useAIChat } from '../../hooks/useAIChat';
import { useAIQuickActions } from '../../hooks/useAIQuickActions';
import { useConversations } from '../../hooks/useConversations';
import { useBackgroundProcesses } from '../../hooks/useBackgroundProcesses';
import {
  AlertCircle,
  X,
  Sparkles,
  FolderGit2,
  Workflow,
  Terminal,
  GitBranch,
  // Feature 024: New icons for Security & System categories
  Shield,
  Activity,
} from 'lucide-react';
import type { SuggestedAction, ToolResult } from '../../types/ai-assistant';
import { parseMCPToolResponse } from '../../types/ai-assistant';
import { useScriptExecutionContext } from '../../contexts/ScriptExecutionContext';
import { QuickActionResultCard } from './QuickActionResultCard';

/** Instant action result for display */
interface InstantResult {
  id: string;
  toolName: string;
  label: string;
  result: unknown;
  timestamp: Date;
}

/**
 * Animated Bot Icon with blinking eyes and head wobble
 * Custom SVG-based robot face with CSS animations
 */
function AnimatedBotIcon({ className }: { className?: string }) {
  return (
    <div className="animate-bot-wobble origin-bottom">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {/* Antenna */}
        <path d="M12 8V4H8" />
        {/* Head */}
        <rect width="16" height="12" x="4" y="8" rx="2" />
        {/* Left ear */}
        <path d="M4 12H2v4h2" />
        {/* Right ear */}
        <path d="M20 12h2v4h-2" />
        {/* Left eye - with blink animation */}
        <ellipse cx="9" cy="13" rx="1" ry="1.5" fill="currentColor" className="animate-blink" />
        {/* Right eye - with blink animation */}
        <ellipse cx="15" cy="13" rx="1" ry="1.5" fill="currentColor" className="animate-blink" />
      </svg>
    </div>
  );
}

interface AIAssistantPageProps {
  /** Handler to open settings page */
  onOpenSettings: () => void;
  /** Initial project path for context (Feature 024) */
  initialProjectPath?: string;
  /** Handler to change project context (Feature 024) */
  onProjectContextChange?: (projectPath: string | null) => void;
  /** Handler to clear project context (Feature 024) */
  onClearProjectContext?: () => void;
}

/**
 * Main AI Assistant page component
 * Displays sidebar with history and chat area
 */
export function AIAssistantPage({
  onOpenSettings,
  initialProjectPath,
  onProjectContextChange: _onProjectContextChange,
  onClearProjectContext: _onClearProjectContext,
}: AIAssistantPageProps) {
  // Feature 024: These handlers will be used in Stage 3 (ProjectContextSelector UI)
  void _onProjectContextChange;
  void _onClearProjectContext;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Feature 024: Track current project context for quick actions
  // Priority: conversation.projectPath > initialProjectPath
  const [localProjectPath, setLocalProjectPath] = useState<string | undefined>(initialProjectPath);

  // Update local state when initialProjectPath changes (from navigation)
  // Always sync when initialProjectPath changes to ensure navigation context is applied
  useEffect(() => {
    // Only update if initialProjectPath changed and is defined
    // This ensures navigation from project page sets the context correctly
    if (initialProjectPath !== undefined) {
      setLocalProjectPath(initialProjectPath);
    }
  }, [initialProjectPath]);

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
    updateConversationContext, // Feature 024
  } = useAIChat({
    providerId: selectedProviderId ?? undefined,
    projectPath: localProjectPath,
  });

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

  // Feature: Handle external navigation events (from Project AI Chats tab)
  useEffect(() => {
    const handleLoadConversation = (e: Event) => {
      const customEvent = e as CustomEvent<{ conversationId: string; projectPath: string }>;
      const { conversationId, projectPath } = customEvent.detail;
      setLocalProjectPath(projectPath);
      // Load the conversation
      loadConversation(conversationId);
    };

    const handleNewChat = (e: Event) => {
      const customEvent = e as CustomEvent<{ projectPath: string }>;
      const { projectPath } = customEvent.detail;
      setLocalProjectPath(projectPath);
      // Create new conversation (projectPath is already set in state)
      createNewConversation();
    };

    window.addEventListener('ai-assistant:load-conversation', handleLoadConversation);
    window.addEventListener('ai-assistant:new-chat', handleNewChat);

    return () => {
      window.removeEventListener('ai-assistant:load-conversation', handleLoadConversation);
      window.removeEventListener('ai-assistant:new-chat', handleNewChat);
    };
  }, [loadConversation, createNewConversation]);

  // Feature 024: Determine effective project path for quick actions
  // Priority: conversation.projectPath > localProjectPath (from navigation)
  const effectiveProjectPath = conversation?.projectPath ?? localProjectPath;

  // Get quick actions based on project context
  const { suggestions } = useAIQuickActions({
    conversationId: conversation?.id,
    projectPath: effectiveProjectPath,
  });

  // Get running scripts for list_background_processes integration
  const { runningScripts } = useScriptExecutionContext();

  // Background process management for long-running scripts
  const backgroundProcessManager = useBackgroundProcesses();

  // Output dialog state for viewing full process output
  const [outputDialogProcessId, setOutputDialogProcessId] = useState<string | null>(null);

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
  // - Hide empty assistant messages (no content AND no tool_calls) - these are useless
  // - But don't hide the last message if it's currently streaming (may be empty temporarily)
  const visibleMessages = useMemo(() => {
    return messages.filter((msg, index) => {
      // Always hide tool role messages (displayed inline via ActionConfirmationCard)
      if (msg.role === 'tool') {
        return false;
      }

      // For assistant messages:
      if (msg.role === 'assistant') {
        const hasContent = msg.content && msg.content.trim().length > 0;
        const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
        const isLastMessage = index === messages.length - 1;

        // Hide empty messages (no content AND no tool_calls) unless currently streaming
        if (!hasContent && !hasToolCalls) {
          // Only show if it's the last message and currently streaming
          return isLastMessage && isGenerating;
        }

        // For messages with tool calls but no content:
        // Hide if there's a subsequent assistant message (this is an intermediate message)
        if (!hasContent && hasToolCalls) {
          const hasSubsequentAssistantMessage = messages
            .slice(index + 1)
            .some((m) => m.role === 'assistant' && m.content);
          // Hide if there's a subsequent assistant message with content
          if (hasSubsequentAssistantMessage) {
            return false;
          }
          // Show only if it's the last message (may be waiting for approval)
          return isLastMessage;
        }
      }

      return true;
    });
  }, [messages, isGenerating]);

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
  const navigateConversation = useCallback(
    (direction: -1 | 1) => {
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
    },
    [conversations, conversation, loadConversation]
  );

  // Handle new chat - Feature 024: keep or clear project context based on source
  const handleNewChat = useCallback(async () => {
    await createNewConversation();
    // Keep localProjectPath if it was set via navigation, otherwise clear
    // This allows users to start a new chat while keeping project context
  }, [createNewConversation]);

  // Handle conversation selection - Feature 024: sync project context
  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      await loadConversation(conversationId);
      // The effectiveProjectPath will automatically update based on conversation.projectPath
    },
    [loadConversation]
  );

  // Feature 024: Handle project context change from header selector
  const handleProjectContextChange = useCallback(
    async (projectPath: string | null) => {
      setLocalProjectPath(projectPath ?? undefined);

      // Update conversation's project context if one exists
      if (conversation) {
        try {
          await updateConversationContext(projectPath);
        } catch (err) {
          console.error('[AI Assistant] Failed to update conversation context:', err);
        }
      }

      // Also notify parent if handler is provided
      _onProjectContextChange?.(projectPath);
    },
    [conversation, updateConversationContext, _onProjectContextChange]
  );

  // Handle send message
  const handleSend = useCallback(async () => {
    if (inputValue.trim()) {
      setDismissedError(null);
      await sendMessage(inputValue);
      setInputValue('');
      await refreshConversations();
    }
  }, [inputValue, sendMessage, setInputValue, refreshConversations]);

  // State for instant action results (shown as cards, not in chat)
  const [instantResults, setInstantResults] = useState<InstantResult[]>([]);

  // Handle quick action click - routes by mode
  const handleQuickAction = useCallback(
    async (action: SuggestedAction) => {
      setDismissedError(null);

      // Route by mode
      switch (action.mode) {
        case 'ai':
          // Full AI conversation flow - send prompt
          await sendMessage(action.prompt);
          await refreshConversations();
          break;

        case 'instant':
          // Execute tool directly, show result card (no AI)
          if (action.tool) {
            try {
              const result = await invoke<ToolResult>('ai_assistant_execute_tool_direct', {
                toolName: action.tool.name,
                toolArgs: action.tool.args,
              });

              if (result.success) {
                // Parse result and merge PTY sessions for processes
                let parsedResult: unknown;
                try {
                  const rawParsed = JSON.parse(result.output);

                  // Handle MCPToolResponse format - check if data is nested
                  // MCPToolResponse has: { data: {...}, display: {...}, meta?: {...} }
                  const isMCPResponse = rawParsed.display && rawParsed.data;
                  parsedResult = isMCPResponse ? rawParsed : rawParsed;

                  // Special handling: merge PTY sessions for list_background_processes
                  if (action.tool.name === 'list_background_processes') {
                    // Extract actual data from MCPToolResponse or use directly
                    const actualData = isMCPResponse ? rawParsed.data : rawParsed;
                    const backendResult = actualData as { processes?: unknown[] };
                    const ptyProcesses = Array.from(runningScripts.values()).map((script) => ({
                      execution_id: script.executionId,
                      script_name: script.scriptName,
                      project_path: script.projectPath,
                      project_name: script.projectName,
                      started_at: script.startedAt,
                      status: script.status,
                      port: script.port,
                      source: 'pty_terminal',
                    }));
                    const allProcesses = [...(backendResult.processes || []), ...ptyProcesses];

                    if (isMCPResponse) {
                      // Preserve MCPToolResponse structure with merged data
                      parsedResult = {
                        ...rawParsed,
                        data: {
                          ...actualData,
                          processes: allProcesses,
                          count: allProcesses.length,
                        },
                      };
                    } else {
                      parsedResult = {
                        ...backendResult,
                        processes: allProcesses,
                        count: allProcesses.length,
                      };
                    }
                  }
                } catch {
                  parsedResult = { message: result.output };
                }

                // Add to instant results (displayed as card)
                setInstantResults((prev) => [
                  {
                    id: `${action.id}-${Date.now()}`,
                    toolName: action.tool!.name,
                    label: action.label,
                    result: parsedResult,
                    timestamp: new Date(),
                  },
                  ...prev.slice(0, 4), // Keep max 5 results
                ]);
              } else {
                // Show error as card
                setInstantResults((prev) => [
                  {
                    id: `${action.id}-${Date.now()}`,
                    toolName: action.tool!.name,
                    label: action.label,
                    result: { error: result.error || 'Tool execution failed' },
                    timestamp: new Date(),
                  },
                  ...prev.slice(0, 4),
                ]);
              }
            } catch (err) {
              console.error('[AI Assistant] Instant action failed:', err);
              setInstantResults((prev) => [
                {
                  id: `${action.id}-${Date.now()}`,
                  toolName: action.tool!.name,
                  label: action.label,
                  result: { error: err instanceof Error ? err.message : 'Unknown error' },
                  timestamp: new Date(),
                },
                ...prev.slice(0, 4),
              ]);
            }
          } else {
            // Fallback to AI mode if no tool specified
            await sendMessage(action.prompt);
            await refreshConversations();
          }
          break;

        case 'smart':
          // Execute tool, then send result to AI for analysis
          if (action.tool) {
            try {
              const result = await invoke<ToolResult>('ai_assistant_execute_tool_direct', {
                toolName: action.tool.name,
                toolArgs: action.tool.args,
              });

              if (result.success) {
                // Try to parse as MCPToolResponse with display layer
                const mcpResponse = parseMCPToolResponse(result.output);
                const hint = action.summaryHint || `Please analyze this ${action.label} result.`;

                let userVisibleMessage: string;
                let aiContext: string;

                if (mcpResponse?.display) {
                  // Use display layer for user-friendly message
                  userVisibleMessage = mcpResponse.display.summary;
                  if (mcpResponse.display.detail) {
                    userVisibleMessage += `\n${mcpResponse.display.detail}`;
                  }
                  // AI gets full data context (hidden from direct display)
                  aiContext = `[Context: ${action.label}]\n${JSON.stringify(mcpResponse.data, null, 2)}`;
                } else {
                  // Legacy format - parse as simple JSON for summary
                  try {
                    const parsed = JSON.parse(result.output);
                    // Try to create a simple summary
                    if (parsed.count !== undefined) {
                      userVisibleMessage = `Found ${parsed.count} items`;
                    } else if (parsed.message) {
                      userVisibleMessage = parsed.message;
                    } else {
                      userVisibleMessage = `${action.label} completed`;
                    }
                  } catch {
                    userVisibleMessage = `${action.label} completed`;
                  }
                  aiContext = `[Context: ${action.label}]\n${result.output}`;
                }

                // Send friendly message + hidden context for AI analysis
                const contextMessage = `${action.prompt}\n\n**Result:** ${userVisibleMessage}\n\n${aiContext}\n\n${hint}`;
                await sendMessage(contextMessage);
                await refreshConversations();
              } else {
                await sendMessage(
                  `[${action.label}] Tool execution failed: ${result.error || 'Unknown error'}`
                );
                await refreshConversations();
              }
            } catch (err) {
              console.error('[AI Assistant] Smart action failed:', err);
              await sendMessage(
                `[${action.label}] Error: ${err instanceof Error ? err.message : 'Unknown error'}`
              );
              await refreshConversations();
            }
          } else {
            // Fallback to AI mode if no tool specified
            await sendMessage(action.prompt);
            await refreshConversations();
          }
          break;

        default:
          // Fallback: send prompt to AI
          await sendMessage(action.prompt);
          await refreshConversations();
      }
    },
    [sendMessage, refreshConversations, runningScripts]
  );

  // Dismiss an instant result card
  const handleDismissInstantResult = useCallback((resultId: string) => {
    setInstantResults((prev) => prev.filter((r) => r.id !== resultId));
  }, []);

  // Ask AI about an instant result
  const handleAskAIAboutResult = useCallback(
    async (context: string) => {
      setDismissedError(null);
      await sendMessage(`Please analyze this:\n\n${context}`);
      await refreshConversations();
    },
    [sendMessage, refreshConversations]
  );

  // Handle tool call approval
  const handleApproveToolCall = useCallback(
    async (toolCallId: string) => {
      await approveToolCall(toolCallId);
    },
    [approveToolCall]
  );

  // Handle tool call denial
  const handleDenyToolCall = useCallback(
    async (toolCallId: string, reason?: string) => {
      await denyToolCall(toolCallId, reason);
    },
    [denyToolCall]
  );

  // Handle stopping tool execution
  const handleStopToolExecution = useCallback(
    async (toolCallId: string) => {
      await stopToolExecution(toolCallId);
    },
    [stopToolExecution]
  );

  // Handle viewing full process output
  const handleViewFullOutput = useCallback((processId: string) => {
    setOutputDialogProcessId(processId);
  }, []);

  // Handle closing output dialog
  const handleCloseOutputDialog = useCallback(() => {
    setOutputDialogProcessId(null);
  }, []);

  // Handle stopping process from dialog or inline card
  const handleStopProcess = useCallback(
    async (processId: string): Promise<void> => {
      await backgroundProcessManager.stopProcess(processId);
    },
    [backgroundProcessManager]
  );

  // Get process for output dialog
  const outputDialogProcess = outputDialogProcessId
    ? backgroundProcessManager.getProcessById(outputDialogProcessId)
    : null;

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
          currentProjectPath={effectiveProjectPath}
          onProjectContextChange={handleProjectContextChange}
        />

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {showWelcome ? (
            <WelcomeState
              onAction={(prompt) =>
                handleQuickAction({ id: 'welcome-tip', label: 'Feature Tip', prompt, mode: 'ai' })
              }
            />
          ) : (
            <>
              {visibleMessages.map((message, index) => {
                // Check if any tool call in this message has an associated background process
                // Backend stores tool_call_id as messageId in the process
                const associatedProcesses = (message.toolCalls ?? [])
                  .map((toolCall) => backgroundProcessManager.getProcessByMessageId(toolCall.id))
                  .filter((p): p is NonNullable<typeof p> => p !== undefined);

                // Count running processes for this message
                const runningCount = associatedProcesses.filter(
                  (p) => p.status === 'running' || p.status === 'starting'
                ).length;

                return (
                  <div key={message.id}>
                    <ChatMessage
                      message={message}
                      isStreaming={
                        isGenerating &&
                        message.role === 'assistant' &&
                        index === visibleMessages.length - 1
                      }
                      responseStatus={
                        isGenerating &&
                        message.role === 'assistant' &&
                        index === visibleMessages.length - 1
                          ? responseStatus
                          : null
                      }
                      onApproveToolCall={handleApproveToolCall}
                      onDenyToolCall={handleDenyToolCall}
                      onStopToolExecution={handleStopToolExecution}
                      executingToolIds={executingToolIds}
                    />
                    {/* Minimal inline hint - click to expand panel */}
                    {associatedProcesses.length > 0 && (
                      <button
                        onClick={() => backgroundProcessManager.setPanelState('expanded')}
                        className={cn(
                          'mt-2 ml-12 inline-flex items-center gap-2',
                          'px-3 py-1.5 rounded-lg',
                          'text-xs text-muted-foreground',
                          'bg-muted/30 hover:bg-muted/50',
                          'border border-border/50',
                          'transition-colors'
                        )}
                      >
                        <div className="relative">
                          <Terminal className="w-3.5 h-3.5" />
                          {runningCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          )}
                        </div>
                        <span>
                          {runningCount > 0
                            ? `${runningCount} running`
                            : `${associatedProcesses.length} process${associatedProcesses.length > 1 ? 'es' : ''}`}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
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

        {/* Instant action results - displayed as cards above input */}
        {instantResults.length > 0 && (
          <div className="flex flex-col gap-2 px-4">
            {instantResults.map((result) => (
              <QuickActionResultCard
                key={result.id}
                toolName={result.toolName}
                label={result.label}
                result={result.result}
                timestamp={result.timestamp}
                onAskAI={handleAskAIAboutResult}
                onDismiss={() => handleDismissInstantResult(result.id)}
              />
            ))}
          </div>
        )}

        {/* Quick actions - popover with categorized menu */}
        {!showWelcome && suggestions.length > 0 && !isGenerating && (
          <div className="px-4 py-2">
            <QuickActionsPopover
              suggestions={suggestions}
              onAction={handleQuickAction}
              disabled={isGenerating}
              currentProjectPath={effectiveProjectPath}
            />
          </div>
        )}

        {/* Input area - Enhanced with IME support and modern UI */}
        <ChatInputContainer
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={isLoading || !isConfigured}
          autoFocus
          showCharCount
        />

        {/* Background Process UI - Status Bar + Panel */}
        {backgroundProcessManager.processes.size > 0 && (
          <>
            {/* Status Bar - Always visible when processes exist */}
            <BackgroundProcessStatusBar
              runningCount={backgroundProcessManager.runningCount}
              totalCount={backgroundProcessManager.processes.size}
              isPanelOpen={backgroundProcessManager.panelState === 'expanded'}
              onTogglePanel={() =>
                backgroundProcessManager.setPanelState(
                  backgroundProcessManager.panelState === 'expanded' ? 'collapsed' : 'expanded'
                )
              }
              onStopAll={backgroundProcessManager.stopAllProcesses}
            />

            {/* Panel - Shows when expanded */}
            {backgroundProcessManager.panelState === 'expanded' && (
              <BackgroundProcessPanel
                processes={backgroundProcessManager.processes}
                selectedProcessId={backgroundProcessManager.selectedProcessId}
                panelState={backgroundProcessManager.panelState}
                onPanelStateChange={backgroundProcessManager.setPanelState}
                onSelectProcess={backgroundProcessManager.selectProcess}
                onStopProcess={backgroundProcessManager.stopProcess}
                onStopAllProcesses={backgroundProcessManager.stopAllProcesses}
                onRemoveProcess={backgroundProcessManager.removeProcess}
                onClearCompleted={backgroundProcessManager.clearCompletedProcesses}
                onViewFullOutput={handleViewFullOutput}
              />
            )}
          </>
        )}

        {/* Output Dialog - Full output viewer */}
        {outputDialogProcess && (
          <BackgroundProcessOutputDialog
            process={outputDialogProcess}
            onClose={handleCloseOutputDialog}
            onStop={handleStopProcess}
          />
        )}
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
  // Feature 024: New Feature Tips
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'Security & Auditing',
    description: 'Run security scans, check vulnerabilities, audit dependencies',
    prompt: 'Check for security vulnerabilities in this project',
    color: 'from-red-500/20 to-red-500/5 border-red-500/20 text-red-500',
  },
  {
    icon: <Activity className="w-5 h-5" />,
    title: 'System Monitoring',
    description: 'View background processes, notifications, environment info',
    prompt: 'List all running background processes',
    color: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 text-cyan-500',
  },
];

/**
 * Welcome state when no messages exist - Feature-focused design
 * Layout optimized to fit content within viewport while remaining scrollable
 */
function WelcomeState({ onAction }: WelcomeStateProps) {
  return (
    <div className="flex flex-col items-center min-h-full py-4 sm:py-6 px-4">
      {/* Header with icon - centered and prominent */}
      <div className="flex flex-col items-center gap-3 mb-4 sm:mb-6">
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
          <AnimatedBotIcon className="w-10 h-10 text-purple-500 dark:text-purple-400" />
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500/20 dark:bg-blue-500/30 border border-blue-500/30 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-1">PackageFlow AI</h2>
          <p className="text-sm text-muted-foreground">
            Your intelligent assistant for project automation
          </p>
        </div>
      </div>

      {/* Feature tips grid - responsive 1/2/3 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full max-w-3xl mb-4 sm:mb-6">
        {FEATURE_TIPS.map((tip) => (
          <button
            key={tip.title}
            onClick={() => onAction(tip.prompt)}
            className={cn(
              'group p-3 sm:p-4 rounded-xl text-left',
              'bg-gradient-to-br border',
              tip.color,
              'hover:scale-[1.02] hover:shadow-lg',
              'active:scale-[0.98]',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
            )}
          >
            <div className="flex items-start gap-2 sm:gap-3">
              <div
                className={cn(
                  'p-2 sm:p-2.5 rounded-xl bg-background/60',
                  'group-hover:bg-background/90 transition-colors',
                  'shadow-sm flex-shrink-0'
                )}
              >
                {tip.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground text-sm mb-0.5">{tip.title}</h3>
                <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-snug">
                  {tip.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Example prompts - contextual tips */}
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs text-muted-foreground/70 mb-2 uppercase tracking-wide font-medium">
          Quick Start
        </p>
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
          {[
            'How many projects are registered?',
            'Run build script for current project',
            'Create a workflow to build and test',
            // Feature 024: New Quick Start examples
            'Check for security vulnerabilities',
            'List all running background processes',
            'Show project dependencies',
          ].map((example) => (
            <button
              key={example}
              onClick={() => onAction(example)}
              className={cn(
                'px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs rounded-lg',
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
      <div className="mt-4 sm:mt-6 pt-4 border-t border-border/30 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-[11px] text-muted-foreground/50">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
            Cmd+B
          </kbd>
          <span>sidebar</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
            Cmd+N
          </kbd>
          <span>new chat</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
            Cmd+[/]
          </kbd>
          <span>navigate history</span>
        </span>
      </div>
    </div>
  );
}
