jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
      __dump: () => ({ ...store }),
    },
  };
});

jest.mock('../../src/services/RevenueCatService', () => ({
  configureRevenueCat: jest.fn(async () => ({ configured: true })),
  getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
  getPackages: jest.fn(async () => ({
    monthly: { identifier: 'monthly', product: { identifier: 'monthly-product', priceString: '$2.99' } },
    yearly: { identifier: 'yearly', product: { identifier: 'yearly-product', priceString: '$19.99' } },
    lifetime: { identifier: 'lifetime', product: { identifier: 'lifetime-product', priceString: '$40.00' } },
    offerings: { current: null },
  })),
  purchasePackage: jest.fn(async () => ({
    kind: 'purchased',
    customerInfo: { entitlements: { active: { 'GitNotēs Pro': { isActive: true, periodType: 'NORMAL' } } } },
  })),
  restorePurchases: jest.fn(async () => ({
    kind: 'purchased',
    customerInfo: { entitlements: { active: {} } },
  })),
  onCustomerInfoUpdate: jest.fn(() => () => {}),
}));

jest.mock('../../src/services/GrandfatherService', () => ({
  resolveGrandfatherStatus: jest.fn(async () => ({ isGrandfathered: false, reason: 'none' })),
}));

jest.mock('../../src/services/PaywallAnalytics', () => ({
  trackPaywallOpen: jest.fn(),
  trackPaywallClose: jest.fn(),
  trackCtaTap: jest.fn(),
  trackPurchaseAttempt: jest.fn(),
  trackPurchaseOutcome: jest.fn(),
  trackRestoreTap: jest.fn(),
  trackRestoreOutcome: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  configureRevenueCat,
  getCustomerInfo,
  getPackages,
  purchasePackage,
  restorePurchases,
  onCustomerInfoUpdate,
} from '../../src/services/RevenueCatService';
import { resolveGrandfatherStatus } from '../../src/services/GrandfatherService';
import {
  trackPurchaseAttempt,
  trackPurchaseOutcome,
  trackRestoreTap,
  trackRestoreOutcome,
} from '../../src/services/PaywallAnalytics';

const { useProStore, selectIsPro } = jest.requireActual('../../src/stores/proStore');

const store = AsyncStorage as unknown as { __reset: () => void; __dump: () => Record<string, string> };

const configureMock = configureRevenueCat as jest.Mock;
const customerInfoMock = getCustomerInfo as jest.Mock;
const packagesMock = getPackages as jest.Mock;
const purchaseMock = purchasePackage as jest.Mock;
const restoreMock = restorePurchases as jest.Mock;
const grandfatherMock = resolveGrandfatherStatus as jest.Mock;
const listenerMock = onCustomerInfoUpdate as jest.Mock;
const attemptSpy = trackPurchaseAttempt as jest.Mock;
const outcomeSpy = trackPurchaseOutcome as jest.Mock;
const restoreTapSpy = trackRestoreTap as jest.Mock;
const restoreOutcomeSpy = trackRestoreOutcome as jest.Mock;

const proCustomer = (periodType = 'NORMAL') => ({
  entitlements: { active: { 'GitNotēs Pro': { isActive: true, periodType, expiresDate: null } } },
});
const freeCustomer = { entitlements: { active: {} } };

const NOW = 1_700_000_000_000;

function resetStoreState(): void {
  useProStore.setState({
    status: 'loading',
    entitlementActive: false,
    isGrandfathered: false,
    trialActive: false,
    trialEndsAt: null,
    entitlementExpiresAt: null,
    offeringsReady: false,
    monthlyPackage: null,
    yearlyPackage: null,
    lifetimePackage: null,
    currentOffering: null,
    isPurchasing: false,
    isRestoring: false,
    error: null,
    interstitialEligible: false,
    configured: false,
  });
}

beforeEach(() => {
  store.__reset();
  jest.clearAllMocks();
  resetStoreState();
  configureMock.mockResolvedValue({ configured: true });
  customerInfoMock.mockResolvedValue(freeCustomer);
  packagesMock.mockResolvedValue({
    monthly: { identifier: 'monthly', product: { identifier: 'm', priceString: '$2.99' } },
    yearly: { identifier: 'yearly', product: { identifier: 'y', priceString: '$19.99' } },
    lifetime: { identifier: 'lifetime', product: { identifier: 'l', priceString: '$40.00' } },
    offerings: { current: null },
  });
  purchaseMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
  // Default restore fixture: nothing to restore (empty active entitlements).
  restoreMock.mockResolvedValue({ kind: 'purchased', customerInfo: freeCustomer });
  grandfatherMock.mockResolvedValue({ isGrandfathered: false, reason: 'none' });
  listenerMock.mockImplementation(() => () => {});
});

describe('proStore selectIsPro', () => {
  it('is true when the entitlement is active', () => {
    expect(selectIsPro({ entitlementActive: true, isGrandfathered: false } as never)).toBe(true);
  });

  it('is true when the user is grandfathered', () => {
    expect(selectIsPro({ entitlementActive: false, isGrandfathered: true } as never)).toBe(true);
  });

  it('is false otherwise', () => {
    expect(selectIsPro({ entitlementActive: false, isGrandfathered: false } as never)).toBe(false);
  });
});

describe('initialize', () => {
  it('marks pro when the entitlement is active', async () => {
    customerInfoMock.mockResolvedValue(proCustomer());
    await useProStore.getState().initialize();
    const s = useProStore.getState();
    expect(s.status).toBe('pro');
    expect(s.entitlementActive).toBe(true);
    expect(s.isGrandfathered).toBe(false);
  });

  it('marks pro when grandfathered without any entitlement', async () => {
    grandfatherMock.mockResolvedValue({ isGrandfathered: true, reason: 'onboarding' });
    await useProStore.getState().initialize();
    const s = useProStore.getState();
    expect(s.status).toBe('pro');
    expect(s.isGrandfathered).toBe(true);
  });

  it('marks free when neither entitlement nor grandfather applies', async () => {
    await useProStore.getState().initialize();
    expect(useProStore.getState().status).toBe('free');
  });

  it('registers a customer info update listener when configured', async () => {
    await useProStore.getState().initialize();
    expect(listenerMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it('still evaluates grandfathering when configure is not available', async () => {
    configureMock.mockResolvedValue({ configured: false });
    grandfatherMock.mockResolvedValue({ isGrandfathered: true, reason: 'onboarding' });
    await useProStore.getState().initialize();
    expect(useProStore.getState().status).toBe('pro');
    expect(listenerMock).not.toHaveBeenCalled();
  });
});

describe('trial + interstitial state machine', () => {
  it('sets trialActive when the entitlement periodType is TRIAL', async () => {
    customerInfoMock.mockResolvedValue({
      entitlements: {
        active: {
          'GitNotēs Pro': { isActive: true, periodType: 'TRIAL', expiresDate: new Date(NOW + 86400000).toISOString() },
        },
      },
    });
    await useProStore.getState().initialize();
    const s = useProStore.getState();
    expect(s.trialActive).toBe(true);
    expect(s.trialEndsAt).toBe(NOW + 86400000);
    expect(store.__dump()['@gitnotes:trial_was_active']).toBe('true');
  });

  it('records trial expiry and becomes interstitial-eligible after 3 days', async () => {
    jest.useFakeTimers({ now: NOW });
    customerInfoMock.mockResolvedValue(proCustomer('TRIAL'));
    await useProStore.getState().initialize();
    expect(store.__dump()['@gitnotes:trial_was_active']).toBe('true');

    customerInfoMock.mockResolvedValue(freeCustomer);
    jest.setSystemTime(NOW + 2 * 86400000);
    await useProStore.getState().refresh();
    expect(store.__dump()['@gitnotes:trial_expired_at']).toBe(String(NOW + 2 * 86400000));
    expect(useProStore.getState().interstitialEligible).toBe(false);

    jest.setSystemTime(NOW + 2 * 86400000 + 3 * 86400000 + 1000);
    await useProStore.getState().refresh();
    expect(useProStore.getState().interstitialEligible).toBe(true);

    await useProStore.getState().markInterstitialShown();
    expect(useProStore.getState().interstitialEligible).toBe(false);
    expect(store.__dump()['@gitnotes:interstitial_offer_shown']).toBe('true');
    jest.useRealTimers();
  });

  it('never becomes interstitial-eligible for a user who never had a trial', async () => {
    jest.useFakeTimers({ now: NOW });
    await useProStore.getState().initialize();
    jest.setSystemTime(NOW + 30 * 86400000);
    await useProStore.getState().refresh();
    expect(useProStore.getState().interstitialEligible).toBe(false);
    jest.useRealTimers();
  });

  it('never becomes interstitial-eligible for a grandfathered user', async () => {
    jest.useFakeTimers({ now: NOW });
    customerInfoMock.mockResolvedValue(proCustomer('TRIAL'));
    await useProStore.getState().initialize();
    grandfatherMock.mockResolvedValue({ isGrandfathered: true, reason: 'flag' });
    jest.setSystemTime(NOW + 30 * 86400000);
    await useProStore.getState().refresh();
    expect(useProStore.getState().interstitialEligible).toBe(false);
    jest.useRealTimers();
  });
});

describe('purchases', () => {
  it('purchaseMonthly purchases the monthly package and refreshes to pro', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    purchaseMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
    customerInfoMock.mockResolvedValue(proCustomer());
    await useProStore.getState().purchaseMonthly();
    expect(purchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'monthly' }),
    );
    expect(useProStore.getState().status).toBe('pro');
  });

  it('purchaseLifetime purchases the lifetime package', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    await useProStore.getState().purchaseLifetime();
    expect(purchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'lifetime' }),
    );
  });

  it('purchaseYearly purchases the yearly package and refreshes to pro', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    expect(useProStore.getState().yearlyPackage?.identifier).toBe('yearly');
    purchaseMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
    customerInfoMock.mockResolvedValue(proCustomer());
    await useProStore.getState().purchaseYearly();
    expect(purchaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'yearly' }),
    );
    expect(useProStore.getState().status).toBe('pro');
  });

  it('clears errors on cancel and keeps status unchanged', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    await useProStore.getState().initialize();
    purchaseMock.mockResolvedValue({ kind: 'cancelled' });
    useProStore.setState({ error: 'old' });
    await useProStore.getState().purchaseMonthly();
    expect(useProStore.getState().error).toBeNull();
    expect(useProStore.getState().status).toBe('free');
    expect(outcomeSpy).toHaveBeenCalledWith('cancelled');
  });

  it('surfaces an error message when the purchase fails', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    purchaseMock.mockResolvedValue({ kind: 'error', message: 'Store unavailable' });
    await useProStore.getState().purchaseMonthly();
    expect(useProStore.getState().error).toBe('Store unavailable');
    expect(outcomeSpy).toHaveBeenCalledWith('error');
  });

  it('does nothing when packages are not loaded', async () => {
    await useProStore.getState().purchaseMonthly();
    expect(purchaseMock).not.toHaveBeenCalled();
  });

  it('tracks purchase attempt before and outcome after the store call', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    await useProStore.getState().purchaseMonthly();
    expect(attemptSpy).toHaveBeenCalledWith('m');
    expect(outcomeSpy).toHaveBeenCalledWith('purchased');
    const attemptAt = attemptSpy.mock.invocationCallOrder[0];
    const purchaseAt = purchaseMock.mock.invocationCallOrder[0];
    const outcomeAt = outcomeSpy.mock.invocationCallOrder[0];
    expect(attemptAt).toBeLessThan(purchaseAt);
    expect(purchaseAt).toBeLessThan(outcomeAt);
  });
});

