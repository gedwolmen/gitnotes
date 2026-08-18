import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

const IOS_API_KEY_ENV = 'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS';
const ANDROID_API_KEY_ENV = 'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID';

export interface ConfigureResult {
  configured: boolean;
}

export interface Packages {
  monthly: PurchasesPackage;
  lifetime: PurchasesPackage;
  yearly?: PurchasesPackage;
  offerings: PurchasesOfferings;
}

export type PurchaseResult =
  | { kind: 'purchased'; customerInfo: CustomerInfo }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function isPlaceholderKey(apiKey: string | undefined): boolean {
  return !apiKey || apiKey.length === 0 || apiKey.includes('<PLACEHOLDER>');
}

export async function configureRevenueCat(): Promise<ConfigureResult> {
  const apiKey = Platform.OS === 'ios' ? process.env[IOS_API_KEY_ENV] : process.env[ANDROID_API_KEY_ENV];
  if (isPlaceholderKey(apiKey)) {
    return { configured: false };
  }
  Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  await Purchases.configure({ apiKey });
  return { configured: true };
}

export async function getPackages(): Promise<Packages | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  const monthly = current.availablePackages.find((pkg) => pkg.identifier === 'monthly');
  const lifetime = current.availablePackages.find((pkg) => pkg.identifier === 'lifetime');
  if (!monthly || !lifetime) return null;
  const yearly = current.availablePackages.find((pkg) => pkg.identifier === 'yearly');
  return { monthly, lifetime, yearly, offerings };
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

export async function isTrialEligible(productId: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  try {
    const eligibilities = await Purchases.checkTrialOrIntroductoryPriceEligibility([productId]);
    return eligibilities[productId]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
  } catch {
    return false;
  }
}
