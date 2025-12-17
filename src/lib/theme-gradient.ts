/**
 * R/E/W Gradient Theme Constants
 *
 * This file defines the consistent gradient color scheme used across settings panels.
 * The gradient represents the three permission levels:
 * - Blue (blue-500) - Read operations
 * - Amber (amber-500) - Execute operations
 * - Rose (rose-500) - Write operations
 *
 * Usage Guidelines:
 * - Use for progress indicators showing permission/tool coverage
 * - Use for decorative dividers between major sections
 * - Use for accent borders on header cards
 * - Use subtly to avoid overwhelming the UI
 */

/**
 * Base gradient class for horizontal gradients (left to right)
 */
export const GRADIENT_REW = 'bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500';

/**
 * Subtle version with reduced opacity - for backgrounds
 */
export const GRADIENT_REW_SUBTLE = 'bg-gradient-to-r from-blue-500/20 via-amber-500/20 to-rose-500/20';

/**
 * Very subtle version - for hover states or large areas
 */
export const GRADIENT_REW_GHOST = 'bg-gradient-to-r from-blue-500/10 via-amber-500/10 to-rose-500/10';

/**
 * Border gradient using CSS custom properties
 * Note: Tailwind doesn't support gradient borders directly,
 * so we use a pseudo-element approach for gradient borders
 */
export const GRADIENT_BORDER_CLASSES = {
  wrapper: 'relative',
  border: 'absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500',
  content: 'absolute inset-[1px] rounded-[11px] bg-background',
};

/**
 * Individual color classes for the R/E/W scheme
 */
export const REW_COLORS = {
  read: {
    base: 'blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    solid: 'bg-blue-500',
  },
  execute: {
    base: 'amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    solid: 'bg-amber-500',
  },
  write: {
    base: 'rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    solid: 'bg-rose-500',
  },
} as const;

/**
 * CSS variable definitions for use in inline styles
 */
export const GRADIENT_CSS = {
  value: 'linear-gradient(to right, #3b82f6, #f59e0b, #f43f5e)',
  valueSubtle: 'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(245, 158, 11, 0.2), rgba(244, 63, 94, 0.2))',
};
