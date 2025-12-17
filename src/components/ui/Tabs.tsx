/**
 * Tabs Component
 * A tab-based navigation component for organizing content into sections
 *
 * Supports an optional gradient underline variant using the R/E/W color scheme:
 * - Blue (blue-500) - Read operations
 * - Amber (amber-500) - Execute operations
 * - Rose (rose-500) - Write operations
 */

import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { cn } from '../../lib/utils';

// ============================================================================
// Context
// ============================================================================

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be used within a Tabs component');
  }
  return context;
}

// ============================================================================
// Tabs Root
// ============================================================================

interface TabsProps {
  /** The value of the currently active tab */
  defaultValue?: string;
  /** Controlled active tab value */
  value?: string;
  /** Callback when active tab changes */
  onValueChange?: (value: string) => void;
  /** Tab content */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
}

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const baseId = useId();

  const activeTab = controlledValue !== undefined ? controlledValue : internalValue;

  const setActiveTab = useCallback(
    (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    },
    [onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={cn('', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ============================================================================
// TabsList
// ============================================================================

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 p-1',
        'bg-muted/50 rounded-lg',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// TabsTrigger
// ============================================================================

interface TabsTriggerProps {
  /** The value that identifies this tab */
  value: string;
  /** Tab label content */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
  /** Disable the tab */
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab, baseId } = useTabsContext();
  const isActive = activeTab === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  const handleClick = useCallback(() => {
    if (!disabled) {
      setActiveTab(value);
    }
  }, [disabled, setActiveTab, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveTab(value);
      }
    },
    [disabled, setActiveTab, value]
  );

  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'px-3 py-1.5 text-sm font-medium rounded-md',
        'transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        className
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// TabsContent
// ============================================================================

interface TabsContentProps {
  /** The value that identifies this panel */
  value: string;
  /** Panel content */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
  /** Force mount even when inactive */
  forceMount?: boolean;
}

export function TabsContent({
  value,
  children,
  className,
  forceMount = false,
}: TabsContentProps) {
  const { activeTab, baseId } = useTabsContext();
  const isActive = activeTab === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  if (!isActive && !forceMount) {
    return null;
  }

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      hidden={!isActive}
      className={cn(
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md',
        !isActive && 'hidden',
        className
      )}
    >
      {children}
    </div>
  );
}
