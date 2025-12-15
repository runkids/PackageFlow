// AccountSelector Component
// Multi Deploy Accounts feature (016-multi-deploy-accounts)
// T033: Dropdown component for selecting deploy account

import { useState, useMemo } from 'react';
import { ChevronDown, User, Star, Check, Loader2 } from 'lucide-react';
import type { PlatformType, DeployAccount, DeployPreferences } from '../../../types/deploy';

interface AccountSelectorProps {
  platform: PlatformType;
  accounts: DeployAccount[];
  preferences: DeployPreferences;
  selectedAccountId?: string;
  onAccountChange: (accountId: string | undefined) => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function AccountSelector({
  platform,
  accounts,
  preferences,
  selectedAccountId,
  onAccountChange,
  disabled = false,
  isLoading = false,
  className = '',
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  const getDefaultAccountId = (): string | undefined => {
    switch (platform) {
      case 'github_pages':
        return preferences.defaultGithubPagesAccountId;
      case 'netlify':
        return preferences.defaultNetlifyAccountId;
      case 'cloudflare_pages':
        return preferences.defaultCloudflarePagesAccountId;
      default:
        return undefined;
    }
  };
  const defaultAccountId = getDefaultAccountId();

  const getDisplayLabel = () => {
    if (!selectedAccount) {
      if (accounts.length === 0) return 'No accounts connected';
      return 'Select account...';
    }
    return selectedAccount.displayName || selectedAccount.username;
  };

  const handleSelect = (accountId: string | undefined) => {
    onAccountChange(accountId);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading accounts...</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <User className="h-4 w-4" />
        <span>No {platform} accounts connected</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors ${
          disabled || isLoading
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-accent'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : selectedAccount?.avatarUrl ? (
            <img
              src={selectedAccount.avatarUrl}
              alt={selectedAccount.username}
              className="h-5 w-5 shrink-0 rounded-full"
            />
          ) : (
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{getDisplayLabel()}</span>
          {selectedAccount && defaultAccountId === selectedAccountId && (
            <Star className="h-3 w-3 shrink-0 fill-primary text-primary" />
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-card shadow-xl">
            {/* Default option */}
            <button
              type="button"
              onClick={() => handleSelect(undefined)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                !selectedAccountId ? 'bg-accent' : ''
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {!selectedAccountId && <Check className="h-4 w-4" />}
              </span>
              <span className="flex-1 text-left text-muted-foreground">
                Use default account
              </span>
            </button>

            {/* Separator */}
            <div className="h-px bg-border" />

            {/* Account options */}
            {accounts.map(account => {
              const isSelected = account.id === selectedAccountId;
              const isDefault = account.id === defaultAccountId;

              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleSelect(account.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                    isSelected ? 'bg-accent' : ''
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4" />}
                  </span>
                  {account.avatarUrl ? (
                    <img
                      src={account.avatarUrl}
                      alt={account.username}
                      className="h-5 w-5 rounded-full"
                    />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="flex-1 truncate text-left">
                    {account.displayName || account.username}
                  </span>
                  {isDefault && (
                    <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      <Star className="h-3 w-3 fill-current" />
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
