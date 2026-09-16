import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startForegroundWatcher,
  updateForegroundWatcherConfig,
} from '../services/ForegroundSyncService';

const PAUSED_KEY = '@gitnotes:foreground_sync_paused';

export const DEFAULT_SYNC_PAUSED = false;

export async function loadForegroundSyncConfig(): Promise<{
  syncPaused: boolean;
}> {
  const [rawPaused] = await Promise.all([
    AsyncStorage.getItem(PAUSED_KEY),
  ]);
  return {
    syncPaused: rawPaused === 'true',
  };
}

export function useForegroundSyncSettings() {
  const [syncPaused, setSyncPausedState] = useState<boolean>(DEFAULT_SYNC_PAUSED);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadForegroundSyncConfig();
      if (cancelled) return;
      setSyncPausedState(cfg.syncPaused);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSyncPaused = useCallback(
    async (next: boolean) => {
      setSyncPausedState(next);
      await AsyncStorage.setItem(PAUSED_KEY, String(next));
      updateForegroundWatcherConfig({
        syncPaused: next,
      });
    },
    [],
  );

  return {
    hydrated,
    syncPaused,
    setSyncPaused,
  };
}

// Re-export for the App-level bootstrapper.
export { startForegroundWatcher };
