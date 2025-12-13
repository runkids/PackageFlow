/**
 * Custom Select Component
 * A modern, accessible dropdown select component with shadcn/ui styling
 * Supports keyboard navigation, groups, and custom option rendering
 */

import * as React from 'react';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export type SelectOptions = SelectOption[] | SelectGroup[];

function isGroupedOptions(options: SelectOptions): options is SelectGroup[] {
  return options.length > 0 && 'options' in options[0];
}

// ============================================================================
// Context
// ============================================================================

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('Select components must be used within a Select provider');
  }
  return context;
}

// ============================================================================
// Main Select Component
// ============================================================================

export interface SelectProps {
  /** Currently selected value */
  value: string;
  /** Callback when value changes */
  onValueChange: (value: string) => void;
  /** Select options (flat or grouped) */
  options: SelectOptions;
  /** Placeholder text when no value is selected */
  placeholder?: string;
  /** Disable the select */
  disabled?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Additional class for the trigger button */
  className?: string;
  /** Accessible label for screen readers */
  'aria-label'?: string;
  /** ID for the select element */
  id?: string;
  /** Name for form submission */
  name?: string;
  /** Size variant */
  size?: 'sm' | 'default' | 'lg';
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  loading = false,
  className,
  'aria-label': ariaLabel,
  id,
  name,
  size = 'default',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flatten options for keyboard navigation
  const flatOptions = useMemo(() => {
    if (isGroupedOptions(options)) {
      return options.flatMap((group) => group.options);
    }
    return options;
  }, [options]);

  // Find the selected option
  const selectedOption = useMemo(() => {
    return flatOptions.find((opt) => opt.value === value);
  }, [flatOptions, value]);

  // Handle value change
  const handleValueChange = useCallback(
    (newValue: string) => {
      onValueChange(newValue);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onValueChange]
  );

