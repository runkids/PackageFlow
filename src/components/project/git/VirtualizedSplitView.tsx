/**
 * VirtualizedSplitView Component - Virtualized side-by-side diff display for large files
 * Uses @tanstack/react-virtual for efficient rendering of large diffs (lockfiles, etc.)
 */

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../../lib/utils';
import { DiffSyntaxHighlighter } from './DiffSyntaxHighlighter';
import type { FileDiff, DiffHunk as DiffHunkType, DiffLine } from '../../../types/git';

interface VirtualizedSplitViewProps {
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

interface SplitLine {
  oldLine?: DiffLine;
  newLine?: DiffLine;
  hunkIndex: number;
  lineIndex: number;
}

/**
 * Flattened row type for virtualization
 */
type FlattenedSplitRow =
  | { type: 'hunk-header'; hunkIndex: number; header: string; oldStart: number }
  | { type: 'split-line'; hunkIndex: number; splitLine: SplitLine };

/**
 * Converts hunk lines to split view format
 */
function convertToSplitLines(hunks: DiffHunkType[]): SplitLine[] {
  const result: SplitLine[] = [];

  for (const hunk of hunks) {
    let lineIndex = 0;
    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];

    for (const line of hunk.lines) {
      if (line.lineType === 'deletion') {
        deletions.push(line);
      } else if (line.lineType === 'addition') {
        additions.push(line);
      } else {
        // Context line - flush any pending deletions/additions first
        const maxLen = Math.max(deletions.length, additions.length);
        for (let i = 0; i < maxLen; i++) {
          result.push({
            oldLine: deletions[i],
            newLine: additions[i],
            hunkIndex: hunk.index,
            lineIndex: lineIndex++,
          });
        }
        deletions.length = 0;
        additions.length = 0;

        // Add context line to both sides
        result.push({
          oldLine: line,
          newLine: line,
          hunkIndex: hunk.index,
          lineIndex: lineIndex++,
        });
      }
    }

    // Flush remaining deletions/additions
    const maxLen = Math.max(deletions.length, additions.length);
    for (let i = 0; i < maxLen; i++) {
      result.push({
        oldLine: deletions[i],
        newLine: additions[i],
        hunkIndex: hunk.index,
        lineIndex: lineIndex++,
      });
    }
  }

  return result;
}

/**
 * Flatten split lines into rows for virtualization (with headers)
 */
function flattenSplitDiff(hunks: DiffHunkType[], splitLines: SplitLine[]): FlattenedSplitRow[] {
  const rows: FlattenedSplitRow[] = [];
  let currentHunkIndex = -1;

  for (const splitLine of splitLines) {
    // Add hunk header when entering a new hunk
    if (splitLine.hunkIndex !== currentHunkIndex) {
      currentHunkIndex = splitLine.hunkIndex;
      const hunk = hunks[currentHunkIndex];
      rows.push({
        type: 'hunk-header',
        hunkIndex: currentHunkIndex,
        header: hunk.header || `Changes at line ${hunk.oldStart}`,
        oldStart: hunk.oldStart,
      });
    }

    rows.push({
      type: 'split-line',
      hunkIndex: splitLine.hunkIndex,
      splitLine,
    });
  }

  return rows;
}

/**
 * Get the starting row index for a hunk
 */
function getHunkStartIndex(flattenedRows: FlattenedSplitRow[], hunkIndex: number): number {
  for (let i = 0; i < flattenedRows.length; i++) {
    const row = flattenedRows[i];
    if (row.type === 'hunk-header' && row.hunkIndex === hunkIndex) {
      return i;
    }
  }
  return 0;
}

const LINE_HEIGHT = 20;
const HEADER_HEIGHT = 28;

/**
 * Single line in split view
 */
function SplitLineRow({
  line,
  side,
  showLineNumbers,
  language,
}: {
  line?: DiffLine;
  side: 'old' | 'new';
  showLineNumbers: boolean;
  language?: string;
}) {
  if (!line) {
    return (
      <div className="flex bg-muted h-full" style={{ height: LINE_HEIGHT }}>
        {showLineNumbers && (
          <span className="w-12 flex-shrink-0 select-none text-right px-2 border-r border-border bg-card text-muted-foreground" />
        )}
        <span className="w-5 flex-shrink-0 text-center select-none text-muted-foreground" />
        <pre className="flex-1 px-2" />
      </div>
    );
  }

  const lineTypeStyles = {
    addition: 'bg-green-900/20',
    deletion: 'bg-red-900/20',
    context: 'bg-transparent',
  };

  const gutterStyles = {
    addition: 'bg-green-900/30 text-green-400',
    deletion: 'bg-red-900/30 text-red-400',
    context: 'bg-card text-muted-foreground',
  };

  const prefixStyles = {
    addition: 'text-green-400',
    deletion: 'text-red-400',
    context: 'text-muted-foreground',
  };

  const prefix = {
    addition: '+',
    deletion: '-',
    context: ' ',
  };

  const lineNumber = side === 'old' ? line.oldLineNumber : line.newLineNumber;

  return (
    <div
      className={cn('flex font-mono text-sm leading-5', lineTypeStyles[line.lineType])}
      style={{ height: LINE_HEIGHT }}
    >
      {showLineNumbers && (
        <span
          className={cn(
            'w-12 flex-shrink-0 select-none text-right px-2 border-r border-border',
            gutterStyles[line.lineType]
          )}
        >
          {lineNumber ?? ''}
        </span>
      )}
      <span className={cn('w-5 flex-shrink-0 text-center select-none', prefixStyles[line.lineType])}>
        {prefix[line.lineType]}
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
 * Renders a virtualized side-by-side diff view for large files
 */
export function VirtualizedSplitView({
  diff,
  focusedHunkIndex,
  onHunkFocus,
  showLineNumbers = true,
  language,
}: VirtualizedSplitViewProps) {
  const effectiveLanguage = language || diff.language;
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert to split lines and flatten for virtualization
  const splitLines = useMemo(() => convertToSplitLines(diff.hunks), [diff.hunks]);
  const flattenedRows = useMemo(
    () => flattenSplitDiff(diff.hunks, splitLines),
    [diff.hunks, splitLines]
  );

  // Estimate row heights
  const estimateSize = useCallback(
    (index: number) => {
      const row = flattenedRows[index];
      return row.type === 'hunk-header' ? HEADER_HEIGHT : LINE_HEIGHT;
    },
    [flattenedRows]
  );

  const virtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan: 20,
  });

  // Scroll to focused hunk
  useEffect(() => {
    if (focusedHunkIndex !== null && focusedHunkIndex !== undefined) {
      const startIndex = getHunkStartIndex(flattenedRows, focusedHunkIndex);
      virtualizer.scrollToIndex(startIndex, { align: 'start', behavior: 'smooth' });
    }
  }, [focusedHunkIndex, flattenedRows, virtualizer]);

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
    <div ref={containerRef} className="overflow-auto h-full bg-background">
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

          const { splitLine } = row;

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
              <div className="flex border-b border-card">
                {/* Old (left) side */}
                <div className="flex-1 border-r border-border min-w-0">
                  <SplitLineRow
                    line={splitLine.oldLine}
                    side="old"
                    showLineNumbers={showLineNumbers}
                    language={effectiveLanguage}
                  />
                </div>
                {/* New (right) side */}
                <div className="flex-1 min-w-0">
                  <SplitLineRow
                    line={splitLine.newLine}
                    side="new"
                    showLineNumbers={showLineNumbers}
                    language={effectiveLanguage}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
