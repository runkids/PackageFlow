import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { mcpAPI, type McpServerConfig } from '../lib/tauri-api';

export function useMcpStatus() {
  const [config, setConfig] = useState<McpServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const newConfig = await mcpAPI.getConfig();
      setConfig(newConfig);
    } catch (err) {
      console.error('Failed to fetch MCP config:', err);
      setError('Failed to fetch MCP config');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();

    const unlistenPromise = listen('mcp:database-changed', (event) => {
      console.log('MCP database changed, refetching config:', event.payload);
      fetchConfig();
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [fetchConfig]);

  return { config, isLoading, error, isEnabled: config?.isEnabled ?? false };
}