  // Reset highlighted index when opening
  useEffect(() => {
    if (open) {
      const currentIndex = flatOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [open, flatOptions, value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      const item = items[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [open, highlightedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || loading) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (open && highlightedIndex >= 0) {
            const option = flatOptions[highlightedIndex];
            if (option && !option.disabled) {
              handleValueChange(option.value);
            }
          } else {
            setOpen(true);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else {
            setHighlightedIndex((prev) => {
              let next = prev + 1;
              while (next < flatOptions.length && flatOptions[next].disabled) {
                next++;
              }
              return next < flatOptions.length ? next : prev;
            });
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else {
            setHighlightedIndex((prev) => {
              let next = prev - 1;
              while (next >= 0 && flatOptions[next].disabled) {
                next--;
              }
              return next >= 0 ? next : prev;
            });
          }
          break;

        case 'Home':
          e.preventDefault();
          if (open) {
            const firstEnabled = flatOptions.findIndex((opt) => !opt.disabled);
            if (firstEnabled >= 0) {
              setHighlightedIndex(firstEnabled);
            }
          }
          break;

        case 'End':
          e.preventDefault();
          if (open) {
            for (let i = flatOptions.length - 1; i >= 0; i--) {
              if (!flatOptions[i].disabled) {
                setHighlightedIndex(i);
                break;
              }
            }
          }
          break;

        case 'Escape':
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;

        case 'Tab':
          if (open) {
            setOpen(false);
          }
          break;
      }
    },
    [open, highlightedIndex, flatOptions, disabled, loading, handleValueChange]
  );

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const sizeClasses = {
    sm: 'h-8 px-2 text-xs',
    default: 'h-9 px-3 text-sm',
    lg: 'h-10 px-4 text-base',
  };

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        setOpen,
        highlightedIndex,
        setHighlightedIndex,
        triggerRef,
        listRef,
        disabled,
      }}
    >
      <div className="relative">
        {/* Hidden input for form submission */}
        {name && <input type="hidden" name={name} value={value} />}

        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          id={id}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${id || 'select'}-listbox`}
          disabled={disabled || loading}
          onClick={() => !disabled && !loading && setOpen(!open)}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-border',
            'bg-background text-foreground shadow-sm',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
            'hover:border-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            sizeClasses[size],
            className
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </span>
            ) : selectedOption ? (
              <span className="flex items-center gap-2">
                {selectedOption.icon}
                {selectedOption.label}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown List */}
        {open && (
          <div
            ref={listRef}
            role="listbox"
            id={`${id || 'select'}-listbox`}
            aria-label={ariaLabel}
            className={cn(
              'absolute z-50 mt-1 w-full',
              'max-h-60 overflow-auto rounded-md',
              'bg-white dark:bg-zinc-900 border border-border shadow-xl',
              'py-1',
              // Animation
              'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
              'duration-150'
            )}
            onKeyDown={handleKeyDown}
          >
            {isGroupedOptions(options) ? (
              options.map((group, groupIndex) => (
                <SelectGroupComponent
                  key={group.label}
                  label={group.label}
                  options={group.options}
                  startIndex={options
                    .slice(0, groupIndex)
                    .reduce((acc, g) => acc + g.options.length, 0)}
                />
              ))
            ) : (
              options.map((option, index) => (
                <SelectOptionComponent
                  key={option.value}
                  option={option}
                  index={index}
                />
              ))
            )}

            {flatOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                No options available
              </div>
            )}
          </div>
        )}
      </div>
    </SelectContext.Provider>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SelectGroupProps {
  label: string;
  options: SelectOption[];
  startIndex: number;
}

function SelectGroupComponent({ label, options, startIndex }: SelectGroupProps) {
  return (
    <div className="py-1">
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      {options.map((option, index) => (
        <SelectOptionComponent
          key={option.value}
          option={option}
          index={startIndex + index}
        />
      ))}
    </div>
  );
}

interface SelectOptionProps {
  option: SelectOption;
  index: number;
}

function SelectOptionComponent({ option, index }: SelectOptionProps) {
  const {
    value,
    onValueChange,
    highlightedIndex,
    setHighlightedIndex,
  } = useSelectContext();

  const isSelected = value === option.value;
  const isHighlighted = highlightedIndex === index;

  const handleClick = () => {
    if (!option.disabled) {
      onValueChange(option.value);
    }
  };

  const handleMouseEnter = () => {
    if (!option.disabled) {
      setHighlightedIndex(index);
    }
  };

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled}
      data-highlighted={isHighlighted}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      className={cn(
        'relative flex items-center px-3 py-2 text-sm cursor-pointer',
        'transition-colors duration-100',
        // Highlighted state (keyboard/hover)
        isHighlighted && !option.disabled && 'bg-accent',
        // Selected state
        isSelected && 'text-blue-400',
        !isSelected && !option.disabled && 'text-foreground',
        // Disabled state
        option.disabled && 'text-muted-foreground cursor-not-allowed opacity-50',
        // Default hover (when not highlighted by keyboard)
        !isHighlighted && !option.disabled && 'hover:bg-accent/50'
      )}
    >
      {/* Check icon for selected item */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center mr-2">
        {isSelected && <Check className="h-4 w-4" />}
      </span>

      {/* Option content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {option.icon && <span className="shrink-0">{option.icon}</span>}
          <span className="truncate">{option.label}</span>
        </div>
        {option.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {option.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Native Select (fallback for simple use cases)
// ============================================================================

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Size variant */
  size?: 'sm' | 'default' | 'lg';
}

/**
 * NativeSelect - A styled native select element
 * Use this for simpler forms where native behavior is preferred
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size = 'default', children, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-8 px-2 pr-8 text-xs',
      default: 'h-9 px-3 pr-8 text-sm',
      lg: 'h-10 px-4 pr-10 text-base',
    };

    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'flex w-full appearance-none rounded-md border border-border',
            'bg-background text-foreground shadow-sm',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring',
            'hover:border-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            sizeClasses[size],
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  }
);
NativeSelect.displayName = 'NativeSelect';

// ============================================================================
// Utility: Convert simple options to SelectOption format
// ============================================================================

export function createOptions(
  items: Array<{ value: string; label: string } | string>
): SelectOption[] {
  return items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item
  );
}

export default Select;
