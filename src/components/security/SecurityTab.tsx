/**
 * Security Tab Component
 * Main component for displaying project security audit information
 * @see specs/005-package-security-audit/spec.md
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  Clock,
  Package,
  FileWarning,
  ExternalLink,
  ArrowRight,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { VulnScanResult, VulnSummary, ScanError } from '../../types/security';
import { VulnerabilityList } from './VulnerabilityList';
import { SeveritySummaryBar, RiskLevelIndicator } from './SeverityBadge';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/utils';

interface SecurityTabProps {
  /** Project ID (reserved for future use) */
  projectId?: string;
  /** Project name for display */
  projectName: string;
  /** Project path (reserved for future use) */
  projectPath?: string;
  /** Current scan result (null if never scanned) */
  scanResult: VulnScanResult | null;
  /** Whether a scan is currently in progress */
  isScanning: boolean;
  /** Scan error (separate from scanResult.error for immediate display) */
  error?: ScanError | null;
  /** Callback to trigger a new security scan */
  onScan: () => void;
  /** Callback when scan is cancelled */
  onCancelScan?: () => void;
  /** Callback to navigate to Scripts tab */
  onNavigateToScripts?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format scan time as relative or absolute
 */
function formatScanTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return formatDate(date);
}

/**
 * Error message display with suggestions
 * Distinguishes between resolvable errors (can be fixed via Scripts tab)
 * and non-resolvable errors (require manual intervention or retry)
 */
interface ScanErrorDisplayProps {
  error: ScanError;
  onRetry: () => void;
  onNavigateToScripts?: () => void;
  isRetrying?: boolean;
}

/**
 * Error configuration for different error types
 */
interface ErrorConfig {
  icon: typeof AlertCircle;
  title: string;
  isResolvable: boolean;
  primaryAction?: 'scripts' | 'retry';
}

function getErrorConfig(code: string): ErrorConfig {
  switch (code) {
    case 'NO_NODE_MODULES':
      return {
        icon: Package,
        title: 'Dependencies Not Installed',
        isResolvable: true,
        primaryAction: 'scripts',
      };
    case 'NO_LOCKFILE':
      return {
        icon: FileWarning,
        title: 'Lock File Missing',
        isResolvable: true,
        primaryAction: 'scripts',
      };
    case 'CLI_NOT_FOUND':
      return {
        icon: Terminal,
        title: 'Package Manager Not Found',
        isResolvable: false,
        primaryAction: 'retry',
      };
    case 'NETWORK_ERROR':
      return {
        icon: AlertCircle,
        title: 'Network Error',
        isResolvable: false,
        primaryAction: 'retry',
      };
    case 'PARSE_ERROR':
      return {
        icon: Wrench,
        title: 'Parse Error',
        isResolvable: false,
        primaryAction: 'retry',
      };
    case 'TIMEOUT':
      return {
        icon: Clock,
        title: 'Scan Timeout',
        isResolvable: false,
        primaryAction: 'retry',
      };
    default:
      return {
        icon: AlertCircle,
        title: 'Scan Failed',
        isResolvable: false,
        primaryAction: 'retry',
      };
  }
}

