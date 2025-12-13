// useDeploy Hook
// One-Click Deploy feature (015-one-click-deploy)

import { useState, useEffect, useCallback, useRef } from 'react';
import { deployAPI, deployEvents, type UnlistenFn } from '../lib/tauri-api';
import { useDeployAccounts } from './useDeployAccounts';
import type {
  PlatformType,
  ConnectedPlatform,
  Deployment,
  DeploymentConfig,
  DeploymentStatusEvent,
  OAuthFlowResult,
} from '../types/deploy';

// ============================================================================
// Types
// ============================================================================

export interface UseDeployState {
  // Platform connection
  connectedPlatforms: ConnectedPlatform[];
  isLoadingPlatforms: boolean;
  connectingPlatform: PlatformType | null;

  // Deployment
  currentDeployment: Deployment | null;
  deploymentHistory: Deployment[];
  isDeploying: boolean;
  isLoadingHistory: boolean;

  // Config
  deploymentConfig: DeploymentConfig | null;
  detectedFramework: string | null;
  isLoadingConfig: boolean;

  // Errors
  error: string | null;
}

export interface UseDeployActions {
  // Platform connection
  connectPlatform: (platform: PlatformType) => Promise<OAuthFlowResult>;
  disconnectPlatform: (platform: PlatformType) => Promise<void>;
  refreshPlatforms: () => Promise<void>;

  // Deployment
  deploy: (projectId: string, projectPath: string, config: DeploymentConfig) => Promise<Deployment | null>;
  redeploy: (projectId: string, projectPath: string) => Promise<Deployment | null>;
  loadHistory: (projectId: string) => Promise<void>;

  // Config
  loadConfig: (projectId: string) => Promise<void>;
  saveConfig: (config: DeploymentConfig) => Promise<void>;
  detectFramework: (projectPath: string) => Promise<string | null>;

  // Utility
  clearError: () => void;
  isPlatformConnected: (platform: PlatformType) => boolean;
}

