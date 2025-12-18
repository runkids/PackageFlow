// AI Analysis Panel Component
// Displays AI-powered security analysis of snapshot diffs

import { useState, useCallback } from 'react';
import { Shield, ShieldCheck, ScanSearch, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import { snapshotAPI } from '../../lib/tauri-api';
import type { AIAnalysisResult } from '../../types/snapshot';
import { cn } from '../../lib/utils';
import { AISecurityAnalysisDialog } from './AISecurityAnalysisDialog';

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
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDialogOpen(true);

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

  const handleViewResult = useCallback(() => {
    setDialogOpen(true);
  }, []);

  return (
    <>
      <div
        className={cn(
          'rounded-lg border overflow-hidden',
          'bg-white dark:bg-gray-900',
          'border-gray-200 dark:border-gray-700',
          className
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 text-left font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <span
                className={cn(
                  'flex items-center justify-center w-5 h-5 rounded transition-transform',
                  'bg-gray-100 dark:bg-gray-800',
                  isExpanded && 'rotate-180'
                )}
              >
                <ChevronDown size={14} className="text-gray-500" />
              </span>
              <Shield size={16} className="text-cyan-500/70 dark:text-cyan-400/60" />
              <span>AI Security Analysis</span>
            </button>

            <div className="flex items-center gap-2">
              {result && (
                <button
                  onClick={handleViewResult}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/15 transition-all"
                >
                  View Result
                </button>
              )}

              <button
                onClick={handleAnalyze}
                disabled={isLoading}
                className={cn(
                  'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                  'bg-cyan-500/10 dark:bg-cyan-500/15',
                  'text-cyan-700 dark:text-cyan-300',
                  'border border-cyan-500/30 dark:border-cyan-500/40',
                  'hover:bg-cyan-500/20 dark:hover:bg-cyan-500/25',
                  'hover:border-cyan-500/50 dark:hover:border-cyan-500/60',
                  'disabled:cursor-not-allowed',
                  isLoading && 'animate-ai-security-glow'
                )}
              >
                <ScanSearch
                  size={14}
                  className={cn(
                    'transition-transform duration-200',
                    isLoading ? 'animate-security-sparkle' : 'group-hover:scale-110'
                  )}
                />
                {isLoading ? 'Analyzing...' : result ? 'Re-analyze' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4">
            {/* Error state (inline) */}
            {error && !dialogOpen && (
              <div className="flex items-start gap-3 p-3 bg-rose-500/5 dark:bg-rose-500/10 rounded-lg border border-rose-500/20 dark:border-rose-500/15">
                <AlertCircle className="text-rose-500/80 dark:text-rose-400/70 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                    Analysis Failed
                  </p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Result preview */}
            {result && !isLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-emerald-500/80 dark:text-emerald-400/70" size={20} />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      Analysis Complete
                    </span>
                  </div>
                  {result.cached && (
                    <span className="text-xs text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15 px-2 py-0.5 rounded border border-sky-500/20 dark:border-sky-500/15">
                      Cached
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Click &quot;View Result&quot; to see the full analysis
                </p>
                {result.tokensUsed && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Tokens used: {result.tokensUsed.toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 flex items-center justify-center mb-3 border border-cyan-500/20 dark:border-cyan-500/15">
                  <ScanSearch className="text-cyan-500/80 dark:text-cyan-400/70" size={24} />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get AI-powered security analysis
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Click &quot;Analyze&quot; to evaluate dependency changes
                </p>
              </div>
            )}

            {/* Loading indicator (inline) */}
            {isLoading && !dialogOpen && (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw className="text-cyan-500/80 dark:text-cyan-400/70 animate-spin" size={20} />
                <span className="text-sm text-cyan-600 dark:text-cyan-400">
                  Analyzing security implications...
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analysis Result Dialog */}
      <AISecurityAnalysisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        result={result}
        isLoading={isLoading}
        error={error}
        onReanalyze={handleAnalyze}
      />
    </>
  );
}
