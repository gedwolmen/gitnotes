/**
 * proStore integration tests — real module, isolated RevenueCat mocks.
 *
 * These tests exercise proStore + RevenueCatService without the global forced-Pro
 * mock (`mockProStoreState`).  Each test case controls the RevenueCat mock so
 * the full entitlement-derivation logic can be verified:
 *
 * - active:   getCustomerInfo returns an active Pro entitlement
 * - free:     getCustomerInfo returns empty entitlements
 * - no-account: configureRevenueCat returns { configured: false } (placeholder key)
 * - sdk-error: configureRevenueCat throws
 *
 * Setup/teardown guarantees:
 * - RevenueCat module-level `configured` flag is reset via __resetConfiguredFlagForTests()
 * - proStore module-level `_customerInfoCleanup` is called after each test
 *
 * @regression-target: global mock forces status=pro/entitlementActive=true and masks
 *   regressions in initialize/refresh/deriveTrialInfo for startup identity states.
 */

const TEST_API_KEY = 'test-revenecat-api-key-12345';
const PLACEHOLDER_KEY = '<PLACEHOLDER>';

process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = TEST_API_KEY;
process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = TEST_API_KEY;

const realProStore = jest.requireActual('@/stores/proStore') as typeof import('@/stores/proStore');

const {
  useProStore,
  selectIsPro,
  PRO_ENTITLEMENT_ID,
} = realProStore;

import { __resetConfiguredFlagForTests, __setDelayForTests } from '@/services/RevenueCatService';

function getPurchasesMock(): typeof import('react-native-purchases')['default'] {
  const mock = jest.requireMock('react-native-purchases');
  return (mock as { default: typeof import('react-native-purchases')['default'] }).default;
}

function resetRevenueCatState(): void {
  __resetConfiguredFlagForTests();
  __setDelayForTests(null);
  const Purchases = getPurchasesMock();
  const mock = jest.requireMock('react-native-purchases') as {
    __resetPurchasesMocks?: () => void;
  };
  mock.__resetPurchasesMocks?.();
  (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
  (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
    entitlements: { active: {} },
    originalApplicationVersion: null,
    originalPurchaseDate: null,
  });
}

function resetProStoreState(): void {
  useProStore.setState({
    status: 'loading',
    entitlementActive: false,
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
  const clearCleanup = (realProStore as Record<string, unknown>)
    .__clearCustomerInfoCleanupForTests as (() => void) | undefined;
  clearCleanup?.();
}

describe('proStore — isolated entitlement states (real module)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRevenueCatState();
    resetProStoreState();
  });

  afterEach(() => {
    resetRevenueCatState();
    resetProStoreState();
    jest.useRealTimers();
  });

  describe('when RevenueCat returns an active Pro entitlement', () => {
    it('initializes with status=pro and entitlementActive=true', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: {
          active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'NORMAL' } },
        },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });

      await useProStore.getState().initialize();

      const state = useProStore.getState();
      expect(state.status).toBe('pro');
      expect(state.entitlementActive).toBe(true);
      expect(selectIsPro(state)).toBe(true);
      expect(state.configured).toBe(true);
      expect(state.error).toBeNull();
    });

    it('refresh reflects updated entitlementActive=true', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: { active: {} },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });
      await useProStore.getState().initialize();
      expect(useProStore.getState().status).toBe('free');

      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: {
          active: { [PRO_ENTITLEMENT_ID]: { isActive: true, periodType: 'NORMAL' } },
        },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });
      await useProStore.getState().refresh();

      const state = useProStore.getState();
      expect(state.status).toBe('pro');
      expect(state.entitlementActive).toBe(true);
    });
  });

  describe('when RevenueCat returns empty entitlements (free user)', () => {
    it('initializes with status=free and entitlementActive=false', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: { active: {} },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });

      await useProStore.getState().initialize();

      const state = useProStore.getState();
      expect(state.status).toBe('free');
      expect(state.entitlementActive).toBe(false);
      expect(selectIsPro(state)).toBe(false);
      expect(state.configured).toBe(true);
      expect(state.error).toBeNull();
    });

    it('refresh on a free user remains free', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: { active: {} },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });
      await useProStore.getState().initialize();
      expect(useProStore.getState().status).toBe('free');

      await useProStore.getState().refresh();

      expect(useProStore.getState().status).toBe('free');
      expect(useProStore.getState().entitlementActive).toBe(false);
    });
  });

  describe('when RevenueCat API key is a placeholder (no-account)', () => {
    it('initializes with configured=false and status=free', async () => {
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = PLACEHOLDER_KEY;
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = PLACEHOLDER_KEY;
      __resetConfiguredFlagForTests();
      const Purchases = getPurchasesMock();
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
        entitlements: { active: {} },
        originalApplicationVersion: null,
        originalPurchaseDate: null,
      });

      await useProStore.getState().initialize();

      const state = useProStore.getState();
      expect(state.configured).toBe(false);
      expect(state.status).toBe('free');
      expect(state.entitlementActive).toBe(false);

      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = TEST_API_KEY;
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = TEST_API_KEY;
    });
  });

  describe('when RevenueCat SDK throws during initialize', () => {
    it('sets an error message and remains in a safe free state', async () => {
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockRejectedValue(new Error('SDK rejected'));

      await useProStore.getState().initialize();

      const state = useProStore.getState();
      expect(state.error).not.toBeNull();
      expect(state.status).toBe('free');
      expect(state.entitlementActive).toBe(false);
    });

    it('refresh also propagates errors from RevenueCat', async () => {
      __setDelayForTests(() => Promise.resolve());
      const Purchases = getPurchasesMock();
      (Purchases.configure as jest.Mock).mockResolvedValue(undefined);
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      await useProStore.getState().initialize();
      await useProStore.getState().refresh();

      const state = useProStore.getState();
      expect(state.error).toMatch(/Network error|Failed to refresh/i);
    });
  });

  describe('selectIsPro — entitlement-gated', () => {
    it('returns true only when entitlementActive=true', () => {
      useProStore.setState({ entitlementActive: false });
      expect(selectIsPro(useProStore.getState())).toBe(false);

      useProStore.setState({ entitlementActive: true });
      expect(selectIsPro(useProStore.getState())).toBe(true);
    });
  });

  describe('initial state', () => {
    it('is loading/false before initialize', () => {
      const state = useProStore.getState();
      expect(state.status).toBe('loading');
      expect(state.entitlementActive).toBe(false);
      expect(state.configured).toBe(false);
      expect(state.offeringsReady).toBe(false);
    });
  });

  describe('restore() does not call initialize', () => {
    it('restore on uninitialized store returns error without crashing', async () => {
      const outcome = await useProStore.getState().restore();
      expect(outcome).toMatch(/error|nothing/);
      expect(useProStore.getState().configured).toBe(false);
    });
  });
});
