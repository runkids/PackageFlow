import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary action - blue theme with translucent style
        default:
          'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 hover:text-blue-300 active:bg-blue-600/40 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-500/30 dark:hover:bg-blue-600/30',
        // Destructive action - red theme
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500',
        // Success action - green theme with translucent style
        success:
          'bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 hover:text-green-300 active:bg-green-600/40 dark:bg-green-600/20 dark:text-green-400 dark:border-green-500/30 dark:hover:bg-green-600/30',
        // Warning action - amber theme
        warning:
          'bg-amber-500 text-white shadow-sm hover:bg-amber-400 active:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400',
        // Info action - blue theme (lighter than primary)
        info: 'bg-blue-500 text-white shadow-sm hover:bg-blue-400 active:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400',
        // Outline variants
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
        'outline-destructive':
          'border border-red-500/50 bg-transparent text-red-600 hover:bg-red-500/10 hover:text-red-700 active:bg-red-500/20 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300',
        'outline-success':
          'border border-green-500/50 bg-transparent text-green-600 hover:bg-green-500/10 hover:text-green-700 active:bg-green-500/20 dark:border-green-500/30 dark:text-green-400 dark:hover:bg-green-500/10 dark:hover:text-green-300',
        'outline-warning':
          'border border-amber-500/50 bg-transparent text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 active:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-300',
        'outline-info':
          'border border-blue-500/50 bg-transparent text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 active:bg-blue-500/20 dark:border-blue-500/30 dark:text-blue-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-300',
        // Secondary action
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:bg-secondary/70',
        // Ghost - minimal style
        ghost:
          'hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
        // Link style
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
