import { Platform } from 'react-native';
import Purchases, { STOREKIT_VERSION } from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

export interface ConfigureResult {
  configured: boolean;
}

export interface Packages {
  monthly: PurchasesPackage;
  yearly?: PurchasesPackage;
  lifetime?: PurchasesPackage;
  offerings: PurchasesOfferings;
}

export type PurchaseResult =
  | { kind: 'purchased'; customerInfo: CustomerInfo }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function isPlaceholderKey(apiKey: string | undefined): boolean {
  return !apiKey || apiKey.length === 0 || apiKey.includes('<PLACEHOLDER>');
}

let configured = false;

export async function configureRevenueCat(): Promise<ConfigureResult> {
  if (configured) {
    return { configured: true };
  }
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  if (isPlaceholderKey(apiKey)) {
    return { configured: false };
  }
  Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  await Purchases.configure({
    apiKey,
    ...(Platform.OS === 'ios' ? { storeKitVersion: STOREKIT_VERSION.STOREKIT_2 } : {}),
  });
  configured = true;
  return { configured: true };
}

export function isConfigured(): boolean {
  return configured;
}

/** Test-only seam: clear the module-level configured flag (#1162). */
export function __resetConfiguredFlagForTests(): void {
  configured = false;
}

const matchIdentifier =
  (accepted: readonly string[]) => (pkg: PurchasesPackage): boolean =>
    accepted.includes(pkg.identifier);

const findByIdentifier = (offering: PurchasesOffering, accepted: readonly string[]) =>
  offering.availablePackages.find(matchIdentifier(accepted));

export async function getPackages(): Promise<Packages | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  const yearly = findByIdentifier(current, ['yearly', '$rc_annual']) ?? current.annual ?? undefined;
  const lifetime =
    findByIdentifier(current, ['lifetime', '$rc_lifetime', '$rc_one_time']) ??
    current.lifetime ??
    undefined;
  // Last-resort monthly: the first package not already claimed by yearly/lifetime,
  // so a lone lifetime package is never sold as the monthly plan (#935).
  const monthly =
    findByIdentifier(current, ['monthly', '$rc_monthly']) ??
    current.monthly ??
    current.availablePackages.find((pkg) => pkg !== yearly && pkg !== lifetime) ??
    null;
  if (!monthly) return null;
  return { monthly, yearly, lifetime, offerings };
}

async function runPurchase(
  purchase: () => Promise<{ customerInfo: CustomerInfo }>,
): Promise<PurchaseResult> {
  try {
    const result = await purchase();
    return { kind: 'purchased', customerInfo: result.customerInfo };
  } catch (error) {
    const err = error as { userCancelled?: boolean; code?: string; message?: string };
    if (err?.userCancelled === true || err?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: err?.message ?? 'Purchase failed' };
  }
}

export function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  return runPurchase(() => Purchases.purchasePackage(pkg));
}

export async function restorePurchases(): Promise<PurchaseResult> {
  return runPurchase(async () => {
    const info = await Purchases.restorePurchases();
    return { customerInfo: info };
  });
}

export function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * Bind the current (anonymous) RevenueCat identity to a stable app user ID so
 * entitlements carry across devices. Returns the refreshed customer info, or
 * null when not configured or the bind fails (caller falls back to anonymous).
 */
export async function logInAppUser(appUserID: string): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    const result = await Purchases.logIn(appUserID);
    return result.customerInfo;
  } catch {
    return null;
  }
}

/** Detach the current RevenueCat identity back to anonymous. */
export async function logOutAppUser(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // best-effort; leaving the stale identity is harmless
  }
}

export function onCustomerInfoUpdate(cb: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => Purchases.removeCustomerInfoUpdateListener(cb);
}

export async function getIntroEligibilities(productIds: string[]): Promise<Record<string, boolean>> {
  const eligibilities: Record<string, boolean> = Object.fromEntries(productIds.map((id) => [id, false]));
  if (Platform.OS !== 'ios') return eligibilities;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    for (const id of productIds) {
      eligibilities[id] = result[id]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    }
    return eligibilities;
  } catch {
    return eligibilities;
  }
}

export async function trackPaywallImpression(offering?: PurchasesOffering | null): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.trackCustomPaywallImpression(offering ? { offering } : undefined);
  } catch {
    // analytics must never throw into the paywall
  }
}
