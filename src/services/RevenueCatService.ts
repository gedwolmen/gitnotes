import { Platform } from 'react-native';
import Purchases, { STOREKIT_VERSION } from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

const IOS_API_KEY_ENV = 'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS';
const ANDROID_API_KEY_ENV = 'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID';

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
  const apiKey = Platform.OS === 'ios' ? process.env[IOS_API_KEY_ENV] : process.env[ANDROID_API_KEY_ENV];
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

export function onCustomerInfoUpdate(cb: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => Purchases.removeCustomerInfoUpdateListener(cb);
}

/** @deprecated removed in the screen rewire (T10) */
export async function isTrialEligible(productId: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  try {
    const eligibilities = await Purchases.checkTrialOrIntroductoryPriceEligibility([productId]);
    return eligibilities[productId]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
  } catch {
    return false;
  }
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
