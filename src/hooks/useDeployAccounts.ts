// useDeployAccounts Hook
// Multi Deploy Accounts feature (016-multi-deploy-accounts)
// T017: React Hook for account management

import { useState, useEffect, useCallback } from 'react';
import { deployAPI } from '../lib/tauri-api';
import type {
  PlatformType,
  DeployAccount,
  DeployPreferences,
  RemoveAccountResult,
  OAuthFlowResult,
} from '../types/deploy';

// ============================================================================
// Types
// ============================================================================

export interface UseDeployAccountsState {
  // Accounts
  accounts: DeployAccount[];
  isLoadingAccounts: boolean;
  addingPlatform: PlatformType | null;
  removingAccountId: string | null;

  // Preferences
  preferences: DeployPreferences;
  isLoadingPreferences: boolean;

  // Error
  error: string | null;
}

export interface UseDeployAccountsActions {
  // Account Management
  refreshAccounts: () => Promise<void>;
  addAccount: (platform: PlatformType) => Promise<OAuthFlowResult>;
  removeAccount: (accountId: string, force?: boolean) => Promise<RemoveAccountResult>;
  updateAccountDisplayName: (accountId: string, displayName?: string) => Promise<DeployAccount | null>;

  // Platform Filtering
  getAccountsByPlatform: (platform: PlatformType) => DeployAccount[];
  getAccountById: (accountId: string) => DeployAccount | undefined;

  // Preferences
  refreshPreferences: () => Promise<void>;
  setDefaultAccount: (platform: PlatformType, accountId?: string) => Promise<void>;
  getDefaultAccount: (platform: PlatformType) => DeployAccount | undefined;
  isDefaultAccount: (accountId: string) => boolean;

  // Utility
  clearError: () => void;
  hasAccountsForPlatform: (platform: PlatformType) => boolean;
}

export type UseDeployAccountsReturn = UseDeployAccountsState & UseDeployAccountsActions;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useDeployAccounts(): UseDeployAccountsReturn {
  // State
  const [accounts, setAccounts] = useState<DeployAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [addingPlatform, setAddingPlatform] = useState<PlatformType | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<DeployPreferences>({});
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // ========================================================================
  // Account Management
  // ========================================================================

  const refreshAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const data = await deployAPI.getDeployAccounts();
      setAccounts(data);
    } catch (err) {
      setError(`Failed to load accounts: ${err}`);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  const addAccount = useCallback(async (platform: PlatformType): Promise<OAuthFlowResult> => {
    setAddingPlatform(platform);
    setError(null);
    try {
      const result = await deployAPI.addDeployAccount(platform);
      if (result.success) {
        // Refresh accounts list
        await refreshAccounts();
      } else if (result.error) {
        setError(result.error);
      }
      return result;
    } catch (err) {
      const errorMsg = `Failed to add account: ${err}`;
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setAddingPlatform(null);
    }
  }, [refreshAccounts]);

  const removeAccount = useCallback(async (
    accountId: string,
    force?: boolean
  ): Promise<RemoveAccountResult> => {
    setRemovingAccountId(accountId);
    setError(null);
    try {
      const result = await deployAPI.removeDeployAccount(accountId, force);
      if (result.success) {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
        // Refresh preferences in case this was a default account
        await refreshPreferences();
      }
      return result;
    } catch (err) {
      const errorMsg = `Failed to remove account: ${err}`;
      setError(errorMsg);
      return { success: false, affectedProjects: [] };
    } finally {
      setRemovingAccountId(null);
    }
  }, []);

  const updateAccountDisplayName = useCallback(async (
    accountId: string,
    displayName?: string
  ): Promise<DeployAccount | null> => {
    setError(null);
    try {
      const updated = await deployAPI.updateDeployAccount(accountId, displayName);
      setAccounts(prev => prev.map(a => a.id === accountId ? updated : a));
      return updated;
    } catch (err) {
      setError(`Failed to update account: ${err}`);
      return null;
    }
  }, []);

  // ========================================================================
  // Platform Filtering
  // ========================================================================

  const getAccountsByPlatform = useCallback((platform: PlatformType): DeployAccount[] => {
    return accounts.filter(a => a.platform === platform);
  }, [accounts]);

  const getAccountById = useCallback((accountId: string): DeployAccount | undefined => {
    return accounts.find(a => a.id === accountId);
  }, [accounts]);

  const hasAccountsForPlatform = useCallback((platform: PlatformType): boolean => {
    return accounts.some(a => a.platform === platform);
  }, [accounts]);

  // ========================================================================
  // Preferences
  // ========================================================================

  const refreshPreferences = useCallback(async () => {
    setIsLoadingPreferences(true);
    try {
      const data = await deployAPI.getDeployPreferences();
      setPreferences(data);
    } catch (err) {
      setError(`Failed to load preferences: ${err}`);
    } finally {
      setIsLoadingPreferences(false);
    }
  }, []);

  const setDefaultAccount = useCallback(async (
    platform: PlatformType,
    accountId?: string
  ): Promise<void> => {
    try {
      const updated = await deployAPI.setDefaultAccount(platform, accountId);
      setPreferences(updated);
    } catch (err) {
      setError(`Failed to set default account: ${err}`);
    }
  }, []);

  const getDefaultAccount = useCallback((platform: PlatformType): DeployAccount | undefined => {
    const defaultId = platform === 'github_pages'
      ? preferences.defaultGithubPagesAccountId
      : preferences.defaultNetlifyAccountId;

    if (!defaultId) return undefined;
    return accounts.find(a => a.id === defaultId);
  }, [accounts, preferences]);

  const isDefaultAccount = useCallback((accountId: string): boolean => {
    return preferences.defaultGithubPagesAccountId === accountId ||
           preferences.defaultNetlifyAccountId === accountId;
  }, [preferences]);

  // ========================================================================
  // Utility
  // ========================================================================

  const clearError = useCallback(() => setError(null), []);

  // ========================================================================
  // Load on mount
  // ========================================================================

  useEffect(() => {
    refreshAccounts();
    refreshPreferences();
  }, [refreshAccounts, refreshPreferences]);

  // ========================================================================
  // Return
  // ========================================================================

  return {
    // State
    accounts,
    isLoadingAccounts,
    addingPlatform,
    removingAccountId,
    preferences,
    isLoadingPreferences,
    error,

    // Actions
    refreshAccounts,
    addAccount,
    removeAccount,
    updateAccountDisplayName,
    getAccountsByPlatform,
    getAccountById,
    refreshPreferences,
    setDefaultAccount,
    getDefaultAccount,
    isDefaultAccount,
    clearError,
    hasAccountsForPlatform,
  };
}
