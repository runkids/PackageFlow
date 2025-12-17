// AI Analysis Panel Component
// Displays AI-powered security analysis of snapshot diffs

import { useState, useCallback } from 'react';
import { Shield, ShieldCheck, ScanSearch, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
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
          'bg-gradient-to-br from-green-50/50 to-emerald-50/50',
          'dark:from-green-950/20 dark:to-emerald-950/20',
          'border-green-200/60 dark:border-green-800/40',
          className
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-green-200/40 dark:border-green-800/30">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 text-left font-medium text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 transition-colors"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Shield size={16} className="text-green-500" />
              <span>AI Security Analysis</span>
            </button>

            <div className="flex items-center gap-2">
              {result && (
                <button
                  onClick={handleViewResult}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all"
                >
                  View Result
                </button>
              )}

              <button
                onClick={handleAnalyze}
                disabled={isLoading}
                className={cn(
                  'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                  'bg-green-500/10 dark:bg-green-500/20',
                  'text-green-700 dark:text-green-300',
                  'border border-green-300/50 dark:border-green-700/50',
                  'hover:bg-green-500/20 dark:hover:bg-green-500/30',
                  'hover:border-green-400/60 dark:hover:border-green-600/60',
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
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Analysis Failed
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Result preview */}
            {result && !isLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-green-500" size={20} />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Analysis Complete
                    </span>
                  </div>
                  {result.cached && (
                    <span className="text-xs text-blue-500 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                      Cached
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click &quot;View Result&quot; to see the full analysis
                </p>
                {result.tokensUsed && (
                  <p className="text-xs text-muted-foreground">
                    Tokens used: {result.tokensUsed.toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                  <ScanSearch className="text-green-500" size={24} />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get AI-powered security analysis
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Click &quot;Analyze&quot; to evaluate dependency changes
                </p>
              </div>
            )}

            {/* Loading indicator (inline) */}
            {isLoading && !dialogOpen && (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw className="text-green-500 animate-spin" size={20} />
                <span className="text-sm text-green-600 dark:text-green-400">
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
