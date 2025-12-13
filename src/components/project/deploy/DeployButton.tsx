// DeployButton Component
// One-Click Deploy feature (015-one-click-deploy)
// Extended: GitHub Pages uses workflow generation instead of direct deploy

import { Rocket, Loader2, FileCode } from 'lucide-react';
import type { PlatformType, DeploymentConfig } from '../../../types/deploy';

interface DeployButtonProps {
  projectId: string;
  projectPath: string;
  projectName?: string; // Optional - for display purposes
  deploymentConfig: DeploymentConfig | null;
  isDeploying: boolean;
  isGeneratingWorkflow?: boolean;
  isPlatformConnected: (platform: PlatformType) => boolean;
  onDeploy: (projectId: string, projectPath: string, config: DeploymentConfig) => Promise<void>;
  onGenerateWorkflow?: (projectPath: string, config: DeploymentConfig) => Promise<void>;
  onOpenSettings: () => void;
}

export function DeployButton({
  projectId,
  projectPath,
  projectName: _projectName, // Reserved for future use
  deploymentConfig,
  isDeploying,
  isGeneratingWorkflow,
  isPlatformConnected,
  onDeploy,
  onGenerateWorkflow,
  onOpenSettings,
}: DeployButtonProps) {
  const canDeploy =
    deploymentConfig && isPlatformConnected(deploymentConfig.platform);

  const isGitHubPages = deploymentConfig?.platform === 'github_pages';
  const isLoading = isDeploying || isGeneratingWorkflow;

  const handleClick = async () => {
    if (!deploymentConfig) {
      onOpenSettings();
      return;
    }

    // GitHub Pages: Generate workflow file instead of direct deploy
    if (isGitHubPages && onGenerateWorkflow) {
      await onGenerateWorkflow(projectPath, deploymentConfig);
    } else {
      await onDeploy(projectId, projectPath, deploymentConfig);
    }
  };

  // Determine button text and icon
  const getButtonContent = () => {
    if (isGeneratingWorkflow) {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        text: 'Generating...',
      };
    }
    if (isDeploying) {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        text: 'Deploying...',
      };
    }
    if (isGitHubPages) {
      return {
        icon: <FileCode className="h-4 w-4" />,
        text: 'Generate Workflow',
      };
    }
    return {
      icon: <Rocket className="h-4 w-4" />,
      text: 'Deploy',
    };
  };

  const { icon, text } = getButtonContent();

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        canDeploy
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      } disabled:opacity-50`}
    >
      {icon}
      <span>{text}</span>
    </button>
  );
}
