import { useState, useCallback } from 'react';
import { tauriBridge } from '../api/tauri-bridge';

interface ServerState {
  running: boolean;
  port: number | null;
  starting: boolean;
}

export function useServerStatus() {
  const [state, setState] = useState<ServerState>({
    running: false,
    port: null,
    starting: false,
  });

  const checkHealth = useCallback(async () => {
    try {
      const running = await tauriBridge.healthCheck();
      const port = running ? await tauriBridge.getServerPort() : null;
      setState({ running, port, starting: false });
      return running;
    } catch {
      setState((s) => ({ ...s, running: false, port: null }));
      return false;
    }
  }, []);

  const start = useCallback(async (cliPath: string, projectDir?: string) => {
    setState((s) => ({ ...s, starting: true }));
    try {
      const port = await tauriBridge.startServer(cliPath, projectDir);
      setState({ running: true, port, starting: false });
      return port;
    } catch (err) {
      setState((s) => ({ ...s, starting: false }));
      throw err;
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await tauriBridge.stopServer();
      setState({ running: false, port: null, starting: false });
    } catch (err) {
      // Re-check actual state
      await checkHealth();
      throw err;
    }
  }, [checkHealth]);

  return {
    running: state.running,
    port: state.port,
    starting: state.starting,
    start,
    stop,
    checkHealth,
  };
}
