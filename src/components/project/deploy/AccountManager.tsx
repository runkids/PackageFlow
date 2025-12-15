/**
 * Account Manager Components
 * Multi Deploy Accounts feature (016-multi-deploy-accounts)
 * Redesigned with modular components for better maintainability
 */

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
  MoreHorizontal,
  ShieldCheck,
} from 'lucide-react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type {
  PlatformType,
  DeployAccount,
  DeployPreferences,
  RemoveAccountResult,
  CheckAccountResult,
} from '../../../types/deploy';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '../../ui/Dropdown';
import { NetlifyIcon, CloudflareIcon } from '../../ui/icons';
import { CloudflareTokenDialog } from './CloudflareTokenDialog';
import { formatRelativeTime } from '../../../hooks/useWorktreeStatuses';
import { cn } from '../../../lib/utils';

// ============================================================================
// Platform Configuration
// ============================================================================

export interface PlatformConfig {
  id: PlatformType;
  name: string;
  icon: React.ReactNode;
  bgClass: string;
  accentColor: string;
  borderAccent: string;
  description: string;
  dashboardUrl: string;
  authType: 'oauth' | 'token';
}

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'netlify',
    name: 'Netlify',
    icon: <NetlifyIcon className="h-4 w-4" />,
    bgClass: 'bg-[#0e1e25]',
    accentColor: 'text-teal-500',
    borderAccent: 'border-l-teal-500',
    description: 'All-in-one platform for web development',
    dashboardUrl: 'https://app.netlify.com',
    authType: 'oauth',
  },
  {
    id: 'cloudflare_pages',
    name: 'Cloudflare Pages',
    icon: <CloudflareIcon className="h-4 w-4" />,
    bgClass: 'bg-[#f38020]',
    accentColor: 'text-orange-500',
    borderAccent: 'border-l-orange-500',
    description: 'JAMstack platform with global edge network',
    dashboardUrl: 'https://dash.cloudflare.com',
    authType: 'token',
  },
];

export const MAX_ACCOUNTS_PER_PLATFORM = 5;

// ============================================================================
// AccountCard Component
// ============================================================================

interface AccountCardProps {
  account: DeployAccount;
  platform: PlatformConfig;
  isDefault: boolean;
  isRemoving: boolean;
  onEdit: () => void;
  onToggleDefault: () => void;
  onOpenDashboard: () => void;
  onRemove: () => void;
}

export function AccountCard({
  account,
  platform,
  isDefault,
  isRemoving,
  onEdit,
  onToggleDefault,
  onOpenDashboard,
  onRemove,
}: AccountCardProps) {
  // Check if token is expiring soon (within 7 days)
  const isExpiringSoon =
    account.expiresAt &&
    new Date(account.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
  const isExpired =
    account.expiresAt && new Date(account.expiresAt).getTime() < Date.now();

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card p-3 transition-all',
        isDefault && 'border-l-4',
        isDefault && platform.borderAccent,
        !isDefault && 'border-border'
      )}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt={account.username}
            className="h-10 w-10 rounded-full ring-2 ring-border"
          />
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              platform.bgClass
            )}
          >
            <User className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Account Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground truncate">
              {account.displayName || account.username}
            </span>
            {account.displayName && (
              <span className="text-xs text-muted-foreground truncate">
                @{account.username}
              </span>
            )}
            {isDefault && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  'bg-primary/10 text-primary'
                )}
              >
                <Star className="h-3 w-3 fill-current" />
                Default
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>Connected {formatRelativeTime(account.connectedAt)}</span>
            {isExpired && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                Token expired
              </span>
            )}
            {isExpiringSoon && !isExpired && (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertCircle className="h-3 w-3" />
                Expires soon
              </span>
            )}
          </div>
        </div>

        {/* Actions Dropdown */}
        <Dropdown
          trigger={
            <button
              className={cn(
                'rounded-md p-2 transition-colors',
                'text-muted-foreground hover:bg-accent hover:text-foreground',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Account actions"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          }
          align="right"
        >
          <DropdownItem
            icon={<Star className={cn('h-4 w-4', isDefault && 'fill-current')} />}
            onClick={onToggleDefault}
          >
            {isDefault ? 'Remove as default' : 'Set as default'}
          </DropdownItem>
          <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
            Edit display name
          </DropdownItem>
          <DropdownItem
            icon={<ExternalLink className="h-4 w-4" />}
            onClick={onOpenDashboard}
          >
            Open dashboard
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            icon={<Trash2 className="h-4 w-4" />}
            onClick={onRemove}
            destructive
            disabled={isRemoving}
          >
            Remove account
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  );
}

// ============================================================================
// EditDisplayNameInput Component
// ============================================================================

interface EditDisplayNameInputProps {
  initialValue: string;
  placeholder: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function EditDisplayNameInput({
  initialValue,
  placeholder,
  onSave,
  onCancel,
}: EditDisplayNameInputProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/50 bg-card">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring'
        )}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={() => onSave(value)}
        className="px-3 py-1.5 text-sm font-medium text-primary hover:underline"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-sm text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}

