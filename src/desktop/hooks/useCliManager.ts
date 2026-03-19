import { useState, useCallback } from 'react';
import { tauriBridge } from '../api/tauri-bridge';

interface CliManagerState {
  cliPath: string | null;
  downloading: boolean;
  error: string | null;
}

export function useCliManager() {
  const [state, setState] = useState<CliManagerState>({
    cliPath: null,
    downloading: false,
    error: null,
  });

  const detect = useCallback(async () => {
    setState((s) => ({ ...s, error: null }));
    try {
      const path = await tauriBridge.detectCli();
      setState((s) => ({ ...s, cliPath: path }));
      return path;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, error: msg }));
      return null;
    }
  }, []);

  const download = useCallback(async () => {
    setState((s) => ({ ...s, downloading: true, error: null }));
    try {
      const path = await tauriBridge.downloadCli();
      setState((s) => ({ ...s, cliPath: path, downloading: false }));
      return path;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, downloading: false, error: msg }));
      return null;
    }
  }, []);

  return {
    cliPath: state.cliPath,
    downloading: state.downloading,
    error: state.error,
    detect,
    download,
  };
}
