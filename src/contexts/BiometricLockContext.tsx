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

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'unknown';

interface BiometricLockContextType {
  isLockEnabled: boolean;
  /**
   * Toggles the lock setting after a successful biometric prompt. Resolves
   * `true` when persisted, `false` when the user cancelled or auth failed.
   * Required for both enable and disable so the setting can't be flipped
   * by anyone with a briefly-unlocked device. (#544)
   */
  setIsLockEnabled: (v: boolean) => Promise<boolean>;
  lockTimeout: LockTimeout;
  setLockTimeout: (v: LockTimeout) => void;
  isLocked: boolean;
  isBiometricAvailable: boolean;
  /** Detected biometric kind so UI can pick the right icon + copy. */
  biometricKind: BiometricKind;
  /** "Face ID" / "Touch ID" / "Biometrics" — for prompt + label text. */
  biometricLabel: string;
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
  const [supportedAuthTypes, setSupportedAuthTypes] = useState<
    LocalAuthentication.AuthenticationType[]
  >([]);
  const backgroundTimeRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricAvailable(compatible && enrolled);
      if (compatible) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        setSupportedAuthTypes(types);
      }
    })();
  }, []);

  const biometricKind = useMemo<BiometricKind>(() => {
    if (
      supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ) {
      return 'face';
    }
    if (supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'fingerprint';
    }
    if (supportedAuthTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'iris';
    }
    return 'unknown';
  }, [supportedAuthTypes]);

  const biometricLabel = useMemo(() => {
    if (biometricKind === 'face') return 'Face ID';
    if (biometricKind === 'fingerprint') return 'Touch ID';
    if (biometricKind === 'iris') return 'Iris';
    return 'Biometrics';
  }, [biometricKind]);

  useEffect(() => {
    (async () => {
      const result = await AsyncStorage.getMany([
        STORAGE_KEY_ENABLED,
        STORAGE_KEY_TIMEOUT,
      ]);
      const enabled = result[STORAGE_KEY_ENABLED] === 'true';
      const timeout = result[STORAGE_KEY_TIMEOUT] ? (Number(result[STORAGE_KEY_TIMEOUT]) as LockTimeout) : 300_000;
      setIsLockEnabledState(enabled);
      setLockTimeoutState(timeout);
      if (enabled) {
        setIsLocked(true);
      }
      isInitializedRef.current = true;
    })();
  }, []);

  const setIsLockEnabled = useCallback(
    async (v: boolean): Promise<boolean> => {
      // #544: require biometric auth before flipping the setting in either
      // direction so anyone with a briefly-unlocked device can't bypass the
      // lock by toggling it off.
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: v
            ? `Enable ${biometricLabel} lock`
            : `Disable ${biometricLabel} lock`,
          fallbackLabel: 'Use passcode',
          cancelLabel: 'Cancel',
        });
        if (!result.success) return false;
      } catch {
        return false;
      }
      setIsLockEnabledState(v);
      await AsyncStorage.setItem(STORAGE_KEY_ENABLED, String(v));
      if (!v) setIsLocked(false);
      return true;
    },
    [biometricLabel],
  );

  const setLockTimeout = useCallback(async (v: LockTimeout) => {
    setLockTimeoutState(v);
    await AsyncStorage.setItem(STORAGE_KEY_TIMEOUT, String(v));
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Unlock GitNotēs with ${biometricLabel}`,
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
  }, [biometricLabel]);

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
      biometricKind,
      biometricLabel,
      authenticate,
    }),
    [
      isLockEnabled,
      setIsLockEnabled,
      lockTimeout,
      setLockTimeout,
      isLocked,
      isBiometricAvailable,
      biometricKind,
      biometricLabel,
      authenticate,
    ],
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
