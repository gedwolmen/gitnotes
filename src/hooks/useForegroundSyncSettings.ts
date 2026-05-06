import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startForegroundWatcher,
  updateForegroundWatcherConfig,
} from '../services/ForegroundSyncService';

const ENABLED_KEY = '@gitnotes:sync_frequently_enabled';
const INTERVAL_KEY = '@gitnotes:sync_interval_seconds';

export const SYNC_INTERVAL_OPTIONS = [
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
  { value: 900, label: 'Every 15 minutes' },
] as const;

export type SyncIntervalSeconds = (typeof SYNC_INTERVAL_OPTIONS)[number]['value'];

export const DEFAULT_SYNC_FREQUENTLY_ENABLED = true;
export const DEFAULT_SYNC_INTERVAL_SECONDS: SyncIntervalSeconds = 60;

const ALLOWED_INTERVALS = new Set<number>(SYNC_INTERVAL_OPTIONS.map((opt) => opt.value));

function coerceInterval(raw: string | null): SyncIntervalSeconds {
  if (!raw) return DEFAULT_SYNC_INTERVAL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SYNC_INTERVAL_SECONDS;
  if (!ALLOWED_INTERVALS.has(parsed)) return DEFAULT_SYNC_INTERVAL_SECONDS;
  return parsed as SyncIntervalSeconds;
}

export async function loadForegroundSyncConfig(): Promise<{
  syncFrequentlyEnabled: boolean;
  syncIntervalSeconds: SyncIntervalSeconds;
}> {
  const [rawEnabled, rawInterval] = await Promise.all([
    AsyncStorage.getItem(ENABLED_KEY),
    AsyncStorage.getItem(INTERVAL_KEY),
  ]);
  // Default-on for the toggle: only `'false'` opts out. `null` (first launch)
  // and any other value fall through to the default.
  const enabled = rawEnabled === null ? DEFAULT_SYNC_FREQUENTLY_ENABLED : rawEnabled !== 'false';
  return {
    syncFrequentlyEnabled: enabled,
    syncIntervalSeconds: coerceInterval(rawInterval),
  };
}

export function useForegroundSyncSettings() {
  const [syncFrequentlyEnabled, setSyncFrequentlyEnabledState] = useState<boolean>(
    DEFAULT_SYNC_FREQUENTLY_ENABLED,
  );
  const [syncIntervalSeconds, setSyncIntervalSecondsState] = useState<SyncIntervalSeconds>(
    DEFAULT_SYNC_INTERVAL_SECONDS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadForegroundSyncConfig();
      if (cancelled) return;
      setSyncFrequentlyEnabledState(cfg.syncFrequentlyEnabled);
      setSyncIntervalSecondsState(cfg.syncIntervalSeconds);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSyncFrequentlyEnabled = useCallback(
    async (next: boolean) => {
      setSyncFrequentlyEnabledState(next);
      await AsyncStorage.setItem(ENABLED_KEY, String(next));
      updateForegroundWatcherConfig({
        syncFrequentlyEnabled: next,
        syncIntervalSeconds,
      });
    },
    [syncIntervalSeconds],
  );

  const setSyncIntervalSeconds = useCallback(
    async (next: SyncIntervalSeconds) => {
      setSyncIntervalSecondsState(next);
      await AsyncStorage.setItem(INTERVAL_KEY, String(next));
      updateForegroundWatcherConfig({
        syncFrequentlyEnabled,
        syncIntervalSeconds: next,
      });
    },
    [syncFrequentlyEnabled],
  );

  return {
    hydrated,
    syncFrequentlyEnabled,
    syncIntervalSeconds,
    setSyncFrequentlyEnabled,
    setSyncIntervalSeconds,
  };
}

// Re-export for the App-level bootstrapper.
export { startForegroundWatcher };
