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
 */
const DEFAULT_SUGGESTIONS: SuggestedAction[] = [
  {
    id: 'help',
    label: 'What can you do?',
    prompt: 'What can you help me with?',
    icon: 'HelpCircle',
    variant: 'default',
    category: 'general',
  },
  {
    id: 'explain',
    label: 'Explain code',
    prompt: 'Please explain what this code does',
    icon: 'FileSearch',
    variant: 'default',
    category: 'general',
  },
  {
    id: 'refactor',
    label: 'Refactor',
    prompt: 'Suggest how to refactor and improve this code',
    icon: 'Hammer',
    variant: 'default',
    category: 'general',
  },
  {
    id: 'debug',
    label: 'Debug issue',
    prompt: 'Help me debug this issue',
    icon: 'TestTube',
    variant: 'warning',
    category: 'general',
  },
  {
    id: 'terminal',
    label: 'Run command',
    prompt: 'Run a terminal command for me',
    icon: 'Terminal',
    variant: 'default',
    category: 'general',
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
 */
export function getContextualQuickActions(
  hasGit: boolean,
  hasPackageJson: boolean,
  hasStagedChanges: boolean
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Git actions
  if (hasGit) {
    if (hasStagedChanges) {
      actions.push({
        id: 'commit-message',
        label: 'Generate commit',
        prompt: 'Generate a commit message for my staged changes',
        icon: 'GitCommit',
        variant: 'primary',
        category: 'git',
      });
    }

    actions.push({
      id: 'review-changes',
      label: 'Review changes',
      prompt: 'Review my current changes and suggest improvements',
      icon: 'FileSearch',
      variant: 'default',
      category: 'git',
    });
  }

  // Node.js project actions
  if (hasPackageJson) {
    actions.push({
      id: 'run-tests',
      label: 'Run tests',
      prompt: 'Run the test suite for this project',
      icon: 'TestTube',
      variant: 'default',
      category: 'project',
    });

    actions.push({
      id: 'build-project',
      label: 'Build project',
      prompt: 'Build this project',
      icon: 'Hammer',
      variant: 'default',
      category: 'project',
    });
  }

  // Always include general help
  actions.push({
    id: 'help',
    label: 'Help',
    prompt: 'What can you help me with?',
    icon: 'HelpCircle',
    variant: 'default',
    category: 'general',
  });

  return actions;
}
