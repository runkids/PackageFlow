/**
 * CloudflareTokenDialog Component
 * Dialog for adding Cloudflare Pages account via API token
 * Follows UI design spec with Cloudflare orange branding
 */

import { useState, useEffect, useId } from 'react';
import {
  Key,
  AlertCircle,
  Loader2,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { CloudflareIcon } from '../../ui/icons';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { deployAPI } from '../../../lib/tauri-api';
import { registerModal, unregisterModal, isTopModal } from '../../ui/modalStack';
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
  const modalId = useId();
  const [apiToken, setApiToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal stack management
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Keyboard handler for Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen]);

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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloudflare-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-md',
            'bg-background rounded-2xl',
            'border border-orange-500/30',
            'shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5 border-b border-border',
              'bg-gradient-to-r',
              'dark:from-orange-500/20 dark:via-orange-600/10 dark:to-transparent',
              'from-orange-500/10 via-orange-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className={cn(
                'absolute right-4 top-4',
                'rounded-lg p-2',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-background/80',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Title with icon badge */}
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-[#f38020]',
                  'shadow-lg'
                )}
              >
                <CloudflareIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2
                  id="cloudflare-dialog-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Connect Cloudflare Pages
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Add your Cloudflare account using an API token
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Info box */}
            <div
              className={cn(
                'flex items-start gap-3 rounded-lg p-4',
                'border border-orange-500/20 bg-orange-500/5'
              )}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 flex-shrink-0">
                <Key className="h-4 w-4 text-orange-500" />
              </div>
              <div className="space-y-1.5 text-sm">
                <p className="text-foreground font-medium">
                  Create an API token with Cloudflare Pages permission
                </p>
                <button
                  type="button"
                  onClick={() =>
                    shellOpen('https://dash.cloudflare.com/profile/api-tokens')
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    'text-orange-500 hover:text-orange-400',
                    'transition-colors duration-150'
                  )}
                >
                  Create API Token
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* API Token Input */}
            <div className="space-y-2">
              <label
                htmlFor="api-token"
                className="text-sm font-medium text-foreground"
              >
                API Token
              </label>
              <div className="relative">
                <input
                  id="api-token"
                  type={showToken ? 'text' : 'password'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter your Cloudflare API token"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={cn(
                    'flex h-10 w-full rounded-lg border',
                    'bg-background px-3 py-2 pr-10 text-sm font-mono',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-colors duration-150',
                    error
                      ? 'border-destructive focus:ring-destructive'
                      : 'border-border'
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && apiToken.trim()) {
                      handleSubmit();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2',
                    'rounded-md p-1.5',
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent',
                    'transition-colors duration-150'
                  )}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
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
            <div className="space-y-2">
              <label
                htmlFor="display-name"
                className="text-sm font-medium text-foreground"
              >
                Display Name
                <span className="ml-1.5 text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., My Cloudflare Account"
                autoComplete="off"
                className={cn(
                  'flex h-10 w-full rounded-lg border border-border',
                  'bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  'transition-colors duration-150'
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiToken.trim()) {
                    handleSubmit();
                  }
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg p-3',
                  'border border-destructive/30 bg-destructive/5'
                )}
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Token Requirements */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Required Permissions
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Account:Cloudflare Pages:Edit</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Account:Account Settings:Read</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4 border-t border-border',
              'bg-card/50 flex-shrink-0',
              'flex items-center justify-end gap-3'
            )}
          >
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isValidating || !apiToken.trim()}
              className="bg-orange-600 hover:bg-orange-500 text-white"
            >
              {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isValidating ? 'Validating...' : 'Connect Account'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
