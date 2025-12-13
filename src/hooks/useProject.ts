/**
 * Project state management hook
 * @see specs/002-frontend-project-manager/spec.md - US1, US5
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { projectAPI, settingsAPI, monorepoAPI, readTextFile } from '../lib/tauri-api';
import type {
  Project,
  WorkspacePackage,
  ScanProjectResponse,
  MonorepoTool,
  ProjectFramework,
  UIFramework,
} from '../types/project';
import type { AppSettings, ProjectSortMode } from '../types/tauri';
import { detectFramework, detectUIFramework } from '../lib/framework-detector';

const ERROR_AUTO_DISMISS_MS = 5000;

/**
 * Detect framework and UI framework from project's package.json
 */
async function detectProjectFrameworks(projectPath: string): Promise<{
  framework: ProjectFramework;
  uiFramework: UIFramework;
}> {
  try {
    const packageJsonPath = `${projectPath}/package.json`;
    const content = await readTextFile(packageJsonPath);
    const packageJson = JSON.parse(content);
    return {
      framework: detectFramework(packageJson),
      uiFramework: detectUIFramework(packageJson),
    };
  } catch (err) {
    console.error('Failed to detect frameworks:', err);
    return { framework: null, uiFramework: null };
  }
}

let cachedProjects: Project[] | null = null;
let cachedWorkspaces: Map<string, WorkspacePackage[]> | null = null;
let cachedSettings: AppSettings | null = null;
let cachedActiveProjectId: string | null = null;
let cachedSortMode: ProjectSortMode = 'name';
let cachedProjectOrder: string[] = [];

interface UseProjectReturn {
  projects: Project[];
  activeProjectId: string | null;
  workspaces: Map<string, WorkspacePackage[]>;
  isLoading: boolean;
  isRevalidating: boolean;
  error: string | null;

  sortMode: ProjectSortMode;
  projectOrder: string[];

  loadProjects: () => Promise<void>;
  addProject: (path: string) => Promise<ScanProjectResponse>;
  removeProject: (id: string) => Promise<boolean>;
  setActiveProject: (id: string | null) => void;
  refreshProject: (id: string) => Promise<boolean>;
  updateLastOpenedAt: (id: string) => Promise<void>;
  updateProject: (id: string, updater: (project: Project) => Project) => Promise<Project | null>;

  setSortMode: (mode: ProjectSortMode) => Promise<void>;
  updateProjectOrder: (order: string[]) => Promise<void>;

  getActiveProject: () => Project | null;
  getProjectWorkspaces: (projectId: string) => WorkspacePackage[];
}

