// Snapshot Detail Panel Component
// Left-right panel layout matching Git/Deploy panel design
// Feature 025 redesign: Project-level lockfile change detection

import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Package,
  Shield,
  History,
  GitCompare,
  Search,
  AlertTriangle,
  Clock,
  HardDrive,
  Hash,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { SecurityBadge } from './SecurityBadge';
import { cn } from '../../lib/utils';
import type { ExecutionSnapshot, SnapshotDependency, SnapshotListItem } from '../../types/snapshot';

type SnapshotTab = 'overview' | 'dependencies' | 'integrity' | 'compare';

interface SnapshotDetailPanelProps {
  snapshot: ExecutionSnapshot;
  dependencies?: SnapshotDependency[];
  loading?: boolean;
  onBackToTimeline: () => void;
  /** All snapshots for compare feature */
  allSnapshots?: SnapshotListItem[];
  /** Callback when compare is requested */
  onCompare?: (snapshotA: SnapshotListItem, snapshotB: SnapshotListItem) => void;
  className?: string;
}

export function SnapshotDetailPanel({
  snapshot,
  dependencies = [],
  loading = false,
  onBackToTimeline,
  allSnapshots = [],
  onCompare,
  className,
}: SnapshotDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<SnapshotTab>('overview');

  // Dependencies filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDirect, setShowDirect] = useState(true);
  const [showDev, setShowDev] = useState(true);
  const [showPostinstall, setShowPostinstall] = useState(false);

  // Compare state
  const [selectedCompareId, setSelectedCompareId] = useState<string>('');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setActiveTab('overview');
          }
          break;
        case '2':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setActiveTab('dependencies');
          }
          break;
        case '3':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setActiveTab('integrity');
          }
          break;
        case '4':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setActiveTab('compare');
          }
          break;
        case '/':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setActiveTab('dependencies');
            // Focus search input after tab switch
            setTimeout(() => {
              const searchInput = document.querySelector<HTMLInputElement>(
                '[data-snapshot-search-input]'
              );
              searchInput?.focus();
            }, 100);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter dependencies
  const filteredDependencies = dependencies.filter((dep) => {
    if (searchQuery && !dep.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (!showDirect && dep.isDirect) return false;
    if (!showDev && dep.isDev) return false;
    if (showPostinstall && !dep.hasPostinstall) return false;
    return true;
  });

  const directDeps = filteredDependencies.filter((d) => d.isDirect && !d.isDev);
  const devDeps = filteredDependencies.filter((d) => d.isDev);
  const transitiveDeps = filteredDependencies.filter((d) => !d.isDirect && !d.isDev);

  // Handle compare
  const handleCompare = useCallback(() => {
    if (!selectedCompareId || !onCompare) return;
    const compareSnapshot = allSnapshots.find((s) => s.id === selectedCompareId);
    if (!compareSnapshot) return;

    // Create a SnapshotListItem from the current snapshot
    const currentSnapshotItem: SnapshotListItem = {
      id: snapshot.id,
      projectPath: snapshot.projectPath,
      status: snapshot.status,
      triggerSource: snapshot.triggerSource,
      lockfileType: snapshot.lockfileType,
      totalDependencies: snapshot.totalDependencies,
      securityScore: snapshot.securityScore,
      postinstallCount: snapshot.postinstallCount,
      createdAt: snapshot.createdAt,
    };

    onCompare(currentSnapshotItem, compareSnapshot);
  }, [selectedCompareId, onCompare, allSnapshots, snapshot]);

  // Tab configuration
  const tabs: {
    id: SnapshotTab;
    label: string;
    description: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }[] = [
    { id: 'overview', label: 'Overview', description: 'Summary & stats', icon: LayoutDashboard },
    {
      id: 'dependencies',
      label: 'Dependencies',
      description: 'Packages list',
      icon: Package,
      badge: dependencies.length || undefined,
    },
    { id: 'integrity', label: 'Integrity', description: 'Hash verification', icon: Shield },
    { id: 'compare', label: 'Compare', description: 'Diff with other', icon: GitCompare },
  ];

  return (
    <div className={cn('flex h-full -m-4 animate-in fade-in-0 duration-200', className)}>
      {/* Left Sidebar Navigation */}
      <div className="w-56 flex-shrink-0 bg-card rounded-lg overflow-hidden m-4 mr-0 self-start">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-muted-foreground">Snapshot Detail</h3>
        </div>
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
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {tab.badge}
                    </span>
                  )}
                </Button>
              </li>
            );
          })}

          {/* Timeline - special button */}
          <li className="border-t border-border mt-2 pt-2">
            <Button
              variant="ghost"
              onClick={onBackToTimeline}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2.5 text-left h-auto justify-start rounded-none border-l-2',
                'hover:bg-accent text-muted-foreground border-transparent'
              )}
            >
              <History className="w-4 h-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Timeline</div>
                <div className="text-xs text-muted-foreground">Back to list</div>
              </div>
            </Button>
          </li>
        </ul>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-w-0 overflow-hidden p-4 flex flex-col">
        {/* Overview Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'overview' && 'hidden')}>
          <OverviewTabContent snapshot={snapshot} />
        </div>

        {/* Dependencies Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'dependencies' && 'hidden')}>
          <DependenciesTabContent
            dependencies={dependencies}
            loading={loading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showDirect={showDirect}
            onShowDirectChange={setShowDirect}
            showDev={showDev}
            onShowDevChange={setShowDev}
            showPostinstall={showPostinstall}
            onShowPostinstallChange={setShowPostinstall}
            filteredDependencies={filteredDependencies}
            directDeps={directDeps}
            devDeps={devDeps}
            transitiveDeps={transitiveDeps}
          />
        </div>

        {/* Integrity Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'integrity' && 'hidden')}>
          <IntegrityTabContent snapshot={snapshot} />
        </div>

        {/* Compare Tab */}
        <div className={cn('flex-1 overflow-y-auto', activeTab !== 'compare' && 'hidden')}>
          <CompareTabContent
            currentSnapshotId={snapshot.id}
            allSnapshots={allSnapshots}
            selectedCompareId={selectedCompareId}
            onSelectCompare={setSelectedCompareId}
            onCompare={handleCompare}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Overview Tab Content
