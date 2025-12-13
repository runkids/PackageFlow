/**
 * Dropdown Menu Component
 * A simple dropdown menu for actions
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'left',
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] bg-card border border-border rounded-lg shadow-lg py-1',
            'animate-in fade-in-0 zoom-in-95',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
};

interface DropdownItemProps {
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  onClick,
  disabled,
  destructive,
  children,
  icon,
  className,
}) => {
  return (
    <button
      className={cn(
        'w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors',
        disabled
          ? 'text-muted-foreground cursor-not-allowed'
          : destructive
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-foreground hover:bg-accent',
        className
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && <span className="w-4 h-4 shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
};

interface DropdownSectionProps {
  title?: string;
  children: React.ReactNode;
}

export const DropdownSection: React.FC<DropdownSectionProps> = ({ title, children }) => {
  return (
    <div className="py-1">
      {title && (
        <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
      )}
      {children}
    </div>
  );
};

export const DropdownSeparator: React.FC = () => {
  return <div className="my-1 border-t border-border" />;
};

interface DropdownButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const DropdownButton: React.FC<DropdownButtonProps> = ({
  children,
  disabled,
  className,
}) => {
  return (
    <button
      className={cn(
        'flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors',
        disabled
          ? 'text-muted-foreground cursor-not-allowed'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
      disabled={disabled}
    >
      {children}
      <ChevronDown className="w-3 h-3" />
    </button>
  );
};
