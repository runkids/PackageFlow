/**
 * useInputHistory - Hook to manage input history for chat messages
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 *
 * Provides arrow key navigation through previously sent messages.
 * History is persisted in localStorage with a configurable limit.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

/** localStorage key for chat history */
const STORAGE_KEY = 'packageflow:ai-chat-history';

/** Maximum number of history entries to keep */
const MAX_HISTORY_SIZE = 50;

interface UseInputHistoryOptions {
  /** Maximum history entries (default: 50) */
  maxSize?: number;
  /** localStorage key (default: 'packageflow:ai-chat-history') */
  storageKey?: string;
}

interface UseInputHistoryReturn {
  /** Navigate to previous (older) history entry. Pass current input value to save it before navigating. */
  navigateUp: (currentValue: string) => string | null;
  /** Navigate to next (newer) history entry */
  navigateDown: () => string | null;
  /** Add a new entry to history */
  addToHistory: (message: string) => void;
  /** Reset navigation index (call when user manually edits input) */
  resetNavigation: () => void;
  /** Current navigation index (-1 means not navigating) */
  currentIndex: number;
  /** Whether currently navigating through history */
  isNavigating: boolean;
  /** Get all history entries (most recent first) */
  getHistory: () => string[];
  /** Clear all history */
  clearHistory: () => void;
}

/**
 * Load history from localStorage
 */
function loadHistory(key: string): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    }
  } catch (error) {
    console.warn('[useInputHistory] Failed to load history:', error);
  }
  return [];
}

/**
 * Save history to localStorage
 */
function saveHistory(key: string, history: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.warn('[useInputHistory] Failed to save history:', error);
  }
}

/**
 * Hook for managing chat input history with arrow key navigation
 *
 * @example
 * ```tsx
 * const { navigateUp, navigateDown, addToHistory, resetNavigation } = useInputHistory();
 *
 * const handleKeyDown = (e: KeyboardEvent) => {
 *   if (e.key === 'ArrowUp' && shouldNavigate) {
 *     const prev = navigateUp();
 *     if (prev !== null) setValue(prev);
 *   }
 *   if (e.key === 'ArrowDown' && isNavigating) {
 *     const next = navigateDown();
 *     if (next !== null) setValue(next);
 *   }
 * };
 *
 * const handleSend = () => {
 *   addToHistory(value);
 *   // ... send message
 * };
 * ```
 */
export function useInputHistory(
  options: UseInputHistoryOptions = {}
): UseInputHistoryReturn {
  const {
    maxSize = MAX_HISTORY_SIZE,
    storageKey = STORAGE_KEY,
  } = options;

  // History array: index 0 is most recent
  const [history, setHistory] = useState<string[]>(() => loadHistory(storageKey));

  // Navigation index: -1 means not navigating, 0 is most recent, etc.
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Track the original input before navigation started
  const originalInputRef = useRef<string>('');

  // Persist history to localStorage when it changes
  useEffect(() => {
    saveHistory(storageKey, history);
  }, [history, storageKey]);

  /**
   * Add a new message to history
   * - Avoids duplicates (same as most recent entry)
   * - Trims and validates non-empty
   * - Maintains max size limit
   */
  const addToHistory = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setHistory((prev) => {
      // Skip if same as most recent entry
      if (prev.length > 0 && prev[0] === trimmed) {
        return prev;
      }

      // Add to beginning, remove duplicates, limit size
      const newHistory = [trimmed, ...prev.filter((item) => item !== trimmed)];
      return newHistory.slice(0, maxSize);
    });

    // Reset navigation after adding
    setCurrentIndex(-1);
  }, [maxSize]);

  /**
   * Navigate to previous (older) entry
   * Returns the message text or null if at end of history
   */
  const navigateUp = useCallback((): string | null => {
    if (history.length === 0) return null;

    const nextIndex = currentIndex + 1;

    // Check if we've reached the end of history
    if (nextIndex >= history.length) {
      return null;
    }

    setCurrentIndex(nextIndex);
    return history[nextIndex];
  }, [history, currentIndex]);

  /**
   * Navigate to next (newer) entry
   * Returns the message text, empty string (original), or null if not navigating
   */
  const navigateDown = useCallback((): string | null => {
    // Not navigating
    if (currentIndex < 0) return null;

    const nextIndex = currentIndex - 1;

    // Back to original input
    if (nextIndex < 0) {
      setCurrentIndex(-1);
      return originalInputRef.current;
    }

    setCurrentIndex(nextIndex);
    return history[nextIndex];
  }, [history, currentIndex]);

  /**
   * Reset navigation state
   * Call this when user manually types in the input
   */
  const resetNavigation = useCallback(() => {
    setCurrentIndex(-1);
  }, []);

  /**
   * Start navigation with the current input as the original
   */
  const startNavigation = useCallback((currentValue: string): string | null => {
    if (history.length === 0) return null;

    // Save current input as original
    originalInputRef.current = currentValue;

    // Navigate to first history entry
    setCurrentIndex(0);
    return history[0];
  }, [history]);

  /**
   * Navigate up, handling the first navigation specially
   */
  const navigateUpWithOriginal = useCallback((currentValue: string): string | null => {
    // First navigation - save original and go to history[0]
    if (currentIndex < 0) {
      return startNavigation(currentValue);
    }

    // Continue navigating
    return navigateUp();
  }, [currentIndex, startNavigation, navigateUp]);

  /**
   * Get all history entries
   */
  const getHistory = useCallback((): string[] => {
    return [...history];
  }, [history]);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    navigateUp: navigateUpWithOriginal,
    navigateDown,
    addToHistory,
    resetNavigation,
    currentIndex,
    isNavigating: currentIndex >= 0,
    getHistory,
    clearHistory,
  };
}

/**
 * Helper to check if cursor is at the first line of a textarea
 */
export function isCursorAtFirstLine(textarea: HTMLTextAreaElement): boolean {
  const { selectionStart, value } = textarea;

  // Empty or cursor at position 0
  if (selectionStart === 0) return true;

  // Check if there's a newline before the cursor
  const textBeforeCursor = value.substring(0, selectionStart);
  return !textBeforeCursor.includes('\n');
}

/**
 * Helper to check if cursor is at the last line of a textarea
 */
export function isCursorAtLastLine(textarea: HTMLTextAreaElement): boolean {
  const { selectionStart, value } = textarea;

  // Cursor at end
  if (selectionStart === value.length) return true;

  // Check if there's a newline after the cursor
  const textAfterCursor = value.substring(selectionStart);
  return !textAfterCursor.includes('\n');
}
