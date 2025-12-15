/**
 * Storage Settings Panel
 * Display SQLite database storage location information
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ExternalLink, HardDrive } from 'lucide-react';
import { settingsAPI } from '../../../lib/tauri-api';
import type { StorePathInfo } from '../../../types/tauri';
import { cn } from '../../../lib/utils';

export const StorageSettingsPanel: React.FC = () => {
  const [storePathInfo, setStorePathInfo] = useState<StorePathInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Formatted storage path for display
  const displayPath = useMemo(() => {
    if (!storePathInfo?.currentPath) return null;
    const path = storePathInfo.currentPath;
    const homeMatch = path.match(/^\/Users\/[^/]+/) || path.match(/^\/home\/[^/]+/);
    if (homeMatch) {
      return path.replace(homeMatch[0], '~');
    }
    return path;
  }, [storePathInfo?.currentPath]);

  // Load store path info on mount
  useEffect(() => {
    const loadPathInfo = async () => {
      try {
        setIsLoading(true);
        const info = await settingsAPI.getStorePath();
        setStorePathInfo(info);
      } catch (error) {
        console.error('Failed to load store path info:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPathInfo();
  }, []);

  // Handle open store location in file explorer
  const handleOpenLocation = useCallback(async () => {
    try {
      await settingsAPI.openStoreLocation();
    } catch (error) {
      console.error('Failed to open store location:', error);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Storage
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          View where PackageFlow stores its data
        </p>
      </div>

      {/* Current Path */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Current Storage Location
        </label>

        {isLoading ? (
          <div className="h-12 bg-muted/50 rounded-lg animate-pulse" />
        ) : (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
            <code
              className="flex-1 text-sm text-muted-foreground font-mono truncate"
              title={storePathInfo?.currentPath}
            >
              {displayPath || 'Not set'}
            </code>
            <button
              onClick={handleOpenLocation}
              className={cn(
                'p-2 rounded-md',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-accent transition-colors'
              )}
              title="Open in Finder"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      {/* Info */}
      <div className="p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-foreground mb-2">About Storage</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>- All data is stored in a SQLite database for optimal performance</li>
          <li>- The database location is fixed for WAL mode compatibility</li>
          <li>- Use Export/Import to backup or transfer data between devices</li>
        </ul>
      </div>
    </div>
  );
};
