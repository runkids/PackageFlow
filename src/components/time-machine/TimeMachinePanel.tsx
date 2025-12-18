// Time Machine Panel Component
// Main panel for viewing and comparing execution snapshots
// Feature 025 redesign: Project-level lockfile change detection

import { useState, useCallback, useEffect } from 'react';
import { Clock, GitCompare, RefreshCw, Settings2, ArrowLeft, Camera, AlertTriangle } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { SnapshotTimeline } from './SnapshotTimeline';
import { SnapshotDetailPanel } from './SnapshotDetailPanel';
import { SnapshotDiffView } from './SnapshotDiffView';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSnapshots, useSnapshot, useSnapshotDiff, useProjectSnapshots } from '../../hooks/useSnapshots';
import type { SnapshotListItem, TriggerSource } from '../../types/snapshot';
import { cn } from '../../lib/utils';

interface TimeMachinePanelProps {
  /** Project path - required for project-level snapshots (Feature 025 redesign) */
  projectPath: string;
  showHeader?: boolean;
  className?: string;
}

type ViewMode = 'timeline' | 'detail' | 'compare';

/** Snapshot auto-captured event - Feature 025 redesign */
interface SnapshotAutoCapturedEvent {
  projectPath: string;
  snapshotId: string;
  triggerSource: TriggerSource;
  status: string;
  totalDependencies: number;
  securityScore: number | null;
  capturedAt: string;
  errorMessage: string | null;
}

