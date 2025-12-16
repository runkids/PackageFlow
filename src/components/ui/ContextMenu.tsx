import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
  /** Use React Portal to render menu at document.body level (for higher z-index needs) */
  usePortal?: boolean;
}

const ContextMenuContent: React.FC<{
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
  menuRef: React.RefObject<HTMLDivElement | null>;
}> = ({ x, y, children, menuRef }) => {
  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y, menuRef]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] bg-card border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, children, usePortal = false }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const content = (
    <ContextMenuContent x={x} y={y} onClose={onClose} menuRef={menuRef}>
      {children}
    </ContextMenuContent>
  );

  if (usePortal) {
    return createPortal(content, document.body);
  }

  return content;
};

interface ContextMenuItemProps {
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  warning?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const ContextMenuItem: React.FC<ContextMenuItemProps> = ({
  onClick,
  disabled,
  destructive,
  warning,
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
          ? 'text-destructive hover:bg-destructive/10'
          : warning
          ? 'text-yellow-400 hover:bg-yellow-500/10'
          : 'hover:bg-muted',
        className
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
};

export const ContextMenuSeparator: React.FC = () => {
  return <div className="my-1 border-t border-border" />;
};

interface ContextMenuSectionProps {
  title?: string;
  children: React.ReactNode;
}

/**
 * Groups context menu items with an optional section title
 */
export const ContextMenuSection: React.FC<ContextMenuSectionProps> = ({ title, children }) => {
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
