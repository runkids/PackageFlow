/**
 * DeploymentHistory Component
 * Displays deployment history with filtering, sorting, and date grouping
 *
 * Features:
 * - Status-based styling with variant config
 * - Date grouping (Today, Yesterday, older dates)
 * - Compact filter buttons
 * - Platform icons and badges
 * - Error message display
 * - Accessibility support
 *
 * One-Click Deploy feature (015-one-click-deploy)
 * Enhanced: Deploy UI Enhancement (018-deploy-ui-enhancement)
 * Redesigned: Improved visual hierarchy and UX patterns
 */

import { useState, useMemo } from 'react';
import {
  Clock,
  Check,
  X,
  Loader2,
  ExternalLink,
  GitCommit,
  AlertCircle,
  RefreshCw,
  Trash2,
  Settings,
  GitBranch,
  Globe,
  Timer,
  Filter,
  ArrowUpDown,
  Rocket,
  RotateCcw,
  Play,
  Ban,
} from 'lucide-react';
import type { Deployment, DeploymentStatus, PlatformType } from '../../../types/deploy';
import { deployAPI } from '../../../lib/tauri-api';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { NetlifyIcon } from '../../ui/icons/NetlifyIcon';
import { CloudflareIcon } from '../../ui/icons/CloudflareIcon';
import { GithubIcon } from '../../ui/icons/GithubIcon';
import { cn } from '../../../lib/utils';

// ============================================================================
// Types
// ============================================================================

type FilterStatus = DeploymentStatus | 'all';
type FilterPlatform = PlatformType | 'all';
type SortBy = 'date' | 'status' | 'deployTime';
type SortOrder = 'asc' | 'desc';

interface DeploymentHistoryProps {
  deployments: Deployment[];
  projectId: string;
  isLoading: boolean;
  onRefresh: () => void;
}

// ============================================================================
// Status Variant Config (follows ExecutionHistoryPanel pattern)
// ============================================================================