export function TimeMachinePanel({ projectPath, showHeader = true, className }: TimeMachinePanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSnapshots, setCompareSnapshots] = useState<{
    snapshotA: SnapshotListItem | null;
    snapshotB: SnapshotListItem | null;
  }>({ snapshotA: null, snapshotB: null });

  // Dialog states for delete and prune confirmations
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pruneDialogOpen, setPruneDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPruning, setIsPruning] = useState(false);

  // Reset view when project changes
  useEffect(() => {
    setViewMode('timeline');
    setSelectedSnapshotId(null);
    setCompareMode(false);
    setCompareSnapshots({ snapshotA: null, snapshotB: null });
  }, [projectPath]);

  // Fetch snapshots for this project - Feature 025 redesign
  const {
    snapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
    refresh: refetchSnapshots,
    captureManualSnapshot,
  } = useProjectSnapshots(projectPath);

  // For delete and prune, use the old hook
  const { deleteSnapshot, pruneSnapshots } = useSnapshots({ projectPath, autoLoad: false });

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

  // Listen for snapshot auto-captured events - Feature 025 redesign
  useEffect(() => {
    const unlisten = listen<SnapshotAutoCapturedEvent>('snapshot:auto-captured', (event) => {
      if (event.payload.projectPath === projectPath) {
        console.log('[TimeMachine] Snapshot auto-captured:', event.payload);
        refetchSnapshots();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [projectPath, refetchSnapshots]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Don't handle if dialogs are open
      if (deleteDialogOpen || pruneDialogOpen) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          // ESC: Return to timeline from detail/compare view
          if (viewMode !== 'timeline') {
            e.preventDefault();
            setViewMode('timeline');
            setSelectedSnapshotId(null);
            setCompareSnapshots({ snapshotA: null, snapshotB: null });
          } else if (compareMode) {
            // Exit compare mode if in timeline
            e.preventDefault();
            setCompareMode(false);
          }
          break;

        case 'r':
        case 'R':
          // R: Refresh snapshots
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            refetchSnapshots();
          }
          break;

        case 'c':
        case 'C':
          // C: Toggle compare mode (only in timeline view)
          if (!e.metaKey && !e.ctrlKey && viewMode === 'timeline') {
            e.preventDefault();
            setCompareMode((prev) => !prev);
            setCompareSnapshots({ snapshotA: null, snapshotB: null });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, compareMode, deleteDialogOpen, pruneDialogOpen, refetchSnapshots]);

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

  // Handle delete - opens confirmation dialog
  const handleDelete = useCallback((snapshotId: string) => {
    setPendingDeleteId(snapshotId);
    setDeleteDialogOpen(true);
  }, []);

  // Confirm delete - executes after dialog confirmation
  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteSnapshot(pendingDeleteId);
      // Refresh the list after deletion
      await refetchSnapshots();
      if (selectedSnapshotId === pendingDeleteId) {
        setSelectedSnapshotId(null);
        setViewMode('timeline');
      }
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setPendingDeleteId(null);
    }
  }, [deleteSnapshot, pendingDeleteId, selectedSnapshotId, refetchSnapshots]);

  // Handle prune - opens confirmation dialog
  const handlePrune = useCallback(() => {
    setPruneDialogOpen(true);
  }, []);

  // Confirm prune - executes after dialog confirmation
  const confirmPrune = useCallback(async () => {
    setIsPruning(true);
    try {
      await pruneSnapshots(30);
      // Refresh the list after pruning
      await refetchSnapshots();
    } finally {
      setIsPruning(false);
      setPruneDialogOpen(false);
    }
  }, [pruneSnapshots, refetchSnapshots]);

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

  // Handle manual snapshot capture
  const handleCaptureSnapshot = useCallback(async () => {
    const snapshot = await captureManualSnapshot();
    if (snapshot) {
      console.log('[TimeMachine] Manual snapshot captured:', snapshot.id);
    }
  }, [captureManualSnapshot]);

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
                {/* Manual snapshot capture button - Feature 025 */}
                <button
                  onClick={handleCaptureSnapshot}
                  disabled={snapshotsLoading}
                  className={cn(
                    'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                    'transition-all duration-200',
                    'border backdrop-blur-sm',
                    'bg-emerald-500/10 dark:bg-emerald-500/15',
                    'border-emerald-500/30 dark:border-emerald-500/40',
                    'text-emerald-600 dark:text-emerald-400',
                    'hover:bg-emerald-500/20 dark:hover:bg-emerald-500/25',
                    'hover:border-emerald-500/50 dark:hover:border-emerald-500/60',
                    'disabled:opacity-50'
                  )}
                  title="Capture manual snapshot"
                >
                  <Camera size={14} className="transition-transform duration-200 group-hover:scale-110" />
                  Capture
                </button>
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
                'border',
                'bg-muted/50 dark:bg-muted/30',
                'border-border',
                'text-muted-foreground',
                'hover:bg-muted hover:text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
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
                {/* Manual snapshot capture button */}
                <button
                  onClick={handleCaptureSnapshot}
                  disabled={snapshotsLoading}
                  className={cn(
                    'group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                    'transition-all duration-200',
                    'border backdrop-blur-sm',
                    'bg-emerald-500/10 dark:bg-emerald-500/15',
                    'border-emerald-500/30 dark:border-emerald-500/40',
                    'text-emerald-600 dark:text-emerald-400',
                    'hover:bg-emerald-500/20 dark:hover:bg-emerald-500/25',
                    'hover:border-emerald-500/50 dark:hover:border-emerald-500/60',
                    'disabled:opacity-50'
                  )}
                  title="Capture manual snapshot"
                >
                  <Camera size={14} className="transition-transform duration-200 group-hover:scale-110" />
                  Capture
                </button>
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
                  'border',
                  'bg-muted/50 dark:bg-muted/30',
                  'border-border',
                  'text-muted-foreground',
                  'hover:bg-muted hover:text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
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
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Failed to load snapshots
                </p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {snapshotsError}
                </p>
              </div>
              <button
                onClick={() => refetchSnapshots()}
                disabled={snapshotsLoading}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg',
                  'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
                  'hover:bg-red-200 dark:hover:bg-red-900/60',
                  'disabled:opacity-50'
                )}
              >
                <RefreshCw size={12} className={snapshotsLoading ? 'animate-spin' : ''} />
                Retry
              </button>
            </div>
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
          <SnapshotDetailPanel
            snapshot={selectedSnapshot}
            dependencies={selectedDependencies ?? undefined}
            loading={detailLoading}
            onBackToTimeline={handleBackToTimeline}
            allSnapshots={snapshots}
            onCompare={handleCompare}
          />
        )}

        {viewMode === 'compare' && diff && (
          <SnapshotDiffView
            diff={diff}
            olderDate={compareSnapshots.snapshotA?.createdAt}
            newerDate={compareSnapshots.snapshotB?.createdAt}
          />
        )}

        {viewMode === 'compare' && !diff && !diffLoading && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <GitCompare className="text-gray-400 mb-2" size={32} />
            <p className="text-gray-500">Select two snapshots to compare</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        variant="destructive"
        title="Delete Snapshot"
        description="Are you sure you want to delete this snapshot? This action cannot be undone."
        confirmText="Delete"
        onConfirm={confirmDelete}
        isLoading={isDeleting}
      />

      {/* Prune Confirmation Dialog */}
      <ConfirmDialog
        open={pruneDialogOpen}
        onOpenChange={setPruneDialogOpen}
        variant="warning"
        title="Prune Old Snapshots"
        description="This will delete all snapshots older than 30 days. This action cannot be undone."
        confirmText="Prune"
        onConfirm={confirmPrune}
        isLoading={isPruning}
      />
    </div>
  );
}
