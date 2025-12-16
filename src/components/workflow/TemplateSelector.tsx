/**
 * Template Selector Component
 * Browse and select workflow step templates
 * Enhanced with:
 * - Collapsible categories with memory
 * - Category navigation tabs
 * - Favorites with star toggle
 * - Recently used templates section
 * - Search result highlighting
 * - Keyboard navigation (j/k, Enter, Esc)
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Package,
  GitBranch,
  Container,
  Terminal,
  TestTube,
  CheckCircle,
  Download,
  Upload,
  Star,
  Trash2,
  Server,
  Database,
  Cloud,
  Shield,
  Cpu,
  ChevronDown,
  ChevronRight,
  Clock,
  Heart,
  Layers,
  List,
} from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { cn } from '../../lib/utils';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import {
  TEMPLATE_CATEGORIES,
  groupTemplatesByCategory,
  filterTemplatesWithCustom,
  exportTemplatesToJson,
  parseImportedTemplates,
  loadCustomTemplates,
  deleteCustomTemplate,
  importTemplatesAsCustom,
  STEP_TEMPLATES,
} from '../../data/step-templates';
import { useTemplatePreferences, type TemplateViewMode } from '../../hooks/useTemplatePreferences';
import type { StepTemplate, TemplateCategoryInfo, CustomTemplate, TemplateCategory } from '../../types/step-template';

/** Map category icon names to components */
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  GitBranch,
  Container,
  Terminal,
  TestTube,
  CheckCircle,
  Star,
  Server,
  Database,
  Cloud,
  Shield,
  Cpu,
};

interface TemplateSelectorProps {
  selectedTemplateId?: string | null;
  onSelectTemplate: (template: StepTemplate) => void;
  className?: string;
}

/** Type guard to check if template is custom */
function isCustomTemplate(template: StepTemplate | CustomTemplate): template is CustomTemplate {
  return 'isCustom' in template && template.isCustom === true;
}

/** Highlight search query in text */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-yellow-500/30 text-inherit rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

/**
 * View Mode Tabs Component
 */
