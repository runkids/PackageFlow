/**
 * useSpecBranch hook
 * Fetches git branch info for a given spec (branch name, existence, commit count).
 * Re-fetches when specId changes or on spec-changed events.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback } from 'react';

interface SpecBranchInfo {
  branch_name: string;
  exists: boolean;
  commit_count: number;
}

export function useSpecBranch(specId: string | null, projectDir: string) {
  const [branchInfo, setBranchInfo] = useState<SpecBranchInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!specId) {
      setBranchInfo(null);
      return;
    }
    try {
      const info = await invoke<SpecBranchInfo>('get_spec_branch_info', {
        specId,
        projectDir,
      });
      setBranchInfo(info);
    } catch (e) {
      console.error('Failed to get spec branch info:', e);
      setBranchInfo(null);
    }
  }, [specId, projectDir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when specs change (e.g. after advancing to implement phase)
  useEffect(() => {
    const unlisten = listen('specforge://spec-changed', () => {
      refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return branchInfo;
}
