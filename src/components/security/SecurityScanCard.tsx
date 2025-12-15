/**
 * Security Scan Card Component
 * Displays project security status in an overview card format
 * @see specs/005-package-security-audit/spec.md
 */

import { Shield, ShieldCheck, ShieldAlert, Clock, RefreshCw, AlertCircle, Folder } from 'lucide-react';
import type { VulnScanResult, VulnSummary } from '../../types/security';
import { SeveritySummaryBar, RiskLevelIndicator } from './SeverityBadge';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/utils';
import { Button } from '../ui/Button';

interface SecurityScanCardProps {
  /** Project name */
  projectName: string;
  /** Project path */
  projectPath: string;
  /** Latest scan result (null if never scanned) */
  scanResult: VulnScanResult | null;
  /** Whether a scan is currently in progress */
  isScanning?: boolean;
  /** Callback to trigger a new scan */
  onScan?: () => void;
  /** Callback when clicking to view details */
  onViewDetails?: () => void;
  /** Compact display mode */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format relative time from ISO timestamp
 */
function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

/**
 * Determine overall security status
 */
function getSecurityStatus(summary: VulnSummary | undefined): {
  level: 'secure' | 'warning' | 'danger';
  icon: typeof ShieldCheck;
  label: string;
  colorClass: string;
} {
  if (!summary) {
    return {
      level: 'warning',
      icon: Shield,
      label: 'Not Scanned',
      colorClass: 'text-muted-foreground',
    };
  }

  if (summary.critical > 0) {
    return {
      level: 'danger',
      icon: ShieldAlert,
      label: 'Critical Issues',
      colorClass: 'text-red-400',
    };
  }

  if (summary.high > 0) {
    return {
      level: 'warning',
      icon: ShieldAlert,
      label: 'High Risk',
      colorClass: 'text-orange-400',
    };
  }

  if (summary.total > 0) {
    return {
      level: 'warning',
      icon: Shield,
      label: 'Issues Found',
      colorClass: 'text-yellow-400',
    };
  }

  return {
    level: 'secure',
    icon: ShieldCheck,
    label: 'Secure',
    colorClass: 'text-green-400',
  };
}

/**
 * Security status card for project overview
 */
export function SecurityScanCard({
  projectName,
  projectPath,
  scanResult,
  isScanning = false,
  onScan,
  onViewDetails,
  compact = false,
  className,
}: SecurityScanCardProps) {
  const status = getSecurityStatus(scanResult?.summary);
  const StatusIcon = status.icon;

  // Compact mode
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3',
          'bg-card rounded-lg border border-border',
          'hover:bg-accent transition-colors cursor-pointer',
          className
        )}
        onClick={onViewDetails}
        role="button"
        tabIndex={0}
        aria-label={`Security status for ${projectName}: ${status.label}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewDetails?.();
          }
        }}
      >
        <StatusIcon className={cn('w-5 h-5 shrink-0', status.colorClass)} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate">{projectName}</h4>
          {scanResult?.summary && scanResult.summary.total > 0 ? (
            <SeveritySummaryBar
              {...scanResult.summary}
              hideZero
              compact
              className="mt-1"
            />
          ) : (
            <p className={cn('text-xs', status.colorClass)}>{status.label}</p>
          )}
        </div>
        {isScanning && (
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  }

  // Full card mode
  return (
    <div
      className={cn(
        'p-4 bg-card rounded-lg border border-border',
        'hover:border-accent transition-colors',
        className
      )}
      role="article"
      aria-labelledby={`security-card-${projectName}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'p-2 rounded-lg shrink-0',
              status.level === 'secure' && 'bg-green-500/20',
              status.level === 'warning' && 'bg-yellow-500/20',
              status.level === 'danger' && 'bg-red-500/20'
            )}
          >
            <StatusIcon className={cn('w-5 h-5', status.colorClass)} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3
              id={`security-card-${projectName}`}
              className="text-base font-medium text-foreground truncate"
            >
              {projectName}
            </h3>
            <p className="text-xs text-muted-foreground truncate" title={projectPath}>
              {projectPath}
            </p>
          </div>
        </div>

        {/* Scan Button */}
        {onScan && (
          <Button
            onClick={onScan}
            disabled={isScanning}
            size="sm"
            aria-label={isScanning ? 'Scanning in progress' : 'Run security scan'}
          >
            <RefreshCw className={cn('w-4 h-4', isScanning && 'animate-spin')} aria-hidden="true" />
            <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
          </Button>
        )}
      </div>

      {/* Status Content */}
      {scanResult ? (
        <>
          {/* Summary */}
          {scanResult.summary.total > 0 ? (
            <div className="space-y-3">
              <RiskLevelIndicator
                critical={scanResult.summary.critical}
                high={scanResult.summary.high}
              />
              <SeveritySummaryBar
                {...scanResult.summary}
                hideZero
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-green-400" aria-hidden="true" />
              <span className="text-sm text-green-400">No vulnerabilities found</span>
            </div>
          )}

          {/* Scan Info */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Last scanned {formatRelativeTime(scanResult.scannedAt)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {scanResult.packageManager}
            </span>
          </div>

          {/* Error State */}
          {scanResult.status === 'failed' && scanResult.error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm text-red-400">{scanResult.error.message}</p>
                  {scanResult.error.suggestion && (
                    <p className="text-xs text-muted-foreground mt-1">{scanResult.error.suggestion}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View Details Link */}
          {onViewDetails && scanResult.summary.total > 0 && (
            <button
              onClick={onViewDetails}
              className="mt-3 w-full py-2 text-sm text-blue-400 hover:text-blue-300 text-center"
            >
              View {scanResult.summary.total} vulnerabilities
            </button>
          )}
        </>
      ) : (
        /* Not Scanned State */
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground mb-1">Not yet scanned</p>
          <p className="text-xs text-muted-foreground">Run a scan to check for vulnerabilities</p>
        </div>
      )}
    </div>
  );
}

/**
 * Grid of security scan cards for overview
 */
interface SecurityScanGridProps {
  projects: Array<{
    projectName: string;
    projectPath: string;
    scanResult: VulnScanResult | null;
    isScanning?: boolean;
  }>;
  onScan?: (projectPath: string) => void;
  onViewDetails?: (projectPath: string) => void;
  className?: string;
}

export function SecurityScanGrid({
  projects,
  onScan,
  onViewDetails,
  className,
}: SecurityScanGridProps) {
  if (projects.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <Folder className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Projects</h3>
        <p className="text-sm text-muted-foreground">Add projects to monitor their security status</p>
      </div>
    );
  }

  return (
    <div
      className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}
      role="list"
      aria-label="Project security status"
    >
      {projects.map((project) => (
        <SecurityScanCard
          key={project.projectPath}
          projectName={project.projectName}
          projectPath={project.projectPath}
          scanResult={project.scanResult}
          isScanning={project.isScanning}
          onScan={onScan ? () => onScan(project.projectPath) : undefined}
          onViewDetails={onViewDetails ? () => onViewDetails(project.projectPath) : undefined}
        />
      ))}
    </div>
  );
}

/**
 * Compact security status bar for project header
 */
interface SecurityStatusBarProps {
  scanResult: VulnScanResult | null;
  isScanning?: boolean;
  onScan?: () => void;
  className?: string;
}

export function SecurityStatusBar({
  scanResult,
  isScanning = false,
  onScan,
  className,
}: SecurityStatusBarProps) {
  const status = getSecurityStatus(scanResult?.summary);
  const StatusIcon = status.icon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusIcon className={cn('w-4 h-4', status.colorClass)} aria-hidden="true" />
      {scanResult?.summary && scanResult.summary.total > 0 ? (
        <SeveritySummaryBar
          {...scanResult.summary}
          hideZero
          compact
        />
      ) : (
        <span className={cn('text-xs', status.colorClass)}>{status.label}</span>
      )}
      {onScan && (
        <button
          onClick={onScan}
          disabled={isScanning}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          title={isScanning ? 'Scanning...' : 'Run security scan'}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
