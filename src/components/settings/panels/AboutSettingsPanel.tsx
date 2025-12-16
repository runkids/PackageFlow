/**
 * About Settings Panel
 * Displays app version information and update functionality
 */

import React, { useEffect } from 'react';
import {
  Info,
  RefreshCw,
  CheckCircle,
  ArrowUpCircle,
  Download,
  Package,
  AlertCircle,
  Loader2,
  ExternalLink,
  Github,
  FileText,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { SettingSection } from '../ui/SettingSection';
import { SettingInfoBox } from '../ui/SettingInfoBox';
import { Progress } from '../../ui/Progress';
import { cn } from '../../../lib/utils';
import { useUpdater } from '../../../hooks/useUpdater';
import { openUrl } from '../../../lib/tauri-api';

interface AboutSettingsPanelProps {
  onExport?: () => void;
  onImport?: () => void;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format relative time
function formatRelativeTime(date: Date | undefined): string {
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Update status configuration
interface StatusConfig {
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  title: string;
  description: string;
  iconAnimation?: string;
}

const getStatusConfig = (
  state: string,
  newVersion: string | null,
  error: string | null
): StatusConfig => {
  // Map useUpdater state to our status config
  const configs: Record<string, StatusConfig> = {
    idle: {
      icon: RefreshCw,
      gradient: 'from-muted/30 to-transparent',
      iconColor: 'text-muted-foreground',
      iconBg: 'bg-muted',
      borderColor: 'border-border',
      title: 'Check for Updates',
      description: 'Click to check for available updates',
    },
    checking: {
      icon: Loader2,
      gradient: 'from-primary/5 to-transparent',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
      borderColor: 'border-primary/20',
      title: 'Checking for Updates',
      description: 'Looking for new versions...',
      iconAnimation: 'animate-spin',
    },
    available: {
      icon: ArrowUpCircle,
      gradient: 'from-blue-500/5 to-transparent',
      iconColor: 'text-blue-500 dark:text-blue-400',
      iconBg: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      title: 'Update Available',
      description: newVersion ? `Version ${newVersion} is ready to download` : 'A new version is available',
    },
    downloading: {
      icon: Download,
      gradient: 'from-blue-500/5 to-transparent',
      iconColor: 'text-blue-500 dark:text-blue-400',
      iconBg: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      title: 'Downloading Update',
      description: 'Please wait while the update downloads...',
    },
    installing: {
      icon: Package,
      gradient: 'from-amber-500/5 to-transparent',
      iconColor: 'text-amber-500 dark:text-amber-400',
      iconBg: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      title: 'Installing Update',
      description: 'Preparing to install...',
      iconAnimation: 'animate-spin',
    },
    complete: {
      icon: Package,
      gradient: 'from-amber-500/5 to-transparent',
      iconColor: 'text-amber-500 dark:text-amber-400',
      iconBg: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      title: 'Ready to Restart',
      description: 'Restart the app to apply the update',
    },
    error: {
      icon: AlertCircle,
      gradient: 'from-red-500/5 to-transparent',
      iconColor: 'text-red-500 dark:text-red-400',
      iconBg: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      title: 'Update Failed',
      description: error || 'An error occurred while updating',
    },
  };

  // Handle 'up_to_date' which is not a state from useUpdater but we derive it
  if (state === 'idle' && !newVersion) {
    return {
      icon: CheckCircle,
      gradient: 'from-green-500/5 to-transparent',
      iconColor: 'text-green-500 dark:text-green-400',
      iconBg: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      title: 'Up to Date',
      description: 'You have the latest version',
    };
  }

  return configs[state] || configs.idle;
};

export const AboutSettingsPanel: React.FC<AboutSettingsPanelProps> = () => {
  const {
    currentVersion,
    state,
    newVersion,
    releaseNotes,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    error,
    checkForUpdates,
    startUpdate,
    restartApp,
    retryUpdate,
  } = useUpdater();

  // Track if we've checked for updates in this session
  const [hasChecked, setHasChecked] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<Date | undefined>(undefined);

  // Update lastChecked when state changes from checking
  useEffect(() => {
    if (state !== 'checking' && state !== 'idle') {
      setHasChecked(true);
      setLastChecked(new Date());
    }
  }, [state]);

  const statusConfig = getStatusConfig(
    hasChecked && state === 'idle' ? 'idle' : state,
    newVersion,
    error
  );
  const StatusIcon = statusConfig.icon;

  // Determine which state we're showing for UI purposes
  const showUpToDate = hasChecked && state === 'idle' && !newVersion && !error;
  const displayConfig = showUpToDate
    ? getStatusConfig('up_to_date', null, null)
    : statusConfig;
  const DisplayIcon = showUpToDate ? CheckCircle : StatusIcon;

  const handleCheckForUpdates = () => {
    setHasChecked(true);
    checkForUpdates();
  };

  const handleOpenGitHub = () => {
    openUrl('https://github.com/runkids/PackageFlow');
  };

  const handleOpenChangelog = () => {
    openUrl('https://github.com/runkids/PackageFlow/releases');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 pb-4 border-b border-border bg-background">
        <h2 className="text-xl font-semibold text-foreground flex items-center">
          <Info className="w-5 h-5 pr-1" />
          About
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Version information and updates
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-6">
        {/* App Identity Section */}
        <SettingSection
          title="PackageFlow"
          description="Project management and automation tool"
          icon={<Package className="w-4 h-4" />}
        >
          <div
            className={cn(
              'p-4 rounded-lg',
              'bg-gradient-to-r from-primary/5 via-transparent to-transparent',
              'border border-primary/20'
            )}
          >
            <div className="flex items-center gap-4">
              {/* App Icon */}
              <div
                className={cn(
                  'flex-shrink-0 w-16 h-16 rounded-xl',
                  'bg-gradient-to-br from-primary/20 to-primary/5',
                  'border border-primary/30',
                  'flex items-center justify-center overflow-hidden'
                )}
              >
                <img
                  src="/image.png"
                  alt="PackageFlow"
                  className="w-12 h-12 object-contain"
                />
              </div>

              {/* Version Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  PackageFlow
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Version {currentVersion || '...'}
                </p>
                {lastChecked && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {formatRelativeTime(lastChecked)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </SettingSection>

        {/* Update Status Section */}
        <SettingSection
          title="Updates"
          description="Check for and install app updates"
          icon={<RefreshCw className="w-4 h-4" />}
        >
          <div
            className={cn(
              'p-4 rounded-lg',
              'bg-gradient-to-r',
              displayConfig.gradient,
              'border',
              displayConfig.borderColor,
              'transition-colors'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div
                className={cn(
                  'flex-shrink-0 p-2.5 rounded-lg',
                  displayConfig.iconBg,
                  displayConfig.iconColor
                )}
              >
                <DisplayIcon
                  className={cn('w-5 h-5', displayConfig.iconAnimation)}
                />
              </div>

              {/* Status Info */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {displayConfig.title}
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  {displayConfig.description}
                </p>

                {/* Release Notes (when update available) */}
                {state === 'available' && releaseNotes && (
                  <div className="mt-3">
                    <h4 className="text-xs font-medium text-foreground mb-1">
                      What&apos;s New
                    </h4>
                    <div
                      className={cn(
                        'p-2 rounded-md',
                        'bg-muted/50 border border-border',
                        'text-xs text-muted-foreground',
                        'max-h-24 overflow-y-auto',
                        'whitespace-pre-wrap'
                      )}
                    >
                      {releaseNotes}
                    </div>
                  </div>
                )}

                {/* Download Progress */}
                {state === 'downloading' && (
                  <div className="mt-3 space-y-2">
                    <Progress
                      value={downloadProgress}
                      max={100}
                      className="h-2"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                      </span>
                      <span>{downloadProgress}%</span>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {state === 'error' && error && (
                  <div
                    className={cn(
                      'mt-3 p-2 rounded-md',
                      'bg-red-500/10 border border-red-500/20',
                      'text-xs text-red-600 dark:text-red-400'
                    )}
                  >
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              {/* Idle / Up to date state */}
              {(state === 'idle' || showUpToDate) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckForUpdates}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Check for Updates
                </Button>
              )}

              {/* Checking state */}
              {state === 'checking' && (
                <Button variant="outline" size="sm" disabled>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Checking...
                </Button>
              )}

              {/* Update available state */}
              {state === 'available' && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={startUpdate}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download & Install
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCheckForUpdates}
                  >
                    Check Again
                  </Button>
                </>
              )}

              {/* Downloading state */}
              {state === 'downloading' && (
                <Button variant="outline" size="sm" disabled>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Downloading...
                </Button>
              )}

              {/* Installing state */}
              {state === 'installing' && (
                <Button variant="outline" size="sm" disabled>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Installing...
                </Button>
              )}

              {/* Complete state */}
              {state === 'complete' && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={restartApp}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Restart Now
                </Button>
              )}

              {/* Error state */}
              {state === 'error' && (
                <Button
                  variant="outline-destructive"
                  size="sm"
                  onClick={retryUpdate}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </SettingSection>

        {/* Links Section */}
        <SettingSection
          title="Resources"
          description="Documentation and support"
          icon={<ExternalLink className="w-4 h-4" />}
        >
          <div className="grid gap-3">
            <LinkCard
              icon={<Github className="w-4 h-4" />}
              title="GitHub Repository"
              description="View source code and contribute"
              onClick={handleOpenGitHub}
              variant="default"
            />
            <LinkCard
              icon={<FileText className="w-4 h-4" />}
              title="Release Notes"
              description="View changelog and version history"
              onClick={handleOpenChangelog}
              variant="default"
            />
          </div>
        </SettingSection>

        {/* Info Box */}
        <SettingInfoBox title="Automatic Updates" variant="info">
          <p className="text-xs">
            PackageFlow automatically checks for updates when you start the app.
            You can also manually check for updates at any time using the button above.
          </p>
        </SettingInfoBox>
      </div>
    </div>
  );
};

// ============================================================================
// Internal Components
// ============================================================================

interface LinkCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  variant?: 'default' | 'blue' | 'purple';
}

const LinkCard: React.FC<LinkCardProps> = ({
  icon,
  title,
  description,
  onClick,
  variant = 'default',
}) => {
  const variantStyles = {
    default: {
      border: 'border-border hover:border-primary/30',
      iconBg: 'bg-muted text-muted-foreground',
    },
    blue: {
      border: 'border-blue-500/20 hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
  };

  const styles = variantStyles[variant];

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg text-left',
        'border bg-card',
        styles.border,
        'transition-colors cursor-pointer',
        'hover:bg-accent/50'
      )}
    >
      <div className={cn('p-2 rounded-lg flex-shrink-0', styles.iconBg)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-1">
          {title}
          <ExternalLink className="w-3 h-3 text-muted-foreground" />
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
};
