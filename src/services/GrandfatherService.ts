import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBootValue } from './StorageBootstrap';

export const PRO_PAYWALL_FIRST_BUILD = 9;

export const GRANDFATHERED_KEY = '@gitnotes:pro_grandfathered';
export const GRANDFATHER_CHECKED_KEY = '@gitnotes:grandfather_checked';
export const FIRST_SEEN_BUILD_KEY = '@gitnotes:first_seen_build';
export const RESTORE_GRANTED_KEY = '@gitnotes:restore_granted';

export type GrandfatherReason = 'flag' | 'onboarding' | 'ios-build' | 'android-build' | 'restore-granted' | 'none' | 'checked';

export interface GrandfatherResult {
  isGrandfathered: boolean;
  reason: GrandfatherReason;
}

export interface GrandfatherCustomerInfo {
  originalApplicationVersion?: string | null;
}

async function getStoredValue(key: string): Promise<string | null> {
  const bootValue = getBootValue(key as never);
  if (bootValue !== undefined) return bootValue;
  return AsyncStorage.getItem(key);
}

async function markGrandfathered(): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(GRANDFATHERED_KEY, 'true'),
    AsyncStorage.setItem(GRANDFATHER_CHECKED_KEY, 'true'),
  ]);
}

export async function getAndroidFirstSeenBuild(): Promise<string | null> {
  return getStoredValue(FIRST_SEEN_BUILD_KEY);
}

export async function setAndroidFirstSeenBuild(build: string): Promise<void> {
  const existing = await getStoredValue(FIRST_SEEN_BUILD_KEY);
  if (existing === null) {
    await AsyncStorage.setItem(FIRST_SEEN_BUILD_KEY, build);
  }
}

export async function resolveGrandfatherStatus(
  customerInfo: GrandfatherCustomerInfo | null,
): Promise<GrandfatherResult> {
  const flag = await getStoredValue(GRANDFATHERED_KEY);
  if (flag === 'true') return { isGrandfathered: true, reason: 'flag' };

  const checked = await getStoredValue(GRANDFATHER_CHECKED_KEY);
  if (checked === 'true') return { isGrandfathered: false, reason: 'checked' };

  if (customerInfo === null) {
    const restored = await getStoredValue(RESTORE_GRANTED_KEY);
    if (restored === 'true') return { isGrandfathered: true, reason: 'restore-granted' };
  }

  // iOS: originalApplicationVersion is CFBundleVersion at time of original purchase.
  // Only treat as build number if it is a pure integer to avoid bypass
  // (parseInt('1.0.0') = 1 < 9 would incorrectly grant Pro).
  const iosVersion = customerInfo?.originalApplicationVersion;
  if (iosVersion != null) {
    const isPureBuildNumber = /^\d+$/.test(iosVersion);
    const parsed = isPureBuildNumber ? Number.parseInt(iosVersion, 10) : NaN;
    if (Number.isFinite(parsed) && parsed < PRO_PAYWALL_FIRST_BUILD) {
      await markGrandfathered();
      return { isGrandfathered: true, reason: 'ios-build' };
    }
  }

  // Android: check the locally stored first-seen build number.
  const androidBuild = await getStoredValue(FIRST_SEEN_BUILD_KEY);
  if (androidBuild != null) {
    const isPureBuildNumber = /^\d+$/.test(androidBuild);
    const parsed = isPureBuildNumber ? Number.parseInt(androidBuild, 10) : NaN;
    if (Number.isFinite(parsed) && parsed < PRO_PAYWALL_FIRST_BUILD) {
      await markGrandfathered();
      return { isGrandfathered: true, reason: 'android-build' };
    }
  }

  await AsyncStorage.setItem(GRANDFATHER_CHECKED_KEY, 'true');
  return { isGrandfathered: false, reason: 'none' };
}
