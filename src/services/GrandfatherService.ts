import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBootValue } from './StorageBootstrap';

export const PRO_PAYWALL_FIRST_BUILD = 9;

export const GRANDFATHERED_KEY = '@gitnotes:pro_grandfathered';
export const GRANDFATHER_CHECKED_KEY = '@gitnotes:grandfather_checked';

export type GrandfatherReason = 'flag' | 'onboarding' | 'ios-build' | 'none' | 'checked';

export interface GrandfatherResult {
  isGrandfathered: boolean;
  reason: GrandfatherReason;
}

export interface GrandfatherCustomerInfo {
  originalApplicationVersion?: string | null;
  firstSeenAppVersion?: string | null;
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

export async function resolveGrandfatherStatus(
  customerInfo: GrandfatherCustomerInfo | null,
): Promise<GrandfatherResult> {
  const flag = await getStoredValue(GRANDFATHERED_KEY);
  if (flag === 'true') return { isGrandfathered: true, reason: 'flag' };

  const checked = await getStoredValue(GRANDFATHER_CHECKED_KEY);
  if (checked === 'true') return { isGrandfathered: false, reason: 'checked' };

  // ios-build path: originalApplicationVersion on iOS, firstSeenAppVersion on Android.
  // Only treat as build number if it is a pure integer — marketing version strings
  // like '1.0.0' must NOT grant free Pro (parseInt('1.0.0') = 1 < 9 would bypass).
  const version =
    customerInfo?.originalApplicationVersion ?? customerInfo?.firstSeenAppVersion;
  if (version != null) {
    const isPureBuildNumber = /^\d+$/.test(version);
    const parsed = isPureBuildNumber ? Number.parseInt(version, 10) : NaN;
    if (Number.isFinite(parsed) && parsed < PRO_PAYWALL_FIRST_BUILD) {
      await markGrandfathered();
      return { isGrandfathered: true, reason: 'ios-build' };
    }
  }

  await AsyncStorage.setItem(GRANDFATHER_CHECKED_KEY, 'true');
  return { isGrandfathered: false, reason: 'none' };
}
