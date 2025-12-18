// Snapshot Timeline Component
// Displays a timeline of execution snapshots with left-right panel layout

import { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Trash2,
  GitCompare,
  Filter,
  BarChart3,
  List,
  Shield,
} from 'lucide-react';
import type { SnapshotListItem, TriggerSource } from '../../types/snapshot';
import { SecurityBadge } from './SecurityBadge';
import { CompactEmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface SnapshotTimelineProps {
  snapshots: SnapshotListItem[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect?: (snapshot: SnapshotListItem) => void;
  onDelete?: (snapshotId: string) => void;
  onCompare?: (snapshotA: SnapshotListItem, snapshotB: SnapshotListItem) => void;
  compareMode?: boolean;
  className?: string;
}

type TimelineTab = 'all' | 'stats';
type TriggerFilter = 'all' | 'auto' | 'manual';

export function SnapshotTimeline({
  snapshots,
  loading = false,
  selectedId,
  onSelect,
  onDelete,
  onCompare,
  compareMode = false,
  className,
}: SnapshotTimelineProps) {
  const [activeTab, setActiveTab] = useState<TimelineTab>('all');
  const [compareSelection, setCompareSelection] = useState<SnapshotListItem | null>(null);
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const [securityFilter, setSecurityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  // Calculate stats
  const stats = useMemo(() => {
    const total = snapshots.length;
    const manual = snapshots.filter((s) => s.triggerSource === 'manual').length;
    const auto = total - manual;
    const withPostinstall = snapshots.filter((s) => s.postinstallCount > 0).length;
    const avgScore =
      snapshots.length > 0
        ? Math.round(
            snapshots.reduce((sum, s) => sum + (s.securityScore ?? 0), 0) / snapshots.length
          )
        : 0;
    const lowSecurity = snapshots.filter((s) => (s.securityScore ?? 100) < 50).length;
    const mediumSecurity = snapshots.filter(
      (s) => (s.securityScore ?? 0) >= 50 && (s.securityScore ?? 0) < 80
    ).length;
    const highSecurity = snapshots.filter((s) => (s.securityScore ?? 0) >= 80).length;

    return { total, manual, auto, withPostinstall, avgScore, lowSecurity, mediumSecurity, highSecurity };
  }, [snapshots]);

  // Filter snapshots
  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((s) => {
      // Trigger filter
      if (triggerFilter === 'auto' && s.triggerSource === 'manual') return false;
      if (triggerFilter === 'manual' && s.triggerSource !== 'manual') return false;

      // Security filter
      const score = s.securityScore ?? 100;
      if (securityFilter === 'low' && score >= 50) return false;
      if (securityFilter === 'medium' && (score < 50 || score >= 80)) return false;
      if (securityFilter === 'high' && score < 80) return false;

      return true;
    });
  }, [snapshots, triggerFilter, securityFilter]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="text-green-500" size={16} />;
      case 'failed':
        return <XCircle className="text-red-500" size={16} />;
      case 'capturing':
        return <Loader2 className="text-blue-500 animate-spin" size={16} />;
      default:
        return <Clock className="text-gray-400" size={16} />;
    }
  };

  const getTriggerLabel = (triggerSource?: TriggerSource, lockfileType?: string) => {
    const lockfileLabel = lockfileType?.toUpperCase() || '';
    if (triggerSource === 'manual') {
      return (
        <span className="text-purple-600 dark:text-purple-400" title="Manually captured">
          Manual
        </span>
      );
    }
    return (
      <span className="text-muted-foreground" title="Triggered by lockfile change">
        {lockfileLabel || 'Auto'}
      </span>
    );
  };

  const handleClick = (snapshot: SnapshotListItem) => {
    if (compareMode && onCompare) {
      if (!compareSelection) {
        setCompareSelection(snapshot);
      } else {
        onCompare(compareSelection, snapshot);
        setCompareSelection(null);
      }
    } else {
      onSelect?.(snapshot);
    }
  };

  const handleDelete = (e: React.MouseEvent, snapshotId: string) => {
    e.stopPropagation();
    onDelete?.(snapshotId);
  };

  const handleCompareWithPrevious = (e: React.MouseEvent, currentIndex: number) => {
    e.stopPropagation();
    if (currentIndex < filteredSnapshots.length - 1 && onCompare) {
      onCompare(filteredSnapshots[currentIndex], filteredSnapshots[currentIndex + 1]);
    }
  };

  // Tab configuration
  const tabs: { id: TimelineTab; label: string; description: string; icon: typeof List }[] = [
    { id: 'all', label: 'All Snapshots', description: 'Browse timeline', icon: List },
    { id: 'stats', label: 'Statistics', description: 'Overview & trends', icon: BarChart3 },
  ];

  if (loading && snapshots.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="animate-spin text-gray-400" size={24} />
        <span className="ml-2 text-gray-500">Loading snapshots...</span>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <CompactEmptyState
        icon={Clock}
        title="No Snapshots"
        description="Snapshots are captured when lockfiles change or manually triggered"
        variant="blue"
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex h-full -m-4 animate-in fade-in-0 duration-200', className)}>
      {/* Left Sidebar */}
      <div className="w-56 flex-shrink-0 bg-card rounded-lg overflow-hidden m-4 mr-0 self-start">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground">Timeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.total} snapshots</p>
        </div>

        {/* Tabs */}
        <ul>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <li key={tab.id}>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-left h-auto justify-start rounded-none border-l-2',
                    isActive
                      ? 'bg-cyan-600/20 text-cyan-400 border-cyan-400'
                      : 'hover:bg-accent text-muted-foreground border-transparent'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tab.label}</div>
                    <div className="text-xs text-muted-foreground">{tab.description}</div>
                  </div>
                </Button>
              </li>
            );
          })}
        </ul>

        {/* Filters - only show when on 'all' tab */}
        {activeTab === 'all' && (
          <div className="border-t border-border p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter size={12} />
              <span className="font-medium">Filters</span>
            </div>

            {/* Trigger filter */}
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Source</span>
              <div className="flex flex-wrap gap-1">
                {(['all', 'auto', 'manual'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTriggerFilter(filter)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md border transition-colors',
                      triggerFilter === filter
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600 dark:text-cyan-400'
                        : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {filter === 'all' ? 'All' : filter === 'auto' ? 'Auto' : 'Manual'}
                  </button>
                ))}
              </div>
            </div>

            {/* Security filter */}
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Security</span>
              <div className="flex flex-wrap gap-1">
                {(['all', 'high', 'medium', 'low'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setSecurityFilter(filter)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md border transition-colors',
                      securityFilter === filter
                        ? filter === 'high'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : filter === 'medium'
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                            : filter === 'low'
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600 dark:text-cyan-400'
                        : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Active filters count */}
            {(triggerFilter !== 'all' || securityFilter !== 'all') && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {filteredSnapshots.length} of {snapshots.length}
                </span>
                <button
                  onClick={() => {
                    setTriggerFilter('all');
                    setSecurityFilter('all');
                  }}
                  className="text-xs text-cyan-500 hover:text-cyan-400"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-w-0 overflow-hidden p-4">
        {/* All Snapshots Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'all' && 'hidden')}>
          {/* Refresh indicator */}
          {loading && snapshots.length > 0 && (
            <div className="mb-2 flex items-center justify-center gap-2 py-1.5 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600 dark:text-blue-400">
              <Loader2 className="animate-spin" size={12} />
              Refreshing...
            </div>
          )}

          {/* Compare mode hint */}
          {compareMode && (
            <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
              {compareSelection ? (
                <span className="text-blue-600 dark:text-blue-400">
                  Select another snapshot to compare with{' '}
                  <strong>{formatRelativeTime(compareSelection.createdAt)}</strong>
                </span>
              ) : (
                <span className="text-blue-600 dark:text-blue-400">
                  Select the first snapshot to compare
                </span>
              )}
            </div>
          )}

          {/* Snapshot list */}
          <div className="space-y-1">
            {filteredSnapshots.map((snapshot, index) => {
              const isSelected = selectedId === snapshot.id;
              const isCompareSelected = compareSelection?.id === snapshot.id;

              return (
                <div
                  key={snapshot.id}
                  onClick={() => handleClick(snapshot)}
                  className={cn(
                    'group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all',
                    'hover:bg-gray-100 dark:hover:bg-gray-800',
                    isSelected &&
                      'bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800',
                    isCompareSelected &&
                      'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
                    !isSelected && !isCompareSelected && 'border border-transparent'
                  )}
                >
                  {/* Timeline connector */}
                  {index < filteredSnapshots.length - 1 && (
                    <div className="absolute left-[22px] top-[40px] w-0.5 h-[calc(100%-20px)] bg-gray-200 dark:bg-gray-700" />
                  )}

                  {/* Status indicator */}
                  <div className="flex-shrink-0 z-10 bg-white dark:bg-gray-900 rounded-full p-1">
                    {getStatusIcon(snapshot.status)}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {formatRelativeTime(snapshot.createdAt)}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{snapshot.totalDependencies} deps</span>
                      <span className="text-muted-foreground/50">·</span>
                      {getTriggerLabel(snapshot.triggerSource, snapshot.lockfileType)}
                      {snapshot.postinstallCount > 0 && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="flex items-center text-amber-500">
                            <AlertTriangle size={10} className="mr-0.5" />
                            {snapshot.postinstallCount} scripts
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center justify-end gap-1 w-[76px] opacity-0 group-hover:opacity-100 transition-opacity">
                      {!compareMode && index < filteredSnapshots.length - 1 && onCompare && (
                        <button
                          onClick={(e) => handleCompareWithPrevious(e, index)}
                          className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-500"
                          title={`Compare with ${formatRelativeTime(filteredSnapshots[index + 1].createdAt)}`}
                        >
                          <GitCompare size={14} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => handleDelete(e, snapshot.id)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                          title="Delete snapshot"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      {!compareMode && (
                        <ChevronRight size={16} className="text-gray-400" />
                      )}
                    </div>
                    <SecurityBadge score={snapshot.securityScore} size="sm" />
                  </div>
                </div>
              );
            })}

            {filteredSnapshots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                  <Filter size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No snapshots match current filters</p>
                <button
                  onClick={() => {
                    setTriggerFilter('all');
                    setSecurityFilter('all');
                  }}
                  className="mt-2 text-xs text-cyan-500 hover:text-cyan-400"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Statistics Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'stats' && 'hidden')}>
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Statistics</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Overview of your snapshot history
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatsCard
                icon={Clock}
                label="Total Snapshots"
                value={stats.total}
                color="cyan"
              />
              <StatsCard
                icon={Shield}
                label="Avg Security"
                value={stats.avgScore}
                suffix="%"
                color={stats.avgScore >= 80 ? 'emerald' : stats.avgScore >= 50 ? 'amber' : 'rose'}
              />
              <StatsCard
                icon={CheckCircle2}
                label="Auto Captured"
                value={stats.auto}
                color="blue"
              />
              <StatsCard
                icon={AlertTriangle}
                label="With Postinstall"
                value={stats.withPostinstall}
                color="amber"
              />
            </div>

            {/* Trigger breakdown */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-sm font-medium text-foreground mb-3">Capture Source</h3>
              <div className="space-y-2">
                <ProgressBar
                  label="Auto (Lockfile Change)"
                  value={stats.auto}
                  total={stats.total}
                  color="cyan"
                />
                <ProgressBar
                  label="Manual"
                  value={stats.manual}
                  total={stats.total}
                  color="purple"
                />
              </div>
            </div>

            {/* Security breakdown */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <h3 className="text-sm font-medium text-foreground mb-3">Security Distribution</h3>
              <div className="space-y-2">
                <ProgressBar
                  label="High (80-100)"
                  value={stats.highSecurity}
                  total={stats.total}
                  color="emerald"
                />
                <ProgressBar
                  label="Medium (50-79)"
                  value={stats.mediumSecurity}
                  total={stats.total}
                  color="amber"
                />
                <ProgressBar
                  label="Low (0-49)"
                  value={stats.lowSecurity}
                  total={stats.total}
                  color="rose"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  suffix?: string;
  color: 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple';
}) {
  const colorClasses = {
    cyan: 'bg-cyan-500/10 text-cyan-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    amber: 'bg-amber-500/10 text-amber-500',
    rose: 'bg-rose-500/10 text-rose-500',
    blue: 'bg-blue-500/10 text-blue-500',
    purple: 'bg-purple-500/10 text-purple-500',
  };

  return (
    <div className="p-4 rounded-xl bg-card border border-border">
      <div className="flex items-start gap-3">
        <div className={cn('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground mt-0.5">
            {value}{suffix}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple';
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  const colorClasses = {
    cyan: 'bg-cyan-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    purple: 'bg-purple-500',
  };

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value} ({percentage}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
