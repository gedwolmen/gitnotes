import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const STORAGE_KEY_ENABLED = 'biometric_lock_enabled';
const STORAGE_KEY_TIMEOUT = 'biometric_lock_timeout';

export const TIMEOUT_OPTIONS = [
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: 300_000 },
  { label: '15 minutes', value: 900_000 },
  { label: '30 minutes', value: 1_800_000 },
] as const;

export type LockTimeout = (typeof TIMEOUT_OPTIONS)[number]['value'];

interface BiometricLockContextType {
  isLockEnabled: boolean;
  setIsLockEnabled: (v: boolean) => void;
  lockTimeout: LockTimeout;
  setLockTimeout: (v: LockTimeout) => void;
  isLocked: boolean;
  isBiometricAvailable: boolean;
  authenticate: () => Promise<boolean>;
}

const BiometricLockContext = createContext<BiometricLockContextType | undefined>(undefined);

interface BiometricLockProviderProps {
  children: ReactNode;
}

export function BiometricLockProvider({ children }: BiometricLockProviderProps) {
  const [isLockEnabled, setIsLockEnabledState] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState<LockTimeout>(300_000);
  const [isLocked, setIsLocked] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const backgroundTimeRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(compatible && enrolled);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [enabledStr, timeoutStr] = await AsyncStorage.multiGet([
        STORAGE_KEY_ENABLED,
        STORAGE_KEY_TIMEOUT,
      ]);
      const enabled = enabledStr[1] === 'true';
      const timeout = timeoutStr[1] ? (Number(timeoutStr[1]) as LockTimeout) : 300_000;
      setIsLockEnabledState(enabled);
      setLockTimeoutState(timeout);
      if (enabled) {
        setIsLocked(true);
      }
      isInitializedRef.current = true;
    })();
  }, []);

  const setIsLockEnabled = useCallback(async (v: boolean) => {
    setIsLockEnabledState(v);
    await AsyncStorage.setItem(STORAGE_KEY_ENABLED, String(v));
    if (!v) {
      setIsLocked(false);
    }
  }, []);

  const setLockTimeout = useCallback(async (v: LockTimeout) => {
    setLockTimeoutState(v);
    await AsyncStorage.setItem(STORAGE_KEY_TIMEOUT, String(v));
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock GitNotēs',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (!isLockEnabled || !isInitializedRef.current) return;

      if (nextState === 'background') {
        backgroundTimeRef.current = Date.now();
      } else if (nextState === 'active' && backgroundTimeRef.current !== null) {
        const elapsed = Date.now() - backgroundTimeRef.current;
        backgroundTimeRef.current = null;
        if (elapsed >= lockTimeout) {
          setIsLocked(true);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [isLockEnabled, lockTimeout]);

  const value = useMemo(
    () => ({
      isLockEnabled,
      setIsLockEnabled,
      lockTimeout,
      setLockTimeout,
      isLocked,
      isBiometricAvailable,
      authenticate,
    }),
    [isLockEnabled, setIsLockEnabled, lockTimeout, setLockTimeout, isLocked, isBiometricAvailable, authenticate],
  );

  return (
    <BiometricLockContext.Provider value={value}>
      {children}
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  const context = useContext(BiometricLockContext);
  if (context === undefined) {
    throw new Error('useBiometricLock must be used within a BiometricLockProvider');
  }
  return context;
}
