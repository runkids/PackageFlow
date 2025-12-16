// MCP Actions Hook
// Manages MCP action state including actions, permissions, executions, and pending requests
// @see specs/021-mcp-actions/spec.md

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  mcpActionAPI,
  type PendingActionRequest,
  type ActionRequestResponse,
} from '../lib/tauri-api';
import type {
  MCPAction,
  MCPActionPermission,
  MCPActionExecution,
  MCPActionType,
  PermissionLevel,
  ExecutionStatus,
} from '../types/mcp-action';

// ============================================================================
// useMCPActions - Main hook for MCP action management
// ============================================================================

export interface UseMCPActionsOptions {
  /** Automatically fetch data on mount */
  autoFetch?: boolean;
  /** Polling interval for pending requests (ms), 0 to disable */
  pendingPollInterval?: number;
}

export interface UseMCPActionsReturn {
  // Data
  actions: MCPAction[];
  permissions: MCPActionPermission[];
  executions: MCPActionExecution[];
  pendingRequests: PendingActionRequest[];

  // Loading states
  isLoading: boolean;
  isActionsLoading: boolean;
  isPermissionsLoading: boolean;
  isExecutionsLoading: boolean;
  isPendingLoading: boolean;

  // Error states
  error: string | null;

  // Actions CRUD
  fetchActions: (projectId?: string, actionType?: MCPActionType, isEnabled?: boolean) => Promise<void>;
  createAction: (
    actionType: MCPActionType,
    name: string,
    description: string | null,
    config: Record<string, unknown>,
    projectId?: string
  ) => Promise<MCPAction>;
  updateAction: (
    actionId: string,
    updates: {
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
      isEnabled?: boolean;
    }
  ) => Promise<MCPAction>;
  deleteAction: (actionId: string) => Promise<boolean>;

  // Permissions
  fetchPermissions: () => Promise<void>;
  updatePermission: (
    actionId: string | null,
    actionType: MCPActionType | null,
    permissionLevel: PermissionLevel
  ) => Promise<MCPActionPermission>;
  deletePermission: (permissionId: string) => Promise<boolean>;

  // Executions
  fetchExecutions: (
    actionId?: string,
    actionType?: MCPActionType,
    status?: ExecutionStatus,
    limit?: number
  ) => Promise<void>;
  cleanupExecutions: (keepCount?: number, maxAgeDays?: number) => Promise<number>;

  // Pending requests
  fetchPendingRequests: () => Promise<void>;
  approveRequest: (executionId: string) => Promise<ActionRequestResponse>;
  denyRequest: (executionId: string, reason?: string) => Promise<ActionRequestResponse>;

  // Refresh all data
  refresh: () => Promise<void>;
}

