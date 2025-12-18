// Security Guardian Hook
// Manages dependency integrity checking state and operations

import { useState, useCallback } from 'react';
import { snapshotAPI } from '../lib/tauri-api';
import type { IntegrityCheckResult, TyposquattingCheckResult } from '../types/snapshot';

export interface SecurityGuardianState {
  isChecking: boolean;
  lastResult: IntegrityCheckResult | null;
  error: string | null;
  lastCheckedAt: Date | null;
}

export function useSecurityGuardian() {
  const [state, setState] = useState<SecurityGuardianState>({
    isChecking: false,
    lastResult: null,
    error: null,
    lastCheckedAt: null,
  });

  // Feature 025: Removed workflowId parameter - now project-level only
  const checkIntegrity = useCallback(
    async (projectPath: string): Promise<IntegrityCheckResult | null> => {
      setState((prev) => ({
        ...prev,
        isChecking: true,
        error: null,
      }));

      try {
        const result = await snapshotAPI.checkDependencyIntegrity(projectPath);
        setState({
          isChecking: false,
          lastResult: result,
          error: null,
          lastCheckedAt: new Date(),
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          isChecking: false,
          error: errorMessage,
        }));
        return null;
      }
    },
    []
  );

  const checkTyposquatting = useCallback(
    async (packageName: string): Promise<TyposquattingCheckResult | null> => {
      try {
        return await snapshotAPI.checkTyposquatting(packageName);
      } catch (err) {
        console.error('Failed to check typosquatting:', err);
        return null;
      }
    },
    []
  );

  const clearResult = useCallback(() => {
    setState({
      isChecking: false,
      lastResult: null,
      error: null,
      lastCheckedAt: null,
    });
  }, []);

  return {
    ...state,
    checkIntegrity,
    checkTyposquatting,
    clearResult,
  };
}
