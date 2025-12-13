/**
 * Settings Context
 * Provides app-wide settings like path display format
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { settingsAPI } from '../lib/tauri-api';
import type { AppSettings, PathDisplayFormat } from '../types/tauri';
import { formatPath as formatPathShort } from '../lib/utils';

interface SettingsContextValue {
  // State
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;

  // Path display format
  pathDisplayFormat: PathDisplayFormat;
  setPathDisplayFormat: (format: PathDisplayFormat) => Promise<void>;

  // Helper function
  formatPath: (path: string) => string;

  // Reload settings
  reloadSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: Partial<AppSettings> = {
  pathDisplayFormat: 'short',
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const loaded = await settingsAPI.loadSettings();
      setSettings(loaded);
      setError(null);
    } catch (e) {
      console.error('[SettingsContext] Failed to load settings:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const pathDisplayFormat = useMemo<PathDisplayFormat>(() => {
    return settings?.pathDisplayFormat ?? DEFAULT_SETTINGS.pathDisplayFormat ?? 'short';
  }, [settings?.pathDisplayFormat]);

  const setPathDisplayFormat = useCallback(
    async (format: PathDisplayFormat) => {
      if (!settings) return;

      const newSettings: AppSettings = {
        ...settings,
        pathDisplayFormat: format,
      };

      try {
        await settingsAPI.saveSettings(newSettings);
        setSettings(newSettings);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [settings]
  );

  // Path formatting function that respects the setting
  const formatPath = useCallback(
    (path: string): string => {
      if (pathDisplayFormat === 'full') {
        return path;
      }
      return formatPathShort(path);
    },
    [pathDisplayFormat]
  );

  const value: SettingsContextValue = {
    settings,
    isLoading,
    error,
    pathDisplayFormat,
    setPathDisplayFormat,
    formatPath,
    reloadSettings: loadSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
