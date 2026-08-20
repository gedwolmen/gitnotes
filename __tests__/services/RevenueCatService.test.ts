jest.mock('react-native-purchases', () => {
  const Purchases = {
    setLogLevel: jest.fn(),
    configure: jest.fn(async () => undefined),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(async () => ({ customerInfo: { id: 'ci-purchased' } })),
    restorePurchases: jest.fn(async () => ({ id: 'ci-restored' })),
    getCustomerInfo: jest.fn(async () => ({ id: 'ci-customer' })),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
    trackCustomPaywallImpression: jest.fn(async () => undefined),
    LOG_LEVEL: { WARN: 'WARN', DEBUG: 'DEBUG', VERBOSE: 'VERBOSE' },
    INTRO_ELIGIBILITY_STATUS: {
      INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
      INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
      INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
      INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
    },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
  };
  return {
    __esModule: true,
    default: Purchases,
    STOREKIT_VERSION: { STOREKIT_1: 'STOREKIT_1', STOREKIT_2: 'STOREKIT_2' },
  };
});

import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  configureRevenueCat,
  getPackages,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  onCustomerInfoUpdate,
  isTrialEligible,
  getIntroEligibilities,
  trackPaywallImpression,
} from '../../src/services/RevenueCatService';

const PurchasesMock = Purchases as unknown as {
  configure: jest.Mock;
  getOfferings: jest.Mock;
  purchasePackage: jest.Mock;
  restorePurchases: jest.Mock;
  checkTrialOrIntroductoryPriceEligibility: jest.Mock;
  addCustomerInfoUpdateListener: jest.Mock;
  removeCustomerInfoUpdateListener: jest.Mock;
  trackCustomPaywallImpression: jest.Mock;
};

const pkg = (identifier: string) => ({ identifier } as PurchasesPackage);
const offerings = (monthly?: boolean, lifetime?: boolean, yearly?: boolean) => ({
  current: {
    availablePackages: [
      ...(monthly ? [pkg('monthly')] : []),
      ...(yearly ? [pkg('yearly')] : []),
      ...(lifetime ? [pkg('lifetime')] : []),
    ],
  },
});

const IOS_KEY = 'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS';
const ANDROID_KEY = 'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env[IOS_KEY];
  delete process.env[ANDROID_KEY];
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env[IOS_KEY];
  delete process.env[ANDROID_KEY];
});

describe('configureRevenueCat', () => {
  it('configures with the iOS key on iOS using StoreKit 2', async () => {
    process.env[IOS_KEY] = 'appl_live_key';
    jest.replaceProperty(Platform, 'OS', 'ios');
    const result = await configureRevenueCat();
    expect(result).toEqual({ configured: true });
    expect(PurchasesMock.configure).toHaveBeenCalledWith({
      apiKey: 'appl_live_key',
      storeKitVersion: 'STOREKIT_2',
    });
  });

  it('configures with the Android key on Android without a storeKit version', async () => {
    process.env[ANDROID_KEY] = 'goog_live_key';
    jest.replaceProperty(Platform, 'OS', 'android');
    const result = await configureRevenueCat();
    expect(result).toEqual({ configured: true });
    expect(PurchasesMock.configure).toHaveBeenCalledWith({ apiKey: 'goog_live_key' });
  });

  it('does not configure when the key is a placeholder', async () => {
    process.env[IOS_KEY] = 'appl_<PLACEHOLDER>';
    jest.replaceProperty(Platform, 'OS', 'ios');
    const result = await configureRevenueCat();
    expect(result).toEqual({ configured: false });
    expect(PurchasesMock.configure).not.toHaveBeenCalled();
  });

  it('does not configure when the key is missing', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const result = await configureRevenueCat();
    expect(result).toEqual({ configured: false });
    expect(PurchasesMock.configure).not.toHaveBeenCalled();
  });
});

