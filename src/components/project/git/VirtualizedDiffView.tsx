/**
 * VirtualizedDiffView Component - Virtualized diff display for large files
 * Uses @tanstack/react-virtual for efficient rendering of large diffs (lockfiles, etc.)
 */

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../../lib/utils';
import { DiffSyntaxHighlighter } from './DiffSyntaxHighlighter';
import type { FileDiff, DiffLine as DiffLineType, DiffHunk } from '../../../types/git';

interface VirtualizedDiffViewProps {
  /** The diff data to display */
  diff: FileDiff;
  /** Currently focused hunk index */
  focusedHunkIndex?: number | null;
  /** Handler for hunk focus changes */
  onHunkFocus?: (index: number) => void;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Language for syntax highlighting (overrides auto-detected) */
  language?: string;
}

/**
 * Flattened row type for virtualization
 */
type FlattenedRow =
  | { type: 'hunk-header'; hunkIndex: number; header: string; oldStart: number }
  | { type: 'line'; hunkIndex: number; line: DiffLineType };

/**
 * Flatten hunks into a single array for virtualization
 */
function flattenDiff(hunks: DiffHunk[]): FlattenedRow[] {
  const rows: FlattenedRow[] = [];

  for (const hunk of hunks) {
    // Add hunk header
    rows.push({
      type: 'hunk-header',
      hunkIndex: hunk.index,
      header: hunk.header || `Changes at line ${hunk.oldStart}`,
      oldStart: hunk.oldStart,
    });

    // Add lines
    for (const line of hunk.lines) {
      rows.push({
        type: 'line',
        hunkIndex: hunk.index,
        line,
      });
    }
  }

  return rows;
}

/**
 * Get the starting row index for a hunk
 */
function getHunkStartIndex(hunks: DiffHunk[], hunkIndex: number): number {
  let index = 0;
  for (let i = 0; i < hunkIndex && i < hunks.length; i++) {
    index += 1 + hunks[i].lines.length; // +1 for header
  }
  return index;
}

const LINE_HEIGHT = 20; // Height in pixels for each row
const HEADER_HEIGHT = 28; // Slightly taller for hunk headers

/**
 * Virtualized diff line component (inline to avoid prop changes)
 */
function VirtualizedDiffLine({
  line,
  showLineNumbers,
  language,
}: {
  line: DiffLineType;
  showLineNumbers: boolean;
  language?: string;
}) {
  const lineTypeStyles = {
    addition: 'bg-green-900/20',
    deletion: 'bg-red-900/20',
    context: 'bg-transparent',
  };

  const lineTypeGutterStyles = {
    addition: 'bg-green-900/30 text-green-400',
    deletion: 'bg-red-900/30 text-red-400',
    context: 'bg-card text-muted-foreground',
  };

  const lineTypePrefix = {
    addition: '+',
    deletion: '-',
    context: ' ',
  };

  return (
    <div
      className={cn(
        'flex font-mono text-sm leading-5 hover:bg-white/5',
        lineTypeStyles[line.lineType]
      )}
      style={{ height: LINE_HEIGHT }}
    >
      {showLineNumbers && (
        <>
          <span
            className={cn(
              'flex-shrink-0 select-none text-right px-2 border-r border-border w-12',
              lineTypeGutterStyles[line.lineType]
            )}
          >
            {line.oldLineNumber ?? ''}
          </span>
          <span
            className={cn(
              'flex-shrink-0 select-none text-right px-2 border-r border-border w-12',
              lineTypeGutterStyles[line.lineType]
            )}
          >
            {line.newLineNumber ?? ''}
          </span>
        </>
      )}
      <span
        className={cn(
          'flex-shrink-0 w-5 text-center select-none',
          line.lineType === 'addition' && 'text-green-400',
          line.lineType === 'deletion' && 'text-red-400',
          line.lineType === 'context' && 'text-muted-foreground'
        )}
      >
        {lineTypePrefix[line.lineType]}
      </span>
      <pre className="flex-1 overflow-x-auto whitespace-pre px-2 truncate">
        <code className="text-foreground">
          {language ? (
            <DiffSyntaxHighlighter content={line.content} language={language} />
          ) : (
            line.content
          )}
        </code>
      </pre>
    </div>
  );
}

/**
 * Renders a virtualized unified diff view for large files
 */
export function VirtualizedDiffView({
  diff,
  focusedHunkIndex,
  onHunkFocus,
  showLineNumbers = true,
  language,
}: VirtualizedDiffViewProps) {
  const effectiveLanguage = language || diff.language;
  const containerRef = useRef<HTMLDivElement>(null);

  // Flatten hunks for virtualization
  const flattenedRows = useMemo(() => flattenDiff(diff.hunks), [diff.hunks]);

  // Estimate row heights
  const estimateSize = useCallback((index: number) => {
    const row = flattenedRows[index];
    return row.type === 'hunk-header' ? HEADER_HEIGHT : LINE_HEIGHT;
  }, [flattenedRows]);

  const virtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan: 20, // Render extra rows for smoother scrolling
  });

  // Scroll to focused hunk
  useEffect(() => {
    if (focusedHunkIndex !== null && focusedHunkIndex !== undefined) {
      const startIndex = getHunkStartIndex(diff.hunks, focusedHunkIndex);
      virtualizer.scrollToIndex(startIndex, { align: 'start', behavior: 'smooth' });
    }
  }, [focusedHunkIndex, diff.hunks, virtualizer]);

  // Handle binary files
  if (diff.isBinary) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">Binary file</p>
          <p className="text-sm mt-1">Cannot display diff for binary files</p>
        </div>
      </div>
    );
  }

  // Handle empty diff
  if (diff.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No changes</p>
          <p className="text-sm mt-1">
            This file has no {diff.status === 'added' ? 'content' : 'changes'} to display
          </p>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      className="overflow-auto h-full bg-background"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const row = flattenedRows[virtualRow.index];

          if (row.type === 'hunk-header') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={cn(
                    'bg-blue-900/20 text-blue-400 font-mono text-sm px-4 py-1.5 border-b border-border cursor-pointer',
                    focusedHunkIndex === row.hunkIndex && 'ring-2 ring-blue-500 ring-inset'
                  )}
                  style={{ height: HEADER_HEIGHT }}
                  onClick={() => onHunkFocus?.(row.hunkIndex)}
                >
                  <span className="select-all">{row.header}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <VirtualizedDiffLine
                line={row.line}
                showLineNumbers={showLineNumbers}
                language={effectiveLanguage}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
