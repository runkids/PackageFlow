/**
 * VirtualizedOutputList Component - Virtualized output list for large outputs
 * Uses @tanstack/react-virtual for efficient rendering
 */

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/utils';

const LINE_HEIGHT = 20;
// Threshold for switching to virtualized rendering
const VIRTUALIZATION_THRESHOLD = 200;

/**
 * Generic output line type - works with both OutputLine and WorkflowOutputLine
 */
interface GenericOutputLine {
  content: string;
  stream: 'stdout' | 'stderr' | 'system';
  nodeType?: string;
}

interface VirtualizedOutputListProps<T extends GenericOutputLine> {
  /** Output lines to display */
  lines: T[];
  /** Custom render function for each line */
  renderLine: (line: T, index: number) => React.ReactNode;
  /** Whether to auto-scroll to bottom */
  autoScroll?: boolean;
  /** Callback when user scrolls (to detect if at bottom) */
  onScrollChange?: (isAtBottom: boolean) => void;
  /** Additional className */
  className?: string;
  /** Empty state content */
  emptyState?: React.ReactNode;
}

/**
 * Virtualized output list for large outputs
 * Falls back to standard rendering for small outputs
 */
export function VirtualizedOutputList<T extends GenericOutputLine>({
  lines,
  renderLine,
  autoScroll = true,
  onScrollChange,
  className,
  emptyState,
}: VirtualizedOutputListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const useVirtualization = lines.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 30,
  });

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && containerRef.current && lines.length > 0) {
      if (useVirtualization) {
        virtualizer.scrollToIndex(lines.length - 1, { align: 'end' });
      } else {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
  }, [lines.length, autoScroll, useVirtualization, virtualizer]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (containerRef.current && onScrollChange) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      onScrollChange(isAtBottom);
    }
  }, [onScrollChange]);

  if (lines.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // Standard rendering for small outputs
  if (!useVirtualization) {
    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn('overflow-auto', className)}
      >
        <div className="font-mono text-xs leading-relaxed space-y-0.5">
          {lines.map((line, index) => (
            <div key={index}>{renderLine(line, index)}</div>
          ))}
        </div>
      </div>
    );
  }

  // Virtualized rendering for large outputs
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn('overflow-auto', className)}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const line = lines[virtualRow.index];
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
              {renderLine(line, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Standard output line styling based on stream type
 */
export function getOutputLineClassName(
  stream: 'stdout' | 'stderr' | 'system',
  content: string,
  nodeType?: string
): string {
  const isSystemMessage = stream === 'system';
  const isTriggerWorkflow = nodeType === 'trigger-workflow';

  return cn(
    'whitespace-pre-wrap break-all font-mono text-xs',
    // Base stream colors
    stream === 'stderr' && 'text-red-400',
    stream === 'stdout' && 'text-foreground',
    // System message styling with node type distinction
    isSystemMessage && !isTriggerWorkflow && 'text-blue-400 font-medium',
    isSystemMessage && isTriggerWorkflow && 'text-purple-400 font-medium',
    // Highlight starting messages
    isSystemMessage && (content.startsWith('>') || content.startsWith('>>')) && 'mt-3 pt-2 border-t border-border',
    // Status message styling
    isSystemMessage && content.startsWith('[OK]') && 'text-green-400',
    isSystemMessage && content.startsWith('[FAIL]') && 'text-red-400'
  );
}
