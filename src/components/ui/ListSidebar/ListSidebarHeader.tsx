/**
 * ListSidebarHeader - Search and action bar for list sidebars
 * Includes search input, sort menu, and create button
 */

import { useState, useRef } from 'react';
import { Search, ArrowUpDown, Plus, ChevronLeft, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../Button';
import type { ListSidebarHeaderProps } from './types';

export function ListSidebarHeader({
  searchQuery,
  searchPlaceholder = 'Search...',
  sortMode,
  sortOptions,
  onSearchChange,
  onSortModeChange,
  onCreateNew,
  onToggleCollapse,
  isCollapsible = false,
}: ListSidebarHeaderProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-2 border-b border-border h-[44px] flex items-center gap-2">
      {/* Search input */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            'w-full pl-8 pr-3 py-1.5',
            'bg-secondary border border-border rounded-md',
            'text-sm text-foreground placeholder-muted-foreground',
            'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20',
            'transition-all duration-150'
          )}
        />
      </div>

      {/* Action buttons - hidden when search is focused */}
      <div
        className={cn(
          'flex items-center gap-1 flex-shrink-0 transition-all duration-200',
          isSearchFocused ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
        )}
      >
        {/* Sort button */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setShowSortMenu(!showSortMenu);
            }}
            className={cn('h-8 w-8', showSortMenu && 'bg-accent')}
            title="Sort by"
          >
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          </Button>

          {/* Sort dropdown menu */}
          {showSortMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSortMenu(false)}
              />
              <div
                className={cn(
                  'absolute left-0 top-full mt-1 z-50',
                  'bg-card border border-border rounded-lg',
                  'shadow-xl shadow-black/20',
                  'py-1 min-w-[160px] whitespace-nowrap',
                  'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150'
                )}
              >
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    onClick={() => {
                      onSortModeChange(option.value);
                      setShowSortMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent justify-start h-auto rounded-none"
                  >
                    <Check
                      className={cn(
                        'w-4 h-4',
                        sortMode === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Create button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCreateNew}
          className="h-8 w-8"
          title="Create new"
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
        </Button>

        {/* Collapse button (optional) */}
        {isCollapsible && onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}
