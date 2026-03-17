/**
 * MarkdownEditor
 * Markdown editor with Edit / Preview / Split modes.
 * Uses react-markdown for the preview rendering.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Pencil, Eye, Columns2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type EditorMode = 'edit' | 'preview' | 'split';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// ---------------------------------------------------------------------------
// Mode toggle button group
// ---------------------------------------------------------------------------

const MODE_BUTTONS: { mode: EditorMode; label: string; icon: typeof Pencil }[] = [
  { mode: 'edit', label: 'Edit', icon: Pencil },
  { mode: 'preview', label: 'Preview', icon: Eye },
  { mode: 'split', label: 'Split', icon: Columns2 },
];

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-md">
      {MODE_BUTTONS.map(({ mode: m, label, icon: Icon }) => (
        <button
          key={m}
          type="button"
          onClick={() => onModeChange(m)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all duration-150',
            mode === m
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={label}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Textarea pane
// ---------------------------------------------------------------------------

function EditPane({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab inserts 2 spaces instead of changing focus
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newValue);
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange]
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full h-full min-h-0 resize-none bg-transparent text-sm text-foreground',
        'font-mono leading-relaxed p-4',
        'placeholder:text-muted-foreground',
        'focus:outline-none',
        className
      )}
      placeholder="Write your spec body in Markdown..."
      spellCheck={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Preview pane
// ---------------------------------------------------------------------------

function PreviewPane({ value, className }: { value: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-invert max-w-none p-4',
        'prose-headings:text-foreground prose-p:text-foreground/90',
        'prose-a:text-blue-400 prose-code:text-pink-400',
        'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border',
        'prose-strong:text-foreground',
        className
      )}
    >
      {value.trim() ? (
        <ReactMarkdown>{value}</ReactMarkdown>
      ) : (
        <p className="text-muted-foreground italic">
          No content yet. Switch to Edit mode to start writing.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>('edit');

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
        <span className="text-xs text-muted-foreground font-medium">Body</span>
        <ModeToggle mode={mode} onModeChange={setMode} />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {mode === 'edit' && (
          <div className="h-full overflow-auto">
            <EditPane value={value} onChange={onChange} />
          </div>
        )}

        {mode === 'preview' && (
          <div className="h-full overflow-auto">
            <PreviewPane value={value} />
          </div>
        )}

        {mode === 'split' && (
          <div className="flex h-full divide-x divide-border">
            <div className="flex-1 overflow-auto">
              <EditPane value={value} onChange={onChange} />
            </div>
            <div className="flex-1 overflow-auto">
              <PreviewPane value={value} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
