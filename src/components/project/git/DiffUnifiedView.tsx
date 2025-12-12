/**
 * DiffUnifiedView Component - Unified (inline) diff display
 * @see specs/010-git-diff-viewer/tasks.md - T014
 */

import { useRef, useEffect, useMemo } from 'react';
import { DiffHunk } from './DiffHunk';
import { VirtualizedDiffView } from './VirtualizedDiffView';
import type { FileDiff } from '../../../types/git';

// Threshold for switching to virtualized rendering (total lines)
const VIRTUALIZATION_THRESHOLD = 500;

interface DiffUnifiedViewProps {
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
 * Renders a unified (inline) diff view
 */
export function DiffUnifiedView({
  diff,
  focusedHunkIndex,
  onHunkFocus,
  showLineNumbers = true,
  language,
}: DiffUnifiedViewProps) {
  // Use provided language or fall back to auto-detected
  const effectiveLanguage = language || diff.language;
  const containerRef = useRef<HTMLDivElement>(null);

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
      const targetHunk = hunkElements[focusedHunkIndex];
      if (targetHunk) {
        targetHunk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  // Handle empty diff (no changes)
  if (diff.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No changes</p>
          <p className="text-sm mt-1">This file has no {diff.status === 'added' ? 'content' : 'changes'} to display</p>
        </div>
      </div>
    );
  }

  // Use virtualized view for large diffs (e.g., lockfiles)
  if (useVirtualization) {
    return (
      <VirtualizedDiffView
        diff={diff}
        focusedHunkIndex={focusedHunkIndex}
        onHunkFocus={onHunkFocus}
        showLineNumbers={showLineNumbers}
        language={effectiveLanguage}
      />
    );
  }

  // Standard rendering for smaller diffs
  return (
    <div ref={containerRef} className="overflow-auto h-full bg-background">
      {diff.hunks.map((hunk) => (
        <div key={hunk.index} data-hunk-index={hunk.index}>
          <DiffHunk
            hunk={hunk}
            isFocused={focusedHunkIndex === hunk.index}
            onClick={() => onHunkFocus?.(hunk.index)}
            showLineNumbers={showLineNumbers}
            language={effectiveLanguage}
          />
        </div>
      ))}
    </div>
  );
}
