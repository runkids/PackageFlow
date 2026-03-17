/**
 * useWorkflowStatus hook
 * Fetches and caches the workflow phase status for a given spec.
 * Auto-refreshes on spec-changed events.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback } from 'react';
import type { WorkflowStatus } from '../types/workflow-phase';

export function useWorkflowStatus(specId: string | null, projectDir: string) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!specId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<WorkflowStatus>('get_workflow_status', {
        specId,
        projectDir,
      });
      setStatus(result);
    } catch (e) {
      console.error('Failed to get workflow status:', e);
      setError(String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [specId, projectDir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for spec-changed events to auto-refresh
  useEffect(() => {
    const unlisten = listen('specforge://spec-changed', () => {
      refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return { status, loading, error, refresh };
}
