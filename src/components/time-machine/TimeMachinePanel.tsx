// Time Machine Panel Component
// Main panel for viewing and comparing execution snapshots

import { useState, useCallback, useEffect } from 'react';
import { Clock, GitCompare, RefreshCw, Settings2, AlertCircle, ArrowLeft } from 'lucide-react';
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
    loading: diffLoading,
    compare: compareDiff,
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
                    'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                    'transition-all duration-200',
                    'border backdrop-blur-sm',
                    compareMode
                      ? 'bg-blue-500/20 dark:bg-blue-500/25 border-blue-500/50 dark:border-blue-500/60 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/10'
                      : 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 dark:hover:bg-blue-500/25 hover:border-blue-500/50 dark:hover:border-blue-500/60'
                  )}
                  title="Compare snapshots"
                >
                  <GitCompare size={14} className="transition-transform duration-200 group-hover:scale-110" />
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
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'transition-all duration-200',
                'border backdrop-blur-sm',
                'bg-cyan-500/10 dark:bg-cyan-500/15',
                'border-cyan-500/30 dark:border-cyan-500/40',
                'text-cyan-600 dark:text-cyan-400',
                'hover:bg-cyan-500/20 dark:hover:bg-cyan-500/25',
                'hover:border-cyan-500/50 dark:hover:border-cyan-500/60',
                'hover:shadow-sm hover:shadow-cyan-500/10',
                'focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-1'
              )}
            >
              <ArrowLeft
                size={14}
                className="transition-transform duration-200 group-hover:-translate-x-0.5"
              />
              Back to timeline
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
                    'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                    'transition-all duration-200',
                    'border backdrop-blur-sm',
                    compareMode
                      ? 'bg-blue-500/20 dark:bg-blue-500/25 border-blue-500/50 dark:border-blue-500/60 text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/10'
                      : 'bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/30 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 dark:hover:bg-blue-500/25 hover:border-blue-500/50 dark:hover:border-blue-500/60'
                  )}
                  title="Compare snapshots"
                >
                  <GitCompare size={14} className="transition-transform duration-200 group-hover:scale-110" />
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
                className={cn(
                  'group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'transition-all duration-200',
                  'border backdrop-blur-sm',
                  'bg-cyan-500/10 dark:bg-cyan-500/15',
                  'border-cyan-500/30 dark:border-cyan-500/40',
                  'text-cyan-600 dark:text-cyan-400',
                  'hover:bg-cyan-500/20 dark:hover:bg-cyan-500/25',
                  'hover:border-cyan-500/50 dark:hover:border-cyan-500/60',
                  'hover:shadow-sm hover:shadow-cyan-500/10',
                  'focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-1'
                )}
              >
                <ArrowLeft
                  size={14}
                  className="transition-transform duration-200 group-hover:-translate-x-0.5"
                />
                Back to timeline
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
          <SnapshotDiffView diff={diff} />
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
