/**
 * Deploy Accounts Settings Panel
 * Manage deployment accounts for various platforms
 * Redesigned with modular components and improved visual hierarchy
 */

import React, { useCallback, useState } from 'react';
import { Rocket, AlertCircle } from 'lucide-react';
import { useDeployAccounts } from '../../../hooks/useDeployAccounts';
import {
  PLATFORMS,
  PlatformAccountSection,
  SecurityInfoBox,
} from '../../project/deploy/AccountManager';
import { CloudflareTokenDialog } from '../../project/deploy/CloudflareTokenDialog';
import type { PlatformType } from '../../../types/deploy';

export const DeployAccountsPanel: React.FC = () => {
  const {
    accounts,
    preferences,
    addingPlatform,
    removingAccountId,
    error,
    addAccount,
    removeAccount,
    updateAccountDisplayName,
    setDefaultAccount,
    refreshAccounts,
    checkUsage,
  } = useDeployAccounts();

  const [showCloudflareDialog, setShowCloudflareDialog] = useState(false);

  // Get accounts for a specific platform
  const getAccountsForPlatform = useCallback(
    (platformId: PlatformType) => accounts.filter((a) => a.platform === platformId),
    [accounts]
  );

  // Get default account ID for a platform
  const getDefaultAccountId = useCallback(
    (platformId: PlatformType): string | undefined => {
      switch (platformId) {
        case 'github_pages':
          return preferences.defaultGithubPagesAccountId;
        case 'netlify':
          return preferences.defaultNetlifyAccountId;
        case 'cloudflare_pages':
          return preferences.defaultCloudflarePagesAccountId;
      }
    },
    [preferences]
  );

  // Handle add account with special handling for Cloudflare
  const handleAddAccount = useCallback(
    async (platformId: PlatformType): Promise<void> => {
      const platform = PLATFORMS.find((p) => p.id === platformId);
      if (platform?.authType === 'token' && platformId === 'cloudflare_pages') {
        setShowCloudflareDialog(true);
      } else {
        await addAccount(platformId);
      }
    },
    [addAccount]
  );

  // Handle Cloudflare dialog success
  const handleCloudflareSuccess = useCallback(async () => {
    await refreshAccounts();
  }, [refreshAccounts]);

  // Handle display name update
  const handleUpdateDisplayName = useCallback(
    async (accountId: string, displayName?: string): Promise<void> => {
      await updateAccountDisplayName(accountId, displayName);
    },
    [updateAccountDisplayName]
  );

  // Handle remove account
  const handleRemoveAccount = useCallback(
    (accountId: string) => {
      removeAccount(accountId, true);
    },
    [removeAccount]
  );

  // Handle set default account
  const handleSetDefaultAccount = useCallback(
    (platformId: PlatformType, accountId?: string) => {
      setDefaultAccount(platformId, accountId);
    },
    [setDefaultAccount]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Deploy Accounts
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect and manage accounts for deploying your projects to cloud platforms
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Platform Sections */}
      {PLATFORMS.map((platform) => (
        <PlatformAccountSection
          key={platform.id}
          platform={platform}
          accounts={getAccountsForPlatform(platform.id)}
          defaultAccountId={getDefaultAccountId(platform.id)}
          isAdding={addingPlatform === platform.id}
          removingAccountId={removingAccountId}
          onAddAccount={() => handleAddAccount(platform.id)}
          onRemoveAccount={handleRemoveAccount}
          onUpdateDisplayName={handleUpdateDisplayName}
          onSetDefaultAccount={(accountId) =>
            handleSetDefaultAccount(platform.id, accountId)
          }
          onCheckUsage={checkUsage}
        />
      ))}

      {/* Security Info */}
      <SecurityInfoBox />

      {/* Cloudflare Token Dialog */}
      <CloudflareTokenDialog
        isOpen={showCloudflareDialog}
        onClose={() => setShowCloudflareDialog(false)}
        onSuccess={handleCloudflareSuccess}
      />
    </div>
  );
};
