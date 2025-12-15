/**
 * ListSidebarItem - Card-style list item component
 * Supports status indicators, drag handles, and hover states
 */

import { forwardRef } from 'react';
import {
  Circle,
  Loader2,
  CheckCircle,
  XCircle,
  PauseCircle,
  MinusCircle,
  GripVertical,
  MoreVertical,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../Button';
import type { ListSidebarItemProps, ItemStatus, StatusConfig } from './types';
import type { LucideIcon } from 'lucide-react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

/**
 * Status configuration with visual styles
 */
const statusConfig: Record<ItemStatus, StatusConfig> = {
  idle: {
    icon: Circle,
    color: 'text-muted-foreground',
    bg: 'bg-transparent',
    label: 'Idle',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    animation: 'animate-spin',
    pulse: true,
    label: 'Running',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    label: 'Failed',
  },
  paused: {
    icon: PauseCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    label: 'Paused',
  },
  cancelled: {
    icon: MinusCircle,
    color: 'text-muted-foreground',
    bg: 'bg-transparent',
    label: 'Cancelled',
  },
};

interface IconAreaProps {
  icon: LucideIcon;
  activeIcon?: LucideIcon;
  isSelected: boolean;
  status?: ItemStatus;
  isDraggable: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
}

function IconArea({
  icon: DefaultIcon,
  activeIcon: ActiveIcon,
  isSelected,
  status,
  isDraggable,
  dragAttributes,
  dragListeners,
}: IconAreaProps) {
  const getStatusIcon = () => {
    if (status && status !== 'idle') {
      const config = statusConfig[status];
      const StatusIcon = config.icon;
      return (
        <StatusIcon
          className={cn('w-4 h-4', config.color, config.animation)}
        />
      );
    }

    const Icon = isSelected && ActiveIcon ? ActiveIcon : DefaultIcon;
    return (
      <Icon
        className={cn(
          'w-4 h-4',
          isSelected ? 'text-blue-400' : 'text-muted-foreground'
        )}
      />
    );
  };

  return (
    <div className="relative flex-shrink-0 w-5 h-5">
      {/* Icon - hidden on hover when draggable */}
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
          isDraggable && 'group-hover:opacity-0'
        )}
      >
        {getStatusIcon()}
      </span>
      {/* Drag handle - shown on hover */}
      {isDraggable && (
        <div
          {...dragAttributes}
          {...dragListeners}
          className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export const ListSidebarItem = forwardRef<HTMLLIElement, ListSidebarItemProps>(
  (
    {
      // id is used by parent components for sorting/keying, not needed here
      id: _id,
      name,
      description,
      icon,
      activeIcon,
      primaryMeta,
      secondaryMeta,
      status,
      isSelected,
      isFocused = false,
      isMenuOpen = false,
      isDraggable = false,
      onClick,
      onContextMenu,
      dragAttributes,
      dragListeners,
      isDragging = false,
    },
    ref
  ) => {
    void _id; // Silence unused variable warning
    const statusCfg = status ? statusConfig[status] : null;
    const isRunning = status === 'running';

    return (
      <li
        ref={ref}
        className={cn(
          'group relative',
          isDragging && 'opacity-50'
        )}
      >
        <button
          onClick={onClick}
          onContextMenu={onContextMenu}
          className={cn(
            'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150',
            // Selected state
            isSelected && [
              'bg-blue-600/15 dark:bg-blue-600/20',
              'border border-blue-500/30',
              'shadow-sm',
            ],
            // Focused state (keyboard navigation)
            !isSelected && isFocused && [
              'bg-muted',
              'ring-2 ring-blue-500 ring-offset-1 ring-offset-background',
            ],
            // Default hover state
            !isSelected && !isFocused && [
              'border border-transparent',
              'hover:bg-accent hover:border-border',
            ],
            // Running pulse effect
            isRunning && isSelected && 'animate-pulse-subtle'
          )}
        >
          <IconArea
            icon={icon}
            activeIcon={activeIcon}
            isSelected={isSelected}
            status={status}
            isDraggable={isDraggable}
            dragAttributes={dragAttributes}
            dragListeners={dragListeners}
          />

          <div className="flex-1 min-w-0 space-y-0.5">
            {/* Name */}
            <div
              className={cn(
                'text-sm font-medium truncate leading-tight',
                isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'
              )}
            >
              {name || 'Untitled'}
            </div>

            {/* Description (if provided) */}
            {description && (
              <div className="text-xs text-muted-foreground truncate">
                {description}
              </div>
            )}

            {/* Metadata row */}
            {(primaryMeta || secondaryMeta) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {primaryMeta && <span>{primaryMeta}</span>}
                {primaryMeta && secondaryMeta && (
                  <span className="text-muted-foreground/50">·</span>
                )}
                {secondaryMeta}
              </div>
            )}
          </div>

          {/* Status indicator (for running/failed states) */}
          {statusCfg && status !== 'idle' && (
            <div
              className={cn(
                'flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                statusCfg.bg,
                statusCfg.color
              )}
            >
              {statusCfg.label}
            </div>
          )}
        </button>

        {/* More options button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2',
            'h-7 w-7',
            'transition-opacity duration-150',
            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          title="More options"
        >
          <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </li>
    );
  }
);

ListSidebarItem.displayName = 'ListSidebarItem';
