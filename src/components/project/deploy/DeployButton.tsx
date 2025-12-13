// DeployButton Component
// One-Click Deploy feature (015-one-click-deploy)

import { useState } from 'react';
import {
  Rocket,
  RefreshCw,
  Loader2,
  ChevronDown,
  Check,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type { PlatformType, Deployment, DeploymentConfig } from '../../../types/deploy';

interface DeployButtonProps {
  projectId: string;
  projectPath: string;
  projectName?: string; // Optional - for display purposes
  deploymentConfig: DeploymentConfig | null;
  currentDeployment: Deployment | null;
  isDeploying: boolean;
  isPlatformConnected: (platform: PlatformType) => boolean;
  onDeploy: (projectId: string, projectPath: string, config: DeploymentConfig) => Promise<void>;
  onRedeploy: (projectId: string, projectPath: string) => Promise<void>;
  onOpenSettings: () => void;
}

export function DeployButton({
  projectId,
  projectPath,
  projectName: _projectName, // Reserved for future use
  deploymentConfig,
  currentDeployment,
  isDeploying,
  isPlatformConnected,
  onDeploy,
  onRedeploy,
  onOpenSettings,
}: DeployButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const canDeploy =
    deploymentConfig && isPlatformConnected(deploymentConfig.platform);

  const handleDeploy = async () => {
    if (!deploymentConfig) {
      onOpenSettings();
      return;
    }
    await onDeploy(projectId, projectPath, deploymentConfig);
    setShowDropdown(false);
  };

  const handleRedeploy = async () => {
    await onRedeploy(projectId, projectPath);
    setShowDropdown(false);
  };

  // Get status display
  const getStatusDisplay = () => {
    if (!currentDeployment) return null;

    switch (currentDeployment.status) {
      case 'queued':
        return { icon: Loader2, text: 'Queued', color: 'text-yellow-500', animate: true };
      case 'building':
        return { icon: Loader2, text: 'Building', color: 'text-blue-500', animate: true };
      case 'deploying':
        return { icon: Loader2, text: 'Deploying', color: 'text-blue-500', animate: true };
      case 'ready':
        return { icon: Check, text: 'Ready', color: 'text-green-500', animate: false };
      case 'failed':
        return { icon: AlertTriangle, text: 'Failed', color: 'text-red-500', animate: false };
      case 'cancelled':
        return { icon: AlertTriangle, text: 'Cancelled', color: 'text-gray-500', animate: false };
      default:
        return null;
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="relative">
      {/* Main Deploy Button */}
      <div className="flex items-stretch">
        <button
          onClick={handleDeploy}
          disabled={isDeploying}
          className={`flex items-center gap-2 rounded-l-md px-4 py-2 text-sm font-medium transition-colors ${
            canDeploy
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          } disabled:opacity-50`}
        >
          {isDeploying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          <span>{isDeploying ? 'Deploying...' : 'Deploy'}</span>
        </button>

        {/* Dropdown Toggle */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isDeploying}
          className={`flex items-center rounded-r-md border-l px-2 py-2 transition-colors ${
            canDeploy
              ? 'border-primary-foreground/20 bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
          } disabled:opacity-50`}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-white dark:bg-zinc-900 shadow-xl">
            {/* Redeploy Option */}
            {deploymentConfig && (
              <button
                onClick={handleRedeploy}
                disabled={isDeploying}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Quick Redeploy</span>
              </button>
            )}

            {/* Divider */}
            <div className="my-1 border-t border-border" />

            {/* Last Deployment Info */}
            {currentDeployment && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Last Deploy</span>
                  {status && (
                    <span className={`flex items-center gap-1 ${status.color}`}>
                      <status.icon
                        className={`h-3 w-3 ${status.animate ? 'animate-spin' : ''}`}
                      />
                      {status.text}
                    </span>
                  )}
                </div>
                {currentDeployment.url && (
                  <a
                    href={currentDeployment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{currentDeployment.url}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
