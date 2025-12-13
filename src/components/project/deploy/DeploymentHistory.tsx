// DeploymentHistory Component
// One-Click Deploy feature (015-one-click-deploy)

import {
  Clock,
  Check,
  X,
  Loader2,
  ExternalLink,
  GitCommit,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { Deployment, DeploymentStatus } from '../../../types/deploy';

interface DeploymentHistoryProps {
  deployments: Deployment[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function DeploymentHistory({
  deployments,
  isLoading,
  onRefresh,
}: DeploymentHistoryProps) {
  const getStatusIcon = (status: DeploymentStatus) => {
    switch (status) {
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'building':
      case 'deploying':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'ready':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <X className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: DeploymentStatus) => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'building':
        return 'Building';
      case 'deploying':
        return 'Deploying';
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
    }
  };

  const formatDuration = (start: string, end?: string) => {
    if (!end) return 'In progress';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Deployment History</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading && deployments.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      ) : deployments.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          <p>No deployments yet</p>
          <p className="mt-1 text-xs">Your deployments will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deployments.map((deployment, index) => (
            <div
              key={deployment.id}
              className={`rounded-md border border-border p-3 transition-colors ${
                index === 0 ? 'bg-accent/30' : 'bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Status & Time */}
                <div className="flex items-center gap-2">
                  {getStatusIcon(deployment.status)}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{getStatusText(deployment.status)}</span>
                      {deployment.status === 'ready' && index === 0 && (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(deployment.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Duration & Link */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {formatDuration(deployment.createdAt, deployment.completedAt)}
                  </span>
                  {deployment.url && (
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Open</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Commit Info */}
              {(deployment.commitHash || deployment.commitMessage) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <GitCommit className="h-3 w-3" />
                  {deployment.commitHash && (
                    <code className="rounded bg-muted px-1">
                      {deployment.commitHash.substring(0, 7)}
                    </code>
                  )}
                  {deployment.commitMessage && (
                    <span className="truncate">{deployment.commitMessage}</span>
                  )}
                </div>
              )}

              {/* Error Message */}
              {deployment.errorMessage && (
                <div className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {deployment.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