describe('getPackages', () => {
  it('returns monthly and lifetime packages from the current offering', async () => {
    PurchasesMock.getOfferings.mockResolvedValue(offerings(true, true));
    const result = await getPackages();
    expect(result).not.toBeNull();
    expect(result?.monthly.identifier).toBe('monthly');
    expect(result?.lifetime.identifier).toBe('lifetime');
  });

  it('returns null when there is no current offering', async () => {
    PurchasesMock.getOfferings.mockResolvedValue({ current: null });
    expect(await getPackages()).toBeNull();
  });

  it('returns null when the monthly package is missing', async () => {
    PurchasesMock.getOfferings.mockResolvedValue(offerings(false, true));
    expect(await getPackages()).toBeNull();
  });

  it('includes the yearly package when the offering has one', async () => {
    PurchasesMock.getOfferings.mockResolvedValue(offerings(true, true, true));
    const result = await getPackages();
    expect(result?.yearly?.identifier).toBe('yearly');
  });

  it('omits the yearly and lifetime packages when the offering lacks them', async () => {
    PurchasesMock.getOfferings.mockResolvedValue(offerings(true, false, false));
    const result = await getPackages();
    expect(result?.yearly).toBeUndefined();
    expect(result?.lifetime).toBeUndefined();
    expect(result?.monthly.identifier).toBe('monthly');
  });

  it('includes the lifetime package when the offering has one', async () => {
    PurchasesMock.getOfferings.mockResolvedValue(offerings(true, true, true));
    const result = await getPackages();
    expect(result?.lifetime?.identifier).toBe('lifetime');
  });

  it('matches RevenueCat default package identifiers ($rc_monthly, $rc_annual, $rc_lifetime)', async () => {
    PurchasesMock.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          pkg('$rc_monthly'),
          pkg('$rc_annual'),
          pkg('$rc_lifetime'),
        ],
      },
    });
    const result = await getPackages();
    expect(result?.monthly.identifier).toBe('$rc_monthly');
    expect(result?.yearly?.identifier).toBe('$rc_annual');
    expect(result?.lifetime.identifier).toBe('$rc_lifetime');
  });

  it('resolves packages via the offering duration shortcuts when identifiers drift', async () => {
    const driftedMonthly = pkg('old_monthly_v1');
    const driftedYearly = pkg('legacy_year');
    PurchasesMock.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [driftedYearly, driftedMonthly],
        monthly: driftedMonthly,
        annual: driftedYearly,
        lifetime: null,
      },
    });
    const result = await getPackages();
    expect(result?.monthly).toBe(driftedMonthly);
    expect(result?.yearly).toBe(driftedYearly);
    expect(result?.lifetime).toBeUndefined();
  });

  it('falls back to the first available package when identifiers drift and shortcuts are absent', async () => {
    const drifted = pkg('custom_plan_v2');
    PurchasesMock.getOfferings.mockResolvedValue({
      current: { availablePackages: [drifted] },
    });
    const result = await getPackages();
    expect(result?.monthly).toBe(drifted);
    expect(result?.yearly).toBeUndefined();
    expect(result?.lifetime).toBeUndefined();
  });

  it('returns null when the offering has no available packages', async () => {
    PurchasesMock.getOfferings.mockResolvedValue({
      current: { availablePackages: [] },
    });
    expect(await getPackages()).toBeNull();
  });
});

describe('purchasePackage', () => {
  it('resolves purchased with customerInfo on success', async () => {
    const result = await purchasePackage(pkg('monthly'));
    expect(result.kind).toBe('purchased');
    if (result.kind === 'purchased') expect(result.customerInfo.id).toBe('ci-purchased');
    expect(PurchasesMock.purchasePackage).toHaveBeenCalledWith(pkg('monthly'));
  });

  it('resolves cancelled when the user cancels', async () => {
    PurchasesMock.purchasePackage.mockRejectedValue({ userCancelled: true, code: 'PURCHASE_CANCELLED_ERROR' });
    expect(await purchasePackage(pkg('monthly'))).toEqual({ kind: 'cancelled' });
  });

  it('resolves error with a message on failure', async () => {
    PurchasesMock.purchasePackage.mockRejectedValue(new Error('Store unavailable'));
    expect(await purchasePackage(pkg('monthly'))).toEqual({ kind: 'error', message: 'Store unavailable' });
  });
});