// ============================================================================
// PlatformAccountSection Component
// ============================================================================

interface PlatformAccountSectionProps {
  platform: PlatformConfig;
  accounts: DeployAccount[];
  defaultAccountId?: string;
  isAdding: boolean;
  removingAccountId: string | null;
  /** Hide platform header when used inside SettingSection */
  hideHeader?: boolean;
  onAddAccount: () => void;
  onRemoveAccount: (accountId: string) => void;
  onUpdateDisplayName: (accountId: string, displayName?: string) => void;
  onSetDefaultAccount: (accountId?: string) => void;
  onCheckUsage: (accountId: string) => Promise<CheckAccountResult | null>;
}

export function PlatformAccountSection({
  platform,
  accounts,
  defaultAccountId,
  isAdding,
  removingAccountId,
  hideHeader = false,
  onAddAccount,
  onRemoveAccount,
  onUpdateDisplayName,
  onSetDefaultAccount,
  onCheckUsage,
}: PlatformAccountSectionProps) {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{
    accountId: string;
    affectedProjects: string[];
  } | null>(null);

  const canAddMore = accounts.length < MAX_ACCOUNTS_PER_PLATFORM;

  const handleStartEdit = (account: DeployAccount) => {
    setEditingAccountId(account.id);
  };

  const handleSaveDisplayName = async (accountId: string, value: string) => {
    await onUpdateDisplayName(accountId, value || undefined);
    setEditingAccountId(null);
  };

  const handleRemoveClick = async (accountId: string) => {
    const result = await onCheckUsage(accountId);
    if (result) {
      setConfirmRemove({ accountId, affectedProjects: result.affectedProjects });
    }
  };

  const handleConfirmRemove = async () => {
    if (confirmRemove) {
      onRemoveAccount(confirmRemove.accountId);
      setConfirmRemove(null);
    }
  };

  const handleToggleDefault = (account: DeployAccount) => {
    if (defaultAccountId === account.id) {
      onSetDefaultAccount(undefined);
    } else {
      onSetDefaultAccount(account.id);
    }
  };

  return (
    <div className="space-y-3">
      {/* Platform Header - hidden when used inside SettingSection */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                platform.bgClass
              )}
            >
              {platform.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{platform.name}</span>
                <span className="text-xs text-muted-foreground">
                  {accounts.length}/{MAX_ACCOUNTS_PER_PLATFORM}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{platform.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Account List */}
      <div className="space-y-2">
        {accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <div
              className={cn(
                'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full',
                'bg-muted'
              )}
            >
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No {platform.name} accounts connected
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect an account to start deploying
            </p>
          </div>
        ) : (
          accounts.map((account) => {
            const isEditing = editingAccountId === account.id;
            const isRemoving = removingAccountId === account.id;
            const isDefault = defaultAccountId === account.id;

            if (isEditing) {
              return (
                <EditDisplayNameInput
                  key={account.id}
                  initialValue={account.displayName || ''}
                  placeholder={account.username}
                  onSave={(value) => handleSaveDisplayName(account.id, value)}
                  onCancel={() => setEditingAccountId(null)}
                />
              );
            }

            return (
              <AccountCard
                key={account.id}
                account={account}
                platform={platform}
                isDefault={isDefault}
                isRemoving={isRemoving}
                onEdit={() => handleStartEdit(account)}
                onToggleDefault={() => handleToggleDefault(account)}
                onOpenDashboard={() => shellOpen(platform.dashboardUrl)}
                onRemove={() => handleRemoveClick(account.id)}
              />
            );
          })
        )}
      </div>

      {/* Add Account Button */}
      {canAddMore && (
        <button
          onClick={onAddAccount}
          disabled={isAdding}
          className={cn(
            'flex w-full items-center justify-center gap-2',
            'rounded-lg border border-dashed border-border',
            'px-4 py-2.5 text-sm font-medium',
            'text-muted-foreground transition-colors',
            'hover:border-primary/50 hover:bg-accent/50 hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isAdding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              <span>Add {platform.name} Account</span>
            </>
          )}
        </button>
      )}

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        variant="destructive"
        title="Remove Account"
        description={
          (confirmRemove?.affectedProjects?.length ?? 0) > 0
            ? `This account is currently used by ${confirmRemove?.affectedProjects.length} project(s). Removing it will unbind all associated projects.`
            : 'Are you sure you want to remove this account? This action cannot be undone.'
        }
        confirmText={
          (confirmRemove?.affectedProjects?.length ?? 0) > 0
            ? 'Remove Anyway'
            : 'Yes, Remove'
        }
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}

