/**
 * ChatMessage - Individual chat message component with role-specific styling
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 * Enhancement: Interactive Elements (023-enhanced-ai-chat US3)
 *
 * Enhanced design:
 * - Larger avatars (32px) with gradient backgrounds
 * - Softer user message background (bg-primary/5 instead of bg-primary)
 * - Better visual separation between messages
 * - Token count display for assistant messages
 * - Interactive elements support (navigation, action, entity links)
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Bot, User, Info, Copy, Check, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { marked } from 'marked';
import { cn } from '../../lib/utils';
import { ActionConfirmationCard } from './ActionConfirmationCard';
import {
  InteractiveElement,
  parseInteractiveElements,
  type InteractiveElementData,
} from './InteractiveElement';
import type { Message, ToolResult } from '../../types/ai-assistant';

/**
 * ChatGPT-style thinking indicator with animated dots
 */
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-2 h-2 rounded-full',
            'bg-muted-foreground/60',
            'animate-[thinking_1.4s_ease-in-out_infinite]'
          )}
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes thinking {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

interface ChatMessageProps {
  /** Message data */
  message: Message;
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /** Handler for copy action */
  onCopy?: () => void;
  /** Handler for regenerate action (assistant only) */
  onRegenerate?: () => void;
  /** Handler for approving a tool call */
  onApproveToolCall?: (toolCallId: string) => Promise<void>;
  /** Handler for denying a tool call */
  onDenyToolCall?: (toolCallId: string, reason?: string) => Promise<void>;
  /** Handler to stop/cancel an executing tool call */
  onStopToolExecution?: (toolCallId: string) => Promise<void>;
  /** IDs of tool calls that are currently executing */
  executingToolIds?: Set<string>;
  /** Show token usage */
  showTokens?: boolean;
  /** Handler for action chip clicks (Feature 023 US3) */
  onAction?: (prompt: string) => void;
  /** Handler for navigation button clicks (Feature 023 US3) */
  onNavigate?: (route: string) => void;
}

/**
 * Chat message component with user/assistant/system variants
 */
export function ChatMessage({
  message,
  isStreaming = false,
  onRegenerate,
  onApproveToolCall,
  onDenyToolCall,
  onStopToolExecution,
  executingToolIds = new Set(),
  showTokens = true,
  onAction,
  onNavigate,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [interactiveElements, setInteractiveElements] = useState<InteractiveElementData[]>([]);
  const [cleanContent, setCleanContent] = useState<string>(message.content);

  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(message.createdAt);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, [message.createdAt]);

  // Parse interactive elements from content (Feature 023 US3 - T078)
  useEffect(() => {
    if (message.role === 'assistant' && message.content) {
      // Check for interactive element markers
      const hasMarkers = /\[\[(navigation|action|entity):/.test(message.content);
      if (hasMarkers) {
        parseInteractiveElements(message.content).then(({ elements, cleanContent: clean }) => {
          setInteractiveElements(elements);
          setCleanContent(clean);
        });
      } else {
        setInteractiveElements([]);
        setCleanContent(message.content);
      }
    } else {
      setInteractiveElements([]);
      setCleanContent(message.content);
    }
  }, [message.content, message.role]);

  // Parse markdown content for assistant messages (use clean content)
  const parsedContent = useMemo(() => {
    if (message.role === 'user' || !cleanContent) return null;
    return marked.parse(cleanContent);
  }, [cleanContent, message.role]);

  // Copy message content to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.content]);

  // Find tool result for a given call ID
  const getToolResult = useCallback((callId: string): ToolResult | undefined => {
    return message.toolResults?.find(r => r.callId === callId);
  }, [message.toolResults]);

  // Handle tool call approval
  const handleApproveToolCall = useCallback(async (toolCallId: string) => {
    if (onApproveToolCall) {
      await onApproveToolCall(toolCallId);
    }
  }, [onApproveToolCall]);

  // Handle tool call denial
  const handleDenyToolCall = useCallback(async (toolCallId: string, reason?: string) => {
    if (onDenyToolCall) {
      await onDenyToolCall(toolCallId, reason);
    }
  }, [onDenyToolCall]);

  // System message variant
  if (message.role === 'system') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 mx-auto',
          'text-xs text-muted-foreground',
          'bg-muted/30 rounded-full'
        )}
        role="status"
      >
        <Info className="w-3.5 h-3.5" />
        <span>{message.content}</span>
      </div>
    );
  }

  // User message variant - Enhanced with softer background
  if (message.role === 'user') {
    return (
      <article
        className={cn(
          'flex gap-3',
          'max-w-[80%] ml-auto',
          'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
        )}
        role="article"
        aria-label="User message"
      >
        {/* Message content */}
        <div className="flex flex-col items-end gap-1.5 flex-1 min-w-0">
          {/* Message bubble - Soft gradient background */}
          <div
            className={cn(
              'px-4 py-3 rounded-2xl rounded-br-md',
              // Soft gradient background
              'bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5',
              'dark:from-primary/20 dark:via-primary/15 dark:to-primary/10',
              'border border-primary/20 dark:border-primary/30',
              'text-foreground',
              'text-sm leading-relaxed',
              'whitespace-pre-wrap break-words',
              'shadow-sm',
              message.status === 'error' && 'opacity-60'
            )}
          >
            {message.content}
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-muted-foreground/60 px-1.5">
            {formattedTime}
          </span>
        </div>

        {/* Avatar - Compact with gradient */}
        <div
          className={cn(
            'flex-shrink-0',
            'w-7 h-7 rounded-lg',
            'bg-gradient-to-br from-primary/25 to-primary/10',
            'dark:from-primary/35 dark:to-primary/15',
            'border border-primary/20',
            'flex items-center justify-center',
            'shadow-sm'
          )}
        >
          <User className="w-3.5 h-3.5 text-primary" />
        </div>
      </article>
    );
  }

  // Assistant message variant - Enhanced design
  return (
    <article
      className={cn(
        'group flex gap-3',
        'max-w-[85%]',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
      )}
      role="article"
      aria-label="Assistant message"
    >
      {/* Avatar - Compact with gradient */}
      <div
        className={cn(
          'flex-shrink-0',
          'w-7 h-7 rounded-lg',
          'bg-gradient-to-br from-purple-500/20 via-blue-500/15 to-cyan-500/10',
          'dark:from-purple-500/30 dark:via-blue-500/20 dark:to-cyan-500/15',
          'border border-purple-500/20 dark:border-purple-500/30',
          'flex items-center justify-center',
          'shadow-sm'
        )}
      >
        <Bot className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
      </div>

      {/* Message content */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* Message bubble */}
        <div
          className={cn(
            'px-4 py-3 rounded-2xl rounded-tl-sm',
            'bg-card border border-border',
            'shadow-sm',
            // Enhanced prose styling
            'prose prose-sm dark:prose-invert max-w-none',
            'prose-headings:text-foreground prose-headings:font-semibold',
            'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm',
            'prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:my-2',
            'prose-ul:my-2 prose-ol:my-2',
            'prose-li:text-foreground/90 prose-li:my-0.5',
            // Code blocks
            'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg',
            'prose-pre:my-3',
            // Inline code
            'prose-code:text-primary prose-code:font-medium',
            'prose-code:before:content-none prose-code:after:content-none',
            'prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
            // Links
            'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
            // Blockquotes
            'prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/30',
            'prose-blockquote:rounded-r-lg prose-blockquote:py-0.5 prose-blockquote:px-3',
            'prose-blockquote:not-italic prose-blockquote:text-muted-foreground',
            // Strong
            'prose-strong:text-foreground prose-strong:font-semibold',
            message.status === 'error' && 'opacity-60'
          )}
        >
          {/* Show thinking animation when streaming with no content yet */}
          {isStreaming && !message.content ? (
            <ThinkingIndicator />
          ) : (
            <>
              {parsedContent ? (
                <div dangerouslySetInnerHTML={{ __html: parsedContent }} />
              ) : cleanContent ? (
                cleanContent
              ) : message.toolCalls && message.toolCalls.length > 0 ? (
                // When only tool calls exist, show a placeholder message
                <span className="text-muted-foreground italic text-sm">
                  Executing requested action...
                </span>
              ) : null}
              {/* Interactive elements (Feature 023 US3 - T079) */}
              {interactiveElements.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 not-prose">
                  {interactiveElements.map((element) => (
                    <InteractiveElement
                      key={element.id}
                      element={element}
                      onAction={onAction}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
              {/* Streaming cursor when content exists */}
              {isStreaming && message.content && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-foreground/70 animate-pulse align-middle" />
              )}
            </>
          )}

          {/* Error state with retry */}
          {message.status === 'error' && onRegenerate && (
            <div
              className={cn(
                'mt-3 p-3 rounded-lg',
                'bg-destructive/10 border border-destructive/20',
                'flex items-center gap-2 text-sm'
              )}
            >
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="flex-1 text-destructive/90">
                Failed to get response
              </span>
              <button
                onClick={onRegenerate}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1',
                  'text-xs font-medium rounded',
                  'bg-destructive/10 hover:bg-destructive/20',
                  'text-destructive transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-destructive/30'
                )}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          {/* Tool calls - Enhanced styling */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-4 space-y-2 not-prose">
              {message.toolCalls.map((toolCall) => (
                <ActionConfirmationCard
                  key={toolCall.id}
                  toolCall={toolCall}
                  onApprove={handleApproveToolCall}
                  onDeny={handleDenyToolCall}
                  onStop={onStopToolExecution}
                  result={getToolResult(toolCall.id)}
                  isExecuting={executingToolIds.has(toolCall.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer with timestamp, tokens, and actions */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 px-1.5 mt-1">
          <span>{formattedTime}</span>

          {/* Token usage */}
          {showTokens && message.tokensUsed && (
            <>
              <span className="text-muted-foreground/30">-</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {message.tokensUsed.toLocaleString()}
              </span>
            </>
          )}

          {/* Model name */}
          {message.model && (
            <>
              <span className="text-muted-foreground/30">-</span>
              <span className="truncate max-w-[80px]">{message.model}</span>
            </>
          )}

          {/* Actions (only show when not streaming) */}
          {!isStreaming && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className={cn(
                  'p-1 rounded-md',
                  'hover:bg-accent/80 transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-ring'
                )}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>

              {/* Regenerate button */}
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className={cn(
                    'p-1 rounded-md',
                    'hover:bg-accent/80 transition-colors',
                    'focus:outline-none focus:ring-1 focus:ring-ring'
                  )}
                  aria-label="Regenerate response"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
