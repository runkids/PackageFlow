/**
 * Settings Panel Component
 * A slide-out panel for settings with categories and keyboard navigation
 * Desktop-optimized with smooth animations and keyboard shortcuts
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from './modalStack';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
  width?: 'sm' | 'md' | 'lg';
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  onOpenChange,
  children,
  title = 'Settings',
  width = 'md',
}) => {
  const modalId = React.useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  useEffect(() => {
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

  // Focus trap
  useEffect(() => {
    if (!open || !panelRef.current) return;

    const panel = panelRef.current;
    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    // Focus first element on open
    firstElement?.focus();

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [open]);

  const widthClasses = {
    sm: 'w-80',
    md: 'w-96',
    lg: 'w-[28rem]',
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
    >
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/40 backdrop-blur-sm',
          'animate-in fade-in-0 duration-200'
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed right-0 top-0 h-full',
          widthClasses[width],
          'bg-background border-l border-border',
          'shadow-2xl shadow-black/20',
          'flex flex-col',
          'animate-in slide-in-from-right duration-300'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2
            id="settings-panel-title"
            className="text-base font-semibold text-foreground"
          >
            {title}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className={cn(
              'p-1.5 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

/**
 * Settings Category - A collapsible section within the settings panel
 */
interface SettingsCategoryProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const SettingsCategory: React.FC<SettingsCategoryProps> = ({
  title,
  icon,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3',
          'text-left text-sm font-medium text-foreground',
          'hover:bg-accent/50 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
        aria-expanded={isOpen}
      >
        {icon && (
          <span className="w-5 h-5 text-muted-foreground shrink-0">
            {icon}
          </span>
        )}
        <span className="flex-1">{title}</span>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-90'
          )}
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Settings Item - A single setting row with label, description, and action
 */
interface SettingsItemProps {
  label: string;
  description?: string;
  shortcut?: string;
  children: React.ReactNode;
}

export const SettingsItem: React.FC<SettingsItemProps> = ({
  label,
  description,
  shortcut,
  children,
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-2 px-3',
        'rounded-lg hover:bg-accent/50 transition-colors',
        'group'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{label}</span>
          {shortcut && (
            <kbd
              className={cn(
                'hidden group-hover:inline-flex',
                'px-1.5 py-0.5 text-xs font-mono',
                'bg-muted text-muted-foreground rounded',
                'border border-border'
              )}
            >
              {shortcut}
            </kbd>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {children}
      </div>
    </div>
  );
};

/**
 * Settings Action Button - A clickable action within settings
 */
interface SettingsActionProps {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'destructive';
  shortcut?: string;
}

export const SettingsAction: React.FC<SettingsActionProps> = ({
  onClick,
  disabled = false,
  icon,
  children,
  variant = 'default',
  shortcut,
}) => {
  const variantClasses = {
    default: 'text-foreground hover:bg-accent',
    primary: 'text-primary hover:bg-primary/10',
    destructive: 'text-destructive hover:bg-destructive/10',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5',
        'rounded-lg text-sm text-left',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        variantClasses[variant],
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon && (
        <span className="w-4 h-4 shrink-0">{icon}</span>
      )}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <kbd
          className={cn(
            'px-1.5 py-0.5 text-xs font-mono',
            'bg-muted text-muted-foreground rounded',
            'border border-border'
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
};

/**
 * Settings Info - Display read-only information
 */
interface SettingsInfoProps {
  label: string;
  value: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

export const SettingsInfo: React.FC<SettingsInfoProps> = ({
  label,
  value,
  action,
}) => {
  return (
    <div className="px-3 py-2">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm text-foreground font-mono truncate">
          {value}
        </code>
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              'p-1 rounded',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            title={action.label}
          >
            {action.icon}
          </button>
        )}
      </div>
    </div>
  );
};
