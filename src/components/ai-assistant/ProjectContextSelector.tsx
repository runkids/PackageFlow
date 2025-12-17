/**
 * ProjectContextSelector - Dropdown to select project context for AI Assistant
 * Feature 024: Context-Aware AI Assistant
 *
 * Design matches the ModelSelector component for consistency
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, FolderOpen, Globe, Check, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
}

interface ProjectContextSelectorProps {
  /** Current project path */
  currentProjectPath?: string;
  /** Handler when project is selected */
  onProjectChange: (projectPath: string | null) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Optional class name */
  className?: string;
}

/**
 * Individual project item in the dropdown
 */
function ProjectItem({
  project,
  isSelected,
  onClick,
  formatPath,
}: {
  project: ProjectInfo | null;
  isSelected: boolean;
  onClick: () => void;
  formatPath: (path: string) => string;
}) {
  const isGlobal = project === null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left',
        'transition-colors duration-100',
        'focus:outline-none focus-visible:bg-accent/50',
        isSelected
          ? 'bg-primary/10 dark:bg-primary/15'
          : 'hover:bg-accent/50 dark:hover:bg-accent/30'
      )}
    >
      {/* Icon container */}
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0',
          'transition-colors duration-100',
          isGlobal
            ? isSelected
              ? 'bg-blue-500/15 dark:bg-blue-500/20'
              : 'bg-muted/60 dark:bg-muted/40'
            : isSelected
              ? 'bg-amber-500/15 dark:bg-amber-500/20'
              : 'bg-muted/60 dark:bg-muted/40'
        )}
      >
        {isGlobal ? (
          <Globe
            className={cn(
              'w-4 h-4',
              isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-muted-foreground'
            )}
          />
        ) : (
          <Folder
            className={cn(
              'w-4 h-4',
              isSelected ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'
            )}
          />
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col flex-1 min-w-0">
        <span
          className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-foreground' : 'text-foreground/90'
          )}
        >
          {isGlobal ? 'Global' : project.name}
        </span>
        <span
          className={cn(
            'text-[11px] truncate',
            isSelected ? 'text-muted-foreground' : 'text-muted-foreground/70'
          )}
          title={isGlobal ? 'No project context' : project.path}
        >
          {isGlobal ? 'No project context' : formatPath(project.path)}
        </span>
      </div>

      {/* Check indicator */}
      {isSelected && (
        <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
          <Check className="w-4 h-4 text-primary" />
        </div>
      )}
    </button>
  );
}

/**
 * Project context selector for AI Assistant
 * Allows users to select which project the AI should operate on
 */
export function ProjectContextSelector({
  currentProjectPath,
  onProjectChange,
  disabled = false,
  className,
}: ProjectContextSelectorProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Settings for path display format
  const { formatPath } = useSettings();

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        // Use the MCP tool to list projects (consistent with AI tool usage)
        // Note: ai_assistant_execute_tool_direct returns ToolResult with output as JSON string
        const result = await invoke<{
          callId: string;
          success: boolean;
          output: string;
          error?: string;
        }>('ai_assistant_execute_tool_direct', {
          toolName: 'list_projects',
          toolArgs: {},
        });

        if (result.success && result.output) {
          // Parse the JSON output string
          const parsed = JSON.parse(result.output) as { projects: ProjectInfo[] };
          if (parsed && Array.isArray(parsed.projects)) {
            setProjects(parsed.projects);
          }
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        // Fallback: try direct API
        try {
          const projectList = await invoke<ProjectInfo[]>('get_all_projects');
          setProjects(projectList);
        } catch {
          setProjects([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Handle click outside to close dropdown
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

  // Find current project
  const currentProject = useMemo(
    () => projects.find((p) => p.path === currentProjectPath),
    [projects, currentProjectPath]
  );

  // Handle project selection
  const handleSelectProject = useCallback(
    (project: ProjectInfo | null) => {
      onProjectChange(project?.path ?? null);
      setIsOpen(false);
    },
    [onProjectChange]
  );

  // Empty state - no projects
  if (!isLoading && projects.length === 0) {
    return (
      <span
        className={cn(
          'text-xs text-muted-foreground px-2.5 py-1.5 bg-muted/30 rounded-lg border border-border/50',
          className
        )}
      >
        No projects registered
      </span>
    );
  }

  const isGlobalContext = !currentProjectPath;

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg',
          'text-xs font-medium',
          'bg-muted/40 hover:bg-muted/60',
          'border border-border/60 hover:border-border',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          (disabled || isLoading) && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Select project context"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {isGlobalContext ? (
          <Globe className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
        ) : (
          <FolderOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
        )}
        <span className="truncate max-w-[100px]">
          {isLoading ? 'Loading...' : (currentProject?.name ?? 'Global')}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-muted-foreground/70 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-[1000] mt-1.5 left-0',
            'min-w-[260px] max-w-[320px]',
            'rounded-xl shadow-lg',
            'bg-card',
            'border border-border',
            'overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
            'duration-150'
          )}
          role="listbox"
          aria-label="Project context options"
        >
          {/* Global option */}
          <div className="border-b border-border/50 dark:border-border/30">
            <ProjectItem
              project={null}
              isSelected={isGlobalContext}
              onClick={() => handleSelectProject(null)}
              formatPath={formatPath}
            />
          </div>

          {/* Projects section */}
          {projects.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Projects
                </span>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {projects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isSelected={currentProjectPath === project.path}
                    onClick={() => handleSelectProject(project)}
                    formatPath={formatPath}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
