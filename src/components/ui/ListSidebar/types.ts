/**
 * ListSidebar Types
 * Unified type definitions for the ListSidebar component system
 */

import type { LucideIcon } from 'lucide-react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

/**
 * Status configuration for list items
 */
export type ItemStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface StatusConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  animation?: string;
  pulse?: boolean;
  label: string;
}

/**
 * Sort mode options
 */
export type SortMode = 'name' | 'updated' | 'created' | 'custom' | 'lastOpened';

export interface SortOption {
  value: SortMode;
  label: string;
}

/**
 * Props for rendering individual list items
 */
export interface RenderItemProps {
  isSelected: boolean;
  isFocused: boolean;
  isMenuOpen: boolean;
  isDraggable: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Context menu action
 */
export interface ContextMenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

/**
 * Empty state type
 */
export type EmptyStateType = 'workflows' | 'projects';

/**
 * Props for the empty state component
 */
export interface ListSidebarEmptyProps {
  type: EmptyStateType;
  hasSearch: boolean;
  searchQuery?: string;
  onCreateNew: () => void;
}

/**
 * Props for list item component
 */
export interface ListSidebarItemProps {
  /** Unique identifier */
  id: string;
  /** Item name */
  name: string;
  /** Item description (optional) */
  description?: string;
  /** Primary icon */
  icon: LucideIcon;
  /** Active/selected icon (optional) */
  activeIcon?: LucideIcon;
  /** Primary metadata (e.g., "3 steps") */
  primaryMeta?: string;
  /** Secondary metadata elements */
  secondaryMeta?: React.ReactNode;
  /** Execution status */
  status?: ItemStatus;
  /** Whether the item is selected */
  isSelected: boolean;
  /** Whether the item is focused (keyboard navigation) */
  isFocused?: boolean;
  /** Whether the context menu is open for this item */
  isMenuOpen?: boolean;
  /** Whether drag handle should be shown */
  isDraggable?: boolean;
  /** Click handler */
  onClick: () => void;
  /** Context menu handler */
  onContextMenu: (e: React.MouseEvent) => void;
  /** DnD attributes (from useSortable) */
  dragAttributes?: DraggableAttributes;
  /** DnD listeners (from useSortable) */
  dragListeners?: DraggableSyntheticListeners;
  /** Whether currently being dragged */
  isDragging?: boolean;
}

/**
 * Props for list header component
 */
export interface ListSidebarHeaderProps {
  /** Search query value */
  searchQuery: string;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Sort mode */
  sortMode: SortMode;
  /** Available sort options */
  sortOptions: SortOption[];
  /** Search change handler */
  onSearchChange: (query: string) => void;
  /** Sort mode change handler */
  onSortModeChange: (mode: SortMode) => void;
  /** Create new item handler */
  onCreateNew: () => void;
  /** Optional collapse handler */
  onToggleCollapse?: () => void;
  /** Whether sidebar is collapsible */
  isCollapsible?: boolean;
}
