import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBootValue } from './StorageBootstrap';
import { OnboardingService } from './OnboardingService';

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

  // SECURITY: onboarding alone must never grant — that is a paywall bypass.
  // Grandfather requires the persisted flag OR a pre-paywall iOS install.
  const onboarded = await OnboardingService.isOnboardingCompleted();
  const originalVersion = customerInfo?.originalApplicationVersion;
  if (onboarded && originalVersion != null) {
    const parsed = Number.parseInt(originalVersion, 10);
    if (Number.isFinite(parsed) && parsed < PRO_PAYWALL_FIRST_BUILD) {
      await markGrandfathered();
      return { isGrandfathered: true, reason: 'ios-build' };
    }
  }

  await AsyncStorage.setItem(GRANDFATHER_CHECKED_KEY, 'true');
  return { isGrandfathered: false, reason: 'none' };
}
