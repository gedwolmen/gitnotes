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
    lifetime: { identifier: 'lifetime', product: { identifier: 'lifetime-product', priceString: '$40.00' } },
    offerings: { current: null },
  })),
  purchasePackage: jest.fn(async () => ({
    kind: 'purchased',
    customerInfo: { entitlements: { active: { pro: { isActive: true, periodType: 'NORMAL' } } } },
  })),
  restorePurchases: jest.fn(async () => ({
    kind: 'purchased',
    customerInfo: { entitlements: { active: { pro: { isActive: true, periodType: 'NORMAL' } } } },
  })),
  onCustomerInfoUpdate: jest.fn(() => () => {}),
}));

jest.mock('../../src/services/GrandfatherService', () => ({
  resolveGrandfatherStatus: jest.fn(async () => ({ isGrandfathered: false, reason: 'none' })),
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

const { useProStore, selectIsPro } = jest.requireActual('../../src/stores/proStore');

const store = AsyncStorage as unknown as { __reset: () => void; __dump: () => Record<string, string> };

const configureMock = configureRevenueCat as jest.Mock;
const customerInfoMock = getCustomerInfo as jest.Mock;
const packagesMock = getPackages as jest.Mock;
const purchaseMock = purchasePackage as jest.Mock;
const restoreMock = restorePurchases as jest.Mock;
const grandfatherMock = resolveGrandfatherStatus as jest.Mock;
const listenerMock = onCustomerInfoUpdate as jest.Mock;

const proCustomer = (periodType = 'NORMAL') => ({
  entitlements: { active: { pro: { isActive: true, periodType, expiresDate: null } } },
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
    lifetimePackage: null,
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
    lifetime: { identifier: 'lifetime', product: { identifier: 'l', priceString: '$40.00' } },
    offerings: { current: null },
  });
  purchaseMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
  restoreMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
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
          pro: { isActive: true, periodType: 'TRIAL', expiresDate: new Date(NOW + 86400000).toISOString() },
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

  it('clears errors on cancel and keeps status unchanged', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    await useProStore.getState().initialize();
    purchaseMock.mockResolvedValue({ kind: 'cancelled' });
    useProStore.setState({ error: 'old' });
    await useProStore.getState().purchaseMonthly();
    expect(useProStore.getState().error).toBeNull();
    expect(useProStore.getState().status).toBe('free');
  });

  it('surfaces an error message when the purchase fails', async () => {
    await useProStore.getState().loadOfferingsIfNeeded();
    purchaseMock.mockResolvedValue({ kind: 'error', message: 'Store unavailable' });
    await useProStore.getState().purchaseMonthly();
    expect(useProStore.getState().error).toBe('Store unavailable');
  });

  it('does nothing when packages are not loaded', async () => {
    await useProStore.getState().purchaseMonthly();
    expect(purchaseMock).not.toHaveBeenCalled();
  });

  it('restores purchases and refreshes to pro', async () => {
    restoreMock.mockResolvedValue({ kind: 'purchased', customerInfo: proCustomer() });
    customerInfoMock.mockResolvedValue(proCustomer());
    await useProStore.getState().restore();
    expect(useProStore.getState().status).toBe('pro');
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

  it('surfaces an error when offerings fail to load', async () => {
    packagesMock.mockRejectedValue(new Error('no offerings'));
    await useProStore.getState().loadOfferingsIfNeeded();
    expect(useProStore.getState().error).toBe('no offerings');
  });
});