const statusVariantConfig = {
  queued: {
    icon: Clock,
    gradient: 'from-amber-500/20 to-transparent',
    iconColor: 'text-amber-500 dark:text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/5',
    badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    label: 'Queued',
  },
  building: {
    icon: Loader2,
    gradient: 'from-blue-500/20 to-transparent',
    iconColor: 'text-blue-500 dark:text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/5',
    badgeClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
    label: 'Building',
    animate: true,
  },
  deploying: {
    icon: Rocket,
    gradient: 'from-indigo-500/20 to-transparent',
    iconColor: 'text-indigo-500 dark:text-indigo-400',
    borderColor: 'border-indigo-500/30',
    bgColor: 'bg-indigo-500/5',
    badgeClass: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    label: 'Deploying',
    animate: true,
  },
  ready: {
    icon: Check,
    gradient: 'from-green-500/20 to-transparent',
    iconColor: 'text-green-500 dark:text-green-400',
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/5',
    badgeClass: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
    label: 'Ready',
  },
  failed: {
    icon: X,
    gradient: 'from-red-500/20 to-transparent',
    iconColor: 'text-red-500 dark:text-red-400',
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/5',
    badgeClass: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
    label: 'Failed',
  },
  cancelled: {
    icon: Ban,
    gradient: 'from-muted/30 to-transparent',
    iconColor: 'text-muted-foreground',
    borderColor: 'border-muted',
    bgColor: 'bg-muted/30',
    badgeClass: 'bg-muted text-muted-foreground border-muted',
    label: 'Cancelled',
  },
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/** Get platform icon component */
const getPlatformIcon = (platform: PlatformType, className = 'h-4 w-4') => {
  switch (platform) {
    case 'netlify':
      return <NetlifyIcon className={className} />;
    case 'cloudflare_pages':
      return <CloudflareIcon className={className} />;
    case 'github_pages':
      return <GithubIcon className={className} />;
  }
};

/** Get platform display name */
const getPlatformName = (platform: PlatformType): string => {
  switch (platform) {
    case 'netlify':
      return 'Netlify';
    case 'cloudflare_pages':
      return 'Cloudflare';
    case 'github_pages':
      return 'GitHub';
  }
};

/** Format duration from seconds */
const formatDeployTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

/** Format duration from start/end dates */
const formatDuration = (start: string, end?: string): string => {
  if (!end) return 'In progress';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const durationMs = endDate.getTime() - startDate.getTime();
  const seconds = Math.floor(durationMs / 1000);
  return formatDeployTime(seconds);
};

/** Get display duration - prefer deployTime if available */
const getDisplayDuration = (deployment: Deployment): string => {
  if (deployment.deployTime) {
    return formatDeployTime(deployment.deployTime);
  }
  return formatDuration(deployment.createdAt, deployment.completedAt);
};

/** Format date for display with relative labels */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return `Today ${timeStr}`;
  if (isYesterday) return `Yesterday ${timeStr}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Get date group key for grouping deployments */
function getDateGroupKey(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Group deployments by date */
function groupByDate(deployments: Deployment[]): Map<string, Deployment[]> {
  const groups = new Map<string, Deployment[]>();

  deployments.forEach((deployment) => {
    const key = getDateGroupKey(deployment.createdAt);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(deployment);
  });

  return groups;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Status icon with optional animation */
function StatusIcon({ status, className }: { status: DeploymentStatus; className?: string }) {
  const config = statusVariantConfig[status];
  const IconComponent = config.icon;
  const shouldAnimate = 'animate' in config && config.animate;
  return (
    <IconComponent
      className={cn(
        'w-4 h-4',
        config.iconColor,
        shouldAnimate && 'animate-spin',
        className
      )}
    />
  );
}

/** Platform badge */
function PlatformBadge({ platform }: { platform: PlatformType }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg',
        'bg-muted/50 border border-border/50'
      )}
      title={getPlatformName(platform)}
    >
      {getPlatformIcon(platform, 'h-4 w-4')}
    </div>
  );
}

/** Environment badge */
function EnvironmentBadge({ isLatest }: { isLatest?: boolean }) {
  if (!isLatest) return null;
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30">
      Latest
    </span>
  );
}

/** Labeled filter select using the shared Select component */
function LabeledSelect({
  label,
  value,
  options,
  onChange,
  width = 'w-[85px]',
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}:</span>
      {/* Wrapper with min-width for dropdown panel */}
      <div className={cn(width, '[&_[role=listbox]]:min-w-[140px]')}>
        <Select
          value={value}
          onValueChange={onChange}
          options={options}
          size="sm"
        />
      </div>
    </div>
  );
}

/** Single deployment history item */
function DeploymentItem({
  deployment,
  isLatest,
  onDelete,
  isDeletingThis,
}: {
  deployment: Deployment;
  isLatest: boolean;
  onDelete: () => void;
  isDeletingThis: boolean;
}) {
  const config = statusVariantConfig[deployment.status];

  return (
    <div
      className={cn(
        'relative p-4 rounded-lg border transition-all group',
        config.borderColor,
        config.bgColor,
        'hover:shadow-sm'
      )}
    >
      {/* Main row */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: Platform icon + Status info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <PlatformBadge platform={deployment.platform} />

          <div className="min-w-0 flex-1">
            {/* Status row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <StatusIcon status={deployment.status} />
                <span className="font-medium text-sm">{config.label}</span>
              </div>
              {isLatest && deployment.status === 'ready' && <EnvironmentBadge isLatest />}
              {deployment.status === 'ready' && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                  production
                </span>
              )}
            </div>

            {/* Metadata row */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatDate(deployment.createdAt)}</span>
              {deployment.siteName && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{deployment.siteName}</span>
                </span>
              )}
              {deployment.branch && (
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate max-w-[80px]">{deployment.branch}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Duration */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-auto" title="Build time">
          <Timer className="h-3 w-3" />
          <span className="font-mono">{getDisplayDuration(deployment)}</span>
        </div>

        {/* Action buttons - absolute positioned */}
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-transparent via-transparent to-transparent">
          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded',
                'bg-background/80 backdrop-blur-sm border border-border/50',
                'hover:bg-accent transition-colors'
              )}
              title="Open deployed site"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
            </a>
          )}
          {deployment.adminUrl && (
            <a
              href={deployment.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded',
                'bg-background/80 backdrop-blur-sm border border-border/50',
                'hover:bg-accent transition-colors'
              )}
              title="Open Dashboard"
            >
              <Settings className="h-3.5 w-3.5" />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={isDeletingThis}
            className="h-7 w-7 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-destructive/10 hover:text-destructive"
            title="Delete this record"
          >
            {isDeletingThis ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Commit info */}
      {(deployment.commitHash || deployment.commitMessage) && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <GitCommit className="h-3 w-3 shrink-0" />
          {deployment.commitHash && (
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
              {deployment.commitHash.substring(0, 7)}
            </code>
          )}
          {deployment.commitMessage && (
            <span className="truncate">{deployment.commitMessage}</span>
          )}
        </div>
      )}

      {/* Preview URL */}
      {deployment.previewUrl && deployment.previewUrl !== deployment.url && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Preview:</span>
          <a
            href={deployment.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-primary hover:underline"
          >
            {deployment.previewUrl}
          </a>
        </div>
      )}

      {/* Error message */}
      {deployment.errorMessage && (
        <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{deployment.errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Date group separator */
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 py-2 bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

/** Empty state component */
function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Filter className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No matching deployments</p>
        <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
        <Button variant="link" size="sm" onClick={onClearFilters} className="mt-3 h-auto p-0 text-xs">
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Play className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">No deployments yet</p>
      <p className="text-xs text-muted-foreground mt-1">Your deployments will appear here</p>
    </div>
  );
}

/** Loading state component */
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-3" />
      <span className="text-sm">Loading deployments...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DeploymentHistory({
  deployments,
  projectId,
  isLoading,
  onRefresh,
}: DeploymentHistoryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filter and sort state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Get unique platforms from deployments
  const availablePlatforms = useMemo(() => {
    const platforms = new Set(deployments.map((d) => d.platform));
    return Array.from(platforms);
  }, [deployments]);

  // Filter and sort deployments
  const filteredDeployments = useMemo(() => {
    let result = [...deployments];

    // Apply status filter
    if (filterStatus !== 'all') {
      result = result.filter((d) => d.status === filterStatus);
    }

    // Apply platform filter
    if (filterPlatform !== 'all') {
      result = result.filter((d) => d.platform === filterPlatform);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'status':
          const statusOrder = { ready: 0, building: 1, deploying: 2, queued: 3, failed: 4, cancelled: 5 };
          comparison = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
          break;
        case 'deployTime':
          comparison = (a.deployTime || 0) - (b.deployTime || 0);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [deployments, filterStatus, filterPlatform, sortBy, sortOrder]);

  // Group filtered deployments by date
  const groupedDeployments = useMemo(() => {
    if (sortBy !== 'date') {
      // If not sorting by date, return single group
      return new Map([['All', filteredDeployments]]);
    }
    return groupByDate(filteredDeployments);
  }, [filteredDeployments, sortBy]);

  // Check if any filters are active
  const hasActiveFilters = filterStatus !== 'all' || filterPlatform !== 'all';

  const handleDeleteItem = async (deploymentId: string) => {
    setDeletingId(deploymentId);
    try {
      await deployAPI.deleteDeploymentHistoryItem(projectId, deploymentId);
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClearAll = async () => {
    setClearing(true);
    try {
      await deployAPI.clearDeploymentHistory(projectId);
      onRefresh();
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterPlatform('all');
  };

  // Find the latest ready deployment
  const latestReadyId = useMemo(() => {
    const sorted = [...deployments]
      .filter((d) => d.status === 'ready')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted[0]?.id;
  }, [deployments]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 space-y-3 pb-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>Deployment History</span>
            {deployments.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {filteredDeployments.length}
                {hasActiveFilters && ` / ${deployments.length}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {deployments.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                disabled={clearing}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                title="Clear all history"
              >
                {clearing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                <span>Clear</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 gap-1.5 px-2 text-xs"
              title="Refresh history"
            >
              <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Filters - Compact inline row */}
        {deployments.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            {/* Filter icon */}
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

            {/* Status Filter */}
            <LabeledSelect
              label="Status"
              value={filterStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'ready', label: 'Ready' },
                { value: 'failed', label: 'Failed' },
                { value: 'building', label: 'Building' },
                { value: 'deploying', label: 'Deploying' },
                { value: 'queued', label: 'Queued' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              onChange={(v) => setFilterStatus(v as FilterStatus)}
              width="w-[95px]"
            />

            {/* Platform Filter (only show if multiple platforms) */}
            {availablePlatforms.length > 1 && (
              <LabeledSelect
                label="Platform"
                value={filterPlatform}
                options={[
                  { value: 'all', label: 'All' },
                  ...availablePlatforms.map((p) => ({ value: p, label: getPlatformName(p) })),
                ]}
                onChange={(v) => setFilterPlatform(v as FilterPlatform)}
                width="w-[95px]"
              />
            )}

            {/* Divider */}
            <div className="h-4 w-px bg-border" />

            {/* Sort */}
            <LabeledSelect
              label="Sort"
              value={sortBy}
              options={[
                { value: 'date', label: 'Date' },
                { value: 'status', label: 'Status' },
                { value: 'deployTime', label: 'Time' },
              ]}
              onChange={(v) => setSortBy(v as SortBy)}
              width="w-[75px]"
            />

            {/* Sort Order Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded border',
                'border-border bg-background hover:bg-accent transition-colors'
              )}
              title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
            >
              <ArrowUpDown className={cn('h-3 w-3', sortOrder === 'asc' && 'rotate-180')} />
            </button>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Reset filters"
                title="Reset filters"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && deployments.length === 0 ? (
          <LoadingState />
        ) : deployments.length === 0 ? (
          <EmptyState hasFilters={false} onClearFilters={clearFilters} />
        ) : filteredDeployments.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearFilters} />
        ) : (
          <div className="space-y-4 pr-1" role="list" aria-label="Deployment history">
            {Array.from(groupedDeployments.entries()).map(([dateLabel, items]) => (
              <div key={dateLabel} role="group" aria-label={`Deployments from ${dateLabel}`}>
                {/* Date separator (only for date sorting) */}
                {sortBy === 'date' && <DateSeparator label={dateLabel} />}

                {/* Deployment items */}
                <div className="space-y-2">
                  {items.map((deployment) => (
                    <DeploymentItem
                      key={deployment.id}
                      deployment={deployment}
                      isLatest={deployment.id === latestReadyId}
                      onDelete={() => handleDeleteItem(deployment.id)}
                      isDeletingThis={deletingId === deployment.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear All Confirmation Dialog */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear All History"
        description="Are you sure you want to clear all deployment history for this project? This action cannot be undone."
        confirmText="Yes, Clear History"
        variant="destructive"
        onConfirm={handleConfirmClearAll}
      />
    </div>
  );
}
