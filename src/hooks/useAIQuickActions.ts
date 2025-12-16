/**
 * useAIQuickActions - Hook for managing AI quick action suggestions
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SuggestedAction, SuggestionsResponse } from '../types/ai-assistant';

interface UseAIQuickActionsOptions {
  /** Current conversation ID */
  conversationId?: string;
  /** Project path for context */
  projectPath?: string;
  /** Whether to fetch suggestions automatically */
  autoFetch?: boolean;
}

interface UseAIQuickActionsReturn {
  /** Current suggestions */
  suggestions: SuggestedAction[];
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refresh suggestions */
  refresh: () => Promise<void>;
}

/**
 * Default quick actions when no project context is available
 * These map directly to PackageFlow MCP tools for practical use
 */
const DEFAULT_SUGGESTIONS: SuggestedAction[] = [
  {
    id: 'list-projects',
    label: 'Projects',
    prompt: 'Use list_projects to show all registered projects',
    icon: 'FolderOpen',
    variant: 'primary',
    category: 'project',
  },
  {
    id: 'list-workflows',
    label: 'Workflows',
    prompt: 'Use list_workflows to show all available workflows',
    icon: 'Workflow',
    variant: 'default',
    category: 'workflow',
  },
  {
    id: 'list-actions',
    label: 'Actions',
    prompt: 'Use list_actions to show all MCP actions',
    icon: 'Zap',
    variant: 'default',
    category: 'workflow',
  },
];

/**
 * Hook for fetching and managing contextual quick actions
 */
export function useAIQuickActions(options: UseAIQuickActionsOptions = {}): UseAIQuickActionsReturn {
  const { conversationId, projectPath, autoFetch = true } = options;

  const [suggestions, setSuggestions] = useState<SuggestedAction[]>(DEFAULT_SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch suggestions from backend
  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await invoke<SuggestionsResponse>('ai_assistant_get_suggestions', {
        conversationId,
        projectPath,
      });

      if (response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
      } else {
        setSuggestions(DEFAULT_SUGGESTIONS);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch suggestions');
      // Fall back to default suggestions on error
      setSuggestions(DEFAULT_SUGGESTIONS);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, projectPath]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetchSuggestions();
    }
  }, [autoFetch, fetchSuggestions]);

  // Refresh function for manual refresh
  const refresh = useCallback(async () => {
    await fetchSuggestions();
  }, [fetchSuggestions]);

  return {
    suggestions,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Get quick actions based on detected project context
 * These map directly to PackageFlow MCP tools
 */
export function getContextualQuickActions(
  hasGit: boolean,
  hasPackageJson: boolean,
  hasStagedChanges: boolean
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Git actions
  if (hasGit) {
    actions.push({
      id: 'git-status',
      label: 'Git Status',
      prompt: 'Use get_git_status for this project',
      icon: 'GitBranch',
      variant: 'default',
      category: 'git',
    });

    if (hasStagedChanges) {
      actions.push({
        id: 'git-diff',
        label: 'Staged Diff',
        prompt: 'Use get_staged_diff to show staged changes',
        icon: 'FileDiff',
        variant: 'default',
        category: 'git',
      });
    }

    actions.push({
      id: 'list-worktrees',
      label: 'Worktrees',
      prompt: 'Use list_worktrees for this project',
      icon: 'GitFork',
      variant: 'default',
      category: 'git',
    });
  }

  // Node.js project actions
  if (hasPackageJson) {
    actions.push({
      id: 'list-scripts',
      label: 'Scripts',
      prompt: 'Use list_project_scripts to show available npm scripts',
      icon: 'Terminal',
      variant: 'default',
      category: 'project',
    });

    actions.push({
      id: 'run-dev',
      label: 'npm dev',
      prompt: 'Use run_npm_script with scriptName "dev"',
      icon: 'Play',
      variant: 'primary',
      category: 'project',
    });

    actions.push({
      id: 'run-build',
      label: 'npm build',
      prompt: 'Use run_npm_script with scriptName "build"',
      icon: 'Hammer',
      variant: 'default',
      category: 'project',
    });

    actions.push({
      id: 'run-test',
      label: 'npm test',
      prompt: 'Use run_npm_script with scriptName "test"',
      icon: 'TestTube',
      variant: 'default',
      category: 'project',
    });
  }

  return actions;
}