describe('restorePurchases', () => {
  it('resolves purchased on success', async () => {
    const result = await restorePurchases();
    expect(result.kind).toBe('purchased');
    if (result.kind === 'purchased') expect(result.customerInfo.id).toBe('ci-restored');
  });

  it('resolves cancelled when the user cancels', async () => {
    PurchasesMock.restorePurchases.mockRejectedValue({ userCancelled: true });
    expect(await restorePurchases()).toEqual({ kind: 'cancelled' });
  });
});

describe('getCustomerInfo / listener', () => {
  it('delegates to Purchases.getCustomerInfo', async () => {
    const info = await getCustomerInfo();
    expect(info.id).toBe('ci-customer');
  });

  it('registers and unregisters the customer info listener', () => {
    const cb = jest.fn();
    const unsubscribe = onCustomerInfoUpdate(cb);
    expect(PurchasesMock.addCustomerInfoUpdateListener).toHaveBeenCalledWith(cb);
    unsubscribe();
    expect(PurchasesMock.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(cb);
  });
});

describe('isTrialEligible', () => {
  it('returns true when iOS eligibility is ELIGIBLE', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      monthly: { status: 2 },
    });
    expect(await isTrialEligible('monthly')).toBe(true);
  });

  it('returns false when iOS eligibility is INELIGIBLE', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      monthly: { status: 1 },
    });
    expect(await isTrialEligible('monthly')).toBe(false);
  });

});

describe('getIntroEligibilities', () => {
  it('maps ELIGIBLE status to true on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      monthly: { status: 2 },
    });
    await expect(getIntroEligibilities(['monthly'])).resolves.toEqual({ monthly: true });
    expect(PurchasesMock.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith(['monthly']);
  });

  it('maps INELIGIBLE and UNKNOWN statuses to false on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      monthly: { status: 1 },
      yearly: { status: 0 },
    });
    await expect(getIntroEligibilities(['monthly', 'yearly'])).resolves.toEqual({
      monthly: false,
      yearly: false,
    });
  });

  it('defaults product ids missing from the SDK response to false on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      monthly: { status: 2 },
    });
    await expect(getIntroEligibilities(['monthly', 'lifetime'])).resolves.toEqual({
      monthly: true,
      lifetime: false,
    });
  });

  it('returns all-false when the SDK rejects on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    PurchasesMock.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error('SDK unavailable'));
    await expect(getIntroEligibilities(['monthly', 'yearly'])).resolves.toEqual({
      monthly: false,
      yearly: false,
    });
  });

  it('returns all-false on Android without calling the iOS-only API', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(getIntroEligibilities(['monthly', 'yearly'])).resolves.toEqual({
      monthly: false,
      yearly: false,
    });
    expect(PurchasesMock.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();
  });
});

describe('trackPaywallImpression', () => {
  const offering = { identifier: 'standard' } as unknown as PurchasesOffering;

  it('calls the SDK with {offering} when offering given, undefined otherwise', async () => {
    process.env[IOS_KEY] = 'appl_live_key';
    jest.replaceProperty(Platform, 'OS', 'ios');
    await configureRevenueCat();

    await trackPaywallImpression(offering);
    expect(PurchasesMock.trackCustomPaywallImpression).toHaveBeenCalledWith({ offering });

    await trackPaywallImpression();
    expect(PurchasesMock.trackCustomPaywallImpression).toHaveBeenCalledWith(undefined);
  });

  it('no-ops silently when configureRevenueCat never ran', async () => {
    let freshService!: typeof import('../../src/services/RevenueCatService');
    let freshPurchases!: { trackCustomPaywallImpression: jest.Mock };
    jest.isolateModules(() => {
      freshService = require('../../src/services/RevenueCatService');
      freshPurchases = (
        require('react-native-purchases') as { default: { trackCustomPaywallImpression: jest.Mock } }
      ).default;
    });

    await expect(freshService.trackPaywallImpression(undefined)).resolves.toBeUndefined();
    expect(freshPurchases.trackCustomPaywallImpression).not.toHaveBeenCalled();
  });
});
