/**
 * useInputAutocomplete - Hook for AI input autocomplete
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 * User Story 5: Conversation Flow Optimization
 *
 * Provides autocomplete suggestions as user types.
 * T117-T118: Debounced autocomplete requests
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types matching backend
export type AutocompleteSource = 'recent_prompt' | 'tool_description' | 'context';

export interface AutocompleteSuggestion {
  text: string;
  source: AutocompleteSource;
  label: string;
  icon?: string;
}

interface UseInputAutocompleteOptions {
  /** Conversation ID for context */
  conversationId?: string;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Maximum suggestions to show */
  maxSuggestions?: number;
  /** Minimum input length to trigger */
  minLength?: number;
}

interface UseInputAutocompleteReturn {
  /** Current suggestions */
  suggestions: AutocompleteSuggestion[];
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Currently selected index (-1 = none) */
  selectedIndex: number;
  /** Update input value to fetch suggestions */
  updateInput: (value: string) => void;
  /** Select next suggestion */
  selectNext: () => void;
  /** Select previous suggestion */
  selectPrevious: () => void;
  /** Get selected suggestion text */
  getSelectedText: () => string | null;
  /** Clear suggestions */
  clear: () => void;
  /** Set selected index directly */
  setSelectedIndex: (index: number) => void;
}

/**
 * Hook for autocomplete functionality
 */
export function useInputAutocomplete({
  conversationId,
  debounceMs = 150,
  maxSuggestions = 5,
  minLength = 2,
}: UseInputAutocompleteOptions = {}): UseInputAutocompleteReturn {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch suggestions from backend (T118)
  const fetchSuggestions = useCallback(async (input: string) => {
    if (!conversationId || input.length < minLength) {
      setSuggestions([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);

    try {
      const result = await invoke<AutocompleteSuggestion[]>('ai_assistant_get_autocomplete', {
        conversationId,
        input,
        limit: maxSuggestions,
      });

      setSuggestions(result);
      setSelectedIndex(-1);
    } catch (error) {
      // Only log non-abort errors
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('Autocomplete error:', error);
      }
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, maxSuggestions, minLength]);

  // Debounced update (T118)
  const updateInput = useCallback((value: string) => {
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Skip if too short
    if (value.length < minLength) {
      setSuggestions([]);
      return;
    }

    // Debounce the fetch
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, debounceMs);
  }, [debounceMs, minLength, fetchSuggestions]);

  // Keyboard navigation (T120)
  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (suggestions.length === 0) return -1;
      return prev < suggestions.length - 1 ? prev + 1 : 0;
    });
  }, [suggestions.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => {
      if (suggestions.length === 0) return -1;
      return prev > 0 ? prev - 1 : suggestions.length - 1;
    });
  }, [suggestions.length]);

  const getSelectedText = useCallback((): string | null => {
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      return suggestions[selectedIndex].text;
    }
    return null;
  }, [selectedIndex, suggestions]);

  const clear = useCallback(() => {
    setSuggestions([]);
    setSelectedIndex(-1);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions,
    isLoading,
    selectedIndex,
    updateInput,
    selectNext,
    selectPrevious,
    getSelectedText,
    clear,
    setSelectedIndex,
  };
}
