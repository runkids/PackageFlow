import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

// Set to true to preview the update dialog (for testing only)
const DEBUG_SHOW_DIALOG = false;

export function useUpdater() {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkForUpdates = async () => {
      setChecking(true);
      setError(null);

      try {
        // Debug mode: show dialog without checking for updates
        if (DEBUG_SHOW_DIALOG) {
          const confirmed = await ask(
            `A new version (vX.X.X) is available!\n\nWould you like to download and install it now?`,
            {
              title: 'Update Available',
              kind: 'info',
              okLabel: 'Update',
              cancelLabel: 'Later',
            }
          );
          console.log('User chose:', confirmed ? 'Update' : 'Later');
          setChecking(false);
          return;
        }

        const update = await check();

        if (update) {
          const confirmed = await ask(
            `A new version (${update.version}) is available!\n\nWould you like to download and install it now?`,
            {
              title: 'Update Available',
              kind: 'info',
              okLabel: 'Update',
              cancelLabel: 'Later',
            }
          );

          if (confirmed) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setChecking(false);
      }
    };

    // Check for updates on app start (with a small delay)
    const timer = setTimeout(checkForUpdates, 3000);

    return () => clearTimeout(timer);
  }, []);

  return { checking, error };
}
