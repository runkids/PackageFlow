/**
 * Dialog Components
 * Unified dialog system matching ConfirmDialog styling
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from './modalStack';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  const modalId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onOpenChange(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, onOpenChange, open]);

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
};

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative w-full max-w-lg p-6',
          'bg-background rounded-xl',
          'border border-border',
          'shadow-2xl shadow-black/50',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          'slide-in-from-bottom-4',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DialogContent.displayName = 'DialogContent';

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const DialogHeader: React.FC<DialogHeaderProps> = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const DialogTitle: React.FC<DialogTitleProps> = ({ className, ...props }) => (
  <h3
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-foreground',
      className
    )}
    {...props}
  />
);

interface DialogCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DialogClose: React.FC<DialogCloseProps> = ({ className, ...props }) => (
  <button
    className={cn(
      'absolute right-4 top-4',
      'p-1.5 rounded-lg',
      'text-muted-foreground hover:text-foreground',
      'hover:bg-accent',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-ring',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </button>
);

/**
 * Footer component for dialog action buttons
 * Provides consistent styling for button areas
 */
interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const DialogFooter: React.FC<DialogFooterProps> = ({ className, ...props }) => (
  <div
    className={cn(
      'flex items-center justify-end gap-3',
      'pt-4 mt-4',
      'border-t border-border',
      className
    )}
    {...props}
  />
);

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
};
