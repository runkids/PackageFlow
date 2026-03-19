import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { tauriBridge, type Project } from '../api/tauri-bridge';

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
  switching: boolean;
  refresh: () => Promise<void>;
  addProject: (name: string, path: string, projectType: 'global' | 'project') => Promise<Project>;
  switchProject: (id: string) => Promise<void>;
  switchWithRestart: (id: string) => Promise<number | undefined>;
  removeProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProject: null,
  switching: false,
  refresh: async () => {},
  addProject: async () => ({}) as Project,
  switchProject: async () => {},
  switchWithRestart: async () => undefined,
  removeProject: async () => {},
});

export function useProjects() {
  return useContext(ProjectContext);
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [switching, setSwitching] = useState(false);
  const switchLock = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([
        tauriBridge.listProjects(),
        tauriBridge.getActiveProject(),
      ]);
      setProjects(list);
      setActiveProject(active);
    } catch {
      // Silently ignore — projects may not exist yet
    }
  }, []);

  const addProject = useCallback(
    async (name: string, path: string, projectType: 'global' | 'project') => {
      const project = await tauriBridge.addProject(name, path, projectType);
      await refresh();
      return project;
    },
    [refresh],
  );

  const switchProject = useCallback(
    async (id: string) => {
      setSwitching(true);
      try {
        await tauriBridge.switchProject(id);
        await refresh();
      } finally {
        setSwitching(false);
      }
    },
    [refresh],
  );

  const switchWithRestart = useCallback(
    async (id: string) => {
      if (switchLock.current) return undefined;
      switchLock.current = true;
      setSwitching(true);
      try {
        await tauriBridge.stopServer();
        await tauriBridge.switchProject(id);
        await refresh();
        const cliPath = await tauriBridge.detectCli();
        const active = await tauriBridge.getActiveProject();
        const projectDir = active?.path;
        const port = await tauriBridge.startServer(cliPath!, projectDir);
        return port;
      } finally {
        setSwitching(false);
        switchLock.current = false;
      }
    },
    [refresh],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await tauriBridge.removeProject(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        switching,
        refresh,
        addProject,
        switchProject,
        switchWithRestart,
        removeProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
