/**
 * AISecurityAnalysisDialog - Dialog for displaying AI security analysis results
 * Shows AI-powered security analysis with markdown formatting
 */

import * as React from 'react';
import { Shield, ScanSearch, X, Copy, Check, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import type { AIAnalysisResult } from '../../types/snapshot';

interface AISecurityAnalysisDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Handler for open state changes */
  onOpenChange: (open: boolean) => void;
  /** Analysis result to display */
  result: AIAnalysisResult | null;
  /** Whether analysis is in progress */
  isLoading: boolean;
  /** Error message if analysis failed */
  error: string | null;
  /** Callback to re-run analysis */
  onReanalyze: () => void;
}

export function AISecurityAnalysisDialog({
  open,
  onOpenChange,
  result,
  isLoading,
  error,
  onReanalyze,
}: AISecurityAnalysisDialogProps) {
  const modalId = React.useId();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Register/unregister modal
  React.useEffect(() => {
    if (!open) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, open]);

  // Handle ESC key
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onOpenChange(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, onOpenChange, open]);

  // Focus content area when opened
  React.useEffect(() => {
    if (open && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  // Copy handler
  const handleCopy = React.useCallback(async () => {
    if (result?.analysis) {
      try {
        await navigator.clipboard.writeText(result.analysis);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  }, [result]);

  if (!open) return null;

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-security-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-3xl max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-green-500/30',
            'shadow-2xl shadow-black/60',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5',
              'border-b border-border',
              'bg-gradient-to-r',
              'dark:from-green-500/15 dark:via-green-600/5 dark:to-transparent',
              'from-green-500/10 via-green-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 h-8 w-8"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Title area with icon badge */}
            <div className="flex items-start gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-green-500/20',
                  'bg-green-500/10',
                  'shadow-lg'
                )}
              >
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  {result?.cached && (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                      Cached
                    </span>
                  )}
                  {result?.isTruncated && (
                    <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
                      Truncated
                    </span>
                  )}
                </div>
                <h2
                  id="ai-security-dialog-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  AI Security Analysis
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI-powered analysis of dependency changes
                </p>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto min-h-0 focus:outline-none p-6"
            tabIndex={-1}
          >
            {/* Error state */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Analysis Failed
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-500 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <ScanSearch className="text-green-500 animate-pulse" size={32} />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-green-500/30 animate-ping" />
                </div>
                <p className="mt-6 text-base text-green-600 dark:text-green-400">
                  Analyzing security implications...
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This may take a few seconds
                </p>
              </div>
            )}

            {/* Result */}
            {result && !isLoading && (
              <div
                className={cn(
                  'prose prose-sm dark:prose-invert max-w-none',
                  'prose-headings:text-foreground',
                  'prose-p:text-muted-foreground',
                  'prose-strong:text-foreground',
                  'prose-code:text-green-600 dark:prose-code:text-green-400',
                  'prose-code:bg-green-100/50 dark:prose-code:bg-green-900/30',
                  'prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
                  'prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950',
                  'prose-li:text-muted-foreground',
                  'prose-ul:my-2 prose-ol:my-2',
                  'prose-li:my-0.5'
                )}
              >
                <ReactMarkdown>{result.analysis}</ReactMarkdown>
              </div>
            )}

            {/* Empty state */}
            {!result && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <ScanSearch className="text-green-500" size={32} />
                </div>
                <p className="text-base text-muted-foreground">No analysis results yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click &quot;Analyze&quot; to start security analysis
                </p>
              </div>
            )}
          </div>

          {/* Footer with actions */}
          <div
            className={cn(
              'px-6 py-4',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-between gap-4',
              'flex-shrink-0'
            )}
          >
            {/* Left side - token usage */}
            <div className="text-xs text-muted-foreground">
              {result?.tokensUsed && <>Tokens used: {result.tokensUsed.toLocaleString()}</>}
            </div>

            {/* Right side - actions */}
            <div className="flex items-center gap-2">
              {result && (
                <Button
                  variant="ghost"
                  onClick={handleCopy}
                  className="flex items-center gap-2 h-auto px-3 py-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={onReanalyze}
                disabled={isLoading}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 h-auto',
                  'bg-green-600/20 hover:bg-green-600/30 text-green-400',
                  'border border-green-500/30 transition-all duration-200',
                  isLoading && 'animate-ai-security-glow'
                )}
              >
                <ScanSearch
                  className={cn(
                    'w-4 h-4 transition-transform duration-200',
                    isLoading ? 'animate-security-sparkle' : 'group-hover:scale-110'
                  )}
                />
                <span>{isLoading ? 'Analyzing...' : result ? 'Re-analyze' : 'Analyze'}</span>
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
