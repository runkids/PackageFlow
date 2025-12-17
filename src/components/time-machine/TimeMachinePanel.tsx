// Time Machine Panel Component
// Main panel for viewing and comparing execution snapshots

import { useState, useCallback, useEffect } from 'react';
import { Clock, GitCompare, RefreshCw, Settings2, AlertCircle } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { SnapshotTimeline } from './SnapshotTimeline';
import { SnapshotDetail } from './SnapshotDetail';
import { SnapshotDiffView } from './SnapshotDiffView';
import { useSnapshots, useSnapshot, useSnapshotDiff } from '../../hooks/useSnapshots';
import type { SnapshotListItem } from '../../types/snapshot';
import { cn } from '../../lib/utils';

interface TimeMachinePanelProps {
  workflowId: string;
  projectPath?: string;
  showHeader?: boolean;
  className?: string;
}

type ViewMode = 'timeline' | 'detail' | 'compare';

interface SnapshotCapturedEvent {
  workflowId: string;
  executionId: string;
  snapshotId: string;
  status: string;
  totalDependencies: number;
  securityScore: number | null;
  capturedAt: string;
  errorMessage: string | null;
}

export function TimeMachinePanel({ workflowId, projectPath, showHeader = true, className }: TimeMachinePanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSnapshots, setCompareSnapshots] = useState<{
    snapshotA: SnapshotListItem | null;
    snapshotB: SnapshotListItem | null;
  }>({ snapshotA: null, snapshotB: null });
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Fetch snapshots for this workflow
  const {
    snapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
    refresh: refetchSnapshots,
    deleteSnapshot,
    pruneSnapshots,
  } = useSnapshots({ workflowId, limit: 50 });

  // Fetch selected snapshot details
  const {
    snapshot: selectedSnapshot,
    dependencies: selectedDependencies,
    loading: detailLoading,
  } = useSnapshot({ snapshotId: selectedSnapshotId, includeDependencies: true });

  // Fetch diff when comparing
  const {
    diff,
    aiPrompt: diffAiPrompt,
    loading: diffLoading,
    compare: compareDiff,
    generateAiPrompt: generateDiffAiPrompt,
  } = useSnapshotDiff();

  // Compare snapshots when both are selected
  useEffect(() => {
    if (compareSnapshots.snapshotA && compareSnapshots.snapshotB) {
      compareDiff(compareSnapshots.snapshotA.id, compareSnapshots.snapshotB.id);
    }
  }, [compareSnapshots.snapshotA, compareSnapshots.snapshotB, compareDiff]);

  // Listen for snapshot captured events
  useEffect(() => {
    const unlisten = listen<SnapshotCapturedEvent>('snapshot_captured', (event) => {
      if (event.payload.workflowId === workflowId) {
        console.log('[TimeMachine] Snapshot captured:', event.payload);
        refetchSnapshots();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workflowId, refetchSnapshots]);

  // Handle snapshot selection
  const handleSelectSnapshot = useCallback((snapshot: SnapshotListItem) => {
    setSelectedSnapshotId(snapshot.id);
    setViewMode('detail');
    setCompareMode(false);
    setCompareSnapshots({ snapshotA: null, snapshotB: null });
  }, []);

  // Handle compare
  const handleCompare = useCallback((snapshotA: SnapshotListItem, snapshotB: SnapshotListItem) => {
    // Ensure older snapshot is first
    const [older, newer] =
      new Date(snapshotA.createdAt) < new Date(snapshotB.createdAt)
        ? [snapshotA, snapshotB]
        : [snapshotB, snapshotA];

    setCompareSnapshots({ snapshotA: older, snapshotB: newer });
    setViewMode('compare');
    setCompareMode(false);
  }, []);

  // Handle delete
  const handleDelete = useCallback(
    async (snapshotId: string) => {
      if (window.confirm('Are you sure you want to delete this snapshot?')) {
        await deleteSnapshot(snapshotId);
        if (selectedSnapshotId === snapshotId) {
          setSelectedSnapshotId(null);
          setViewMode('timeline');
        }
      }
    },
    [deleteSnapshot, selectedSnapshotId]
  );

  // Handle prune
  const handlePrune = useCallback(async () => {
    if (window.confirm('Delete snapshots older than 30 days?')) {
      await pruneSnapshots(30);
    }
  }, [pruneSnapshots]);

  // Handle generate AI prompt
  const handleGenerateAiPrompt = useCallback(async () => {
    if (!compareSnapshots.snapshotA?.id || !compareSnapshots.snapshotB?.id) return;

    setGeneratingPrompt(true);
    try {
      await generateDiffAiPrompt(compareSnapshots.snapshotA.id, compareSnapshots.snapshotB.id);
    } finally {
      setGeneratingPrompt(false);
    }
  }, [compareSnapshots, generateDiffAiPrompt]);

  // Handle copy AI prompt
  const handleCopyAiPrompt = useCallback(() => {
    if (diffAiPrompt) {
      navigator.clipboard.writeText(diffAiPrompt);
    }
  }, [diffAiPrompt]);

  // Back to timeline
  const handleBackToTimeline = useCallback(() => {
    setViewMode('timeline');
    setSelectedSnapshotId(null);
    setCompareSnapshots({ snapshotA: null, snapshotB: null });
  }, []);

  // Toggle compare mode
  const toggleCompareMode = useCallback(() => {
    setCompareMode((prev) => !prev);
    setCompareSnapshots({ snapshotA: null, snapshotB: null });
  }, []);

  // No project path - show message
  if (!projectPath) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <AlertCircle className="text-gray-400 mb-2" size={32} />
        <p className="text-gray-500 text-sm">Time Machine requires a project with lockfile</p>
        <p className="text-gray-400 text-xs mt-1">Associate this workflow with a project to enable snapshots</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header - only shown when showHeader is true */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-gray-500" />
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Time Machine</h3>
            {snapshots.length > 0 && (
              <span className="text-xs text-gray-400">({snapshots.length} snapshots)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'timeline' && (
              <>
                <button
                  onClick={toggleCompareMode}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                    compareMode
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                  title="Compare snapshots"
                >
                  <GitCompare size={14} />
                  Compare
                </button>
                <button
                  onClick={() => refetchSnapshots()}
                  disabled={snapshotsLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={snapshotsLoading ? 'animate-spin' : ''} />
                </button>
                {snapshots.length > 10 && (
                  <button
                    onClick={handlePrune}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Prune old snapshots"
                >
                  <Settings2 size={14} />
                </button>
              )}
            </>
          )}
          {viewMode !== 'timeline' && (
            <button
              onClick={handleBackToTimeline}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              ← Back to timeline
            </button>
          )}
        </div>
        </div>
      )}

      {/* Toolbar for side panel mode (when header is hidden) */}
      {!showHeader && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {snapshots.length > 0 && (
              <span className="text-xs text-gray-400">({snapshots.length} snapshots)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'timeline' && (
              <>
                <button
                  onClick={toggleCompareMode}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                    compareMode
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                  title="Compare snapshots"
                >
                  <GitCompare size={14} />
                  Compare
                </button>
                <button
                  onClick={() => refetchSnapshots()}
                  disabled={snapshotsLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={snapshotsLoading ? 'animate-spin' : ''} />
                </button>
              </>
            )}
            {viewMode !== 'timeline' && (
              <button
                onClick={handleBackToTimeline}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                ← Back to timeline
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {snapshotsError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            Error loading snapshots: {snapshotsError}
          </div>
        )}

        {viewMode === 'timeline' && (
          <SnapshotTimeline
            snapshots={snapshots}
            loading={snapshotsLoading}
            selectedId={selectedSnapshotId}
            onSelect={handleSelectSnapshot}
            onDelete={handleDelete}
            onCompare={handleCompare}
            compareMode={compareMode}
          />
        )}

        {viewMode === 'detail' && selectedSnapshot && (
          <SnapshotDetail
            snapshot={selectedSnapshot}
            dependencies={selectedDependencies ?? undefined}
            loading={detailLoading}
          />
        )}

        {viewMode === 'compare' && diff && (
          <SnapshotDiffView
            diff={diff}
            aiPrompt={diffAiPrompt}
            onGenerateAiPrompt={handleGenerateAiPrompt}
            onCopyAiPrompt={handleCopyAiPrompt}
            loading={generatingPrompt || diffLoading}
          />
        )}

        {viewMode === 'compare' && !diff && !diffLoading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <GitCompare className="text-gray-400 mb-2" size={32} />
            <p className="text-gray-500">Select two snapshots to compare</p>
          </div>
        )}
      </div>
    </div>
  );
}
