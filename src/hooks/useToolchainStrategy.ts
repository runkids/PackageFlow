/**
 * useToolchainStrategy Hook
 * Feature: 017-toolchain-conflict-detection
 *
 * Manages toolchain strategy detection, preference storage, and conflict resolution
 */

import { useState, useCallback } from 'react';
import { toolchainAPI } from '../lib/tauri-api';
import type {
  ToolchainStrategy,
  ToolchainConflictResult,
  ProjectPreference,
  BuildCommandResult,
  EnvironmentDiagnostics,
  UseToolchainStrategyState,
  UseToolchainStrategyActions,
} from '../types/toolchain';

export interface UseToolchainStrategyReturn extends UseToolchainStrategyState, UseToolchainStrategyActions {}

export function useToolchainStrategy(): UseToolchainStrategyReturn {
  const [conflict, setConflict] = useState<ToolchainConflictResult | null>(null);
  const [preference, setPreferenceState] = useState<ProjectPreference | null>(null);
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Detect toolchain conflict for a project
   * Also loads any saved preference
   */
  const detectConflict = useCallback(async (projectPath: string): Promise<void> => {
    setIsDetecting(true);
    setError(null);

    try {
      // Check for saved preference first
      const savedPreference = await toolchainAPI.getPreference(projectPath);
      setPreferenceState(savedPreference);

      // Detect conflict
      const result = await toolchainAPI.detectConflict(projectPath);
      setConflict(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  /**
   * Set toolchain strategy preference for a project
   */
  const setPreference = useCallback(async (
    projectPath: string,
    strategy: ToolchainStrategy,
    remember: boolean
  ): Promise<void> => {
    setIsSaving(true);
    setError(null);

    try {
      await toolchainAPI.setPreference(projectPath, strategy, remember);

      // Update local state
      if (remember) {
        setPreferenceState({
          project_path: projectPath,
          strategy,
          remember,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  /**
   * Clear toolchain strategy preference for a project
   */
  const clearPreference = useCallback(async (projectPath: string): Promise<void> => {
    setIsSaving(true);
    setError(null);

    try {
      await toolchainAPI.clearPreference(projectPath);
      setPreferenceState(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  /**
   * Get environment diagnostics
   */
  const getDiagnostics = useCallback(async (projectPath?: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await toolchainAPI.getDiagnostics(projectPath);
      setDiagnostics(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Build wrapped command with toolchain strategy
   */
  const buildCommand = useCallback(async (
    projectPath: string,
    command: string,
    args: string[]
  ): Promise<BuildCommandResult | undefined> => {
    setError(null);

    try {
      const result = await toolchainAPI.buildCommand(projectPath, command, args);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return undefined;
    }
  }, []);

  return {
    // State
    conflict,
    preference,
    diagnostics,
    isLoading,
    isDetecting,
    isSaving,
    error,

    // Actions
    detectConflict,
    setPreference,
    clearPreference,
    getDiagnostics,
    buildCommand,
  };
}

export default useToolchainStrategy;
