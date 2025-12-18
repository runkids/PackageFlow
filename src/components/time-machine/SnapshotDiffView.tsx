// Snapshot Diff View Component
// Displays comparison between two snapshots with left-right panel layout

import { useState, useMemo } from 'react';
import {
  Plus,
  Minus,
  ArrowUp,
  AlertTriangle,
  ChevronDown,
  LayoutDashboard,
  Sparkles,
  Package,
} from 'lucide-react';
import type { SnapshotDiff, DependencyChange, PostinstallChange } from '../../types/snapshot';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { AIAnalysisPanel } from './AIAnalysisPanel';

type DiffTab = 'summary' | 'added' | 'removed' | 'updated' | 'postinstall' | 'ai';

interface SnapshotDiffViewProps {
  diff: SnapshotDiff;
  /** Date of the older snapshot (base) */
  olderDate?: string;
  /** Date of the newer snapshot (compare target) */
  newerDate?: string;
  className?: string;
}

export function SnapshotDiffView({ diff, olderDate, newerDate, className }: SnapshotDiffViewProps) {
  const [activeTab, setActiveTab] = useState<DiffTab>('summary');
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Format dates for display
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Categorize changes
  const addedDeps = useMemo(
    () => diff.dependencyChanges.filter((c) => c.changeType === 'added'),
    [diff.dependencyChanges]
  );
  const removedDeps = useMemo(
    () => diff.dependencyChanges.filter((c) => c.changeType === 'removed'),
    [diff.dependencyChanges]
  );
  const updatedDeps = useMemo(
    () => diff.dependencyChanges.filter((c) => c.changeType === 'updated'),
    [diff.dependencyChanges]
  );
  const unchangedDeps = useMemo(
    () => diff.dependencyChanges.filter((c) => c.changeType === 'unchanged'),
    [diff.dependencyChanges]
  );

  // Tab configuration
  const tabs: {
    id: DiffTab;
    label: string;
    description: string;
    icon: typeof LayoutDashboard;
    count?: number;
    variant?: 'added' | 'removed' | 'updated' | 'warning' | 'ai';
  }[] = [
    { id: 'summary', label: 'Summary', description: 'Overview', icon: LayoutDashboard },
    {
      id: 'added',
      label: 'Added',
      description: 'New packages',
      icon: Plus,
      count: addedDeps.length,
      variant: 'added',
    },
    {
      id: 'removed',
      label: 'Removed',
      description: 'Deleted packages',
      icon: Minus,
      count: removedDeps.length,
      variant: 'removed',
    },
    {
      id: 'updated',
      label: 'Updated',
      description: 'Version changes',
      icon: ArrowUp,
      count: updatedDeps.length,
      variant: 'updated',
    },
    {
      id: 'postinstall',
      label: 'Postinstall',
      description: 'Script changes',
      icon: AlertTriangle,
      count: diff.postinstallChanges.length,
      variant: 'warning',
    },
    { id: 'ai', label: 'AI Analysis', description: 'Smart insights', icon: Sparkles, variant: 'ai' },
  ];

  const getVariantColor = (variant?: string) => {
    switch (variant) {
      case 'added':
        return 'bg-emerald-600/20 text-emerald-400 border-emerald-400';
      case 'removed':
        return 'bg-rose-600/20 text-rose-400 border-rose-400';
      case 'updated':
        return 'bg-sky-600/20 text-sky-400 border-sky-400';
      case 'warning':
        return 'bg-amber-600/20 text-amber-400 border-amber-400';
      case 'ai':
        return 'bg-violet-600/20 text-violet-400 border-violet-400';
      default:
        return 'bg-cyan-600/20 text-cyan-400 border-cyan-400';
    }
  };

  const getBadgeColor = (variant?: string) => {
    switch (variant) {
      case 'added':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'removed':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      case 'updated':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/30';
      case 'warning':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className={cn('flex h-full -m-4 animate-in fade-in-0 duration-200', className)}>
      {/* Left Sidebar Navigation */}
      <div className="w-56 flex-shrink-0 bg-card rounded-lg overflow-hidden m-4 mr-0 self-start">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground">Compare Results</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {diff.summary.addedCount + diff.summary.removedCount + diff.summary.updatedCount} changes
          </p>
        </div>

        {/* Comparison Info */}
        {(olderDate || newerDate) && (
          <div className="p-3 border-b border-border bg-cyan-500/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Comparing</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                <span className="text-muted-foreground">Older:</span>
                <span className="text-foreground font-medium truncate">{formatDate(olderDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <span className="text-muted-foreground">Newer:</span>
                <span className="text-foreground font-medium truncate">{formatDate(newerDate)}</span>
              </div>
            </div>
          </div>
        )}

        <ul>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasItems = tab.count === undefined || tab.count > 0;

            // Skip tabs with no items (except summary and ai)
            if (tab.count === 0 && tab.id !== 'summary' && tab.id !== 'ai') {
              return null;
            }

            return (
              <li key={tab.id}>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-left h-auto justify-start rounded-none border-l-2',
                    isActive
                      ? getVariantColor(tab.variant)
                      : 'hover:bg-accent text-muted-foreground border-transparent',
                    !hasItems && 'opacity-50'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tab.label}</div>
                    <div className="text-xs text-muted-foreground">{tab.description}</div>
                  </div>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded border',
                        getBadgeColor(tab.variant)
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>

        {/* Quick Stats */}
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-emerald-500">+{diff.summary.addedCount}</p>
              <p className="text-[10px] text-muted-foreground">Added</p>
            </div>
            <div>
              <p className="text-lg font-bold text-rose-500">-{diff.summary.removedCount}</p>
              <p className="text-[10px] text-muted-foreground">Removed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-sky-500">~{diff.summary.updatedCount}</p>
              <p className="text-[10px] text-muted-foreground">Updated</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-w-0 overflow-hidden p-4">
        {/* Summary Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'summary' && 'hidden')}>
          <SummaryTabContent
            diff={diff}
            unchangedCount={unchangedDeps.length}
            showUnchanged={showUnchanged}
            onToggleUnchanged={() => setShowUnchanged(!showUnchanged)}
            unchangedDeps={unchangedDeps}
          />
        </div>

        {/* Added Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'added' && 'hidden')}>
          <DependencyListContent
            title="Added Dependencies"
            description="New packages added to the project"
            deps={addedDeps}
            type="added"
            emptyMessage="No dependencies were added"
          />
        </div>

        {/* Removed Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'removed' && 'hidden')}>
          <DependencyListContent
            title="Removed Dependencies"
            description="Packages removed from the project"
            deps={removedDeps}
            type="removed"
            emptyMessage="No dependencies were removed"
          />
        </div>

        {/* Updated Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'updated' && 'hidden')}>
          <DependencyListContent
            title="Updated Dependencies"
            description="Packages with version changes"
            deps={updatedDeps}
            type="updated"
            emptyMessage="No dependencies were updated"
          />
        </div>

        {/* Postinstall Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'postinstall' && 'hidden')}>
          <PostinstallTabContent changes={diff.postinstallChanges} />
        </div>

        {/* AI Analysis Tab */}
        <div className={cn('h-full overflow-y-auto', activeTab !== 'ai' && 'hidden')}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Analysis</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Get intelligent insights about these changes
              </p>
            </div>
            <AIAnalysisPanel
              baseSnapshotId={diff.snapshotAId}
              compareSnapshotId={diff.snapshotBId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Summary Tab Content
// ============================================================================

function SummaryTabContent({
  diff,
  unchangedCount,
  showUnchanged,
  onToggleUnchanged,
  unchangedDeps,
}: {
  diff: SnapshotDiff;
  unchangedCount: number;
  showUnchanged: boolean;
  onToggleUnchanged: () => void;
  unchangedDeps: DependencyChange[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Comparison Summary</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of changes between snapshots
        </p>
      </div>

      {/* Change counts */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Added" value={diff.summary.addedCount} icon={Plus} variant="added" />
        <StatCard label="Removed" value={diff.summary.removedCount} icon={Minus} variant="removed" />
        <StatCard label="Updated" value={diff.summary.updatedCount} icon={ArrowUp} variant="updated" />
        <StatCard label="Unchanged" value={diff.summary.unchangedCount} variant="default" />
      </div>

      {/* Postinstall changes */}
      {(diff.summary.postinstallAdded > 0 ||
        diff.summary.postinstallRemoved > 0 ||
        diff.summary.postinstallChanged > 0) && (
        <div
          className={cn(
            'p-4 rounded-xl',
            'bg-amber-500/10 border border-amber-500/30',
            'flex items-center gap-3'
          )}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Postinstall Script Changes
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{diff.summary.postinstallAdded}
              </span>
              <span>/</span>
              <span className="text-rose-600 dark:text-rose-400">
                -{diff.summary.postinstallRemoved}
              </span>
              <span>/</span>
              <span className="text-sky-600 dark:text-sky-400">
                ~{diff.summary.postinstallChanged}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Security score change */}
      {diff.summary.securityScoreChange !== null &&
        diff.summary.securityScoreChange !== undefined && (
          <div
            className={cn(
              'p-4 rounded-xl border',
              diff.summary.securityScoreChange >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-rose-500/10 border-rose-500/30'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center',
                  diff.summary.securityScoreChange >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                )}
              >
                <span
                  className={cn(
                    'text-xl font-bold',
                    diff.summary.securityScoreChange >= 0
                      ? 'text-emerald-500'
                      : 'text-rose-500'
                  )}
                >
                  {diff.summary.securityScoreChange >= 0 ? '+' : ''}
                  {diff.summary.securityScoreChange}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Security Score Change</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {diff.summary.securityScoreChange >= 0
                    ? 'Security posture improved'
                    : 'Security posture decreased'}
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Lockfile type change */}
      {diff.lockfileTypeChanged && (
        <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
                Package Manager Changed
              </p>
              <p className="text-xs font-mono text-violet-600/80 dark:text-violet-400/80 mt-0.5">
                {diff.oldLockfileType?.toUpperCase() || 'unknown'}
                <span className="mx-1">→</span>
                {diff.newLockfileType?.toUpperCase() || 'unknown'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unchanged */}
      {unchangedCount > 0 && (
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {unchangedCount} unchanged dependencies
            </span>
            <button
              onClick={onToggleUnchanged}
              className="text-xs text-cyan-500 hover:text-cyan-400"
            >
              {showUnchanged ? 'Hide' : 'Show'}
            </button>
          </div>
          {showUnchanged && (
            <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
              {unchangedDeps.map((dep) => (
                <div
                  key={dep.name}
                  className="flex items-center gap-2 text-sm text-muted-foreground py-1"
                >
                  <span className="font-mono">{dep.name}</span>
                  <span className="text-xs">@{dep.newVersion || dep.oldVersion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
}: {
  label: string;
  value: number;
  icon?: React.ElementType;
  variant?: 'added' | 'removed' | 'updated' | 'default';
}) {
  const variantStyles = {
    added: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      icon: 'text-emerald-500',
      value: 'text-emerald-600 dark:text-emerald-400',
    },
    removed: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      icon: 'text-rose-500',
      value: 'text-rose-600 dark:text-rose-400',
    },
    updated: {
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/30',
      icon: 'text-sky-500',
      value: 'text-sky-600 dark:text-sky-400',
    },
    default: {
      bg: 'bg-muted/50',
      border: 'border-border',
      icon: 'text-muted-foreground',
      value: 'text-foreground',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={cn('p-4 rounded-xl border text-center', styles.bg, styles.border)}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {Icon && <Icon size={14} className={styles.icon} />}
        <span className={cn('text-xl font-bold', styles.value)}>{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ============================================================================
// Dependency List Content
// ============================================================================

function DependencyListContent({
  title,
  description,
  deps,
  type,
  emptyMessage,
}: {
  title: string;
  description: string;
  deps: DependencyChange[];
  type: 'added' | 'removed' | 'updated';
  emptyMessage: string;
}) {
  const [expanded, setExpanded] = useState(true);

  if (deps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <Package size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronDown
            size={16}
            className={cn('text-muted-foreground transition-transform', !expanded && '-rotate-90')}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-1">
          {deps.map((dep) => (
            <DependencyRow key={dep.name} change={dep} type={type} />
          ))}
        </div>
      )}
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
  const styles = {
    added: {
      wrapper:
        'hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10 border-transparent hover:border-emerald-500/20',
      icon: 'text-emerald-500',
      indicator: 'bg-emerald-500',
    },
    removed: {
      wrapper:
        'hover:bg-rose-500/5 dark:hover:bg-rose-500/10 border-transparent hover:border-rose-500/20',
      icon: 'text-rose-500',
      indicator: 'bg-rose-500',
    },
    updated: {
      wrapper:
        'hover:bg-sky-500/5 dark:hover:bg-sky-500/10 border-transparent hover:border-sky-500/20',
      icon: 'text-sky-500',
      indicator: 'bg-sky-500',
    },
  };

  const iconComponents = {
    added: <Plus size={14} className={styles[type].icon} />,
    removed: <Minus size={14} className={styles[type].icon} />,
    updated: <ArrowUp size={14} className={styles[type].icon} />,
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors',
        styles[type].wrapper
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', styles[type].indicator)} />
      {iconComponents[type]}
      <span className="font-mono text-sm text-foreground">{change.name}</span>
      {type === 'updated' ? (
        <span className="text-xs text-muted-foreground font-mono">
          {change.oldVersion} <span className="text-muted-foreground/50">→</span> {change.newVersion}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground font-mono">
          @{change.newVersion || change.oldVersion}
        </span>
      )}
      {change.isDev && (
        <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border">
          dev
        </span>
      )}
      {change.postinstallChanged && (
        <span
          className={cn(
            'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border',
            'bg-amber-100/50 dark:bg-amber-900/20',
            'text-amber-600 dark:text-amber-400',
            'border-amber-200/50 dark:border-amber-700/30'
          )}
          title="Postinstall script changed"
        >
          <AlertTriangle size={10} />
          <span className="text-[10px]">postinstall</span>
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Postinstall Tab Content
// ============================================================================

function PostinstallTabContent({ changes }: { changes: PostinstallChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <AlertTriangle size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No postinstall script changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Postinstall Script Changes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review changes to postinstall scripts - these run automatically after installation
        </p>
      </div>

      <div className="space-y-3">
        {changes.map((change) => (
          <PostinstallRow key={change.packageName} change={change} />
        ))}
      </div>
    </div>
  );
}

function PostinstallRow({ change }: { change: PostinstallChange }) {
  const typeStyles = {
    added: {
      icon: <Plus size={14} className="text-emerald-500" />,
      indicator: 'bg-emerald-500',
    },
    removed: {
      icon: <Minus size={14} className="text-rose-500" />,
      indicator: 'bg-rose-500',
    },
    updated: {
      icon: <ArrowUp size={14} className="text-sky-500" />,
      indicator: 'bg-sky-500',
    },
    unchanged: {
      icon: null,
      indicator: 'bg-gray-400',
    },
  };

  const style = typeStyles[change.changeType];

  return (
    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style.indicator)} />
        {style.icon}
        <span className="font-mono text-sm font-medium text-foreground">{change.packageName}</span>
      </div>
      {change.oldScript && (
        <div className="mb-2 flex items-start gap-2">
          <span className="text-xs text-rose-500 font-mono mt-0.5">-</span>
          <code
            className={cn(
              'text-xs font-mono px-2 py-1 rounded border flex-1',
              'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
            )}
          >
            {change.oldScript}
          </code>
        </div>
      )}
      {change.newScript && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-emerald-500 font-mono mt-0.5">+</span>
          <code
            className={cn(
              'text-xs font-mono px-2 py-1 rounded border flex-1',
              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
            )}
          >
            {change.newScript}
          </code>
        </div>
      )}
    </div>
  );
}
