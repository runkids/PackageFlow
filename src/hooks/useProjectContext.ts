/**
 * useProjectContext - Hook for managing AI project context
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectContext } from '../types/ai-assistant';

interface UseProjectContextOptions {
  /** Initial project path */
  initialProjectPath?: string;
  /** Auto-fetch context on path change */
  autoFetch?: boolean;
}

interface UseProjectContextReturn {
  /** Current project context */
  projectContext: ProjectContext | null;
  /** Current project path */
  projectPath: string | null;
  /** Whether context is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Set the project path and fetch context */
  setProjectPath: (path: string | null) => void;
  /** Refresh the context */
  refresh: () => Promise<void>;
  /** Clear the context */
  clearContext: () => void;
}

/**
 * Hook for managing project context for AI assistant
 */
export function useProjectContext(
  options: UseProjectContextOptions = {}
): UseProjectContextReturn {
  const { initialProjectPath, autoFetch = true } = options;

  const [projectPath, setProjectPathState] = useState<string | null>(
    initialProjectPath ?? null
  );
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch project context from backend
  const fetchContext = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const context = await invoke<ProjectContext>(
        'ai_assistant_get_project_context',
        { projectPath: path }
      );
      setProjectContext(context);
    } catch (err) {
      console.error('Failed to fetch project context:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch project context');
      setProjectContext(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set project path and fetch context
  const setProjectPath = useCallback((path: string | null) => {
    setProjectPathState(path);
    if (path && autoFetch) {
      fetchContext(path);
    } else if (!path) {
      setProjectContext(null);
    }
  }, [autoFetch, fetchContext]);

  // Refresh context
  const refresh = useCallback(async () => {
    if (projectPath) {
      await fetchContext(projectPath);
    }
  }, [projectPath, fetchContext]);

  // Clear context
  const clearContext = useCallback(() => {
    setProjectPathState(null);
    setProjectContext(null);
    setError(null);
  }, []);

  // Auto-fetch on initial mount if path is provided
  useEffect(() => {
    if (initialProjectPath && autoFetch) {
      fetchContext(initialProjectPath);
    }
  }, []); // Only run on mount

  return {
    projectContext,
    projectPath,
    isLoading,
    error,
    setProjectPath,
    refresh,
    clearContext,
  };
}
