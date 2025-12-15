/**
 * Confirmation dialog component for user confirmation actions.
 *
 * @example
 * <ConfirmDialog
 *   open={showDeleteDialog}
 *   onOpenChange={setShowDeleteDialog}
 *   variant="destructive"
 *   title="Delete Workflow"
 *   description="Are you sure you want to delete this workflow? This action cannot be undone."
 *   itemName="My Workflow"
 *   confirmText="Delete"
 *   onConfirm={handleDelete}
 * />
 */

import * as React from 'react';
import { AlertTriangle, Trash2, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from './modalStack';

type DialogVariant = 'destructive' | 'warning' | 'info' | 'default';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: DialogVariant;
  title: string;
  description: string;
  itemName?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

const variantConfig: Record<
  DialogVariant,
  {
    icon: typeof AlertTriangle;
    iconBgClass: string;
    iconClass: string;
    confirmButtonClass: string;
    accentColor: string;
  }
> = {
  destructive: {
    icon: Trash2,
    iconBgClass: 'bg-red-500/10',
    iconClass: 'text-red-400',
    confirmButtonClass:
      'bg-red-600 hover:bg-red-500 focus:ring-red-500/50 text-white shadow-lg shadow-red-500/20',
    accentColor: 'border-red-500/20',
  },
  warning: {
    icon: AlertTriangle,
    iconBgClass: 'bg-amber-500/10',
    iconClass: 'text-amber-400',
    confirmButtonClass:
      'bg-amber-600 hover:bg-amber-500 focus:ring-amber-500/50 text-white shadow-lg shadow-amber-500/20',
    accentColor: 'border-amber-500/20',
  },
  info: {
    icon: Info,
    iconBgClass: 'bg-blue-500/10',
    iconClass: 'text-blue-400',
    confirmButtonClass:
      'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 focus:ring-blue-500/50',
    accentColor: 'border-blue-500/20',
  },
  default: {
    icon: AlertCircle,
    iconBgClass: 'bg-muted/10',
    iconClass: 'text-muted-foreground',
    confirmButtonClass:
      'bg-secondary hover:bg-accent focus:ring-ring/50 text-foreground shadow-lg shadow-muted/20',
    accentColor: 'border-border',
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  variant = 'default',
  title,
  description,
  itemName,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const modalId = React.useId();
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  const config = variantConfig[variant];
  const IconComponent = config.icon;

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

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'animate-in fade-in-0 duration-200'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-md',
            'bg-background rounded-xl',
            'border',
            config.accentColor,
            'shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => !isLoading && onOpenChange(false)}
            disabled={isLoading}
            className={cn(
              'absolute right-3 top-3',
              'p-1.5 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-6">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-full',
                  'flex items-center justify-center',
                  config.iconBgClass
                )}
              >
                <IconComponent className={cn('w-6 h-6', config.iconClass)} />
              </div>

              <div className="flex-1 min-w-0">
                <h2
                  id="confirm-dialog-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  {title}
                </h2>
                <p
                  id="confirm-dialog-description"
                  className="mt-2 text-sm text-muted-foreground leading-relaxed"
                >
                  {description}
                  {itemName && (
                    <>
                      {' '}
                      <span className="font-medium text-foreground">
                        "{itemName}"
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-card rounded-b-xl border-t border-border">
            <div className="flex items-center justify-end gap-3">
              <button
                ref={cancelButtonRef}
                onClick={() => !isLoading && onOpenChange(false)}
                disabled={isLoading}
                className={cn(
                  'px-4 py-2 rounded-lg',
                  'text-sm font-medium',
                  'text-foreground bg-secondary',
                  'border border-border',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  'transition-all duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {cancelText}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={handleConfirm}
                disabled={isLoading}
                className={cn(
                  'px-4 py-2 rounded-lg',
                  'text-sm font-medium',
                  'focus:outline-none focus:ring-2',
                  'transition-all duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  config.confirmButtonClass
                )}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType?: string;
  itemName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemType = 'item',
  itemName,
  onConfirm,
  isLoading = false,
}: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="destructive"
      title={`Delete ${itemType}`}
      description={`Are you sure you want to delete this ${itemType}? This action cannot be undone.`}
      itemName={itemName}
      confirmText="Delete"
      cancelText="Cancel"
      onConfirm={onConfirm}
      isLoading={isLoading}
    />
  );
}