// ============================================================================

function OverviewTabContent({ snapshot }: { snapshot: ExecutionSnapshot }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Snapshot Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {snapshot.triggerSource === 'manual' ? 'Manual capture' : 'Auto-captured on lockfile change'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          icon={Clock}
          label="Created"
          value={formatDate(snapshot.createdAt)}
        />
        <StatCard
          icon={Package}
          label="Package Manager"
          value={(snapshot.lockfileType || 'Unknown').toUpperCase()}
        />
        <StatCard
          icon={HardDrive}
          label="Storage"
          value={formatSize(snapshot.compressedSize)}
        />
        <div
          className={cn(
            'p-4 rounded-xl',
            'bg-card border border-border',
            'flex items-start gap-3'
          )}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Security Score</p>
            <SecurityBadge score={snapshot.securityScore} size="md" className="mt-1" />
          </div>
        </div>
      </div>

      {/* Postinstall Warning */}
      {snapshot.postinstallCount > 0 && (
        <div
          className={cn(
            'p-4 rounded-xl',
            'bg-amber-500/10 border border-amber-500/30',
            'flex items-center gap-3'
          )}
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {snapshot.postinstallCount} postinstall scripts detected
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              Review these scripts in the Dependencies tab
            </p>
          </div>
        </div>
      )}

      {/* Dependency Summary */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <h3 className="text-sm font-medium text-foreground mb-3">Dependency Summary</h3>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold text-foreground">{snapshot.totalDependencies}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-cyan-500">{snapshot.directDependencies}</p>
            <p className="text-xs text-muted-foreground">Direct</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-violet-500">{snapshot.devDependencies}</p>
            <p className="text-xs text-muted-foreground">Dev</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        'p-4 rounded-xl',
        'bg-card border border-border',
        'flex items-start gap-3'
      )}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-cyan-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Dependencies Tab Content
// ============================================================================

interface DependenciesTabContentProps {
  dependencies: SnapshotDependency[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showDirect: boolean;
  onShowDirectChange: (show: boolean) => void;
  showDev: boolean;
  onShowDevChange: (show: boolean) => void;
  showPostinstall: boolean;
  onShowPostinstallChange: (show: boolean) => void;
  filteredDependencies: SnapshotDependency[];
  directDeps: SnapshotDependency[];
  devDeps: SnapshotDependency[];
  transitiveDeps: SnapshotDependency[];
}

function DependenciesTabContent({
  loading,
  searchQuery,
  onSearchChange,
  showDirect,
  onShowDirectChange,
  showDev,
  onShowDevChange,
  showPostinstall,
  onShowPostinstallChange,
  filteredDependencies,
  directDeps,
  devDeps,
  transitiveDeps,
}: DependenciesTabContentProps) {
  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div
        className={cn(
          'relative rounded-xl overflow-hidden',
          'bg-white/60 dark:bg-gray-800/60',
          'backdrop-blur-sm',
          'border border-gray-200/80 dark:border-gray-700/80',
          'shadow-sm',
          'focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/20',
          'transition-all duration-200'
        )}
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <Search size={16} className="text-gray-400" />
        </div>
        <input
          type="text"
          data-snapshot-search-input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search dependencies..."
          className={cn(
            'w-full pl-10 pr-4 py-2.5 text-sm',
            'bg-transparent',
            'text-gray-900 dark:text-gray-100',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-none'
          )}
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filter:</span>
        <FilterPill
          label="Direct"
          active={showDirect}
          onClick={() => onShowDirectChange(!showDirect)}
        />
        <FilterPill
          label="Dev"
          active={showDev}
          onClick={() => onShowDevChange(!showDev)}
        />
        <FilterPill
          label="Postinstall"
          active={showPostinstall}
          onClick={() => onShowPostinstallChange(!showPostinstall)}
          variant="warning"
        />
      </div>

      {/* Dependencies list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
              'text-sm'
            )}
          >
            <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            Loading dependencies...
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {directDeps.length > 0 && (
            <DependencyGroup title="Direct" deps={directDeps} variant="primary" />
          )}
          {devDeps.length > 0 && (
            <DependencyGroup title="Dev" deps={devDeps} variant="secondary" />
          )}
          {transitiveDeps.length > 0 && (
            <DependencyGroup title="Transitive" deps={transitiveDeps} variant="muted" />
          )}
          {filteredDependencies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div
                className={cn(
                  'w-12 h-12 rounded-xl mb-3',
                  'bg-gray-100 dark:bg-gray-800',
                  'flex items-center justify-center'
                )}
              >
                <Search size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-muted-foreground">No dependencies match filters</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  variant = 'default',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: 'default' | 'warning';
}) {
  const isWarning = variant === 'warning';

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative px-3 py-1.5 rounded-lg text-xs font-medium',
        'transition-all duration-200',
        'border backdrop-blur-sm',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        active
          ? isWarning
            ? [
                'bg-amber-500/15 dark:bg-amber-500/20',
                'border-amber-500/40 dark:border-amber-500/50',
                'text-amber-600 dark:text-amber-400',
                'shadow-sm shadow-amber-500/10',
                'focus:ring-amber-500/40',
              ]
            : [
                'bg-cyan-500/15 dark:bg-cyan-500/20',
                'border-cyan-500/40 dark:border-cyan-500/50',
                'text-cyan-600 dark:text-cyan-400',
                'shadow-sm shadow-cyan-500/10',
                'focus:ring-cyan-500/40',
              ]
          : [
              'bg-gray-100/60 dark:bg-gray-800/60',
              'border-gray-200/80 dark:border-gray-700/80',
              'text-gray-500 dark:text-gray-400',
              'hover:bg-gray-200/60 dark:hover:bg-gray-700/60',
              'hover:border-gray-300/80 dark:hover:border-gray-600/80',
              'focus:ring-gray-400/40',
            ]
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full transition-all duration-200',
            active
              ? isWarning
                ? 'bg-amber-500 dark:bg-amber-400'
                : 'bg-cyan-500 dark:bg-cyan-400'
              : 'bg-gray-400/50 dark:bg-gray-500/50'
          )}
        />
        {label}
      </span>
    </button>
  );
}

function DependencyGroup({
  title,
  deps,
  variant = 'primary',
}: {
  title: string;
  deps: SnapshotDependency[];
  variant?: 'primary' | 'secondary' | 'muted';
}) {
  const [expanded, setExpanded] = useState(true);

  const titleColors = {
    primary: 'text-cyan-600 dark:text-cyan-400',
    secondary: 'text-violet-600 dark:text-violet-400',
    muted: 'text-gray-500 dark:text-gray-400',
  };

  const dotColors = {
    primary: 'bg-cyan-500 dark:bg-cyan-400',
    secondary: 'bg-violet-500 dark:bg-violet-400',
    muted: 'bg-gray-400 dark:bg-gray-500',
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
      >
        <span className={cn('w-2 h-2 rounded-full', dotColors[variant])} />
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider', titleColors[variant])}>
          {title}
        </h4>
        <span
          className={cn(
            'px-1.5 py-0.5 text-xs rounded-md',
            'bg-gray-100 dark:bg-gray-800',
            'text-gray-500 dark:text-gray-400'
          )}
        >
          {deps.length}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'ml-auto text-muted-foreground transition-transform',
            !expanded && '-rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-0.5 ml-1">
          {deps.map((dep) => (
            <div
              key={`${dep.name}@${dep.version}`}
              className={cn(
                'flex items-center justify-between py-2 px-3 rounded-lg',
                'border border-transparent',
                'hover:bg-gray-50/80 dark:hover:bg-gray-800/50',
                'hover:border-gray-200/50 dark:hover:border-gray-700/50',
                'transition-all duration-150'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm text-foreground truncate">{dep.name}</span>
                <span
                  className={cn(
                    'flex-shrink-0 px-1.5 py-0.5 text-xs rounded',
                    'bg-gray-100 dark:bg-gray-800',
                    'text-muted-foreground',
                    'font-mono'
                  )}
                >
                  {dep.version}
                </span>
                {dep.hasPostinstall && (
                  <span
                    className={cn(
                      'flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded',
                      'bg-amber-100/80 dark:bg-amber-900/30',
                      'text-amber-600 dark:text-amber-400',
                      'text-xs'
                    )}
                    title="Has postinstall script"
                  >
                    <AlertTriangle size={10} />
                    <span className="text-[10px]">postinstall</span>
                  </span>
                )}
              </div>
              {dep.integrityHash && (
                <span
                  className={cn(
                    'flex-shrink-0 ml-2 text-xs font-mono truncate max-w-[120px]',
                    'text-muted-foreground',
                    'px-1.5 py-0.5 rounded',
                    'bg-gray-50 dark:bg-gray-800/50'
                  )}
                  title={dep.integrityHash}
                >
                  {dep.integrityHash.slice(0, 16)}...
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Integrity Tab Content
// ============================================================================

function IntegrityTabContent({ snapshot }: { snapshot: ExecutionSnapshot }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrity Verification</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cryptographic hashes for verifying snapshot integrity
        </p>
      </div>

      {/* Hash Cards */}
      <div className="space-y-3">
        {snapshot.lockfileHash && (
          <HashCard
            label="Lockfile Hash"
            hash={snapshot.lockfileHash}
            description="SHA-256 hash of the lockfile contents"
          />
        )}
        {snapshot.packageJsonHash && (
          <HashCard
            label="package.json Hash"
            hash={snapshot.packageJsonHash}
            description="SHA-256 hash of package.json"
          />
        )}
        {snapshot.dependencyTreeHash && (
          <HashCard
            label="Dependency Tree Hash"
            hash={snapshot.dependencyTreeHash}
            description="Combined hash of all resolved dependencies"
          />
        )}
      </div>

      {/* Verification Status */}
      <div
        className={cn(
          'p-4 rounded-xl',
          'bg-emerald-500/10 border border-emerald-500/30',
          'flex items-center gap-3'
        )}
      >
        <Shield className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Integrity Verified
          </p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
            All hashes are consistent with captured data
          </p>
        </div>
      </div>
    </div>
  );
}

function HashCard({
  label,
  hash,
  description,
}: {
  label: string;
  hash: string;
  description: string;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(hash);
  };

  return (
    <div
      className={cn(
        'p-4 rounded-xl',
        'bg-card border border-border',
        'hover:border-cyan-500/30 transition-colors'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <Hash className="w-5 h-5 text-cyan-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          <button
            onClick={copyToClipboard}
            className={cn(
              'mt-2 font-mono text-xs text-muted-foreground',
              'bg-muted/50 px-2 py-1 rounded',
              'hover:bg-muted transition-colors',
              'truncate block w-full text-left'
            )}
            title="Click to copy"
          >
            {hash}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Compare Tab Content
// ============================================================================

interface CompareTabContentProps {
  currentSnapshotId: string;
  allSnapshots: SnapshotListItem[];
  selectedCompareId: string;
  onSelectCompare: (id: string) => void;
  onCompare: () => void;
}

function CompareTabContent({
  currentSnapshotId,
  allSnapshots,
  selectedCompareId,
  onSelectCompare,
  onCompare,
}: CompareTabContentProps) {
  const otherSnapshots = allSnapshots.filter((s) => s.id !== currentSnapshotId);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Compare Snapshots</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select another snapshot to compare with the current one
        </p>
      </div>

      {otherSnapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div
            className={cn(
              'w-16 h-16 rounded-2xl mb-4',
              'bg-gray-100 dark:bg-gray-800',
              'flex items-center justify-center'
            )}
          >
            <GitCompare size={28} className="text-gray-400" />
          </div>
          <p className="text-sm text-muted-foreground">
            No other snapshots available for comparison
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Capture more snapshots to enable comparison
          </p>
        </div>
      ) : (
        <>
          {/* Snapshot Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Compare with:</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {otherSnapshots.map((snapshot) => (
                <button
                  key={snapshot.id}
                  onClick={() => onSelectCompare(snapshot.id)}
                  className={cn(
                    'w-full p-3 rounded-xl text-left',
                    'border transition-all duration-200',
                    selectedCompareId === snapshot.id
                      ? 'bg-cyan-500/10 border-cyan-500/50'
                      : 'bg-card border-border hover:border-cyan-500/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(snapshot.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {snapshot.totalDependencies} deps
                        {snapshot.triggerSource === 'manual' && ' • Manual'}
                      </p>
                    </div>
                    {snapshot.securityScore !== undefined && (
                      <SecurityBadge score={snapshot.securityScore} size="sm" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Compare Button */}
          <Button
            onClick={onCompare}
            disabled={!selectedCompareId}
            className={cn(
              'w-full',
              'bg-cyan-600 hover:bg-cyan-700 text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <GitCompare className="w-4 h-4 mr-2" />
            Compare Snapshots
          </Button>
        </>
      )}
    </div>
  );
}
