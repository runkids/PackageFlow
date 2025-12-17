/**
 * GradientDivider Component
 *
 * A decorative divider using the R/E/W gradient color scheme.
 * Use sparingly to separate major sections while maintaining visual hierarchy.
 *
 * The gradient represents:
 * - Blue (blue-500) - Read operations
 * - Amber (amber-500) - Execute operations
 * - Rose (rose-500) - Write operations
 */

import React from 'react';
import { cn } from '../../lib/utils';

interface GradientDividerProps {
  /** Orientation of the divider */
  orientation?: 'horizontal' | 'vertical';
  /** Thickness variant */
  variant?: 'thin' | 'normal' | 'thick';
  /** Opacity level for subtlety */
  opacity?: 'full' | 'medium' | 'subtle';
  /** Additional class name */
  className?: string;
}

const thicknessStyles = {
  thin: {
    horizontal: 'h-px',
    vertical: 'w-px',
  },
  normal: {
    horizontal: 'h-0.5',
    vertical: 'w-0.5',
  },
  thick: {
    horizontal: 'h-1',
    vertical: 'w-1',
  },
};

const opacityStyles = {
  full: 'from-blue-500 via-amber-500 to-rose-500',
  medium: 'from-blue-500/60 via-amber-500/60 to-rose-500/60',
  subtle: 'from-blue-500/30 via-amber-500/30 to-rose-500/30',
};

export const GradientDivider: React.FC<GradientDividerProps> = ({
  orientation = 'horizontal',
  variant = 'thin',
  opacity = 'medium',
  className,
}) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'rounded-full',
        isHorizontal ? 'w-full' : 'h-full',
        thicknessStyles[variant][orientation],
        'bg-gradient-to-r',
        opacityStyles[opacity],
        className
      )}
    />
  );
};

/**
 * GradientAccent Component
 *
 * A small accent bar that can be placed at the top of cards or sections.
 * Provides a subtle visual indicator using the R/E/W gradient.
 */
interface GradientAccentProps {
  /** Width variant */
  width?: 'full' | 'partial';
  /** Additional class name */
  className?: string;
}

export const GradientAccent: React.FC<GradientAccentProps> = ({
  width = 'full',
  className,
}) => {
  return (
    <div
      className={cn(
        'h-0.5 rounded-full',
        'bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500',
        width === 'full' ? 'w-full' : 'w-16',
        className
      )}
    />
  );
};

export default GradientDivider;
