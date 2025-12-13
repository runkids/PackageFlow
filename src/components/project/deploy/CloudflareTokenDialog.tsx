// CloudflareTokenDialog Component
// Dialog for adding Cloudflare Pages account via API token

import { useState } from 'react';
import {
  Key,
  AlertCircle,
  Loader2,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { CloudflareIcon } from '../../ui/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { deployAPI } from '../../../lib/tauri-api';
import type { DeployAccount } from '../../../types/deploy';

interface CloudflareTokenDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (account: DeployAccount) => void | Promise<void>;
}

export function CloudflareTokenDialog({
  isOpen,
  onClose,
  onSuccess,
}: CloudflareTokenDialogProps) {
  const [apiToken, setApiToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!apiToken.trim()) {
      setError('Please enter an API token');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const account = await deployAPI.addCloudflareAccount(
        apiToken.trim(),
        displayName.trim() || undefined
      );
      // Wait for onSuccess to complete (e.g., refresh accounts list) before closing
      await onSuccess(account);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setApiToken('');
    setDisplayName('');
    setShowToken(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudflareIcon className="h-5 w-5" />
            <span>Connect Cloudflare Pages</span>
          </DialogTitle>
          <DialogClose onClick={handleClose} />
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <Key className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="text-foreground">
                Create an API token with <strong>Cloudflare Pages:Edit</strong> permission.
              </p>
              <button
                type="button"
                onClick={() => shellOpen('https://dash.cloudflare.com/profile/api-tokens')}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Create API Token
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* API Token Input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              API Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your Cloudflare API token"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={cn(
                  'flex h-10 w-full rounded-md border border-border',
                  'bg-background px-3 py-2 pr-10 text-sm font-mono',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  error && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Display Name
              <span className="ml-1 text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., My Cloudflare Account"
              autoComplete="off"
              className={cn(
                'flex h-10 w-full rounded-md border border-border',
                'bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Token Requirements */}
          <div className="rounded-lg border border-border bg-background p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Required Token Permissions:
            </p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-500" />
                <span>Account:Cloudflare Pages:Edit</span>
              </li>
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-500" />
                <span>Account:Account Settings:Read</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isValidating || !apiToken.trim()}>
            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isValidating ? 'Validating...' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
