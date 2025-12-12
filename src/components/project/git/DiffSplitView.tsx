/**
 * DiffSplitView Component - Side-by-side diff display
 * @see specs/010-git-diff-viewer/tasks.md - T021
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { DiffSyntaxHighlighter } from './DiffSyntaxHighlighter';
import { VirtualizedSplitView } from './VirtualizedSplitView';
import type { FileDiff, DiffHunk as DiffHunkType, DiffLine } from '../../../types/git';

// Threshold for switching to virtualized rendering (total lines)
const VIRTUALIZATION_THRESHOLD = 500;

interface DiffSplitViewProps {
  /** The diff data to display */
  diff: FileDiff;
  /** Currently focused hunk index */
  focusedHunkIndex?: number | null;
  /** Handler for hunk focus changes */
  onHunkFocus?: (index: number) => void;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Language for syntax highlighting */
  language?: string;
}

interface SplitLine {
  oldLine?: DiffLine;
  newLine?: DiffLine;
  hunkIndex: number;
  lineIndex: number;
}

/**
 * Converts hunk lines to split view format
 */
function convertToSplitLines(hunks: DiffHunkType[]): SplitLine[] {
  const result: SplitLine[] = [];

  for (const hunk of hunks) {
    let lineIndex = 0;
    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];

    // Group consecutive deletions and additions
    for (const line of hunk.lines) {
      if (line.lineType === 'deletion') {
        deletions.push(line);
      } else if (line.lineType === 'addition') {
        additions.push(line);
      } else {
        // Context line - flush any pending deletions/additions first
        // Pair up deletions with additions
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
      <div className="flex bg-muted h-full">
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
    <div className={cn('flex font-mono text-sm leading-5', lineTypeStyles[line.lineType])}>
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
      <pre className="flex-1 overflow-x-auto whitespace-pre px-2">
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
 * Renders a side-by-side diff view
 */
export function DiffSplitView({
  diff,
  focusedHunkIndex,
  onHunkFocus,
  showLineNumbers = true,
  language,
}: DiffSplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const effectiveLanguage = language || diff.language;

  // Calculate total lines to determine if virtualization is needed
  const totalLines = useMemo(() => {
    return diff.hunks.reduce((acc, hunk) => acc + hunk.lines.length, 0);
  }, [diff.hunks]);

  const useVirtualization = totalLines > VIRTUALIZATION_THRESHOLD;

  // Scroll focused hunk into view (only for non-virtualized view)
  useEffect(() => {
    if (useVirtualization) return; // Virtualized view handles its own scrolling
    if (focusedHunkIndex !== null && focusedHunkIndex !== undefined && containerRef.current) {
      const hunkElements = containerRef.current.querySelectorAll('[data-hunk-index]');
      const uniqueHunks = new Set<string>();
      let targetElement: Element | null = null;

      hunkElements.forEach((el) => {
        const idx = el.getAttribute('data-hunk-index');
        if (idx && !uniqueHunks.has(idx)) {
          uniqueHunks.add(idx);
          if (idx === String(focusedHunkIndex) && !targetElement) {
            targetElement = el;
          }
        }
      });

      if (targetElement) {
        (targetElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [focusedHunkIndex, useVirtualization]);

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

  // Use virtualized view for large diffs (e.g., lockfiles)
  if (useVirtualization) {
    return (
      <VirtualizedSplitView
        diff={diff}
        focusedHunkIndex={focusedHunkIndex}
        onHunkFocus={onHunkFocus}
        showLineNumbers={showLineNumbers}
        language={effectiveLanguage}
      />
    );
  }

  const splitLines = convertToSplitLines(diff.hunks);

  // Group lines by hunk for rendering headers
  const renderContent = () => {
    const elements: React.ReactElement[] = [];
    let currentHunkIndex = -1;

    for (let i = 0; i < splitLines.length; i++) {
      const splitLine = splitLines[i];

      // Render hunk header when entering a new hunk
      if (splitLine.hunkIndex !== currentHunkIndex) {
        currentHunkIndex = splitLine.hunkIndex;
        const hunk = diff.hunks[currentHunkIndex];
        // Show only the context (function name, etc.) if available
        const hunkHeader = hunk.header ? hunk.header : `Changes at line ${hunk.oldStart}`;

        elements.push(
          <div
            key={`header-${currentHunkIndex}`}
            data-hunk-index={currentHunkIndex}
            className={cn(
              'bg-blue-900/20 text-blue-400 font-mono text-sm px-4 py-1.5 sticky top-0 z-10 border-b border-border',
              focusedHunkIndex === currentHunkIndex && 'ring-2 ring-blue-500 ring-inset'
            )}
            onClick={() => onHunkFocus?.(currentHunkIndex)}
          >
            <span className="select-all">{hunkHeader}</span>
          </div>
        );
      }

      // Render split line
      elements.push(
        <div
          key={`line-${splitLine.hunkIndex}-${splitLine.lineIndex}`}
          data-hunk-index={splitLine.hunkIndex}
          className="flex border-b border-card last:border-b-0"
        >
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
      );
    }

    return elements;
  };

  return (
    <div ref={containerRef} className="overflow-auto h-full bg-background">
      {renderContent()}
    </div>
  );
}
