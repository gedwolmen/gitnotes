import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startBackgroundSync, stopBackgroundSync } from '../services/BackgroundSyncService';

const SETTINGS_KEY = '@gitnotes:background_sync_enabled';

export function useBackgroundSync() {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      const enabled = raw === 'true';
      if (cancelled) return;
      setIsEnabled(enabled);
      if (enabled) {
        await startBackgroundSync();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !isEnabled;
    setIsEnabled(next);
    await AsyncStorage.setItem(SETTINGS_KEY, String(next));
    if (next) {
      await startBackgroundSync();
    } else {
      await stopBackgroundSync();
    }
  }, [isEnabled]);

  return { isEnabled, toggle };
}
