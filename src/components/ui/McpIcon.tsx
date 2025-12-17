import React, { useId } from 'react';
import { cn } from '../../lib/utils';

// R/E/W gradient colors (blue -> amber -> rose)
const REW_GRADIENT_COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'] as const;

interface McpIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  /** Enable gradient fill */
  gradient?: boolean;
  /** Use R/E/W theme gradient (blue -> amber -> rose) */
  rewGradient?: boolean;
  /** Custom gradient colors [start, middle?, end] - supports 2 or 3 colors */
  gradientColors?: string[];
}

export const McpIcon: React.FC<McpIconProps> = ({
  className,
  gradient = false,
  rewGradient = false,
  gradientColors,
  ...props
}) => {
  const gradientId = useId();
  const useGradient = gradient || rewGradient;

  // Determine colors: rewGradient > gradientColors > default
  const colors = rewGradient
    ? REW_GRADIENT_COLORS
    : gradientColors ?? ['#22c55e', '#3b82f6'];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill={useGradient ? `url(#${gradientId})` : 'currentColor'}
      fillRule="evenodd"
      viewBox="0 0 24 24"
      className={cn('w-4 h-4', className)}
      {...props}
    >
      {useGradient && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {colors.length === 2 ? (
              <>
                <stop offset="0%" stopColor={colors[0]} />
                <stop offset="100%" stopColor={colors[1]} />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor={colors[0]} />
                <stop offset="50%" stopColor={colors[1]} />
                <stop offset="100%" stopColor={colors[2]} />
              </>
            )}
          </linearGradient>
        </defs>
      )}
      <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"/>
      <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"/>
    </svg>
  );
};