describe('restore outcomes', () => {
  it('returns nothing and keeps free status when no entitlement is active', async () => {
    await useProStore.getState().initialize();
    expect(useProStore.getState().status).toBe('free');
    const outcome = await useProStore.getState().restore();
    expect(outcome).toBe('nothing');
    expect(useProStore.getState().status).toBe('free');
    expect(useProStore.getState().isRestoring).toBe(false);
  });

  it('returns restored and flips status to pro when the pro entitlement is active', async () => {
    await useProStore.getState().initialize();
    restoreMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
    customerInfoMock.mockResolvedValue(proCustomer());
    const outcome = await useProStore.getState().restore();
    expect(outcome).toBe('restored');
    expect(useProStore.getState().status).toBe('pro');
    expect(restoreOutcomeSpy).toHaveBeenCalledWith('restored');
  });

  it('returns nothing when the restore sheet is cancelled', async () => {
    await useProStore.getState().initialize();
    restoreMock.mockResolvedValue({ kind: 'cancelled' });
    const outcome = await useProStore.getState().restore();
    expect(outcome).toBe('nothing');
    expect(useProStore.getState().status).toBe('free');
    expect(useProStore.getState().error).toBeNull();
  });

  it('returns error and surfaces the message when restore fails', async () => {
    restoreMock.mockResolvedValue({ kind: 'error', message: 'Store unavailable' });
    const outcome = await useProStore.getState().restore();
    expect(outcome).toBe('error');
    expect(useProStore.getState().error).toBe('Store unavailable');
    expect(useProStore.getState().isRestoring).toBe(false);
  });

  it('tracks restore tap before and outcome after the service call', async () => {
    const outcome = await useProStore.getState().restore();
    expect(outcome).toBe('nothing');
    expect(restoreTapSpy).toHaveBeenCalledTimes(1);
    expect(restoreOutcomeSpy).toHaveBeenCalledWith('nothing');
    const tapAt = restoreTapSpy.mock.invocationCallOrder[0];
    const serviceAt = restoreMock.mock.invocationCallOrder[0];
    const outcomeAt = restoreOutcomeSpy.mock.invocationCallOrder[0];
    expect(tapAt).toBeLessThan(serviceAt);
    expect(serviceAt).toBeLessThan(outcomeAt);
  });
});

