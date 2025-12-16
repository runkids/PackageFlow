/**
 * ChatInputArea - Input area with send/stop controls for AI chat
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import * as React from 'react';
import { useRef, useCallback, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

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

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim() && !isGenerating) {
          onSend();
        }
      }

      // Cmd/Ctrl + Enter to send (alternative)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!disabled && value.trim() && !isGenerating) {
          onSend();
        }
      }

      // Escape to stop generation or clear input
      if (e.key === 'Escape') {
        if (isGenerating && onStop) {
          onStop();
        } else if (value) {
          onChange('');
        }
      }
    },
    [disabled, value, isGenerating, onSend, onStop, onChange]
  );

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Handle send button click
  const handleSend = useCallback(() => {
    if (!disabled && value.trim() && !isGenerating) {
      onSend();
    }
  }, [disabled, value, isGenerating, onSend]);

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
        'border-t border-border',
        'bg-background'
      )}
    >
      <div
        className={cn(
          'relative flex items-end gap-2',
          'bg-card rounded-xl border border-border',
          'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30',
          'transition-all duration-150'
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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

      {/* Keyboard hint */}
      <p
        id="chat-input-hint"
        className="mt-1.5 text-xs text-muted-foreground text-center"
      >
        Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to send,{' '}
        <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
