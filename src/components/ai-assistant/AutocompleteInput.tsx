/**
 * AutocompleteInput - Input with autocomplete dropdown
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 * User Story 5: Conversation Flow Optimization
 *
 * T116, T119, T120: Autocomplete input with dropdown and keyboard navigation
 */

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Clock, Wrench, MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useInputAutocomplete, type AutocompleteSuggestion, type AutocompleteSource } from '../../hooks/useInputAutocomplete';

interface AutocompleteInputProps {
  /** Current input value */
  value: string;
  /** Called when input changes */
  onChange: (value: string) => void;
  /** Called when Enter is pressed (with final value) */
  onSubmit: (value: string) => void;
  /** Conversation ID for context */
  conversationId?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

export interface AutocompleteInputRef {
  focus: () => void;
  clear: () => void;
}

/**
 * Get icon for autocomplete source
 */
function SourceIcon({ source }: { source: AutocompleteSource }) {
  switch (source) {
    case 'recent_prompt':
      return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    case 'tool_description':
      return <Wrench className="w-3.5 h-3.5 text-amber-500" />;
    case 'context':
      return <MessageCircle className="w-3.5 h-3.5 text-blue-500" />;
    default:
      return null;
  }
}

/**
 * AutocompleteInput component with dropdown suggestions
 */
export const AutocompleteInput = forwardRef<AutocompleteInputRef, AutocompleteInputProps>(
  function AutocompleteInput(
    {
      value,
      onChange,
      onSubmit,
      conversationId,
      placeholder = 'Type your message...',
      disabled = false,
      className,
    },
    ref
  ) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    // Track IME composition state to prevent premature submission during CJK input
    const isComposingRef = useRef(false);

    const {
      suggestions,
      isLoading,
      selectedIndex,
      updateInput,
      selectNext,
      selectPrevious,
      getSelectedText,
      clear,
      setSelectedIndex,
    } = useInputAutocomplete({
      conversationId,
      debounceMs: 150,
      maxSuggestions: 5,
      minLength: 2,
    });

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        onChange('');
        clear();
      },
    }));

    // Update autocomplete when value changes
    useEffect(() => {
      updateInput(value);
      setIsOpen(value.length >= 2);
    }, [value, updateInput]);

    // Close dropdown when suggestions are empty
    useEffect(() => {
      if (suggestions.length === 0 && !isLoading) {
        setIsOpen(false);
      } else if (suggestions.length > 0) {
        setIsOpen(true);
      }
    }, [suggestions, isLoading]);

    // Handle suggestion selection
    const handleSelectSuggestion = useCallback((suggestion: AutocompleteSuggestion) => {
      onChange(suggestion.text);
      clear();
      setIsOpen(false);
      inputRef.current?.focus();
    }, [onChange, clear]);

    // Handle IME composition start (CJK input method)
    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    // Handle IME composition end (CJK input method)
    const handleCompositionEnd = useCallback(() => {
      isComposingRef.current = false;
    }, []);

    // Handle keyboard events (T120)
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Skip keyboard handling during IME composition (CJK input)
      // This prevents premature message submission when user presses Enter to select a character
      if (isComposingRef.current) {
        return;
      }

      if (!isOpen || suggestions.length === 0) {
        // Normal Enter behavior when no dropdown
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit(value);
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectPrevious();
          break;
        case 'Enter':
          e.preventDefault();
          const selected = getSelectedText();
          if (selected) {
            handleSelectSuggestion({ text: selected, source: 'recent_prompt', label: selected });
          } else {
            // Submit current value
            onSubmit(value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          clear();
          break;
        case 'Tab':
          if (selectedIndex >= 0) {
            e.preventDefault();
            const selected = getSelectedText();
            if (selected) {
              handleSelectSuggestion({ text: selected, source: 'recent_prompt', label: selected });
            }
          }
          break;
      }
    }, [isOpen, suggestions.length, selectedIndex, value, selectNext, selectPrevious, getSelectedText, handleSelectSuggestion, onSubmit, clear]);

    // Handle input change
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    }, [onChange]);

    // Click outside to close
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative w-full">
        {/* Input textarea */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full resize-none rounded-lg border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          style={{
            minHeight: '40px',
            maxHeight: '120px',
          }}
        />

        {/* Autocomplete dropdown (T119) */}
        {isOpen && (suggestions.length > 0 || isLoading) && (
          <div
            ref={dropdownRef}
            className={cn(
              'absolute left-0 right-0 bottom-full mb-1 z-50',
              'rounded-lg border border-border bg-popover shadow-lg',
              'animate-in fade-in-0 zoom-in-95 duration-150'
            )}
          >
            {isLoading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center p-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading suggestions...
              </div>
            ) : (
              <ul className="py-1 max-h-[200px] overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.source}-${index}`}>
                    <button
                      type="button"
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                        'hover:bg-accent transition-colors',
                        selectedIndex === index && 'bg-accent'
                      )}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <SourceIcon source={suggestion.source} />
                      <span className="flex-1 truncate">{suggestion.label}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {suggestion.source.replace('_', ' ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
);
