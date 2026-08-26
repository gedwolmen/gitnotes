import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateClonePushTriggersConfig } from '../services/ClonePushTriggers';

const IDLE_ENABLED_KEY = '@gitnotes:clone_push_idle_enabled';
const BACKGROUND_ENABLED_KEY = '@gitnotes:clone_push_background_enabled';

export const DEFAULT_IDLE_ENABLED = true;
export const DEFAULT_BACKGROUND_ENABLED = true;

export function useClonePushSettings() {
  const [idleEnabled, setIdleEnabledState] = useState<boolean>(DEFAULT_IDLE_ENABLED);
  const [backgroundEnabled, setBackgroundEnabledState] = useState<boolean>(DEFAULT_BACKGROUND_ENABLED);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rawIdle, rawBg] = await Promise.all([
        AsyncStorage.getItem(IDLE_ENABLED_KEY),
        AsyncStorage.getItem(BACKGROUND_ENABLED_KEY),
      ]);
      if (cancelled) return;
      setIdleEnabledState(rawIdle === null ? DEFAULT_IDLE_ENABLED : rawIdle !== 'false');
      setBackgroundEnabledState(rawBg === null ? DEFAULT_BACKGROUND_ENABLED : rawBg !== 'false');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setIdleEnabled = useCallback(async (next: boolean) => {
    setIdleEnabledState(next);
    await AsyncStorage.setItem(IDLE_ENABLED_KEY, String(next));
    updateClonePushTriggersConfig({ idleEnabled: next });
  }, []);

  const setBackgroundEnabled = useCallback(async (next: boolean) => {
    setBackgroundEnabledState(next);
    await AsyncStorage.setItem(BACKGROUND_ENABLED_KEY, String(next));
    updateClonePushTriggersConfig({ backgroundEnabled: next });
  }, []);

  return { idleEnabled, backgroundEnabled, setIdleEnabled, setBackgroundEnabled };
}