function ViewModeTabs({
  currentView,
  onViewChange,
  favoriteCount,
}: {
  currentView: TemplateViewMode;
  onViewChange: (view: TemplateViewMode) => void;
  favoriteCount: number;
}) {
  const tabs: { id: TemplateViewMode; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'categories', label: 'Categories', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'all', label: 'All', icon: <List className="w-3.5 h-3.5" /> },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: <Heart className="w-3.5 h-3.5" />,
      count: favoriteCount,
    },
  ];

  return (
    <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          variant="ghost"
          onClick={() => onViewChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all h-auto',
            currentView === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.count !== undefined && tab.count > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full">
              {tab.count}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}

/**
 * Category Navigation Pills
 */
function CategoryNavigation({
  categories,
  activeCategory,
  onCategoryClick,
}: {
  categories: { id: TemplateCategory | 'custom'; name: string; count: number }[];
  activeCategory: string | null;
  onCategoryClick: (categoryId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto py-1 px-0.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
    >
      {categories.map((cat) => (
        <Button
          key={cat.id}
          variant="ghost"
          onClick={() => onCategoryClick(cat.id)}
          className={cn(
            'h-auto px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0',
            activeCategory === cat.id
              ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50'
              : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <span>{cat.name}</span>
          <span className="text-[10px] opacity-60">({cat.count})</span>
        </Button>
      ))}
    </div>
  );
}

/**
 * Category Group Component
 * Shows category header with collapse toggle and all templates
 */
function CategoryGroup({
  category,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onDeleteTemplate,
  isCollapsed,
  onToggleCollapse,
  searchQuery,
  isFavorite,
  onToggleFavorite,
  categoryRef,
}: {
  category: TemplateCategoryInfo;
  templates: (StepTemplate | CustomTemplate)[];
  selectedTemplateId?: string | null;
  onSelectTemplate: (template: StepTemplate) => void;
  onDeleteTemplate?: (templateId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  searchQuery: string;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  categoryRef?: (el: HTMLDivElement | null) => void;
}) {
  const IconComponent = CATEGORY_ICONS[category.icon] || Package;

  return (
    <div ref={categoryRef}>
      {/* Category Header - Clickable to collapse */}
      <Button
        variant="ghost"
        onClick={onToggleCollapse}
        className="w-full justify-start h-auto sticky top-0 z-10 gap-2 px-3 py-2 bg-muted/80 dark:bg-muted/50 border border-border rounded-lg mb-1 -mx-0.5 hover:bg-muted group backdrop-blur-sm"
      >
        <span className="text-muted-foreground transition-transform duration-200">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </span>
        <IconComponent className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{category.name}</span>
        <span className="text-xs text-muted-foreground">({templates.length})</span>
      </Button>

      {/* Templates List - Collapsible */}
      {!isCollapsed && (
        <div className="flex flex-col gap-1 mb-3 animate-in slide-in-from-top-2 duration-200">
          {templates.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              isSelected={selectedTemplateId === template.id}
              onClick={() => onSelectTemplate(template)}
              onDelete={onDeleteTemplate}
              searchQuery={searchQuery}
              isFavorite={isFavorite(template.id)}
              onToggleFavorite={() => onToggleFavorite(template.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Template Item Component
 * Individual template in the list with favorite toggle
 */
function TemplateItem({
  template,
  isSelected,
  onClick,
  onDelete,
  searchQuery,
  isFavorite,
  onToggleFavorite,
}: {
  template: StepTemplate | CustomTemplate;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: (templateId: string) => void;
  searchQuery: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const isCustom = isCustomTemplate(template);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(template.id);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite();
  };

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        'w-full justify-start items-start h-auto flex-col gap-0.5 px-3 py-2.5 rounded-md group relative',
        isSelected
          ? 'bg-blue-600/20 ring-1 ring-blue-500'
          : 'hover:bg-accent'
      )}
    >
      <div className="w-full flex items-center justify-between gap-2">
        <span className={cn('text-sm font-medium flex items-center gap-1.5', isSelected ? 'text-blue-300' : 'text-foreground')}>
          {isCustom && <Star className="w-3 h-3 text-yellow-500" />}
          {highlightMatch(template.name, searchQuery)}
        </span>
        <div className="flex items-center gap-1">
          {/* Favorite button */}
          <span
            onClick={handleFavoriteClick}
            className={cn(
              'p-1 rounded transition-all',
              isFavorite
                ? 'text-red-400 hover:text-red-300'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400'
            )}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-3.5 h-3.5', isFavorite && 'fill-current')} />
          </span>
          {/* Delete button for custom templates */}
          {isCustom && onDelete && (
            <span
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all"
              title="Delete template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
      <code className="w-full text-left text-xs text-muted-foreground font-mono truncate">
        {highlightMatch(template.command, searchQuery)}
      </code>
      {template.description && (
        <span className="w-full text-left text-xs text-muted-foreground truncate">
          {highlightMatch(template.description, searchQuery)}
        </span>
      )}
    </Button>
  );
}

/**
 * Recently Used Section
 */
function RecentlyUsedSection({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onClear,
  searchQuery,
  isFavorite,
  onToggleFavorite,
}: {
  templates: (StepTemplate | CustomTemplate)[];
  selectedTemplateId?: string | null;
  onSelectTemplate: (template: StepTemplate) => void;
  onClear: () => void;
  searchQuery: string;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
}) {
  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/50 border border-border/50 rounded-lg mb-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Recently Used</span>
          <span className="text-xs text-muted-foreground">({templates.length})</span>
        </div>
        <Button
          variant="ghost"
          onClick={onClear}
          className="h-auto text-xs text-muted-foreground hover:text-foreground px-2 py-1"
        >
          Clear
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        {templates.map((template) => (
          <TemplateItem
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            onClick={() => onSelectTemplate(template)}
            searchQuery={searchQuery}
            isFavorite={isFavorite(template.id)}
            onToggleFavorite={() => onToggleFavorite(template.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Empty State Component
 * Shown when no templates match the search
 */
function EmptyState({ searchQuery, viewMode }: { searchQuery: string; viewMode: TemplateViewMode }) {
  if (viewMode === 'favorites') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Heart className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No favorite templates yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Click the heart icon on any template to add it to favorites
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Search className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">
        No templates found for "<span className="text-foreground">{searchQuery}</span>"
      </p>
      <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
    </div>
  );
}

/**
 * Template Selector Component
 * Main component for browsing and selecting templates
 */
export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
  className,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Template preferences hook
  const {
    isLoaded: isPrefsLoaded,
    preferredView,
    setPreferredView,
    favorites,
    favoriteCount,
    isFavorite,
    toggleFavorite,
    recentTemplateIds,
    recordUsage,
    clearRecentlyUsed,
    isCategoryCollapsed,
    toggleCategoryCollapse,
  } = useTemplatePreferences();

  // Load custom templates on mount
  useEffect(() => {
    const load = async () => {
      try {
        const templates = await loadCustomTemplates();
        setCustomTemplates(templates);
      } catch (error) {
        console.error('Failed to load custom templates:', error);
      } finally {
        setIsLoadingCustom(false);
      }
    };
    load();
  }, []);

  // All templates combined
  const allTemplates = useMemo(() => {
    return [...customTemplates, ...STEP_TEMPLATES] as (StepTemplate | CustomTemplate)[];
  }, [customTemplates]);

  // Filter templates based on search (including custom)
  const filteredTemplates = useMemo(() => {
    return filterTemplatesWithCustom(searchQuery, customTemplates);
  }, [searchQuery, customTemplates]);

  // Get recent templates
  const recentTemplates = useMemo(() => {
    return recentTemplateIds
      .map((id) => allTemplates.find((t) => t.id === id))
      .filter((t): t is StepTemplate | CustomTemplate => t !== undefined);
  }, [recentTemplateIds, allTemplates]);

  // Get favorite templates
  const favoriteTemplates = useMemo(() => {
    return favorites
      .map((id) => allTemplates.find((t) => t.id === id))
      .filter((t): t is StepTemplate | CustomTemplate => t !== undefined);
  }, [favorites, allTemplates]);

  // Group filtered templates by category
  const groupedTemplates = useMemo(() => {
    if (!searchQuery.trim()) {
      // Build groups with custom templates first
      const groups = groupTemplatesByCategory();

      if (customTemplates.length > 0) {
        // Add "My Templates" category at the beginning
        const customCategory: TemplateCategoryInfo = {
          id: 'custom' as TemplateCategory,
          name: 'My Templates',
          icon: 'Star',
        };
        groups.unshift({
          category: customCategory,
          templates: customTemplates,
        });
      }

      return groups;
    }

    // Group filtered templates by category
    const groups = new Map<string, (StepTemplate | CustomTemplate)[]>();

    // Separate custom templates
    const filteredCustom = filteredTemplates.filter((t) => isCustomTemplate(t));
    const filteredBuiltIn = filteredTemplates.filter((t) => !isCustomTemplate(t));

    // Add custom templates to "My Templates" group
    if (filteredCustom.length > 0) {
      groups.set('custom', filteredCustom);
    }

    // Group built-in templates by category
    for (const template of filteredBuiltIn) {
      const existing = groups.get(template.category) || [];
      groups.set(template.category, [...existing, template]);
    }

    // Build result with custom templates first
    const result: { category: TemplateCategoryInfo; templates: (StepTemplate | CustomTemplate)[] }[] = [];

    if (groups.has('custom')) {
      result.push({
        category: { id: 'custom' as TemplateCategory, name: 'My Templates', icon: 'Star' },
        templates: groups.get('custom') || [],
      });
    }

    // Add built-in categories
    for (const cat of TEMPLATE_CATEGORIES) {
      if (groups.has(cat.id)) {
        result.push({
          category: cat,
          templates: groups.get(cat.id) || [],
        });
      }
    }

    return result;
  }, [filteredTemplates, searchQuery, customTemplates]);

  // Category navigation data
  const categoryNavItems = useMemo(() => {
    return groupedTemplates.map((group) => ({
      id: group.category.id,
      name: group.category.name,
      count: group.templates.length,
    }));
  }, [groupedTemplates]);

  // Handle template selection with usage tracking
  const handleSelectTemplate = useCallback(
    (template: StepTemplate | CustomTemplate) => {
      recordUsage(template.id);
      onSelectTemplate(template);
    },
    [recordUsage, onSelectTemplate]
  );

  // Handle delete custom template
  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    const success = await deleteCustomTemplate(templateId);
    if (success) {
      setCustomTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setImportStatus({ type: 'success', message: 'Template deleted' });
      setTimeout(() => setImportStatus(null), 2000);
    } else {
      setImportStatus({ type: 'error', message: 'Failed to delete template' });
      setTimeout(() => setImportStatus(null), 3000);
    }
  }, []);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Category navigation click handler
  const handleCategoryClick = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    const ref = categoryRefs.current.get(categoryId);
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Export custom templates only (My Templates)
  const handleExport = useCallback(async () => {
    if (customTemplates.length === 0) {
      setImportStatus({ type: 'error', message: 'No custom templates to export' });
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    try {
      const filePath = await save({
        defaultPath: 'my-templates.node.json',
        filters: [{ name: 'Node Templates', extensions: ['node.json'] }],
      });

      if (filePath) {
        const jsonContent = exportTemplatesToJson(customTemplates);
        await writeTextFile(filePath, jsonContent);
        setImportStatus({ type: 'success', message: `Exported ${customTemplates.length} custom template${customTemplates.length !== 1 ? 's' : ''}` });
        setTimeout(() => setImportStatus(null), 3000);
      }
    } catch (error) {
      console.error('Export failed:', error);
      setImportStatus({ type: 'error', message: 'Export failed' });
      setTimeout(() => setImportStatus(null), 3000);
    }
  }, [customTemplates]);

  // Import templates and add to custom templates
  const handleImport = useCallback(async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'Node Templates', extensions: ['node.json', 'json'] }],
        multiple: false,
      });

      if (filePath && typeof filePath === 'string') {
        const content = await readTextFile(filePath);
        const result = parseImportedTemplates(content);

        if (result.success && result.templates && result.templates.length > 0) {
          // Import templates as custom templates
          const imported = await importTemplatesAsCustom(result.templates);

          if (imported.length > 0) {
            // Update the custom templates list immediately
            setCustomTemplates((prev) => [...imported, ...prev]);
            setImportStatus({
              type: 'success',
              message: `Imported ${imported.length} template${imported.length !== 1 ? 's' : ''}`,
            });
          } else {
            setImportStatus({ type: 'error', message: 'Failed to import templates' });
          }
        } else {
          setImportStatus({ type: 'error', message: result.error || 'No valid templates found' });
        }
        setTimeout(() => setImportStatus(null), 3000);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportStatus({ type: 'error', message: 'Import failed' });
      setTimeout(() => setImportStatus(null), 3000);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on "/" key
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Clear search on Escape
      if (e.key === 'Escape' && searchQuery) {
        e.preventDefault();
        handleClearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, handleClearSearch]);

  const hasResults = preferredView === 'favorites' ? favoriteTemplates.length > 0 : groupedTemplates.length > 0;
  const showRecentSection = preferredView === 'categories' && !searchQuery && recentTemplates.length > 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* View Mode Tabs */}
      <ViewModeTabs
        currentView={preferredView}
        onViewChange={setPreferredView}
        favoriteCount={favoriteCount}
      />

      {/* Search and Actions Row */}
      <div className="flex gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates... (press / to focus)"
            className="pl-9 pr-8 bg-background border-border text-foreground"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
        </div>

        {/* Export/Import Buttons */}
        <Button
          variant="outline"
          size="icon"
          onClick={handleExport}
          className="h-9 w-9"
          title="Export templates"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleImport}
          className="h-9 w-9"
          title="Import templates"
        >
          <Upload className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Category Navigation - Only show in categories view with no search */}
      {preferredView === 'categories' && !searchQuery && categoryNavItems.length > 0 && (
        <CategoryNavigation
          categories={categoryNavItems}
          activeCategory={activeCategory}
          onCategoryClick={handleCategoryClick}
        />
      )}

      {/* Import Status Message */}
      {importStatus && (
        <div
          className={cn(
            'text-xs px-3 py-1.5 rounded-md',
            importStatus.type === 'success'
              ? 'bg-green-900/30 text-green-400 border border-green-700/50'
              : 'bg-red-900/30 text-red-400 border border-red-700/50'
          )}
        >
          {importStatus.message}
        </div>
      )}

      {/* Templates List */}
      <div ref={listRef} className="flex flex-col gap-2 h-[400px] overflow-y-auto px-1">
        {isLoadingCustom || !isPrefsLoaded ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : preferredView === 'favorites' ? (
          // Favorites view
          favoriteTemplates.length > 0 ? (
            <div className="flex flex-col gap-1">
              {favoriteTemplates.map((template) => (
                <TemplateItem
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onClick={() => handleSelectTemplate(template)}
                  onDelete={isCustomTemplate(template) ? handleDeleteTemplate : undefined}
                  searchQuery={searchQuery}
                  isFavorite={isFavorite(template.id)}
                  onToggleFavorite={() => toggleFavorite(template.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState searchQuery={searchQuery} viewMode={preferredView} />
          )
        ) : preferredView === 'all' ? (
          // All templates flat list
          filteredTemplates.length > 0 ? (
            <div className="flex flex-col gap-1">
              {filteredTemplates.map((template) => (
                <TemplateItem
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onClick={() => handleSelectTemplate(template)}
                  onDelete={isCustomTemplate(template) ? handleDeleteTemplate : undefined}
                  searchQuery={searchQuery}
                  isFavorite={isFavorite(template.id)}
                  onToggleFavorite={() => toggleFavorite(template.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState searchQuery={searchQuery} viewMode={preferredView} />
          )
        ) : hasResults ? (
          // Categories view (default)
          <>
            {/* Recently Used Section */}
            {showRecentSection && (
              <RecentlyUsedSection
                templates={recentTemplates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={handleSelectTemplate}
                onClear={clearRecentlyUsed}
                searchQuery={searchQuery}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
            )}

            {/* Category Groups */}
            {groupedTemplates.map(({ category, templates }) => (
              <CategoryGroup
                key={category.id}
                category={category}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={handleSelectTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                isCollapsed={isCategoryCollapsed(category.id)}
                onToggleCollapse={() => toggleCategoryCollapse(category.id)}
                searchQuery={searchQuery}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                categoryRef={(el) => {
                  if (el) {
                    categoryRefs.current.set(category.id, el);
                  }
                }}
              />
            ))}
          </>
        ) : (
          <EmptyState searchQuery={searchQuery} viewMode={preferredView} />
        )}
      </div>

      {/* Template Count & Keyboard Hints */}
      {hasResults && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
          </span>
          <span className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">/</kbd>
            <span>search</span>
          </span>
        </div>
      )}
    </div>
  );
}
