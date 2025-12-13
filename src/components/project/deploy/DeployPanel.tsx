// DeployPanel Component
// One-Click Deploy feature (015-one-click-deploy)
// Main panel integrating deployment and history
// Extended: GitHub Pages workflow generation (016-multi-deploy-accounts)
// Note: Deploy Accounts management moved to app Settings

import { useState, useEffect } from 'react';
import { Rocket, Settings, History, AlertCircle } from 'lucide-react';
import { useDeploy } from '../../../hooks/useDeploy';
import { useDeployAccounts } from '../../../hooks/useDeployAccounts';
import { deployAPI } from '../../../lib/tauri-api';
import { DeployButton } from './DeployButton';
import { DeploymentSettingsDialog } from './DeploymentSettingsDialog';
import { DeploymentHistory } from './DeploymentHistory';
import { GitHubPagesSetupDialog } from './GitHubPagesSetupDialog';
import type { DeploymentConfig, PlatformType, GitHubWorkflowResult } from '../../../types/deploy';

// Format platform name for display
const formatPlatformName = (platform: PlatformType): string => {
  switch (platform) {
    case 'github_pages':
      return 'GitHub Pages';
    case 'netlify':
      return 'Netlify';
    case 'cloudflare_pages':
      return 'Cloudflare Pages';
    default:
      return platform;
  }
};

interface DeployPanelProps {
  projectId: string;
  projectName: string;
  projectPath: string;
}

export function DeployPanel({ projectId, projectName, projectPath }: DeployPanelProps) {
  const [activeTab, setActiveTab] = useState<'deploy' | 'history'>('deploy');
  const [showSettings, setShowSettings] = useState(false);
  // GitHub Pages workflow generation state
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<GitHubWorkflowResult | null>(null);
  const [workflowError, setWorkflowError] = useState<string | undefined>(undefined);

  const {
    // State
    currentDeployment,
    deploymentHistory,
    isDeploying,
    isLoadingHistory,
    deploymentConfig,
    detectedFramework,
    error,

    // Actions
    deploy,
    loadHistory,
    loadConfig,
    saveConfig,
    detectFramework,
    clearError,
    isPlatformConnected,
  } = useDeploy();

  // Check for connected accounts (016-multi-deploy-accounts)
  const { accounts } = useDeployAccounts();

  // Load config and history on mount
  useEffect(() => {
    loadConfig(projectId);
    loadHistory(projectId);
  }, [projectId, loadConfig, loadHistory]);

  const handleDeploy = async (_projectId: string, _projectPath: string, config: DeploymentConfig) => {
    await deploy(_projectId, _projectPath, config);
  };

  // Handle GitHub Pages workflow generation
  const handleGenerateWorkflow = async (_projectPath: string, config: DeploymentConfig) => {
    setIsGeneratingWorkflow(true);
    setWorkflowError(undefined);
    setWorkflowResult(null);
    setShowSetupDialog(true);

    try {
      const result = await deployAPI.generateGitHubActionsWorkflow(_projectPath, config);
      setWorkflowResult(result);
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingWorkflow(false);
    }
  };

  // GitHub Pages is always available, Netlify requires an account
  const hasConnectedPlatform = accounts.length > 0 || true; // GitHub Pages is always available

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">One-Click Deploy</h2>
        </div>

        <div className="flex items-center gap-2">
          {hasConnectedPlatform && (
            <DeployButton
              projectId={projectId}
              projectPath={projectPath}
              projectName={projectName}
              deploymentConfig={deploymentConfig}
              isDeploying={isDeploying}
              isGeneratingWorkflow={isGeneratingWorkflow}
              isPlatformConnected={isPlatformConnected}
              onDeploy={handleDeploy}
              onGenerateWorkflow={handleGenerateWorkflow}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        <button
          onClick={() => setActiveTab('deploy')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
            activeTab === 'deploy'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          <span>History</span>
          {deploymentHistory.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-xs">
              {deploymentHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'deploy' && (
          <div className="space-y-6">
            {!hasConnectedPlatform ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Rocket className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 font-medium">Get Started with One-Click Deploy</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Connect a deployment platform to get started.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Go to <span className="font-medium">Settings → Deploy Accounts</span> to add an account.
                </p>
              </div>
            ) : (
              <>
                {/* Quick Deploy Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Quick Deploy</h3>
                  {deploymentConfig ? (
                    <div className="rounded-md border border-border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {formatPlatformName(deploymentConfig.platform)}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {deploymentConfig.environment === 'production'
                                ? 'Production'
                                : 'Preview'}
                            </span>
                          </div>
                          {deploymentConfig.frameworkPreset && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Framework: {deploymentConfig.frameworkPreset}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setShowSettings(true)}
                          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        No deployment configuration yet
                      </p>
                      <button
                        onClick={() => setShowSettings(true)}
                        className="mt-2 text-sm text-primary hover:underline"
                      >
                        Configure Deploy
                      </button>
                    </div>
                  )}
                </div>

                {/* Current Deployment Status */}
                {currentDeployment && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Current Deployment</h3>
                    <div className="rounded-md border border-border bg-accent/30 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {currentDeployment.status === 'ready' ? (
                            <span className="flex h-2 w-2 rounded-full bg-green-500" />
                          ) : currentDeployment.status === 'failed' ? (
                            <span className="flex h-2 w-2 rounded-full bg-red-500" />
                          ) : (
                            <span className="flex h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                          )}
                          <span className="font-medium">
                            {currentDeployment.status === 'queued' && 'Queued'}
                            {currentDeployment.status === 'building' && 'Building'}
                            {currentDeployment.status === 'deploying' && 'Deploying'}
                            {currentDeployment.status === 'ready' && 'Ready'}
                            {currentDeployment.status === 'failed' && 'Failed'}
                            {currentDeployment.status === 'cancelled' && 'Cancelled'}
                          </span>
                        </div>
                        {currentDeployment.url && (
                          <a
                            href={currentDeployment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Open Site →
                          </a>
                        )}
                      </div>
                      {currentDeployment.errorMessage && (
                        <p className="mt-2 text-sm text-destructive">
                          {currentDeployment.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <DeploymentHistory
            deployments={deploymentHistory}
            projectId={projectId}
            isLoading={isLoadingHistory}
            onRefresh={() => loadHistory(projectId)}
          />
        )}
      </div>

      {/* Settings Dialog */}
      <DeploymentSettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        projectId={projectId}
        projectPath={projectPath}
        initialConfig={deploymentConfig}
        detectedFramework={detectedFramework}
        onSave={saveConfig}
        onDetectFramework={detectFramework}
      />

      {/* GitHub Pages Setup Dialog */}
      <GitHubPagesSetupDialog
        isOpen={showSetupDialog}
        onClose={() => {
          setShowSetupDialog(false);
          // Clear state after closing
          setWorkflowResult(null);
          setWorkflowError(undefined);
        }}
        result={workflowResult}
        error={workflowError}
        isGenerating={isGeneratingWorkflow}
      />
    </div>
  );
}
