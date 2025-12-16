/**
 * EmptyState - Unified empty state component for consistent UX across the app
 *
 * Design principles:
 * - Gradient icon badge for visual appeal
 * - Clear hierarchy: icon, title, description, actions
 * - Support for keyboard shortcuts hints
 * - Theme-aware styling (light/dark)
 * - Optional background pattern for full-page states
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

/**
 * Color variant configurations for different contexts
 */
const variantConfig = {
  blue: {
    gradient: 'from-blue-500/20 via-blue-600/10 to-purple-500/10',
    gradientDark: 'dark:from-blue-500/15 dark:via-blue-600/10 dark:to-purple-500/10',
    border: 'border-blue-500/20',
    shadow: 'shadow-blue-500/10',
    iconColor: 'text-blue-500 dark:text-blue-400',
  },
  purple: {
    gradient: 'from-purple-500/20 via-blue-500/15 to-cyan-500/10',
    gradientDark: 'dark:from-purple-500/30 dark:via-blue-500/20 dark:to-cyan-500/15',
    border: 'border-purple-500/20',
    shadow: 'shadow-purple-500/10',
    iconColor: 'text-purple-500 dark:text-purple-400',
  },
  cyan: {
    gradient: 'from-cyan-500/20 via-blue-500/10 to-purple-500/10',
    gradientDark: 'dark:from-cyan-500/15 dark:via-blue-500/10 dark:to-purple-500/10',
    border: 'border-cyan-500/20',
    shadow: 'shadow-cyan-500/10',
    iconColor: 'text-cyan-500 dark:text-cyan-400',
  },
  amber: {
    gradient: 'from-amber-500/20 via-orange-500/10 to-yellow-500/10',
    gradientDark: 'dark:from-amber-500/15 dark:via-orange-500/10 dark:to-yellow-500/10',
    border: 'border-amber-500/20',
    shadow: 'shadow-amber-500/10',
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  muted: {
    gradient: 'from-muted/80 via-muted/50 to-transparent',
    gradientDark: 'dark:from-muted/60 dark:via-muted/30 dark:to-transparent',
    border: 'border-border',
    shadow: 'shadow-black/5',
    iconColor: 'text-muted-foreground',
  },
} as const;

type EmptyStateVariant = keyof typeof variantConfig;

/**
 * Keyboard shortcut configuration
 */
interface KeyboardShortcut {
  key: string;
  label: string;
}

/**
 * Action button configuration
 */
interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: LucideIcon;
}

interface EmptyStateProps {
  /** Main icon to display */
  icon: LucideIcon;
  /** Optional decorative icon (e.g., sparkles) positioned at top-right of main icon */
  decorativeIcon?: LucideIcon;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Color variant */
  variant?: EmptyStateVariant;
  /** Primary action button */
  action?: EmptyStateAction;
  /** Secondary action button */
  secondaryAction?: EmptyStateAction;
  /** Keyboard shortcuts to display */
  shortcuts?: KeyboardShortcut[];
  /** Whether to show background dot pattern (for full-page states) */
  showBackgroundPattern?: boolean;
  /** Icon size variant */
  iconSize?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
  /** Children for custom content below description */
  children?: React.ReactNode;
}

/**
 * Background dot pattern SVG component
 */
function BackgroundPattern() {
  return (
    <div className="absolute inset-0 opacity-[0.15] dark:opacity-20 pointer-events-none">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="empty-state-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="1" className="fill-muted-foreground" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#empty-state-grid)" />
      </svg>
    </div>
  );
}

/**
 * Icon badge component with gradient background
 */
function IconBadge({
  icon: Icon,
  decorativeIcon: DecorativeIcon,
  variant,
  size,
}: {
  icon: LucideIcon;
  decorativeIcon?: LucideIcon;
  variant: EmptyStateVariant;
  size: 'sm' | 'md' | 'lg';
}) {
  const config = variantConfig[variant];

  const sizeClasses = {
    sm: {
      container: 'w-14 h-14 rounded-xl',
      icon: 'w-7 h-7',
      decorative: 'w-3 h-3 -top-0.5 -right-0.5',
    },
    md: {
      container: 'w-16 h-16 rounded-2xl',
      icon: 'w-8 h-8',
      decorative: 'w-3.5 h-3.5 -top-0.5 -right-0.5',
    },
    lg: {
      container: 'w-20 h-20 rounded-2xl',
      icon: 'w-10 h-10',
      decorative: 'w-4 h-4 -top-1 -right-1',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        sizes.container,
        'flex items-center justify-center',
        'bg-gradient-to-br',
        config.gradient,
        config.gradientDark,
        'border',
        config.border,
        'shadow-lg',
        config.shadow
      )}
    >
      <div className="relative">
        <Icon className={cn(sizes.icon, config.iconColor)} />
        {DecorativeIcon && (
          <DecorativeIcon
            className={cn(
              sizes.decorative,
              'absolute',
              'text-blue-500 dark:text-blue-400'
            )}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Keyboard shortcut display component
 */
function ShortcutHints({ shortcuts }: { shortcuts: KeyboardShortcut[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
      {shortcuts.map((shortcut, index) => (
        <span key={index} className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
            {shortcut.key}
          </kbd>
          <span>{shortcut.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Unified empty state component
 */
export function EmptyState({
  icon,
  decorativeIcon,
  title,
  description,
  variant = 'blue',
  action,
  secondaryAction,
  shortcuts,
  showBackgroundPattern = false,
  iconSize = 'lg',
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative w-full h-full',
        'flex flex-col items-center justify-center',
        'text-center',
        'bg-background',
        className
      )}
    >
      {/* Background pattern */}
      {showBackgroundPattern && <BackgroundPattern />}

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center max-w-md px-6">
        {/* Icon badge */}
        <div className="mb-6">
          <IconBadge
            icon={icon}
            decorativeIcon={decorativeIcon}
            variant={variant}
            size={iconSize}
          />
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          {description}
        </p>

        {/* Custom children content */}
        {children}

        {/* Action buttons */}
        {(action || secondaryAction) && (
          <div className="flex items-center gap-3 mb-6">
            {action && (
              <Button
                variant={action.variant || 'default'}
                onClick={action.onClick}
              >
                {action.icon && <action.icon className="w-4 h-4 mr-2" />}
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant={secondaryAction.variant || 'outline'}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.icon && (
                  <secondaryAction.icon className="w-4 h-4 mr-2" />
                )}
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}

        {/* Keyboard shortcuts */}
        {shortcuts && shortcuts.length > 0 && (
          <div className="mt-2">
            <ShortcutHints shortcuts={shortcuts} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact empty state for inline/smaller contexts
 */
interface CompactEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  variant?: EmptyStateVariant;
  className?: string;
}

export function CompactEmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'muted',
  className,
}: CompactEmptyStateProps) {
  const config = variantConfig[variant];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        'py-12 px-6 text-center',
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-14 h-14 rounded-2xl mb-4',
          'flex items-center justify-center',
          variant === 'muted' ? 'bg-muted/50' : 'bg-gradient-to-br',
          variant !== 'muted' && config.gradient,
          variant !== 'muted' && config.gradientDark,
          'border',
          config.border
        )}
      >
        <Icon className={cn('w-7 h-7', config.iconColor)} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>

      {/* Description */}
      {description && (
        <p className="mt-2 text-xs text-muted-foreground max-w-[200px] leading-relaxed">
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <Button
          variant={action.variant || 'default'}
          size="sm"
          onClick={action.onClick}
          className="mt-4"
        >
          {action.icon && <action.icon className="w-4 h-4 mr-1.5" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
