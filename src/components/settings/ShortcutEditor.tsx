/**
 * Shortcut Editor Component
 * Allows recording and editing a single keyboard shortcut
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, AlertTriangle, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatShortcutKey, type KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';
import {
  parseKeyboardEvent,
  isValidShortcut,
  detectConflicts,
  type ConflictResult,
} from '../../lib/shortcut-utils';

interface ShortcutEditorProps {
  /** The shortcut being edited */
  shortcut: KeyboardShortcut;
  /** Current custom key (null = using default) */
  customKey: string | null;
  /** Whether the shortcut is enabled */
  enabled: boolean;
  /** All shortcuts for conflict detection */
  allShortcuts: KeyboardShortcut[];
  /** Callback when shortcut is updated */
  onUpdate: (customKey: string | null, enabled: boolean) => void;
  /** Callback when shortcut is reset to default */
  onReset: () => void;
}

export function ShortcutEditor({
  shortcut,
  customKey,
  enabled,
  allShortcuts,
  onUpdate,
  onReset,
}: ShortcutEditorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKey, setRecordedKey] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveKey = customKey || shortcut.key;
  const hasCustomKey = customKey !== null && customKey !== shortcut.key;

  // Handle keyboard recording
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const key = parseKeyboardEvent(e);

      // Ignore if only modifiers pressed
      if (!key || ['cmd', 'ctrl', 'alt', 'shift'].includes(key)) {
        return;
      }

      // Escape to cancel
      if (e.key === 'Escape') {
        setIsRecording(false);
        setRecordedKey(null);
        setConflict(null);
        return;
      }

      // Validate the shortcut
      if (!isValidShortcut(key)) {
        return;
      }

      // Check for conflicts
      const conflictResult = detectConflicts(key, allShortcuts, shortcut.id);
      setConflict(conflictResult);
      setRecordedKey(key);
    },
    [isRecording, allShortcuts, shortcut.id]
  );

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);

  const startRecording = () => {
    setIsRecording(true);
    setRecordedKey(null);
    setConflict(null);
    inputRef.current?.focus();
  };

  const cancelRecording = () => {
    setIsRecording(false);
    setRecordedKey(null);
    setConflict(null);
  };

  const confirmRecording = () => {
    if (recordedKey && !conflict?.hasConflict) {
      // If recorded key is same as default, set to null (use default)
      onUpdate(recordedKey === shortcut.key ? null : recordedKey, enabled);
      setIsRecording(false);
      setRecordedKey(null);
      setConflict(null);
    }
  };

  const handleToggleEnabled = () => {
    onUpdate(customKey, !enabled);
  };

  const handleReset = () => {
    onReset();
    setRecordedKey(null);
    setConflict(null);
  };

  return (
    <div className="relative flex items-center py-2.5 px-4 rounded-lg hover:bg-accent transition-colors group">
      {/* Description - fixed width for alignment */}
      <div className="flex-1 min-w-0 pr-4">
        <span className={cn('text-sm', enabled ? 'text-foreground' : 'text-muted-foreground')}>
          {shortcut.description}
        </span>
      </div>

      {/* Shortcut key display/editor - fixed width container */}
      <div className="w-[120px] flex items-center justify-end gap-1.5">
        {isRecording ? (
          <>
            <div
              ref={inputRef as React.RefObject<HTMLDivElement>}
              className={cn(
                'px-2.5 py-1 w-[80px] text-center bg-background border rounded text-xs font-mono',
                conflict?.hasConflict
                  ? 'border-red-500 text-red-400'
                  : recordedKey
                  ? 'border-green-500 text-green-400'
                  : 'border-blue-500 text-blue-400 animate-pulse'
              )}
              tabIndex={0}
            >
              {recordedKey ? formatShortcutKey(recordedKey) : 'Press...'}
            </div>
            {recordedKey && (
              <button
                onClick={confirmRecording}
                disabled={conflict?.hasConflict}
                className={cn(
                  'p-1 rounded transition-colors',
                  conflict?.hasConflict
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-green-400 hover:bg-green-500/20'
                )}
                title="Confirm"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={cancelRecording}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startRecording}
              disabled={!enabled}
              className={cn(
                'px-2.5 py-1 bg-card border border-border rounded text-xs font-mono transition-colors w-[80px] text-center',
                enabled
                  ? 'text-foreground hover:bg-accent hover:border-border cursor-pointer'
                  : 'text-muted-foreground cursor-not-allowed'
              )}
              title="Click to change shortcut"
            >
              {formatShortcutKey(effectiveKey)}
            </button>
            {/* Custom indicator */}
            {hasCustomKey && (
              <button
                onClick={handleReset}
                className="p-1 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                title={`Reset to default (${formatShortcutKey(shortcut.key)})`}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Toggle switch - fixed position */}
      <div className="w-12 flex justify-end ml-3">
        <button
          onClick={handleToggleEnabled}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200',
            enabled ? 'bg-blue-500' : 'bg-muted'
          )}
          title={enabled ? 'Disable shortcut' : 'Enable shortcut'}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
              enabled ? 'translate-x-4' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {/* Conflict warning */}
      {conflict?.hasConflict && (
        <div className="absolute left-0 right-0 top-full mt-1 mx-4 z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 border border-red-500/50 rounded text-xs text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {conflict.isSystemReserved
                ? 'This shortcut is reserved by the system'
                : `Conflicts with "${conflict.conflictsWith?.description}"`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
