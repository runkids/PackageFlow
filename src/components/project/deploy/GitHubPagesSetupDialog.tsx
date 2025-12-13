// GitHubPagesSetupDialog Component
// Shows setup instructions after generating GitHub Actions workflow file

import { useState } from 'react';
import {
  FileCode,
  ExternalLink,
  Check,
  Copy,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { GithubIcon } from '../../ui/icons';
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
import type { GitHubWorkflowResult } from '../../../types/deploy';

interface GitHubPagesSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: GitHubWorkflowResult | null;
  error?: string;
  isGenerating?: boolean;
  onCommitAndPush?: () => Promise<void>;
}

export function GitHubPagesSetupDialog({
  isOpen,
  onClose,
  result,
  error,
  isGenerating,
  onCommitAndPush,
}: GitHubPagesSetupDialogProps) {
  const [copied, setCopied] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const handleCopyPath = async () => {
    if (!result?.workflowPath) return;
    await navigator.clipboard.writeText(result.workflowPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommitAndPush = async () => {
    if (!onCommitAndPush) return;
    setIsPushing(true);
    try {
      await onCommitAndPush();
    } finally {
      setIsPushing(false);
    }
  };

  const pagesSettingsUrl =
    result?.username && result?.repo
      ? `https://github.com/${result.username}/${result.repo}/settings/pages`
      : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GithubIcon className="h-5 w-5" />
            <span>GitHub Pages Setup</span>
          </DialogTitle>
          <DialogClose onClick={onClose} />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-2 -mr-2">
          {/* Loading State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">
                Generating workflow file...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  Failed to generate workflow
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {/* Success State */}
          {result && !isGenerating && (
            <>
              {/* Success Banner */}
              <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                <Check className="h-5 w-5 shrink-0 text-green-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Workflow file generated successfully!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Follow the steps below to complete the setup.
                  </p>
                </div>
              </div>

              {/* Generated File */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Generated File
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
                  <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <code className="flex-1 text-sm font-mono">
                    {result.workflowPath}
                  </code>
                  <button
                    onClick={handleCopyPath}
                    className={cn(
                      'rounded p-1.5 transition-colors',
                      'hover:bg-accent text-muted-foreground hover:text-foreground'
                    )}
                    title="Copy path"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Setup Instructions */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Setup Instructions
                </label>
                <div className="space-y-2">
                  {result.setupInstructions.map((instruction, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {index + 1}
                      </span>
                      <p className="text-sm text-foreground leading-relaxed">
                        {instruction.replace(/^\d+\.\s*/, '')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-col gap-2 pt-2">
                {pagesSettingsUrl && (
                  <button
                    type="button"
                    onClick={() => shellOpen(pagesSettingsUrl)}
                    disabled={!pagesSettingsUrl}
                    className={cn(
                      'flex items-center justify-center gap-2',
                      'rounded-md border border-border px-4 py-2',
                      'text-sm font-medium text-foreground',
                      'transition-colors hover:bg-accent',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open GitHub Pages Settings
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {result && onCommitAndPush && (
            <Button
              variant="outline"
              onClick={handleCommitAndPush}
              disabled={isPushing}
            >
              {isPushing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Commit & Push
            </Button>
          )}
          <Button onClick={onClose}>
            {result ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
