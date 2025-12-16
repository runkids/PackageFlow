/**
 * ChatInputArea - Input area with send/stop controls for AI chat
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 *
 * Features:
 * - Auto-resize textarea
 * - Send/Stop controls
 * - Arrow key history navigation (023-enhanced-ai-chat)
 */

import * as React from 'react';
import { useRef, useCallback, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { useInputHistory, isCursorAtFirstLine, isCursorAtLastLine } from '../../hooks/useInputHistory';

interface ChatInputAreaProps {
  /** Current input value */
  value: string;
  /** Handler for input changes */
  onChange: (value: string) => void;
  /** Handler for send action */
  onSend: () => void;
  /** Handler for stop action */
  onStop?: () => void;
  /** Whether AI is currently generating */
  isGenerating?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
}

/**
 * Chat input area with auto-resize textarea and send/stop controls
 */
export function ChatInputArea({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  disabled = false,
  placeholder = 'Type your message...',
  autoFocus = true,
}: ChatInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track IME composition state to prevent premature submission during CJK input
  const isComposingRef = useRef(false);

  // Input history for arrow key navigation
  const {
    navigateUp,
    navigateDown,
    addToHistory,
    resetNavigation,
    isNavigating,
  } = useInputHistory();

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight, capped at max-height
    const newHeight = Math.min(textarea.scrollHeight, 150);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height when value changes
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Handle IME composition start (CJK input method)
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  // Handle IME composition end (CJK input method)
  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Skip keyboard handling during IME composition (CJK input)
      // This prevents premature message submission when user presses Enter to select a character
      if (isComposingRef.current) {
        return;
      }

      const textarea = textareaRef.current;

      // Arrow Up - navigate to previous history entry
      // Only trigger when input is empty OR cursor is at the first line
      if (e.key === 'ArrowUp' && textarea) {
        const shouldNavigate = !value || isCursorAtFirstLine(textarea);
        if (shouldNavigate) {
          const prevMessage = navigateUp(value);
          if (prevMessage !== null) {
            e.preventDefault();
            onChange(prevMessage);
            // Move cursor to end after history navigation
            requestAnimationFrame(() => {
              if (textarea) {
                textarea.selectionStart = textarea.selectionEnd = prevMessage.length;
              }
            });
          }
        }
      }

      // Arrow Down - navigate to next history entry (or back to original)
      // Only trigger when navigating through history AND cursor is at the last line
      if (e.key === 'ArrowDown' && textarea && isNavigating) {
        const shouldNavigate = isCursorAtLastLine(textarea);
        if (shouldNavigate) {
          const nextMessage = navigateDown();
          if (nextMessage !== null) {
            e.preventDefault();
            onChange(nextMessage);
            // Move cursor to end after history navigation
            requestAnimationFrame(() => {
              if (textarea) {
                textarea.selectionStart = textarea.selectionEnd = nextMessage.length;
              }
            });
          }
        }
      }

      // Enter to send (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim() && !isGenerating) {
          addToHistory(value);
          onSend();
        }
      }

      // Cmd/Ctrl + Enter to send (alternative)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!disabled && value.trim() && !isGenerating) {
          addToHistory(value);
          onSend();
        }
      }

      // Escape to stop generation or clear input
      if (e.key === 'Escape') {
        if (isGenerating && onStop) {
          onStop();
        } else if (value) {
          onChange('');
          resetNavigation();
        }
      }
    },
    [disabled, value, isGenerating, onSend, onStop, onChange, navigateUp, navigateDown, isNavigating, addToHistory, resetNavigation]
  );

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Reset history navigation when user manually types
      resetNavigation();
    },
    [onChange, resetNavigation]
  );

  // Handle send button click
  const handleSend = useCallback(() => {
    if (!disabled && value.trim() && !isGenerating) {
      addToHistory(value);
      onSend();
    }
  }, [disabled, value, isGenerating, onSend, addToHistory]);

  // Handle stop button click
  const handleStop = useCallback(() => {
    if (onStop) {
      onStop();
    }
  }, [onStop]);

  const canSend = !disabled && value.trim() && !isGenerating;

  return (
    <div
      className={cn(
        'px-4 py-3',
        'border-t border-border/50',
        'bg-gradient-to-t from-background via-background to-transparent'
      )}
    >
      <div
        className={cn(
          'relative flex items-end gap-2',
          'bg-card/80 backdrop-blur-sm rounded-xl',
          'border border-border/60',
          'shadow-sm',
          'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
          'focus-within:shadow-md focus-within:shadow-primary/5',
          'transition-all duration-200'
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none',
            'px-4 py-3',
            'bg-transparent',
            'placeholder:text-muted-foreground',
            'focus:outline-none',
            'max-h-[150px] min-h-[44px]',
            'text-sm',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label="Chat message input"
          aria-describedby="chat-input-hint"
        />

        {/* Send/Stop button */}
        <div className="p-1.5">
          {isGenerating ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              className={cn(
                'flex items-center justify-center',
                'w-10 h-10 rounded-lg p-0'
              )}
              aria-label="Stop generating"
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'flex items-center justify-center',
                'w-10 h-10 rounded-lg p-0'
              )}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Keyboard hint - subtle and only visible on focus */}
      <p
        id="chat-input-hint"
        className={cn(
          'mt-2 text-[11px] text-muted-foreground/50 text-center',
          'transition-opacity duration-200',
          'select-none'
        )}
      >
        <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono">Enter</kbd>
        <span className="mx-1.5 text-muted-foreground/30">send</span>
        <span className="text-muted-foreground/20 mx-2">|</span>
        <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono">Shift+Enter</kbd>
        <span className="mx-1.5 text-muted-foreground/30">new line</span>
        <span className="text-muted-foreground/20 mx-2">|</span>
        <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono">Esc</kbd>
        <span className="mx-1.5 text-muted-foreground/30">{isGenerating ? 'stop' : 'clear'}</span>
      </p>
    </div>
  );
}
