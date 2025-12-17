/**
 * ChatInputContainer - Enhanced chat input with IME support and modern UI
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 *
 * Features:
 * - IME-friendly textarea (handles CJK input methods properly)
 * - Auto-resize based on content
 * - Toolbar with attachment and formatting options
 * - Input history navigation (arrow keys)
 * - Character count indicator
 * - Keyboard shortcuts with visual hints
 * - Accessibility support (ARIA labels, focus management)
 * - Deep/Light theme support
 */

import * as React from 'react';
import { useRef, useCallback, useEffect, useState } from 'react';
import { Send, Square, Paperclip, Code, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { useIMEComposition } from '../../../hooks/useIMEComposition';
import {
  useInputHistory,
  isCursorAtFirstLine,
  isCursorAtLastLine,
} from '../../../hooks/useInputHistory';
import type { ChatInputContainerProps, Attachment } from './types';

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Attachment pill component
 */
function AttachmentPill({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const iconMap = {
    file: Paperclip,
    code: Code,
    image: Paperclip,
  };
  const Icon = iconMap[attachment.type];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1',
        'bg-muted/60 rounded-lg border border-border/50',
        'text-xs text-muted-foreground',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="max-w-[120px] truncate">{attachment.name}</span>
      <button
        onClick={onRemove}
        className={cn(
          'p-0.5 rounded-full',
          'hover:bg-destructive/10 hover:text-destructive',
          'transition-colors duration-150'
        )}
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Toolbar button component
 */
function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  shortcut,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-2 rounded-lg',
        'text-muted-foreground hover:text-foreground',
        'hover:bg-muted/60 active:bg-muted',
        'transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        disabled && 'opacity-50 cursor-not-allowed',
        active && 'bg-primary/10 text-primary'
      )}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/**
 * Character count indicator
 */
function CharacterCount({ current, max }: { current: number; max?: number }) {
  const percentage = max ? (current / max) * 100 : 0;
  const isNearLimit = percentage > 80;
  const isAtLimit = percentage >= 100;

  return (
    <span
      className={cn(
        'text-[10px] font-mono tabular-nums',
        'transition-colors duration-200',
        isAtLimit ? 'text-destructive' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground/50'
      )}
      role="status"
      aria-live="polite"
    >
      {current.toLocaleString()}
      {max && (
        <>
          <span className="text-muted-foreground/30">/</span>
          {max.toLocaleString()}
        </>
      )}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Enhanced Chat Input Container
 */
export function ChatInputContainer({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  disabled = false,
  placeholder = 'Type your message...',
  autoFocus = true,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  maxLength,
  showCharCount = true,
  showQuickCommands = false,
  onQuickCommand,
  className,
}: ChatInputContainerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  // IME composition handling (prevents Enter from sending during CJK input)
  const {
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
    createSafeKeyHandler,
  } = useIMEComposition();

  // Input history for arrow key navigation
  const { navigateUp, navigateDown, addToHistory, resetNavigation, isNavigating } =
    useInputHistory();

  // ----------------------------------------
  // Auto-resize logic
  // ----------------------------------------
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to measure scrollHeight
    textarea.style.height = 'auto';
    // Calculate new height (min 44px, max 200px)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 200);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // ----------------------------------------
  // Event handlers
  // ----------------------------------------
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;

      // Check for quick commands (@ or /)
      if (showQuickCommands && onQuickCommand) {
        const lastChar = newValue.slice(-1);
        if (lastChar === '@' || lastChar === '/') {
          onQuickCommand(lastChar);
        }
      }

      onChange(newValue);
      resetNavigation();
    },
    [onChange, resetNavigation, showQuickCommands, onQuickCommand]
  );

  const handleSend = useCallback(() => {
    if (!disabled && value.trim() && !isGenerating) {
      addToHistory(value);
      onSend();
    }
  }, [disabled, value, isGenerating, onSend, addToHistory]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  // Keyboard event handler (wrapped for IME safety)
  const rawKeyHandler = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current;

      // Arrow Up - navigate history
      if (e.key === 'ArrowUp' && textarea) {
        const shouldNavigate = !value || isCursorAtFirstLine(textarea);
        if (shouldNavigate) {
          const prevMessage = navigateUp(value);
          if (prevMessage !== null) {
            e.preventDefault();
            onChange(prevMessage);
            requestAnimationFrame(() => {
              if (textarea) {
                textarea.selectionStart = textarea.selectionEnd = prevMessage.length;
              }
            });
          }
        }
      }

      // Arrow Down - navigate history
      if (e.key === 'ArrowDown' && textarea && isNavigating) {
        const shouldNavigate = isCursorAtLastLine(textarea);
        if (shouldNavigate) {
          const nextMessage = navigateDown();
          if (nextMessage !== null) {
            e.preventDefault();
            onChange(nextMessage);
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
        handleSend();
      }

      // Cmd/Ctrl + Enter to send
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }

      // Escape to stop or clear
      if (e.key === 'Escape') {
        if (isGenerating && onStop) {
          onStop();
        } else if (value) {
          onChange('');
          resetNavigation();
        }
      }
    },
    [
      value,
      isGenerating,
      isNavigating,
      navigateUp,
      navigateDown,
      onChange,
      resetNavigation,
      handleSend,
      onStop,
    ]
  );

  // Wrap with IME-safe handler
  const handleKeyDown = createSafeKeyHandler(rawKeyHandler);

  // Focus handlers
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowToolbar(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding toolbar to allow clicking toolbar buttons
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowToolbar(false);
      }
    }, 150);
  }, []);

  // ----------------------------------------
  // Computed values
  // ----------------------------------------
  const canSend = !disabled && value.trim() && !isGenerating;
  const hasAttachments = attachments.length > 0;
  const charCount = value.length;
  const isOverLimit = maxLength ? charCount > maxLength : false;
  // Only show toolbar if there's content to display (attachment buttons)
  const hasToolbarContent = !!onAddAttachment;

  return (
    <div
      ref={containerRef}
      className={cn(
        'px-4 py-3',
        'border-t border-border/50',
        'bg-gradient-to-t from-background via-background to-transparent',
        className
      )}
    >
      {/* Attachments preview */}
      {hasAttachments && (
        <div
          className={cn(
            'flex flex-wrap gap-2 mb-2',
            'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
          )}
        >
          {attachments.map((attachment) => (
            <AttachmentPill
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemoveAttachment?.(attachment.id)}
            />
          ))}
        </div>
      )}

      {/* Main input container */}
      <div
        className={cn(
          'relative flex flex-col',
          'bg-card/80 backdrop-blur-sm rounded-xl',
          'border border-border/60',
          'shadow-sm',
          'transition-all duration-200',
          isFocused && 'border-primary/50 ring-2 ring-primary/20 shadow-md shadow-primary/5',
          isOverLimit && 'border-destructive/50 ring-destructive/20'
        )}
      >
        {/* Toolbar (collapsible) - only render when there's content */}
        {hasToolbarContent && (
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-1.5',
              'border-b border-border/30',
              'transition-all duration-200',
              showToolbar
                ? 'opacity-100 max-h-12'
                : 'opacity-0 max-h-0 overflow-hidden py-0 border-b-0'
            )}
          >
            {onAddAttachment && (
              <>
                <ToolbarButton
                  icon={Paperclip}
                  label="Attach file"
                  onClick={() => onAddAttachment('file')}
                  disabled={disabled}
                  shortcut="Cmd+U"
                />
                <ToolbarButton
                  icon={Code}
                  label="Add code block"
                  onClick={() => onAddAttachment('code')}
                  disabled={disabled}
                  shortcut="Cmd+Shift+C"
                />
              </>
            )}
          </div>
        )}

        {/* Textarea row */}
        <div className="flex items-end gap-2">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionUpdate={handleCompositionUpdate}
            onCompositionEnd={handleCompositionEnd}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            maxLength={maxLength}
            className={cn(
              'flex-1 resize-none',
              'px-4 py-3',
              'bg-transparent',
              'placeholder:text-muted-foreground/60',
              'focus:outline-none',
              'max-h-[200px] min-h-[44px]',
              'text-sm leading-relaxed',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            aria-label="Chat message input"
            aria-describedby="chat-input-hint"
            aria-invalid={isOverLimit}
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
                  'w-10 h-10 rounded-lg p-0',
                  'animate-in zoom-in-95 duration-150'
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
                disabled={!canSend || isOverLimit}
                className={cn(
                  'flex items-center justify-center',
                  'w-10 h-10 rounded-lg p-0',
                  'transition-transform duration-150',
                  canSend && !isOverLimit && 'hover:scale-105 active:scale-95'
                )}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Footer with hints and character count */}
      <div
        className={cn(
          'flex items-center justify-between mt-2 px-1',
          'text-[11px] text-muted-foreground/50',
          'transition-opacity duration-200',
          isFocused ? 'opacity-100' : 'opacity-60'
        )}
      >
        {/* Keyboard shortcuts */}
        <p id="chat-input-hint" className="flex items-center gap-3 select-none">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
              Enter
            </kbd>
            <span className="text-muted-foreground/40">send</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
              Shift+Enter
            </kbd>
            <span className="text-muted-foreground/40">new line</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono border border-border/30">
              Esc
            </kbd>
            <span className="text-muted-foreground/40">{isGenerating ? 'stop' : 'clear'}</span>
          </span>
          {isNavigating && (
            <span className="flex items-center gap-1 text-primary/60">
              <ChevronUp className="w-3 h-3" />
              <span>history</span>
            </span>
          )}
        </p>

        {/* Character count */}
        {showCharCount && <CharacterCount current={charCount} max={maxLength} />}
      </div>
    </div>
  );
}
