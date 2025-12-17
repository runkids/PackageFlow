// AI Analysis Panel Component
// Displays AI-powered analysis of snapshot diffs

import { useState, useCallback } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Check, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { snapshotAPI } from '../../lib/tauri-api';
import type { AIAnalysisResult } from '../../types/snapshot';
import { cn } from '../../lib/utils';

interface AIAnalysisPanelProps {
  baseSnapshotId: string;
  compareSnapshotId: string;
  providerId?: string;
  className?: string;
}

export function AIAnalysisPanel({
  baseSnapshotId,
  compareSnapshotId,
  providerId,
  className,
}: AIAnalysisPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await snapshotAPI.requestAiAnalysis({
        baseSnapshotId,
        compareSnapshotId,
        providerId,
        focusOnSecurity: true,
      });

      if (response.success && response.data) {
        setResult(response.data);
      } else {
        setError(response.error || 'Analysis failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [baseSnapshotId, compareSnapshotId, providerId]);

  const handleCopy = useCallback(() => {
    if (result?.analysis) {
      navigator.clipboard.writeText(result.analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        'bg-gradient-to-br from-purple-50/50 to-indigo-50/50',
        'dark:from-purple-950/20 dark:to-indigo-950/20',
        'border-purple-200/60 dark:border-purple-800/40',
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-200/40 dark:border-purple-800/30">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-left font-medium text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Sparkles size={16} className="text-purple-500" />
            <span>AI Security Analysis</span>
          </button>

          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs rounded transition-all',
                  copied
                    ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}

            <button
              onClick={handleAnalyze}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                'bg-purple-500/10 dark:bg-purple-500/20',
                'text-purple-700 dark:text-purple-300',
                'border border-purple-300/50 dark:border-purple-700/50',
                'hover:bg-purple-500/20 dark:hover:bg-purple-500/30',
                'hover:border-purple-400/60 dark:hover:border-purple-600/60',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {isLoading ? 'Analyzing...' : result ? 'Re-analyze' : 'Analyze'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Error state */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Analysis Failed</p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && !result && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Sparkles className="text-purple-500 animate-pulse" size={24} />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
              </div>
              <p className="mt-4 text-sm text-purple-600 dark:text-purple-400">
                Analyzing dependency changes...
              </p>
              <p className="mt-1 text-xs text-gray-500">
                This may take a few seconds
              </p>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <div className="space-y-3">
              {/* Truncation warning */}
              {result.isTruncated && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle size={14} />
                  <span>Analysis was truncated due to length limits</span>
                </div>
              )}

              {/* Markdown content */}
              <div
                className={cn(
                  'prose prose-sm dark:prose-invert max-w-none',
                  'prose-headings:text-gray-800 dark:prose-headings:text-gray-200',
                  'prose-p:text-gray-600 dark:prose-p:text-gray-400',
                  'prose-strong:text-gray-800 dark:prose-strong:text-gray-200',
                  'prose-code:text-purple-600 dark:prose-code:text-purple-400',
                  'prose-code:bg-purple-100/50 dark:prose-code:bg-purple-900/30',
                  'prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
                  'prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950',
                  'prose-li:text-gray-600 dark:prose-li:text-gray-400',
                  'prose-ul:my-2 prose-ol:my-2',
                  'prose-li:my-0.5'
                )}
              >
                <ReactMarkdown>{result.analysis}</ReactMarkdown>
              </div>

              {/* Token usage */}
              {result.tokensUsed && (
                <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                  Tokens used: {result.tokensUsed.toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
                <Sparkles className="text-purple-500" size={24} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get AI-powered security analysis
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Click &quot;Analyze&quot; to evaluate dependency changes
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
