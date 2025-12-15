/**
 * Project sidebar component
 * @see specs/002-frontend-project-manager/spec.md - US5
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ListSidebarHeader,
  ListSidebarItem,
  ListSidebarEmpty,
} from '../ui/ListSidebar';
import type { SortOption } from '../ui/ListSidebar';
import type { Project } from '../../types/project';
import type { ProjectSortMode } from '../../types/tauri';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  isCollapsed: boolean;
  sortMode: ProjectSortMode;
  projectOrder: string[];
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onRemoveProject: (id: string) => void;
  onToggleCollapse: () => void;
  onSortModeChange: (mode: ProjectSortMode) => void;
  onProjectOrderChange: (order: string[]) => void;
}

const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'lastOpened', label: 'Recently Opened' },
  { value: 'created', label: 'Date Created' },
  { value: 'custom', label: 'Custom Order' },
];

interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  isFocused: boolean;
  isMenuOpen: boolean;
  isDraggable: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortableProjectItem({
  project,
  isActive,
  isFocused,
  isMenuOpen,
  isDraggable,
  onSelect,
  onContextMenu,
}: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ListSidebarItem
        id={project.id}
        name={project.name}
        icon={Folder}
        activeIcon={FolderOpen}
        primaryMeta={project.isMonorepo ? 'Monorepo' : undefined}
        isSelected={isActive}
        isFocused={isFocused}
        isMenuOpen={isMenuOpen}
        isDraggable={isDraggable}
        isDragging={isDragging}
        dragAttributes={attributes}
        dragListeners={listeners}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  isLoading,
  isCollapsed,
  sortMode,
  projectOrder,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onToggleCollapse,
  onSortModeChange,
  onProjectOrderChange,
}: ProjectSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    projectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedProjects = useMemo(() => {
    let filtered = projects;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.path.toLowerCase().includes(query)
      );
    }

    const sorted = [...filtered];
    switch (sortMode) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'lastOpened':
        return sorted.sort(
          (a, b) =>
            new Date(b.lastOpenedAt).getTime() -
            new Date(a.lastOpenedAt).getTime()
        );
      case 'created':
        return sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      case 'custom':
        return sorted.sort((a, b) => {
          const aIndex = projectOrder.indexOf(a.id);
          const bIndex = projectOrder.indexOf(b.id);
          if (aIndex === -1 && bIndex === -1)
            return a.name.localeCompare(b.name);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      default:
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [projects, searchQuery, sortMode, projectOrder]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortedProjects.findIndex((p) => p.id === active.id);
        const newIndex = sortedProjects.findIndex((p) => p.id === over.id);

        const newSortedProjects = arrayMove(sortedProjects, oldIndex, newIndex);
        const newOrder = newSortedProjects.map((p) => p.id);
        onProjectOrderChange(newOrder);
      }
    },
    [sortedProjects, onProjectOrderChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedProjects.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < sortedProjects.length - 1 ? prev + 1 : 0;
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : sortedProjects.length - 1;
            return next;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < sortedProjects.length) {
            onSelectProject(sortedProjects[focusedIndex].id);
          }
          break;
        case 'Escape':
          setFocusedIndex(-1);
          searchInputRef.current?.blur();
          break;
      }
    },
    [sortedProjects, focusedIndex, onSelectProject]
  );

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  // Listen for Cmd+F shortcut event to focus search input
  useEffect(() => {
    const handleShortcutFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('shortcut-focus-search', handleShortcutFocusSearch);
    return () =>
      window.removeEventListener(
        'shortcut-focus-search',
        handleShortcutFocusSearch
      );
  }, []);

  const handleContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isButtonClick = e.type === 'click';
    setContextMenu({
      projectId,
      x: isButtonClick ? rect.right - 140 : e.clientX,
      y: isButtonClick ? rect.bottom + 4 : e.clientY,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleMenuAction = (action: 'remove') => {
    if (!contextMenu) return;

    if (action === 'remove') {
      onRemoveProject(contextMenu.projectId);
    }

    closeContextMenu();
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-background border-r border-border flex flex-col">
        <div className="p-2">
          <Button
            variant="ghost"
            onClick={onToggleCollapse}
            className="w-full p-2 h-auto"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground mx-auto" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedProjects.map((project) => (
            <Button
              key={project.id}
              variant="ghost"
              onClick={() => onSelectProject(project.id)}
              className={`w-full p-2 rounded h-auto ${
                activeProjectId === project.id
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'hover:bg-accent text-muted-foreground'
              }`}
              title={project.name}
            >
              {activeProjectId === project.id ? (
                <FolderOpen className="w-4 h-4 mx-auto" />
              ) : (
                <Folder className="w-4 h-4 mx-auto" />
              )}
            </Button>
          ))}
        </div>
        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={onAddProject}
            className="w-full p-2 h-auto"
            title="Add project"
          >
            <Plus className="w-4 h-4 text-muted-foreground mx-auto" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-60 bg-background border-r border-border flex flex-col focus:outline-none"
      onClick={closeContextMenu}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Search and actions */}
      <ListSidebarHeader
        searchQuery={searchQuery}
        searchPlaceholder="Search projects..."
        sortMode={sortMode}
        sortOptions={SORT_OPTIONS}
        onSearchChange={setSearchQuery}
        onSortModeChange={(mode) => onSortModeChange(mode as ProjectSortMode)}
        onCreateNew={onAddProject}
        onToggleCollapse={onToggleCollapse}
        isCollapsible
      />

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : sortedProjects.length === 0 ? (
          <ListSidebarEmpty
            type="projects"
            hasSearch={searchQuery.trim().length > 0}
            searchQuery={searchQuery}
            onCreateNew={onAddProject}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul ref={listRef} className="p-2 space-y-1">
                {sortedProjects.map((project, index) => (
                  <SortableProjectItem
                    key={project.id}
                    project={project}
                    isActive={activeProjectId === project.id}
                    isFocused={focusedIndex === index}
                    isMenuOpen={contextMenu?.projectId === project.id}
                    isDraggable={sortMode === 'custom'}
                    onSelect={() => onSelectProject(project.id)}
                    onContextMenu={(e) => handleContextMenu(e, project.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Drag hint - only show in custom mode */}
      {sortMode === 'custom' && sortedProjects.length > 1 && (
        <div className="px-2 py-1.5 border-t border-border text-xs text-muted-foreground text-center">
          Drag items to reorder
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          {/* Transparent overlay - click anywhere to close */}
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <Button
              variant="ghost"
              onClick={() => handleMenuAction('remove')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-accent justify-start h-auto rounded-none"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