export function useProject(): UseProjectReturn {
  const [projects, setProjects] = useState<Project[]>(cachedProjects ?? []);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(cachedActiveProjectId);
  const [workspaces, setWorkspaces] = useState<Map<string, WorkspacePackage[]>>(cachedWorkspaces ?? new Map());
  const [isLoading, setIsLoading] = useState(cachedProjects === null);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(cachedSettings);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sortMode, setSortModeState] = useState<ProjectSortMode>(cachedSortMode);
  const [projectOrder, setProjectOrder] = useState<string[]>(cachedProjectOrder);

  const setErrorWithAutoDismiss = useCallback((errorMessage: string | null) => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    setError(errorMessage);

    if (errorMessage) {
      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
        errorTimeoutRef.current = null;
      }, ERROR_AUTO_DISMISS_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const loadProjects = useCallback(async (forceRefresh = false) => {
    const hasCache = cachedProjects !== null && cachedProjects.length > 0;

    if (hasCache && !forceRefresh) {
      setIsLoading(false);
      setIsRevalidating(true);
    } else {
      setIsLoading(true);
    }

    setErrorWithAutoDismiss(null);

    try {
      const [projectList, loadedSettings] = await Promise.all([
        settingsAPI.loadProjects(),
        settingsAPI.loadSettings(),
      ]);

      cachedProjects = projectList;
      cachedSettings = loadedSettings;

      setProjects(projectList);
      setSettings(loadedSettings);

      const loadedSortMode = (loadedSettings.projectSortMode as ProjectSortMode) || 'name';
      const loadedProjectOrder = loadedSettings.projectOrder || [];
      cachedSortMode = loadedSortMode;
      cachedProjectOrder = loadedProjectOrder;
      setSortModeState(loadedSortMode);
      setProjectOrder(loadedProjectOrder);

      const frameworkPromises = projectList.map(async (project) => {
        const { framework, uiFramework } = await detectProjectFrameworks(project.path);
        return { projectId: project.id, framework, uiFramework };
      });

      const monorepoProjects = projectList.filter(p => p.isMonorepo);
      const workspacePromises = monorepoProjects.map(async (project) => {
        try {
          const [ws, toolResponse] = await Promise.all([
            projectAPI.getWorkspacePackages(project.path),
            monorepoAPI.detectTools(project.path),
          ]);

          let monorepoTool: MonorepoTool = null;
          if (toolResponse.success && toolResponse.primary) {
            const tool = toolResponse.primary;
            if (tool === 'nx' || tool === 'turbo' || tool === 'lerna' || tool === 'workspaces') {
              monorepoTool = tool;
            }
          }

          const workspacesWithFramework = await Promise.all(
            ws.map(async (workspace) => {
              const { uiFramework } = await detectProjectFrameworks(workspace.absolutePath);
              return { ...workspace, uiFramework };
            })
          );

          return { projectId: project.id, workspaces: workspacesWithFramework, monorepoTool };
        } catch (err) {
          console.error(`Failed to load workspaces for ${project.name}:`, err);
          return { projectId: project.id, workspaces: [], monorepoTool: null as MonorepoTool };
        }
      });

      const [frameworkResults, workspaceResults] = await Promise.all([
        Promise.all(frameworkPromises),
        Promise.all(workspacePromises),
      ]);

      const newWorkspaces = new Map<string, WorkspacePackage[]>();
      const updatedProjects = [...projectList];

      for (const result of frameworkResults) {
        const projectIndex = updatedProjects.findIndex(p => p.id === result.projectId);
        if (projectIndex !== -1) {
          updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            ...(result.framework && { framework: result.framework }),
            ...(result.uiFramework && { uiFramework: result.uiFramework }),
          };
        }
      }

      for (const result of workspaceResults) {
        if (result.workspaces.length > 0) {
          newWorkspaces.set(result.projectId, result.workspaces);
        }
        const projectIndex = updatedProjects.findIndex(p => p.id === result.projectId);
        if (projectIndex !== -1 && result.monorepoTool) {
          updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            monorepoTool: result.monorepoTool,
          };
        }
      }

      cachedWorkspaces = newWorkspaces;
      cachedProjects = updatedProjects;
      setWorkspaces(newWorkspaces);
      setProjects(updatedProjects);

      const currentActiveId = cachedActiveProjectId ?? activeProjectId;
      if (projectList.length > 0 && !currentActiveId) {
        const lastProjectId = loadedSettings.lastProjectId;
        let newActiveId: string | null = null;

        if (lastProjectId) {
          const lastProject = projectList.find(p => p.id === lastProjectId);
          if (lastProject) {
            newActiveId = lastProjectId;
          }
        }

        if (!newActiveId) {
          const sorted = [...projectList].sort(
            (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
          );
          newActiveId = sorted[0].id;
        }

        cachedActiveProjectId = newActiveId;
        setActiveProjectId(newActiveId);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      if (!hasCache) {
        setErrorWithAutoDismiss('Failed to load project list');
      }
    } finally {
      setIsLoading(false);
      setIsRevalidating(false);
    }
  }, [activeProjectId, setErrorWithAutoDismiss]);

  const saveLastProjectId = useCallback(async (projectId: string | null) => {
    if (!settings) return;
    const updatedSettings = { ...settings, lastProjectId: projectId ?? undefined };
    setSettings(updatedSettings);
    try {
      await settingsAPI.saveSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }, [settings]);

  const addProject = useCallback(async (path: string): Promise<ScanProjectResponse> => {
    setIsLoading(true);
    setErrorWithAutoDismiss(null);

    try {
      const response = await projectAPI.scanProject(path);

      if (response.success && response.project) {
        const { framework, uiFramework } = await detectProjectFrameworks(path);
        const projectWithFramework = {
          ...response.project,
          ...(framework && { framework }),
          ...(uiFramework && { uiFramework }),
        };

        await projectAPI.saveProject(projectWithFramework);

        setProjects(prev => {
          const updated = [...prev, projectWithFramework];
          cachedProjects = updated;
          return updated;
        });

        if (response.workspaces && response.workspaces.length > 0) {
          setWorkspaces(prev => {
            const newMap = new Map(prev).set(projectWithFramework.id, response.workspaces!);
            cachedWorkspaces = newMap;
            return newMap;
          });
        }

        setActiveProjectId(projectWithFramework.id);
        cachedActiveProjectId = projectWithFramework.id;
        saveLastProjectId(projectWithFramework.id);

        response.project = projectWithFramework;
      } else {
        const errorMessages: Record<string, string> = {
          INVALID_PATH: 'Invalid path',
          NO_PACKAGE_JSON: 'No package.json found in this directory',
          INVALID_PACKAGE_JSON: 'Invalid package.json format',
          ALREADY_EXISTS: 'Project already exists',
        };
        setErrorWithAutoDismiss(errorMessages[response.error || ''] || 'Project scan failed');
      }

      return response;
    } catch (err) {
      console.error('Failed to add project:', err);
      setErrorWithAutoDismiss('Failed to add project');
      return { success: false, error: 'INVALID_PATH' };
    } finally {
      setIsLoading(false);
    }
  }, [setErrorWithAutoDismiss, saveLastProjectId]);

  const removeProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      await projectAPI.removeProject(id);

      setProjects(prev => {
        const updated = prev.filter(p => p.id !== id);
        cachedProjects = updated;
        return updated;
      });
      setWorkspaces(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        cachedWorkspaces = newMap;
        return newMap;
      });

      if (activeProjectId === id) {
        const remaining = projects.filter(p => p.id !== id);
        const newActiveId = remaining.length > 0 ? remaining[0].id : null;
        setActiveProjectId(newActiveId);
        cachedActiveProjectId = newActiveId;
        saveLastProjectId(newActiveId);
      }
      else if (settings?.lastProjectId === id) {
        saveLastProjectId(null);
      }

      return true;
    } catch (err) {
      console.error('Failed to remove project:', err);
      setErrorWithAutoDismiss('Failed to remove project');
      return false;
    }
  }, [activeProjectId, projects, setErrorWithAutoDismiss, saveLastProjectId, settings]);

  const setActiveProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
    cachedActiveProjectId = id;

    saveLastProjectId(id);
  }, [saveLastProjectId]);

  const updateLastOpenedAt = useCallback(async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    const updated = {
      ...project,
      lastOpenedAt: new Date().toISOString(),
    };

    try {
      await projectAPI.saveProject(updated);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
    } catch (err) {
      console.error('Failed to update lastOpenedAt:', err);
    }
  }, [projects]);

  const updateProject = useCallback(async (id: string, updater: (project: Project) => Project): Promise<Project | null> => {
    const current = projects.find(p => p.id === id);
    if (!current) return null;

    const updated = updater(current);

    try {
      await projectAPI.saveProject(updated);
      setProjects(prev => {
        const next = prev.map(p => p.id === id ? updated : p);
        cachedProjects = next;
        return next;
      });
      return updated;
    } catch (err) {
      console.error('Failed to update project:', err);
      setErrorWithAutoDismiss('Failed to save project');
      return null;
    }
  }, [projects, setErrorWithAutoDismiss]);

  const refreshProject = useCallback(async (id: string): Promise<boolean> => {
    setIsRevalidating(true);
    setErrorWithAutoDismiss(null);

    try {
      const response = await projectAPI.refreshProject(id);

      if (response.success && response.project) {
        let updatedProject = response.project;

        const { framework, uiFramework } = await detectProjectFrameworks(updatedProject.path);
        if (framework) {
          updatedProject = { ...updatedProject, framework };
        }
        if (uiFramework) {
          updatedProject = { ...updatedProject, uiFramework };
        }

        let workspacesWithFramework = response.workspaces || [];
        if (updatedProject.isMonorepo) {
          const toolResponse = await monorepoAPI.detectTools(updatedProject.path);
          if (toolResponse.success && toolResponse.primary) {
            const tool = toolResponse.primary;
            if (tool === 'nx' || tool === 'turbo' || tool === 'lerna' || tool === 'workspaces') {
              updatedProject = { ...updatedProject, monorepoTool: tool };
            }
          }

          if (response.workspaces && response.workspaces.length > 0) {
            workspacesWithFramework = await Promise.all(
              response.workspaces.map(async (workspace) => {
                const { uiFramework: wsUiFramework } = await detectProjectFrameworks(workspace.absolutePath);
                return { ...workspace, uiFramework: wsUiFramework };
              })
            );
          }
        }

        setProjects(prev => {
          const updated = prev.map(p => p.id === id ? updatedProject : p);
          cachedProjects = updated;
          return updated;
        });

        if (workspacesWithFramework.length > 0) {
          setWorkspaces(prev => {
            const newMap = new Map(prev).set(id, workspacesWithFramework);
            cachedWorkspaces = newMap;
            return newMap;
          });
        } else {
          setWorkspaces(prev => {
            const newMap = new Map(prev);
            newMap.delete(id);
            cachedWorkspaces = newMap;
            return newMap;
          });
        }

        return true;
      } else {
        const errorMessages: Record<string, string> = {
          PROJECT_NOT_FOUND: 'Project not found',
          PATH_NOT_EXISTS: 'Project path does not exist',
          INVALID_PACKAGE_JSON: 'Invalid package.json format',
        };
        setErrorWithAutoDismiss(errorMessages[response.error || ''] || 'Failed to refresh project');
        return false;
      }
    } catch (err) {
      console.error('Failed to refresh project:', err);
      setErrorWithAutoDismiss('Failed to refresh project');
      return false;
    } finally {
      setIsRevalidating(false);
    }
  }, [setErrorWithAutoDismiss]);

  const getActiveProject = useCallback((): Project | null => {
    if (!activeProjectId) return null;
    return projects.find(p => p.id === activeProjectId) || null;
  }, [activeProjectId, projects]);

  const getProjectWorkspaces = useCallback((projectId: string): WorkspacePackage[] => {
    return workspaces.get(projectId) || [];
  }, [workspaces]);

  const setSortMode = useCallback(async (mode: ProjectSortMode) => {
    setSortModeState(mode);
    cachedSortMode = mode;

    if (settings) {
      const updatedSettings = { ...settings, projectSortMode: mode };
      setSettings(updatedSettings);
      cachedSettings = updatedSettings;
      try {
        await settingsAPI.saveSettings(updatedSettings);
      } catch (err) {
        console.error('Failed to save sort mode:', err);
      }
    }
  }, [settings]);

  const updateProjectOrder = useCallback(async (order: string[]) => {
    setProjectOrder(order);
    cachedProjectOrder = order;

    setSortModeState('custom');
    cachedSortMode = 'custom';

    if (settings) {
      const updatedSettings = {
        ...settings,
        projectSortMode: 'custom' as ProjectSortMode,
        projectOrder: order,
      };
      setSettings(updatedSettings);
      cachedSettings = updatedSettings;
      try {
        await settingsAPI.saveSettings(updatedSettings);
      } catch (err) {
        console.error('Failed to save project order:', err);
      }
    }
  }, [settings]);

  useEffect(() => {
    loadProjects();
  }, []);

  return {
    projects,
    activeProjectId,
    workspaces,
    isLoading,
    isRevalidating,
    error,

    sortMode,
    projectOrder,

    loadProjects,
    addProject,
    removeProject,
    setActiveProject,
    refreshProject,
    updateLastOpenedAt,
    updateProject,

    setSortMode,
    updateProjectOrder,

    getActiveProject,
    getProjectWorkspaces,
  };
}
