// DeployAccountsDialog Component
// Global deploy account management dialog
// Accessed from Settings dropdown

import { useDeployAccounts } from '../../hooks/useDeployAccounts';
import { AccountManager } from '../project/deploy/AccountManager';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/Dialog';
import { Users } from 'lucide-react';
import type { PlatformType } from '../../types/deploy';
import { useCallback } from 'react';

interface DeployAccountsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeployAccountsDialog({ isOpen, onClose }: DeployAccountsDialogProps) {
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

  const handleAddAccount = useCallback(async (platform: PlatformType): Promise<void> => {
    await addAccount(platform);
  }, [addAccount]);

  const handleUpdateDisplayName = useCallback(async (
    accountId: string,
    displayName?: string
  ): Promise<void> => {
    await updateAccountDisplayName(accountId, displayName);
  }, [updateAccountDisplayName]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span>Deploy Accounts</span>
          </DialogTitle>
          <DialogClose onClick={onClose} />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 pr-2 -mr-2">
          <AccountManager
            accounts={accounts}
            preferences={preferences}
            addingPlatform={addingPlatform}
            removingAccountId={removingAccountId}
            error={error}
            onAddAccount={handleAddAccount}
            onRemoveAccount={removeAccount}
            onUpdateDisplayName={handleUpdateDisplayName}
            onSetDefaultAccount={setDefaultAccount}
            onRefreshAccounts={refreshAccounts}
            onCheckUsage={checkUsage}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
