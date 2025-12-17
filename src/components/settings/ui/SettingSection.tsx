/**
 * Setting Section Component
 * Container for grouping related settings with optional title and description
 *
 * Icon sizes follow project convention:
 * - Section icon: w-4 h-4 (standard for section-level elements)
 *
 * Supports optional gradient accent using the R/E/W color scheme:
 * - Blue (blue-500) - Read operations
 * - Amber (amber-500) - Execute operations
 * - Rose (rose-500) - Write operations
 */

import React from 'react';
import { cn } from '../../../lib/utils';

interface SettingSectionProps {
  /** Section title */
  title?: string;
  /** Optional description below title */
  description?: string;
  /** Optional icon (should be w-4 h-4) */
  icon?: React.ReactNode;
  /** Section content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Optional gradient accent bar above the section */
  gradientAccent?: boolean;
}

export const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  description,
  icon,
  children,
  className,
  gradientAccent = false,
}) => {
  return (
    <section className={cn('space-y-3', className)}>
      {/* Optional gradient accent bar */}
      {gradientAccent && (
        <div className="h-0.5 w-16 rounded-full bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500 opacity-60" />
      )}

      {/* Section Header */}
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              {icon && (
                <span className="text-muted-foreground flex-shrink-0">
                  {icon}
                </span>
              )}
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {/* Section Content */}
      <div className="space-y-2">{children}</div>
    </section>
  );
};