// ============================================================================
// Security Info Box Component
// ============================================================================

export function SecurityInfoBox() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
        <ShieldCheck className="h-4 w-4 text-green-500" />
      </div>
      <div>
        <h4 className="text-sm font-medium text-foreground">Secure Storage</h4>
        <p className="text-xs text-muted-foreground mt-1">
          API tokens and credentials are encrypted and stored securely in your system
          keychain. They are never exposed to the frontend or logged.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// AccountManager Component (Legacy wrapper for backward compatibility)
// ============================================================================

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
  onRefreshAccounts: () => Promise<void>;
  onCheckUsage: (accountId: string) => Promise<CheckAccountResult | null>;
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
  onRefreshAccounts,
  onCheckUsage,
}: AccountManagerProps) {
  const [showCloudflareDialog, setShowCloudflareDialog] = useState(false);

  const getAccountsForPlatform = (platformId: PlatformType) =>
    accounts.filter((a) => a.platform === platformId);

  const getDefaultAccountId = (platformId: PlatformType): string | undefined => {
    switch (platformId) {
      case 'github_pages':
        return preferences.defaultGithubPagesAccountId;
      case 'netlify':
        return preferences.defaultNetlifyAccountId;
      case 'cloudflare_pages':
        return preferences.defaultCloudflarePagesAccountId;
    }
  };

  const handleAddAccount = (platform: PlatformConfig) => {
    if (platform.authType === 'token' && platform.id === 'cloudflare_pages') {
      setShowCloudflareDialog(true);
    } else {
      onAddAccount(platform.id);
    }
  };

  const handleCloudflareSuccess = async () => {
    await onRefreshAccounts();
  };

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
          onAddAccount={() => handleAddAccount(platform)}
          onRemoveAccount={(accountId) => onRemoveAccount(accountId, true)}
          onUpdateDisplayName={onUpdateDisplayName}
          onSetDefaultAccount={(accountId) =>
            onSetDefaultAccount(platform.id, accountId)
          }
          onCheckUsage={onCheckUsage}
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
}
