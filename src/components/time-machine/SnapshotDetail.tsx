// Snapshot Detail Component
// Displays detailed information about a snapshot

import { useState } from 'react';
import {
  Package,
  Clock,
  HardDrive,
  Hash,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react';
import type { ExecutionSnapshot, SnapshotDependency } from '../../types/snapshot';
import { SecurityBadge } from './SecurityBadge';
import { cn } from '../../lib/utils';

interface SnapshotDetailProps {
  snapshot: ExecutionSnapshot;
  dependencies?: SnapshotDependency[];
  loading?: boolean;
  className?: string;
}

export function SnapshotDetail({
  snapshot,
  dependencies = [],
  loading = false,
  className,
}: SnapshotDetailProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDirect, setShowDirect] = useState(true);
  const [showDev, setShowDev] = useState(true);
  const [showPostinstall, setShowPostinstall] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    dependencies: true,
    hashes: false,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredDependencies = dependencies.filter((dep) => {
    // Search filter
    if (searchQuery && !dep.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Type filters
    if (!showDirect && dep.isDirect) return false;
    if (!showDev && dep.isDev) return false;
    if (showPostinstall && !dep.hasPostinstall) return false;
    return true;
  });

  const directDeps = filteredDependencies.filter((d) => d.isDirect && !d.isDev);
  const devDeps = filteredDependencies.filter((d) => d.isDev);
  const transitiveDeps = filteredDependencies.filter((d) => !d.isDirect && !d.isDev);

  const SectionHeader = ({
    title,
    section,
    count,
  }: {
    title: string;
    section: string;
    count?: number;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center gap-2 w-full py-2 text-left font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {expandedSections[section] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span>{title}</span>
      {count !== undefined && (
        <span className="text-xs text-gray-400 dark:text-gray-500">({count})</span>
      )}
    </button>
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overview Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <SectionHeader title="Overview" section="overview" />
        {expandedSections.overview && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} className="text-gray-400" />
                <span className="text-gray-500">Created:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatDate(snapshot.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Package size={16} className="text-gray-400" />
                <span className="text-gray-500">Package Manager:</span>
                <span className="text-gray-900 dark:text-gray-100 uppercase">
                  {snapshot.lockfileType || 'Unknown'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HardDrive size={16} className="text-gray-400" />
                <span className="text-gray-500">Storage:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatSize(snapshot.compressedSize)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="text-sm">
                <span className="text-gray-500">Security Score:</span>
                <SecurityBadge score={snapshot.securityScore} size="md" className="ml-2 inline-flex" />
              </div>
              {snapshot.postinstallCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-amber-500">
                  <AlertTriangle size={14} />
                  <span>{snapshot.postinstallCount} postinstall scripts</span>
                </div>
              )}
            </div>

            <div className="flex gap-4 text-sm">
              <span>
                <strong className="text-gray-900 dark:text-gray-100">
                  {snapshot.totalDependencies}
                </strong>{' '}
                <span className="text-gray-500">total</span>
              </span>
              <span>
                <strong className="text-gray-900 dark:text-gray-100">
                  {snapshot.directDependencies}
                </strong>{' '}
                <span className="text-gray-500">direct</span>
              </span>
              <span>
                <strong className="text-gray-900 dark:text-gray-100">
                  {snapshot.devDependencies}
                </strong>{' '}
                <span className="text-gray-500">dev</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Dependencies Section */}
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          'border border-cyan-500/20',
          'bg-gradient-to-br from-white via-white to-cyan-50/30',
          'dark:from-gray-900 dark:via-gray-900 dark:to-cyan-950/20',
          'shadow-sm'
        )}
      >
        {/* Section Header */}
        <button
          onClick={() => toggleSection('dependencies')}
          className={cn(
            'flex items-center gap-3 w-full px-4 py-3 text-left',
            'bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent',
            'dark:from-cyan-500/15 dark:via-cyan-500/5 dark:to-transparent',
            'border-b border-cyan-500/10',
            'hover:from-cyan-500/15 hover:via-cyan-500/10 hover:to-transparent',
            'transition-all duration-200'
          )}
        >
          <div
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-lg',
              'bg-cyan-500/10 dark:bg-cyan-500/20',
              'border border-cyan-500/20'
            )}
          >
            <Package size={14} className="text-cyan-500 dark:text-cyan-400" />
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">Dependencies</span>
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
              'border border-cyan-500/20'
            )}
          >
            {dependencies.length}
          </span>
          <div className="flex-1" />
          <div
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center',
              'bg-gray-100 dark:bg-gray-800',
              'transition-transform duration-200',
              expandedSections.dependencies && 'rotate-180'
            )}
          >
            <ChevronDown size={14} className="text-gray-500" />
          </div>
        </button>

        {expandedSections.dependencies && (
          <div className="p-4 space-y-4">
            {/* Search bar with glass effect */}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Filter:</span>
              <FilterPill
                label="Direct"
                active={showDirect}
                onClick={() => setShowDirect(!showDirect)}
              />
              <FilterPill label="Dev" active={showDev} onClick={() => setShowDev(!showDev)} />
              <FilterPill
                label="Postinstall"
                active={showPostinstall}
                onClick={() => setShowPostinstall(!showPostinstall)}
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
              <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No dependencies match filters
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hashes Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <SectionHeader title="Integrity Hashes" section="hashes" />
        {expandedSections.hashes && (
          <div className="mt-3 space-y-2 text-sm">
            {snapshot.lockfileHash && (
              <HashRow label="Lockfile Hash" hash={snapshot.lockfileHash} />
            )}
            {snapshot.packageJsonHash && (
              <HashRow label="package.json Hash" hash={snapshot.packageJsonHash} />
            )}
            {snapshot.dependencyTreeHash && (
              <HashRow label="Dependency Tree Hash" hash={snapshot.dependencyTreeHash} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Filter Pill Component with glass morphism effect
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
        {/* Active indicator dot */}
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
      <div className="flex items-center gap-2">
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
      </div>
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
              <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
                {dep.name}
              </span>
              <span
                className={cn(
                  'flex-shrink-0 px-1.5 py-0.5 text-xs rounded',
                  'bg-gray-100 dark:bg-gray-800',
                  'text-gray-500 dark:text-gray-400',
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
                  'text-gray-400 dark:text-gray-500',
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
    </div>
  );
}

function HashRow({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-start gap-2">
      <Hash size={14} className="text-gray-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-gray-500">{label}:</span>
        <code className="block text-xs font-mono text-gray-700 dark:text-gray-300 truncate mt-0.5">
          {hash}
        </code>
      </div>
    </div>
  );
}