export type UseDeployReturn = UseDeployState & UseDeployActions;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useDeploy(): UseDeployReturn {
  // Multi-account system (016-multi-deploy-accounts)
  const { accounts } = useDeployAccounts();

  // State
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);
  const [isLoadingPlatforms, setIsLoadingPlatforms] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformType | null>(null);

  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<Deployment[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfig | null>(null);
  const [detectedFramework, setDetectedFramework] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Event listener cleanup
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ========================================================================
  // Event Handling
  // ========================================================================

  useEffect(() => {
    // Subscribe to deployment status events
    deployEvents.onDeploymentStatus((event: DeploymentStatusEvent) => {
      setCurrentDeployment((prev) => {
        if (!prev || prev.id !== event.deploymentId) return prev;
        return {
          ...prev,
          status: event.status,
          url: event.url ?? prev.url,
          errorMessage: event.errorMessage,
        };
      });

      // Update history when deployment completes
      if (event.status === 'ready' || event.status === 'failed') {
        setIsDeploying(false);
        setDeploymentHistory((prev) =>
          prev.map((d) =>
            d.id === event.deploymentId
              ? {
                  ...d,
                  status: event.status,
                  url: event.url ?? d.url,
                  errorMessage: event.errorMessage,
                  completedAt: new Date().toISOString(),
                }
              : d
          )
        );
      }
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  // Load connected platforms on mount
  useEffect(() => {
    refreshPlatforms();
  }, []);

  // ========================================================================
  // Platform Connection Actions
  // ========================================================================

  const refreshPlatforms = useCallback(async () => {
    setIsLoadingPlatforms(true);
    try {
      const platforms = await deployAPI.getConnectedPlatforms();
      setConnectedPlatforms(platforms);
    } catch (err) {
      setError(`Failed to load platforms: ${err}`);
    } finally {
      setIsLoadingPlatforms(false);
    }
  }, []);

  const connectPlatform = useCallback(async (platform: PlatformType): Promise<OAuthFlowResult> => {
    setConnectingPlatform(platform);
    setError(null);
    try {
      const result = await deployAPI.startOAuthFlow(platform);
      if (result.success && result.platform) {
        setConnectedPlatforms((prev) => [
          ...prev.filter((p) => p.platform !== platform),
          result.platform!,
        ]);
      } else if (result.error) {
        setError(result.error);
      }
      return result;
    } catch (err) {
      const errorMsg = `Failed to connect to ${platform}: ${err}`;
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setConnectingPlatform(null);
    }
  }, []);

  const disconnectPlatform = useCallback(async (platform: PlatformType) => {
    try {
      await deployAPI.disconnectPlatform(platform);
      setConnectedPlatforms((prev) => prev.filter((p) => p.platform !== platform));
    } catch (err) {
      setError(`Failed to disconnect ${platform}: ${err}`);
    }
  }, []);

  // Use new multi-account system for checking platform connection
  // GitHub Pages doesn't require OAuth - it uses git credentials
  const isPlatformConnected = useCallback(
    (platform: PlatformType) => {
      if (platform === 'github_pages') {
        return true; // Always available - uses git credentials
      }
      return accounts.some((a) => a.platform === platform);
    },
    [accounts]
  );

  // ========================================================================
  // Deployment Actions
  // ========================================================================

  const deploy = useCallback(async (
    projectId: string,
    projectPath: string,
    config: DeploymentConfig
  ): Promise<Deployment | null> => {
    setIsDeploying(true);
    setError(null);
    try {
      const deployment = await deployAPI.startDeployment(projectId, projectPath, config);
      setCurrentDeployment(deployment);
      setDeploymentHistory((prev) => [deployment, ...prev]);
      return deployment;
    } catch (err) {
      const errorMsg = `Deployment failed: ${err}`;
      setError(errorMsg);
      setIsDeploying(false);
      return null;
    }
  }, []);

  const redeploy = useCallback(async (projectId: string, projectPath: string): Promise<Deployment | null> => {
    setIsDeploying(true);
    setError(null);
    try {
      const deployment = await deployAPI.redeploy(projectId, projectPath);
      setCurrentDeployment(deployment);
      setDeploymentHistory((prev) => [deployment, ...prev]);
      return deployment;
    } catch (err) {
      const errorMsg = `Redeploy failed: ${err}`;
      setError(errorMsg);
      setIsDeploying(false);
      return null;
    }
  }, []);

  const loadHistory = useCallback(async (projectId: string) => {
    setIsLoadingHistory(true);
    try {
      const history = await deployAPI.getDeploymentHistory(projectId);
      setDeploymentHistory(history);
    } catch (err) {
      setError(`Failed to load deployment history: ${err}`);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // ========================================================================
  // Config Actions
  // ========================================================================

  const loadConfig = useCallback(async (projectId: string) => {
    setIsLoadingConfig(true);
    try {
      const config = await deployAPI.getDeploymentConfig(projectId);
      setDeploymentConfig(config);
    } catch (err) {
      setError(`Failed to load deployment config: ${err}`);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  const saveConfig = useCallback(async (config: DeploymentConfig) => {
    try {
      await deployAPI.saveDeploymentConfig(config);
      setDeploymentConfig(config);
    } catch (err) {
      setError(`Failed to save deployment config: ${err}`);
    }
  }, []);

  const detectFrameworkAction = useCallback(async (projectPath: string): Promise<string | null> => {
    try {
      const framework = await deployAPI.detectFramework(projectPath);
      setDetectedFramework(framework);
      return framework;
    } catch (err) {
      setError(`Failed to detect framework: ${err}`);
      return null;
    }
  }, []);

  // ========================================================================
  // Utility Actions
  // ========================================================================

  const clearError = useCallback(() => setError(null), []);

  // ========================================================================
  // Return
  // ========================================================================

  return {
    // State
    connectedPlatforms,
    isLoadingPlatforms,
    connectingPlatform,
    currentDeployment,
    deploymentHistory,
    isDeploying,
    isLoadingHistory,
    deploymentConfig,
    detectedFramework,
    isLoadingConfig,
    error,

    // Actions
    connectPlatform,
    disconnectPlatform,
    refreshPlatforms,
    deploy,
    redeploy,
    loadHistory,
    loadConfig,
    saveConfig,
    detectFramework: detectFrameworkAction,
    clearError,
    isPlatformConnected,
  };
}
