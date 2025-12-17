import * as React from 'react';
import { cn } from '../../lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  /**
   * Visual variant for the progress bar
   * - default: solid primary color
   * - gradient: R/E/W gradient (blue -> amber -> rose)
   */
  variant?: 'default' | 'gradient';
}

/**
 * Progress bar variant styles
 * The gradient variant uses the R/E/W color scheme:
 * - Blue (blue-500) - Read operations
 * - Amber (amber-500) - Execute operations
 * - Rose (rose-500) - Write operations
 */
const progressVariants = {
  default: 'bg-primary',
  gradient: 'bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500',
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, variant = 'default', ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-muted',
          className
        )}
        {...props}
      >
        <div
          className={cn(
            'h-full transition-all duration-300 ease-in-out',
            progressVariants[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = 'Progress';

export { Progress };
