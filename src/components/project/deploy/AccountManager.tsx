// AccountManager Component
// Multi Deploy Accounts feature (016-multi-deploy-accounts)
// T018: Component for managing multiple deploy accounts

import { useState } from 'react';
import {
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Star,
  AlertCircle,
  User,
  ExternalLink,
} from 'lucide-react';
import type { PlatformType, DeployAccount, DeployPreferences, RemoveAccountResult } from '../../../types/deploy';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { NetlifyIcon } from '../../ui/icons';

// Platform configuration
// Note: GitHub Pages doesn't require OAuth - it uses git credentials directly
const PLATFORMS: Array<{
  id: PlatformType;
  name: string;
  icon: React.ReactNode;
  bgClass: string;
  description: string;
  dashboardUrl: string;
}> = [
  {
    id: 'netlify',
    name: 'Netlify',
    icon: <NetlifyIcon className="h-5 w-5" />,
    bgClass: 'bg-[#0e1e25]',
    description: 'All-in-one platform for web development',
    dashboardUrl: 'https://app.netlify.com',
  },
];

const MAX_ACCOUNTS_PER_PLATFORM = 5;

interface AccountManagerProps {
  accounts: DeployAccount[];
  preferences: DeployPreferences;
  addingPlatform: PlatformType | null;
  removingAccountId: string | null;
  error?: string | null;
  onAddAccount: (platform: PlatformType) => Promise<void>;
  onRemoveAccount: (accountId: string, force?: boolean) => Promise<RemoveAccountResult>;
  onUpdateDisplayName: (accountId: string, displayName?: string) => Promise<void>;
  onSetDefaultAccount: (platform: PlatformType, accountId?: string) => Promise<void>;
}

export function AccountManager({
  accounts,
  preferences,
  addingPlatform,
  removingAccountId,
  error,
  onAddAccount,
  onRemoveAccount,
  onUpdateDisplayName,
  onSetDefaultAccount,
}: AccountManagerProps) {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{
    accountId: string;
    affectedProjects: string[];
  } | null>(null);

  const getAccountsForPlatform = (platformId: PlatformType) =>
    accounts.filter(a => a.platform === platformId);

  const isDefaultAccount = (accountId: string) =>
    preferences.defaultGithubPagesAccountId === accountId ||
    preferences.defaultNetlifyAccountId === accountId;

  const handleStartEdit = (account: DeployAccount) => {
    setEditingAccountId(account.id);
    setEditDisplayName(account.displayName || '');
  };

  const handleSaveDisplayName = async (accountId: string) => {
    await onUpdateDisplayName(accountId, editDisplayName || undefined);
    setEditingAccountId(null);
    setEditDisplayName('');
  };

  const handleCancelEdit = () => {
    setEditingAccountId(null);
    setEditDisplayName('');
  };

  const handleRemoveClick = async (accountId: string) => {
    const result = await onRemoveAccount(accountId, false);
    if (!result.success && result.affectedProjects.length > 0) {
      // Show confirmation dialog with affected projects
      setConfirmRemove({ accountId, affectedProjects: result.affectedProjects });
    }
  };

  const handleConfirmRemove = async () => {
    if (confirmRemove) {
      await onRemoveAccount(confirmRemove.accountId, true);
      setConfirmRemove(null);
    }
  };

  const handleToggleDefault = async (account: DeployAccount) => {
    const currentDefault = account.platform === 'github_pages'
      ? preferences.defaultGithubPagesAccountId
      : preferences.defaultNetlifyAccountId;

    if (currentDefault === account.id) {
      // Clear default
      await onSetDefaultAccount(account.platform, undefined);
    } else {
      // Set as default
      await onSetDefaultAccount(account.platform, account.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Platforms */}
      <div className="space-y-6">
        {PLATFORMS.map(platform => {
          const platformAccounts = getAccountsForPlatform(platform.id);
          const canAddMore = platformAccounts.length < MAX_ACCOUNTS_PER_PLATFORM;
          const isAddingThis = addingPlatform === platform.id;

          return (
            <div key={platform.id} className="space-y-3">
              {/* Platform Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded ${platform.bgClass}`}>
                    {platform.icon}
                  </div>
                  <span className="font-medium">{platform.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({platformAccounts.length}/{MAX_ACCOUNTS_PER_PLATFORM})
                  </span>
                </div>

                {canAddMore && (
                  <button
                    onClick={() => onAddAccount(platform.id)}
                    disabled={isAddingThis || addingPlatform !== null}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    {isAddingThis ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    <span>{isAddingThis ? 'Connecting...' : 'Add Account'}</span>
                  </button>
                )}
              </div>

              {/* Account List */}
              {platformAccounts.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    No {platform.name} accounts connected
                  </p>
                  <button
                    onClick={() => onAddAccount(platform.id)}
                    disabled={isAddingThis || addingPlatform !== null}
                    className="mt-2 text-sm text-primary hover:underline disabled:opacity-50"
                  >
                    Connect your first account
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {platformAccounts.map(account => {
                    const isEditing = editingAccountId === account.id;
                    const isRemoving = removingAccountId === account.id;
                    const isDefault = isDefaultAccount(account.id);

                    return (
                      <div
                        key={account.id}
                        className={`relative rounded-lg border p-3 transition-all ${
                          isDefault
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          {account.avatarUrl ? (
                            <img
                              src={account.avatarUrl}
                              alt={account.username}
                              className="h-8 w-8 rounded-full"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}

                          {/* Account Info */}
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editDisplayName}
                                  onChange={e => setEditDisplayName(e.target.value)}
                                  placeholder={account.username}
                                  className="h-7 w-40 rounded border border-input bg-background px-2 text-sm"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveDisplayName(account.id);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveDisplayName(account.id)}
                                  className="text-sm text-primary hover:underline"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="text-sm text-muted-foreground hover:underline"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">
                                  {account.displayName || account.username}
                                </span>
                                {account.displayName && (
                                  <span className="text-xs text-muted-foreground">
                                    (@{account.username})
                                  </span>
                                )}
                                {isDefault && (
                                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                    <Star className="h-3 w-3" />
                                    Default
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Connected {new Date(account.connectedAt).toLocaleDateString()}
                            </p>
                          </div>

                          {/* Actions */}
                          {!isEditing && (
                            <div className="flex items-center gap-1">
                              {/* Set as Default */}
                              <button
                                onClick={() => handleToggleDefault(account)}
                                className={`rounded p-1.5 transition-colors ${
                                  isDefault
                                    ? 'text-primary hover:bg-primary/10'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                                title={isDefault ? 'Remove as default' : 'Set as default'}
                              >
                                <Star className={`h-4 w-4 ${isDefault ? 'fill-current' : ''}`} />
                              </button>

                              {/* Edit Display Name */}
                              <button
                                onClick={() => handleStartEdit(account)}
                                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title="Edit display name"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>

                              {/* Open Dashboard */}
                              <a
                                href={platform.dashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title="Open dashboard"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>

                              {/* Remove */}
                              <button
                                onClick={() => handleRemoveClick(account.id)}
                                disabled={isRemoving}
                                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                title="Remove account"
                              >
                                {isRemoving ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        variant="destructive"
        title="Remove Account"
        description={`This account is currently used by ${confirmRemove?.affectedProjects.length ?? 0} project(s). Removing it will unbind all associated projects.`}
        confirmText="Remove Anyway"
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
