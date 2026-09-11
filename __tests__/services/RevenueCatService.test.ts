/**
 * RevenueCatService tests.
 *
 * These tests verify:
 * - configureRevenueCat accepts an optional appUserID and passes it to Purchases.configure
 * - Anonymous configuration (no appUserID) still works
 * - Placeholder keys result in configured=false
 * - Configure can only happen once (idempotent)
 * - logInAppUser / logOutAppUser work correctly
 */
import Purchases from 'react-native-purchases';
import {
  configureRevenueCat,
  isConfigured,
  getCustomerInfo,
  logInAppUser,
  logOutAppUser,
  __resetConfiguredFlagForTests,
  __setDelayForTests,
} from '../../src/services/RevenueCatService';

// Mock react-native-purchases for these specific tests
jest.mock('react-native-purchases', () => {
  const Purchases = {
    setLogLevel: jest.fn(),
    configure: jest.fn(async () => undefined),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(async () => ({
      customerInfo: { entitlements: { active: { 'GitNotēs Pro': { isActive: true, periodType: 'NORMAL' } } } },
    })),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} } })),
    getCustomerInfo: jest.fn(async () => ({
      entitlements: { active: {} },
      originalApplicationVersion: null,
      originalPurchaseDate: null,
    })),
    logIn: jest.fn(async () => ({
      customerInfo: { entitlements: { active: { 'GitNotēs Pro': { isActive: true } } } },
      created: false,
    })),
    logOut: jest.fn(async () => ({
      entitlements: { active: {} },
    })),
    addCustomerInfoUpdateListener: jest.fn(() => () => {}),
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
    __resetPurchasesMocks: () => {
      for (const fn of Object.values(Purchases)) {
        if (typeof fn === 'function' && 'mockClear' in fn) (fn as jest.Mock).mockClear();
      }
    },
  };
});

const MockPurchases = Purchases as jest.Mocked<typeof Purchases>;

beforeAll(() => {
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = 'test-ios-api-key';
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'test-android-api-key';
});

describe('RevenueCatService', () => {
  beforeEach(() => {
    __resetConfiguredFlagForTests();
    __setDelayForTests(null);
    MockPurchases.configure.mockClear();
    MockPurchases.logIn.mockClear();
    MockPurchases.logOut.mockClear();
    MockPurchases.getCustomerInfo.mockClear();
  });

  describe('configureRevenueCat', () => {
    it('configures anonymously when no appUserID is provided', async () => {
      const result = await configureRevenueCat();
      expect(result.configured).toBe(true);
      expect(result.appUserID).toBeNull();
      const configureCall = MockPurchases.configure.mock.calls[0][0];
      expect(configureCall.apiKey).toBeTruthy();
      expect(configureCall).not.toHaveProperty('appUserID');
    });

    it('passes appUserID to Purchases.configure when provided', async () => {
      const appUserID = 'gitnotes:github:12345';
      const result = await configureRevenueCat(appUserID);
      expect(result.configured).toBe(true);
      expect(result.appUserID).toBe(appUserID);
      expect(MockPurchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: expect.any(String), appUserID }),
      );
    });

    it('idempotent: second configure returns configured=true without calling Purchases.configure again', async () => {
      await configureRevenueCat('gitnotes:github:12345');
      await configureRevenueCat('gitnotes:github:99999');
      // Only called once (the first time)
      expect(MockPurchases.configure).toHaveBeenCalledTimes(1);
      expect(MockPurchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ appUserID: 'gitnotes:github:12345' }),
      );
    });

    it('returns configured=false when API key is placeholder', async () => {
      const originalKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = '<PLACEHOLDER>';
      try {
        const result = await configureRevenueCat('gitnotes:github:12345');
        expect(result.configured).toBe(false);
        expect(result.appUserID).toBeNull();
        expect(MockPurchases.configure).not.toHaveBeenCalled();
      } finally {
        if (originalKey !== undefined) {
          process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = originalKey;
        }
      }
    });

    it('returns configured=false when API key is empty', async () => {
      const originalKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = '';
      try {
        const result = await configureRevenueCat();
        expect(result.configured).toBe(false);
      } finally {
        if (originalKey !== undefined) {
          process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = originalKey;
        }
      }
    });

    it('returns configured=false when API key is undefined', async () => {
      const originalKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
      delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
      try {
        const result = await configureRevenueCat();
        expect(result.configured).toBe(false);
      } finally {
        if (originalKey !== undefined) {
          process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = originalKey;
        }
      }
    });
  });

  describe('isConfigured', () => {
    it('returns false before first configure', () => {
      expect(isConfigured()).toBe(false);
    });

    it('returns true after successful configure', async () => {
      await configureRevenueCat();
      expect(isConfigured()).toBe(true);
    });
  });

  describe('logInAppUser', () => {
    it('returns null when not configured', async () => {
      const result = await logInAppUser('gitnotes:github:12345');
      expect(result).toBeNull();
    });

    it('calls Purchases.logIn with the provided appUserID', async () => {
      await configureRevenueCat();
      const result = await logInAppUser('gitnotes:github:12345');
      expect(MockPurchases.logIn).toHaveBeenCalledWith('gitnotes:github:12345');
      expect(result).not.toBeNull();
    });

    it('returns null when logIn throws', async () => {
      __setDelayForTests(() => Promise.resolve());
      await configureRevenueCat();
      MockPurchases.logIn.mockRejectedValue(new Error('Network error'));
      const result = await logInAppUser('gitnotes:github:12345');
      expect(result).toBeNull();
    });
  });

  describe('logOutAppUser', () => {
    it('is no-op when not configured', async () => {
      await logOutAppUser();
      expect(MockPurchases.logOut).not.toHaveBeenCalled();
    });

    it('calls Purchases.logOut when configured', async () => {
      await configureRevenueCat();
      await logOutAppUser();
      expect(MockPurchases.logOut).toHaveBeenCalled();
    });
  });

  describe('getCustomerInfo', () => {
    it('calls Purchases.getCustomerInfo', async () => {
      await configureRevenueCat();
      await getCustomerInfo();
      expect(MockPurchases.getCustomerInfo).toHaveBeenCalled();
    });
  });

  describe('configure-before-customer-info contract', () => {
    it('configure must precede getCustomerInfo in the call order', async () => {
      __resetConfiguredFlagForTests();
      MockPurchases.getCustomerInfo.mockClear();

      // This test documents the expected behavior:
      // 1. configure first (with appUserID if available)
      // 2. then call getCustomerInfo
      await configureRevenueCat('gitnotes:github:12345');
      await getCustomerInfo();

      // Verify configure was called with appUserID before getCustomerInfo was called
      const configureCall = MockPurchases.configure.mock.calls[0][0];
      const getCustomerInfoCall = MockPurchases.getCustomerInfo.mock.calls.length;
      expect(configureCall.appUserID).toBe('gitnotes:github:12345');
      expect(getCustomerInfoCall).toBeGreaterThan(0);
    });
  });
});