function ScanErrorDisplay({ error, onRetry, onNavigateToScripts, isRetrying }: ScanErrorDisplayProps) {
  const config = getErrorConfig(error.code);
  const ErrorIcon = config.icon;
  const isResolvable = config.isResolvable && onNavigateToScripts;

  // Theme colors based on whether error is resolvable
  const theme = isResolvable
    ? {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        iconColor: 'text-amber-400',
        titleColor: 'text-amber-400',
        primaryBtnClass: 'bg-amber-600 hover:bg-amber-500 text-white border-transparent',
        secondaryBtnClass: 'text-muted-foreground border-border hover:bg-accent',
      }
    : {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        iconColor: 'text-red-400',
        titleColor: 'text-red-400',
        primaryBtnClass: 'text-red-400 border-red-500/50 hover:bg-red-500/10',
        secondaryBtnClass: 'text-muted-foreground border-border hover:bg-accent',
      };

  return (
    <div className={cn('p-4 rounded-lg border', theme.bg, theme.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', isResolvable ? 'bg-amber-500/20' : 'bg-red-500/20')}>
          <ErrorIcon className={cn('w-5 h-5 shrink-0', theme.iconColor)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Title and Badge */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn('text-base font-medium', theme.titleColor)}>
              {config.title}
            </h4>
            {isResolvable && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-300">
                Fixable
              </span>
            )}
          </div>

          {/* Error Message */}
          <p className="text-sm text-foreground mb-2">{error.message}</p>

          {/* Error Details (if any) */}
          {error.details && (
            <p className="text-xs text-muted-foreground font-mono mb-2 break-all">{error.details}</p>
          )}

          {/* Suggestion Box - Different styling for resolvable errors */}
          {error.suggestion && (
            <div className={cn(
              'p-3 rounded text-sm mb-4',
              isResolvable
                ? 'bg-amber-500/5 border border-amber-500/20'
                : 'bg-secondary'
            )}>
              {isResolvable ? (
                <div className="flex items-start gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-foreground font-medium mb-1">Quick Fix</p>
                    <p className="text-muted-foreground">
                      Go to the <span className="text-amber-300 font-medium">Scripts</span> tab and run{' '}
                      <code className="px-1.5 py-0.5 bg-secondary rounded text-amber-300 text-xs">
                        install
                      </code>{' '}
                      to install dependencies, then retry the scan.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Suggestion:</strong> {error.suggestion}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isResolvable ? (
              <>
                {/* Primary: Go to Scripts */}
                <Button
                  size="sm"
                  onClick={onNavigateToScripts}
                  className={theme.primaryBtnClass}
                >
                  <Terminal className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Go to Scripts
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
                </Button>
                {/* Secondary: Retry */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className={theme.secondaryBtnClass}
                >
                  <RefreshCw className={cn('w-4 h-4 mr-1.5', isRetrying && 'animate-spin')} aria-hidden="true" />
                  {isRetrying ? 'Retrying...' : 'Retry Anyway'}
                </Button>
              </>
            ) : (
              /* Non-resolvable: Only show retry */
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={isRetrying}
                className={theme.primaryBtnClass}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1.5', isRetrying && 'animate-spin')} aria-hidden="true" />
                {isRetrying ? 'Retrying...' : 'Retry Scan'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Summary header showing overall security status
 */
interface SecuritySummaryHeaderProps {
  summary: VulnSummary;
  scannedAt: string;
  packageManager: string;
  onRescan: () => void;
  isScanning: boolean;
}

function SecuritySummaryHeader({
  summary,
  scannedAt,
  packageManager,
  onRescan,
  isScanning,
}: SecuritySummaryHeaderProps) {
  const hasVulnerabilities = summary.total > 0;
  const hasCritical = summary.critical > 0;

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <div className="flex items-start justify-between gap-4 mb-4">
        {/* Status Icon and Title */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'p-2.5 rounded-lg',
              !hasVulnerabilities && 'bg-green-500/20',
              hasVulnerabilities && !hasCritical && 'bg-yellow-500/20',
              hasCritical && 'bg-red-500/20'
            )}
          >
            {!hasVulnerabilities ? (
              <ShieldCheck className="w-6 h-6 text-green-400" aria-hidden="true" />
            ) : hasCritical ? (
              <ShieldAlert className="w-6 h-6 text-red-400" aria-hidden="true" />
            ) : (
              <Shield className="w-6 h-6 text-yellow-400" aria-hidden="true" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground">
              {!hasVulnerabilities
                ? 'No Vulnerabilities Found'
                : `${summary.total} Vulnerabilit${summary.total !== 1 ? 'ies' : 'y'} Found`}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Scanned {formatScanTime(scannedAt)} using {packageManager}
            </p>
          </div>
        </div>

        {/* Rescan Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRescan}
          disabled={isScanning}
          className="shrink-0"
        >
          <RefreshCw className={cn('w-4 h-4 mr-1.5', isScanning && 'animate-spin')} />
          {isScanning ? 'Scanning...' : 'Rescan'}
        </Button>
      </div>

      {/* Vulnerability Summary */}
      {hasVulnerabilities && (
        <div className="space-y-3">
          <RiskLevelIndicator critical={summary.critical} high={summary.high} />
          <SeveritySummaryBar
            critical={summary.critical}
            high={summary.high}
            moderate={summary.moderate}
            low={summary.low}
            info={summary.info}
            hideZero
          />
        </div>
      )}

    </div>
  );
}

/**
 * Initial state - project never scanned
 */
interface NotScannedStateProps {
  projectName: string;
  onScan: () => void;
  isScanning: boolean;
}

function NotScannedState({ projectName, onScan, isScanning }: NotScannedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 bg-secondary rounded-full mb-4">
        <Shield className="w-12 h-12 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">Security Not Yet Scanned</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Run a security audit to check <strong className="text-foreground">{projectName}</strong> for
        known vulnerabilities in its dependencies.
      </p>
      <Button variant="default" onClick={onScan} disabled={isScanning}>
        <RefreshCw className={cn('w-4 h-4 mr-2', isScanning && 'animate-spin')} />
        {isScanning ? 'Scanning...' : 'Run Security Scan'}
      </Button>
      <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <p>Supports npm, pnpm, yarn, and bun</p>
        <a
          href="https://docs.npmjs.com/cli/v9/commands/npm-audit"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
        >
          <ExternalLink className="w-3 h-3" />
          Learn about npm audit
        </a>
      </div>
    </div>
  );
}

/**
 * Secure state - no vulnerabilities found
 */
interface SecureStateProps {
  scannedAt: string;
  packageManager: string;
  onRescan: () => void;
  isScanning: boolean;
}

function SecureState({ scannedAt, packageManager, onRescan, isScanning }: SecureStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 bg-green-500/20 rounded-full mb-4">
        <ShieldCheck className="w-12 h-12 text-green-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">No Vulnerabilities Found</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Your project dependencies are secure. Keep packages updated to maintain security.
      </p>
      <Button onClick={onRescan} disabled={isScanning} variant="outline" className="border-green-500/50 text-green-400 hover:bg-green-500/10">
        <RefreshCw className={cn('w-4 h-4 mr-2', isScanning && 'animate-spin')} />
        {isScanning ? 'Scanning...' : 'Rescan'}
      </Button>
      <p className="mt-6 text-xs text-muted-foreground">
        Scanned {formatScanTime(scannedAt)} using {packageManager}
      </p>
    </div>
  );
}

/**
 * Scanning state with progress indicator
 */
interface ScanningStateProps {
  projectName: string;
  onCancel?: () => void;
}

function ScanningState({ projectName, onCancel }: ScanningStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-6">
        <div className="p-4 bg-blue-500/20 rounded-full">
          <Shield className="w-12 h-12 text-blue-400" aria-hidden="true" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">Scanning Dependencies</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        Checking <strong className="text-foreground">{projectName}</strong> for known vulnerabilities...
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>This may take a few moments</span>
      </div>
      {onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel} className="mt-4 text-muted-foreground">
          Cancel
        </Button>
      )}
    </div>
  );
}

/**
 * Main Security Tab Component
 */
export function SecurityTab({
  projectName,
  scanResult,
  isScanning,
  error,
  onScan,
  onCancelScan,
  onNavigateToScripts,
  className,
}: SecurityTabProps) {
  // Local state for UI
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Handle scan with skeleton display
  const handleScan = useCallback(() => {
    setShowSkeleton(true);
    onScan();
    // Hide skeleton when scan completes (handled by parent updating scanResult)
  }, [onScan]);

  // Determine current state - check error prop first, then scanResult.error
  const currentState = useMemo(() => {
    if (isScanning) return 'scanning';
    if (error) return 'error';
    if (!scanResult) return 'not-scanned';
    if (scanResult.status === 'failed' || scanResult.error) return 'error';
    return 'success';
  }, [isScanning, scanResult, error]);

  // Get the actual error to display (from prop or scanResult)
  const displayError = error || scanResult?.error || null;

  // Reset skeleton when scan completes
  useMemo(() => {
    if (!isScanning && showSkeleton) {
      setShowSkeleton(false);
    }
  }, [isScanning, showSkeleton]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Scanning State */}
      {currentState === 'scanning' && (
        <ScanningState projectName={projectName} onCancel={onCancelScan} />
      )}

      {/* Not Scanned State */}
      {currentState === 'not-scanned' && (
        <NotScannedState
          projectName={projectName}
          onScan={handleScan}
          isScanning={isScanning}
        />
      )}

      {/* Error State */}
      {currentState === 'error' && displayError && (
        <ScanErrorDisplay
          error={displayError}
          onRetry={handleScan}
          onNavigateToScripts={onNavigateToScripts}
          isRetrying={isScanning}
        />
      )}

      {/* Success State - No Vulnerabilities */}
      {currentState === 'success' && scanResult && scanResult.summary.total === 0 && (
        <SecureState
          scannedAt={scanResult.scannedAt}
          packageManager={scanResult.packageManager}
          onRescan={handleScan}
          isScanning={isScanning}
        />
      )}

      {/* Success State - Has Vulnerabilities */}
      {currentState === 'success' && scanResult && scanResult.summary.total > 0 && (
        <>
          {/* Summary Header */}
          <SecuritySummaryHeader
            summary={scanResult.summary}
            scannedAt={scanResult.scannedAt}
            packageManager={scanResult.packageManager}
            onRescan={handleScan}
            isScanning={isScanning}
          />

          {/* Vulnerability List */}
          {scanResult.vulnerabilities.length > 0 && (
            <VulnerabilityList vulnerabilities={scanResult.vulnerabilities} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Inline security indicator for project header integration
 */
interface SecurityIndicatorProps {
  scanResult: VulnScanResult | null;
  isScanning?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SecurityIndicator({
  scanResult,
  isScanning = false,
  onClick,
  className,
}: SecurityIndicatorProps) {
  if (isScanning) {
    return (
      <span
        className={cn('flex items-center gap-1.5 text-xs text-blue-400', className)}
        title="Scanning..."
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <span>Scanning</span>
      </span>
    );
  }

  if (!scanResult) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground',
          className
        )}
        title="Not scanned - click to scan"
      >
        <Shield className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Not scanned</span>
      </button>
    );
  }

  const { summary } = scanResult;
  const hasIssues = summary.total > 0;
  const hasCritical = summary.critical > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 text-xs',
        !hasIssues && 'text-green-400',
        hasIssues && !hasCritical && 'text-yellow-400',
        hasCritical && 'text-red-400',
        className
      )}
      title={hasIssues ? `${summary.total} vulnerabilities found` : 'No vulnerabilities'}
    >
      {!hasIssues ? (
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>{hasIssues ? summary.total : 'Secure'}</span>
    </button>
  );
}
