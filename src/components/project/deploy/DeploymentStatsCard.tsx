// DeploymentStatsCard Component
// Deploy UI Enhancement (018-deploy-ui-enhancement)
// Displays deployment statistics and quick access to last successful deployment

import { useState, useEffect } from 'react';
import {
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { deployAPI, openUrl } from '../../../lib/tauri-api';
import { Button } from '../../ui/Button';
import type { DeploymentStats, PlatformType } from '../../../types/deploy';

interface DeploymentStatsCardProps {
  projectId: string;
  /** Callback when stats are loaded */
  onStatsLoaded?: (stats: DeploymentStats) => void;
  /** Change this value to trigger a refresh */
  refreshTrigger?: number;
}

// Format seconds into human readable string
const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

// Format percentage
const formatPercent = (value: number): string => {
  return `${Math.round(value)}%`;
};

// Format relative time
const formatRelativeTime = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Get platform display name
const getPlatformName = (platform: PlatformType): string => {
  switch (platform) {
    case 'github_pages': return 'GitHub Pages';
    case 'netlify': return 'Netlify';
    case 'cloudflare_pages': return 'Cloudflare Pages';
    default: return platform;
  }
};

export function DeploymentStatsCard({ projectId, onStatsLoaded, refreshTrigger }: DeploymentStatsCardProps) {
  const [stats, setStats] = useState<DeploymentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadStats();
  }, [projectId, refreshTrigger]);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await deployAPI.getDeploymentStats(projectId);
      setStats(result);
      onStatsLoaded?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = async () => {
    if (stats?.lastSuccessfulDeployment?.url) {
      await navigator.clipboard.writeText(stats.lastSuccessfulDeployment.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 rounded bg-muted" />
            <div className="h-16 rounded bg-muted" />
            <div className="h-16 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Failed to load deployment stats
      </div>
    );
  }

  if (!stats || stats.totalDeployments === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No deployment history yet
        </p>
        <p className="text-xs text-muted-foreground">
          Stats will appear after your first deployment
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4" />
          Deployment Overview
        </h3>
        {stats.recentDeploymentsCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            {stats.recentDeploymentsCount} this week
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total Deployments */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-2xl font-bold">{stats.totalDeployments}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            Total Deploys
          </div>
        </div>

        {/* Success Rate */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className={`text-2xl font-bold ${
            stats.successRate >= 80 ? 'text-green-500' :
            stats.successRate >= 50 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {formatPercent(stats.successRate)}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Success Rate
          </div>
        </div>

        {/* Average Time */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-2xl font-bold">
            {formatDuration(stats.averageDeployTime)}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Avg. Time
          </div>
        </div>
      </div>

      {/* Success/Failure Counts */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          <span>{stats.successfulDeployments} successful</span>
        </div>
        {stats.failedDeployments > 0 && (
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-500">
            <XCircle className="h-4 w-4" />
            <span>{stats.failedDeployments} failed</span>
          </div>
        )}
      </div>

      {/* Deploy Time Range */}
      {(stats.fastestDeployTime != null || stats.slowestDeployTime != null) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Deploy time range: {formatDuration(stats.fastestDeployTime)} - {formatDuration(stats.slowestDeployTime)}
          </span>
        </div>
      )}

      {/* Last Successful Deployment */}
      {stats.lastSuccessfulDeployment && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Last Successful Deploy
            </div>
            <span className="text-xs text-green-600 dark:text-green-500">
              {formatRelativeTime(stats.lastSuccessfulDeployment.deployedAt)}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => openUrl(stats.lastSuccessfulDeployment!.url)}
              className="flex-1 truncate text-sm text-green-700 hover:underline dark:text-green-400 text-left"
            >
              {stats.lastSuccessfulDeployment.url}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyUrl}
                className="h-auto w-auto rounded p-1 hover:bg-green-100 dark:hover:bg-green-900"
                title="Copy URL"
              >
                <Copy className={`h-4 w-4 ${copied ? 'text-green-500' : 'text-green-600 dark:text-green-500'}`} />
              </Button>
              <button
                onClick={() => openUrl(stats.lastSuccessfulDeployment!.url)}
                className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4 text-green-600 dark:text-green-500" />
              </button>
            </div>
          </div>

          {stats.lastSuccessfulDeployment.commitHash && (
            <div className="mt-1 text-xs text-green-600 dark:text-green-500">
              Commit: {stats.lastSuccessfulDeployment.commitHash.substring(0, 7)}
              {' | '}
              {getPlatformName(stats.lastSuccessfulDeployment.platform)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