export function useMCPActions(options: UseMCPActionsOptions = {}): UseMCPActionsReturn {
  const { autoFetch = true, pendingPollInterval = 5000 } = options;

  // Data state
  const [actions, setActions] = useState<MCPAction[]>([]);
  const [permissions, setPermissions] = useState<MCPActionPermission[]>([]);
  const [executions, setExecutions] = useState<MCPActionExecution[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingActionRequest[]>([]);

  // Loading states
  const [isActionsLoading, setIsActionsLoading] = useState(false);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [isExecutionsLoading, setIsExecutionsLoading] = useState(false);
  const [isPendingLoading, setIsPendingLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Combined loading state
  const isLoading = isActionsLoading || isPermissionsLoading || isExecutionsLoading || isPendingLoading;

  // ============================================================================
  // Fetch functions
  // ============================================================================

  const fetchActions = useCallback(
    async (projectId?: string, actionType?: MCPActionType, isEnabled?: boolean) => {
      setIsActionsLoading(true);
      setError(null);
      try {
        const data = await mcpActionAPI.listActions(projectId, actionType, isEnabled);
        setActions(data);
      } catch (err) {
        console.error('Failed to fetch MCP actions:', err);
        setError(`Failed to fetch actions: ${err}`);
      } finally {
        setIsActionsLoading(false);
      }
    },
    []
  );

  const fetchPermissions = useCallback(async () => {
    setIsPermissionsLoading(true);
    setError(null);
    try {
      const data = await mcpActionAPI.listPermissions();
      setPermissions(data);
    } catch (err) {
      console.error('Failed to fetch MCP permissions:', err);
      setError(`Failed to fetch permissions: ${err}`);
    } finally {
      setIsPermissionsLoading(false);
    }
  }, []);

  const fetchExecutions = useCallback(
    async (
      actionId?: string,
      actionType?: MCPActionType,
      status?: ExecutionStatus,
      limit?: number
    ) => {
      setIsExecutionsLoading(true);
      setError(null);
      try {
        const data = await mcpActionAPI.getExecutions(actionId, actionType, status, limit);
        setExecutions(data);
      } catch (err) {
        console.error('Failed to fetch MCP executions:', err);
        setError(`Failed to fetch executions: ${err}`);
      } finally {
        setIsExecutionsLoading(false);
      }
    },
    []
  );

  const fetchPendingRequests = useCallback(async () => {
    setIsPendingLoading(true);
    try {
      const data = await mcpActionAPI.getPendingRequests();
      setPendingRequests(data);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
      // Don't set error for polling failures
    } finally {
      setIsPendingLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchActions(),
      fetchPermissions(),
      fetchExecutions(),
      fetchPendingRequests(),
    ]);
  }, [fetchActions, fetchPermissions, fetchExecutions, fetchPendingRequests]);

  // ============================================================================
  // CRUD operations
  // ============================================================================

  const createAction = useCallback(
    async (
      actionType: MCPActionType,
      name: string,
      description: string | null,
      config: Record<string, unknown>,
      projectId?: string
    ): Promise<MCPAction> => {
      const action = await mcpActionAPI.createAction(actionType, name, description, config, projectId);
      setActions((prev) => [...prev, action]);
      return action;
    },
    []
  );

  const updateAction = useCallback(
    async (
      actionId: string,
      updates: {
        name?: string;
        description?: string;
        config?: Record<string, unknown>;
        isEnabled?: boolean;
      }
    ): Promise<MCPAction> => {
      const action = await mcpActionAPI.updateAction(
        actionId,
        updates.name,
        updates.description,
        updates.config,
        updates.isEnabled
      );
      setActions((prev) => prev.map((a) => (a.id === actionId ? action : a)));
      return action;
    },
    []
  );

  const deleteAction = useCallback(async (actionId: string): Promise<boolean> => {
    const success = await mcpActionAPI.deleteAction(actionId);
    if (success) {
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    }
    return success;
  }, []);

  const updatePermission = useCallback(
    async (
      actionId: string | null,
      actionType: MCPActionType | null,
      permissionLevel: PermissionLevel
    ): Promise<MCPActionPermission> => {
      const permission = await mcpActionAPI.updatePermission(actionId, actionType, permissionLevel);
      setPermissions((prev) => {
        // Replace existing permission with same action_id and action_type, or add new
        const existing = prev.findIndex(
          (p) => p.actionId === actionId && p.actionType === actionType
        );
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = permission;
          return updated;
        }
        return [...prev, permission];
      });
      return permission;
    },
    []
  );

  const deletePermission = useCallback(async (permissionId: string): Promise<boolean> => {
    const success = await mcpActionAPI.deletePermission(permissionId);
    if (success) {
      setPermissions((prev) => prev.filter((p) => p.id !== permissionId));
    }
    return success;
  }, []);

  const cleanupExecutions = useCallback(
    async (keepCount?: number, maxAgeDays?: number): Promise<number> => {
      const deleted = await mcpActionAPI.cleanupExecutions(keepCount, maxAgeDays);
      await fetchExecutions(); // Refresh after cleanup
      return deleted;
    },
    [fetchExecutions]
  );

  // ============================================================================
  // Pending request operations
  // ============================================================================

  const approveRequest = useCallback(
    async (executionId: string): Promise<ActionRequestResponse> => {
      const response = await mcpActionAPI.respondToRequest(executionId, true);
      setPendingRequests((prev) => prev.filter((r) => r.executionId !== executionId));
      return response;
    },
    []
  );

  const denyRequest = useCallback(
    async (executionId: string, reason?: string): Promise<ActionRequestResponse> => {
      const response = await mcpActionAPI.respondToRequest(executionId, false, reason);
      setPendingRequests((prev) => prev.filter((r) => r.executionId !== executionId));
      return response;
    },
    []
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      refresh();
    }
  }, [autoFetch, refresh]);

  // Poll for pending requests
  useEffect(() => {
    if (pendingPollInterval <= 0) return;

    const interval = setInterval(() => {
      fetchPendingRequests();
    }, pendingPollInterval);

    return () => clearInterval(interval);
  }, [pendingPollInterval, fetchPendingRequests]);

  // Listen for action response events
  useEffect(() => {
    const unlistenPromise = listen<{ executionId: string; approved: boolean; status: string }>(
      'mcp:action-response',
      (event) => {
        console.log('MCP action response:', event.payload);
        // Remove from pending requests
        setPendingRequests((prev) =>
          prev.filter((r) => r.executionId !== event.payload.executionId)
        );
        // Refresh executions to get updated status
        fetchExecutions();
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [fetchExecutions]);

  return {
    // Data
    actions,
    permissions,
    executions,
    pendingRequests,

    // Loading states
    isLoading,
    isActionsLoading,
    isPermissionsLoading,
    isExecutionsLoading,
    isPendingLoading,

    // Error
    error,

    // Actions CRUD
    fetchActions,
    createAction,
    updateAction,
    deleteAction,

    // Permissions
    fetchPermissions,
    updatePermission,
    deletePermission,

    // Executions
    fetchExecutions,
    cleanupExecutions,

    // Pending requests
    fetchPendingRequests,
    approveRequest,
    denyRequest,

    // Refresh all
    refresh,
  };
}

// ============================================================================
// useActionHistory - Dedicated hook for action history view
// ============================================================================

export interface UseActionHistoryOptions {
  /** Initial limit */
  limit?: number;
  /** Filter by action type */
  actionType?: MCPActionType;
  /** Filter by status */
  status?: ExecutionStatus;
}

export function useActionHistory(options: UseActionHistoryOptions = {}) {
  const { limit = 50, actionType, status } = options;

  const [executions, setExecutions] = useState<MCPActionExecution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await mcpActionAPI.getExecutions(undefined, actionType, status, limit);
      setExecutions(data);
    } catch (err) {
      console.error('Failed to fetch action history:', err);
      setError(`Failed to fetch history: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [limit, actionType, status]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const cleanup = useCallback(
    async (keepCount?: number, maxAgeDays?: number) => {
      const deleted = await mcpActionAPI.cleanupExecutions(keepCount, maxAgeDays);
      await fetchHistory();
      return deleted;
    },
    [fetchHistory]
  );

  return {
    executions,
    isLoading,
    error,
    refresh: fetchHistory,
    cleanup,
  };
}

// ============================================================================
// usePendingActions - Hook for pending action confirmation UI
// ============================================================================

export interface UsePendingActionsOptions {
  /** Polling interval (ms) */
  pollInterval?: number;
}

export function usePendingActions(options: UsePendingActionsOptions = {}) {
  const { pollInterval = 3000 } = options;

  const [requests, setRequests] = useState<PendingActionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await mcpActionAPI.getPendingRequests();
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const approve = useCallback(async (executionId: string) => {
    const response = await mcpActionAPI.respondToRequest(executionId, true);
    setRequests((prev) => prev.filter((r) => r.executionId !== executionId));
    return response;
  }, []);

  const deny = useCallback(async (executionId: string, reason?: string) => {
    const response = await mcpActionAPI.respondToRequest(executionId, false, reason);
    setRequests((prev) => prev.filter((r) => r.executionId !== executionId));
    return response;
  }, []);

  useEffect(() => {
    fetchRequests();

    const interval = setInterval(fetchRequests, pollInterval);
    return () => clearInterval(interval);
  }, [fetchRequests, pollInterval]);

  return {
    requests,
    hasPending: requests.length > 0,
    pendingCount: requests.length,
    isLoading,
    approve,
    deny,
    refresh: fetchRequests,
  };
}
