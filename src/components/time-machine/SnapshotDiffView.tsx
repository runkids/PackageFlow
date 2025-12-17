// Snapshot Diff View Component
// Displays comparison between two snapshots

import { useState } from 'react';
import {
  Plus,
  Minus,
  ArrowUp,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SnapshotDiff, DependencyChange, PostinstallChange } from '../../types/snapshot';
import { cn } from '../../lib/utils';
import { AIAnalysisPanel } from './AIAnalysisPanel';

interface SnapshotDiffViewProps {
  diff: SnapshotDiff;
  className?: string;
}

export function SnapshotDiffView({
  diff,
  className,
}: SnapshotDiffViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    added: true,
    removed: true,
    updated: true,
    postinstall: false,
  });

  const [showUnchanged, setShowUnchanged] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDuration = (ms?: number | null) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatPercentage = (pct?: number | null) => {
    if (pct === null || pct === undefined) return '';
    const sign = pct >= 0 ? '+' : '';
    return `(${sign}${pct.toFixed(1)}%)`;
  };

  const addedDeps = diff.dependencyChanges.filter((c) => c.changeType === 'added');
  const removedDeps = diff.dependencyChanges.filter((c) => c.changeType === 'removed');
  const updatedDeps = diff.dependencyChanges.filter((c) => c.changeType === 'updated');
  const unchangedDeps = diff.dependencyChanges.filter((c) => c.changeType === 'unchanged');

  const SectionHeader = ({
    title,
    section,
    count,
    icon: Icon,
    iconColor,
  }: {
    title: string;
    section: string;
    count?: number;
    icon?: React.ElementType;
    iconColor?: string;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center gap-2 w-full py-2 text-left font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {expandedSections[section] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      {Icon && <Icon size={16} className={iconColor} />}
      <span>{title}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500">({count})</span>
      )}
    </button>
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <SectionHeader title="Summary" section="summary" />
        {expandedSections.summary && (
          <div className="mt-3 space-y-4">
            {/* Change counts */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Added"
                value={diff.summary.addedCount}
                icon={Plus}
                iconColor="text-green-500"
              />
              <StatCard
                label="Removed"
                value={diff.summary.removedCount}
                icon={Minus}
                iconColor="text-red-500"
              />
              <StatCard
                label="Updated"
                value={diff.summary.updatedCount}
                icon={ArrowUp}
                iconColor="text-blue-500"
              />
              <StatCard
                label="Unchanged"
                value={diff.summary.unchangedCount}
                iconColor="text-gray-400"
              />
            </div>

            {/* Postinstall changes */}
            {(diff.summary.postinstallAdded > 0 ||
              diff.summary.postinstallRemoved > 0 ||
              diff.summary.postinstallChanged > 0) && (
              <div className="flex items-center gap-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertTriangle className="text-amber-500" size={20} />
                <div className="text-sm">
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Postinstall Script Changes:
                  </span>
                  <span className="ml-2 text-amber-600 dark:text-amber-500">
                    +{diff.summary.postinstallAdded} / -{diff.summary.postinstallRemoved} /{' '}
                    ~{diff.summary.postinstallChanged}
                  </span>
                </div>
              </div>
            )}

            {/* Timing diff */}
            {diff.timing.oldDurationMs && diff.timing.newDurationMs && (
              <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Clock className="text-gray-400" size={20} />
                <div className="text-sm">
                  <span className="text-gray-500">Execution Time:</span>
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    {formatDuration(diff.timing.oldDurationMs)} → {formatDuration(diff.timing.newDurationMs)}
                  </span>
                  <span
                    className={cn(
                      'ml-2',
                      diff.timing.diffMs && diff.timing.diffMs > 0
                        ? 'text-red-500'
                        : 'text-green-500'
                    )}
                  >
                    {formatPercentage(diff.timing.diffPercentage)}
                  </span>
                </div>
              </div>
            )}

            {/* Security score change */}
            {diff.summary.securityScoreChange !== null &&
              diff.summary.securityScoreChange !== undefined && (
                <div
                  className={cn(
                    'flex items-center gap-4 p-3 rounded-lg',
                    diff.summary.securityScoreChange >= 0
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-red-50 dark:bg-red-900/20'
                  )}
                >
                  <span
                    className={cn(
                      'text-2xl font-bold',
                      diff.summary.securityScoreChange >= 0 ? 'text-green-500' : 'text-red-500'
                    )}
                  >
                    {diff.summary.securityScoreChange >= 0 ? '+' : ''}
                    {diff.summary.securityScoreChange}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Security Score Change
                  </span>
                </div>
              )}

            {/* Lockfile type change */}
            {diff.lockfileTypeChanged && (
              <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-sm">
                <span className="text-purple-600 dark:text-purple-400">
                  Package manager changed: {diff.oldLockfileType?.toUpperCase() || 'unknown'} →{' '}
                  {diff.newLockfileType?.toUpperCase() || 'unknown'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Added Dependencies */}
      {addedDeps.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <SectionHeader
            title="Added Dependencies"
            section="added"
            count={addedDeps.length}
            icon={Plus}
            iconColor="text-green-500"
          />
          {expandedSections.added && (
            <div className="mt-2 space-y-1">
              {addedDeps.map((dep) => (
                <DependencyRow key={dep.name} change={dep} type="added" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Removed Dependencies */}
      {removedDeps.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <SectionHeader
            title="Removed Dependencies"
            section="removed"
            count={removedDeps.length}
            icon={Minus}
            iconColor="text-red-500"
          />
          {expandedSections.removed && (
            <div className="mt-2 space-y-1">
              {removedDeps.map((dep) => (
                <DependencyRow key={dep.name} change={dep} type="removed" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Updated Dependencies */}
      {updatedDeps.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <SectionHeader
            title="Updated Dependencies"
            section="updated"
            count={updatedDeps.length}
            icon={ArrowUp}
            iconColor="text-blue-500"
          />
          {expandedSections.updated && (
            <div className="mt-2 space-y-1">
              {updatedDeps.map((dep) => (
                <DependencyRow key={dep.name} change={dep} type="updated" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Postinstall Changes */}
      {diff.postinstallChanges.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-amber-200 dark:border-amber-800 p-4">
          <SectionHeader
            title="Postinstall Script Changes"
            section="postinstall"
            count={diff.postinstallChanges.length}
            icon={AlertTriangle}
            iconColor="text-amber-500"
          />
          {expandedSections.postinstall && (
            <div className="mt-2 space-y-2">
              {diff.postinstallChanges.map((change) => (
                <PostinstallRow key={change.packageName} change={change} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unchanged (optional) */}
      {unchangedDeps.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {unchangedDeps.length} unchanged dependencies
            </span>
            <button
              onClick={() => setShowUnchanged(!showUnchanged)}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              {showUnchanged ? 'Hide' : 'Show'}
            </button>
          </div>
          {showUnchanged && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {unchangedDeps.map((dep) => (
                <div key={dep.name} className="flex items-center gap-2 text-sm text-gray-400 py-1">
                  <span className="font-mono">{dep.name}</span>
                  <span className="text-xs">@{dep.newVersion || dep.oldVersion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      <AIAnalysisPanel
        baseSnapshotId={diff.snapshotAId}
        compareSnapshotId={diff.snapshotBId}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: number;
  icon?: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-center gap-1 mb-1">
        {Icon && <Icon size={16} className={iconColor} />}
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</span>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function DependencyRow({
  change,
  type,
}: {
  change: DependencyChange;
  type: 'added' | 'removed' | 'updated';
}) {
  const colors = {
    added: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    removed: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    updated: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  const icons = {
    added: <Plus size={14} className="text-green-500" />,
    removed: <Minus size={14} className="text-red-500" />,
    updated: <ArrowUp size={14} className="text-blue-500" />,
  };

  return (
    <div className={cn('flex items-center gap-2 p-2 rounded border', colors[type])}>
      {icons[type]}
      <span className="font-mono text-sm">{change.name}</span>
      {type === 'updated' ? (
        <span className="text-xs text-gray-500">
          {change.oldVersion} → {change.newVersion}
        </span>
      ) : (
        <span className="text-xs text-gray-500">
          @{change.newVersion || change.oldVersion}
        </span>
      )}
      {change.isDev && (
        <span className="text-xs px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">dev</span>
      )}
      {change.postinstallChanged && (
        <span className="text-amber-500" title="Postinstall script changed">
          <AlertTriangle size={12} />
        </span>
      )}
    </div>
  );
}

function PostinstallRow({ change }: { change: PostinstallChange }) {
  const typeIcons = {
    added: <Plus size={14} className="text-green-500" />,
    removed: <Minus size={14} className="text-red-500" />,
    updated: <ArrowUp size={14} className="text-blue-500" />,
    unchanged: null,
  };

  return (
    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        {typeIcons[change.changeType]}
        <span className="font-mono text-sm font-medium">{change.packageName}</span>
      </div>
      {change.oldScript && (
        <div className="mb-1">
          <span className="text-xs text-red-600 dark:text-red-400">- </span>
          <code className="text-xs font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">
            {change.oldScript}
          </code>
        </div>
      )}
      {change.newScript && (
        <div>
          <span className="text-xs text-green-600 dark:text-green-400">+ </span>
          <code className="text-xs font-mono bg-green-100 dark:bg-green-900/30 px-1 rounded">
            {change.newScript}
          </code>
        </div>
      )}
    </div>
  );
}