describe('offerings', () => {
  it('loads monthly and lifetime packages once', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    await useProStore.getState().loadOfferingsIfNeeded();
    expect(packagesMock).toHaveBeenCalledTimes(1);
    expect(useProStore.getState().monthlyPackage?.identifier).toBe('monthly');
    expect(useProStore.getState().lifetimePackage?.identifier).toBe('lifetime');
  });

  it('surfaces an error and resolves the loading state when offerings fail to load', async () => {
    packagesMock.mockRejectedValue(new Error('no offerings'));
    await useProStore.getState().loadOfferingsIfNeeded();
    const s = useProStore.getState();
    expect(s.error).toBe('no offerings');
    expect(s.offeringsReady).toBe(true);
  });

  it('stores the current offering once offerings load', async () => {
    const offering = { identifier: 'default', serverDescription: 'Default' };
    packagesMock.mockResolvedValue({
      monthly: { identifier: 'monthly', product: { identifier: 'm', priceString: '$2.99' } },
      offerings: { current: offering },
    });
    await useProStore.getState().loadOfferingsIfNeeded();
    expect(useProStore.getState().currentOffering).toEqual(offering);
    expect(useProStore.getState().offeringsReady).toBe(true);
  });
});

describe('DEV_FORCE_PRO override', () => {
  // See __tests__/stores/proStore.devForcePro.test.ts
});
