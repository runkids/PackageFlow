/**
 * StreamingIndicator - Animated indicator for AI streaming responses
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { cn } from '../../lib/utils';

interface StreamingIndicatorProps {
  /** Visual variant */
  variant?: 'dots' | 'cursor';
  /** Size of the indicator */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
}

/**
 * Animated streaming indicator displayed while AI is generating response
 */
export function StreamingIndicator({
  variant = 'dots',
  size = 'md',
  className,
}: StreamingIndicatorProps) {
  if (variant === 'cursor') {
    return (
      <span
        className={cn(
          'inline-block animate-pulse',
          size === 'sm' ? 'w-1.5 h-3' : 'w-2 h-4',
          'bg-primary rounded-sm',
          className
        )}
        aria-hidden="true"
      />
    );
  }

  // Dots variant
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        'text-muted-foreground',
        className
      )}
      aria-label="AI is generating response"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'rounded-full bg-current animate-bounce',
            size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'
          )}
          style={{
            animationDelay: `${i * 150}ms`,
            animationDuration: '600ms',
          }}
        />
      ))}
    </span>
  );
}
