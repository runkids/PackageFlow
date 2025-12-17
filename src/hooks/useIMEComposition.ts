/**
 * useIMEComposition - Hook for handling IME (Input Method Editor) composition
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 *
 * This hook properly handles CJK (Chinese, Japanese, Korean) input methods
 * by tracking composition state and preventing premature actions during IME input.
 *
 * Key features:
 * - Tracks isComposing state to prevent Enter key submission during character selection
 * - Provides composition text for visual feedback
 * - Creates safe key handlers that respect composition state
 */

import { useRef, useCallback, useState } from 'react';

interface UseIMECompositionOptions {
  /** Callback when composition starts */
  onCompositionStart?: () => void;
  /** Callback when composition updates */
  onCompositionUpdate?: (text: string) => void;
  /** Callback when composition ends */
  onCompositionEnd?: (text: string) => void;
}

interface UseIMECompositionReturn {
  /** Whether IME composition is active */
  isComposing: boolean;
  /** Current composition text (during IME input) */
  compositionText: string;
  /** Handler for compositionstart event */
  handleCompositionStart: (e: React.CompositionEvent) => void;
  /** Handler for compositionupdate event */
  handleCompositionUpdate: (e: React.CompositionEvent) => void;
  /** Handler for compositionend event */
  handleCompositionEnd: (e: React.CompositionEvent) => void;
  /** Safe key handler that respects composition state */
  createSafeKeyHandler: <T extends HTMLElement>(
    handler: (e: React.KeyboardEvent<T>) => void
  ) => (e: React.KeyboardEvent<T>) => void;
}

/**
 * Hook for handling IME (Input Method Editor) composition
 *
 * @example
 * ```tsx
 * const {
 *   isComposing,
 *   handleCompositionStart,
 *   handleCompositionUpdate,
 *   handleCompositionEnd,
 *   createSafeKeyHandler,
 * } = useIMEComposition();
 *
 * const handleKeyDown = createSafeKeyHandler((e) => {
 *   if (e.key === 'Enter') {
 *     // This won't fire during IME composition
 *     sendMessage();
 *   }
 * });
 *
 * return (
 *   <textarea
 *     onKeyDown={handleKeyDown}
 *     onCompositionStart={handleCompositionStart}
 *     onCompositionUpdate={handleCompositionUpdate}
 *     onCompositionEnd={handleCompositionEnd}
 *   />
 * );
 * ```
 */
export function useIMEComposition(options: UseIMECompositionOptions = {}): UseIMECompositionReturn {
  const { onCompositionStart, onCompositionUpdate, onCompositionEnd } = options;

  const [isComposing, setIsComposing] = useState(false);
  const [compositionText, setCompositionText] = useState('');

  // Use ref for immediate access in event handlers (state updates are async)
  const isComposingRef = useRef(false);

  const handleCompositionStart = useCallback(
    (_e: React.CompositionEvent) => {
      isComposingRef.current = true;
      setIsComposing(true);
      setCompositionText('');
      onCompositionStart?.();
    },
    [onCompositionStart]
  );

  const handleCompositionUpdate = useCallback(
    (e: React.CompositionEvent) => {
      setCompositionText(e.data || '');
      onCompositionUpdate?.(e.data || '');
    },
    [onCompositionUpdate]
  );

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent) => {
      const data = e.data || '';
      // Use requestAnimationFrame to ensure the final character is processed
      // before we mark composition as ended. This is important for some browsers
      // where the compositionend event fires before the input event.
      requestAnimationFrame(() => {
        isComposingRef.current = false;
        setIsComposing(false);
        setCompositionText('');
        onCompositionEnd?.(data);
      });
    },
    [onCompositionEnd]
  );

  /**
   * Creates a wrapped key handler that only fires when not composing
   * This prevents Enter key from submitting during IME character selection
   */
  const createSafeKeyHandler = useCallback(
    <T extends HTMLElement>(handler: (e: React.KeyboardEvent<T>) => void) => {
      return (e: React.KeyboardEvent<T>) => {
        // Skip all key handling during IME composition
        // Use ref for immediate check (state may be stale)
        if (isComposingRef.current) {
          return;
        }
        handler(e);
      };
    },
    []
  );

  return {
    isComposing,
    compositionText,
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
    createSafeKeyHandler,
  };
}
