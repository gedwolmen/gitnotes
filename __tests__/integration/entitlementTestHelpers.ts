/**
 * Shared mock utilities for entitlement integration tests.
 * All entitlement E2E tests import from this file to ensure consistent mock setup.
 */
import { jest as _jest } from '@jest/globals';

export const TEST_API_KEY = 'test-revenecat-api-key-12345';

export const mockAuthGetActiveSummary = jest.fn();
jest.mock('@/services/AuthService', () => ({
  AuthService: {
    getActiveSummary: mockAuthGetActiveSummary,
    listAccountSummaries: jest.fn().mockResolvedValue([]),
  },
  HostConnectionSummary: {},
}));

export const mockSaveRepositories = jest.fn();
jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn().mockResolvedValue([]),
    saveRepositories: mockSaveRepositories,
  },
}));

export const mockRemoveAccount = jest.fn();
jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    listAccounts: jest.fn().mockResolvedValue([]),
    removeAccount: mockRemoveAccount,
  },
}));

let rebindCalls: unknown[][] = [];
export const getRebindCalls = () => rebindCalls;
jest.mock('@/contexts/AccountsContext', () => ({
  rebindRevenueCatToActiveAccount: jest.fn(async (...args: unknown[]) => {
    getRebindCalls().push(args);
  }),
  syncRevenueCatIdentity: jest.fn(async () => {
    /* noop */
  }),
}));

jest.unmock('@/stores/proStore');
jest.unmock('@/services/TierLimits');
jest.unmock('@/bootstrap/bootstrapEntitlement');

export const { useProStore, PRO_ENTITLEMENT_ID } = jest.requireActual('@/stores/proStore');

export const {
  __resetConfiguredFlagForTests,
  __setDelayForTests,
} = jest.requireActual('@/services/RevenueCatService') as {
  __resetConfiguredFlagForTests: () => void;
  __setDelayForTests: (fn: ((ms: number) => Promise<void>) | null) => void;
};

export const realTierLimits = jest.requireActual('@/services/TierLimits') as {
  enforceTierLimits: () => Promise<void>;
  FREE_TIER_MAX_REPOS: number;
  FREE_TIER_MAX_ACCOUNTS: number;
};

export const storeStateAtEnforceCall: Array<{ status: string; entitlementActive: boolean }> = [];
export const mockEnforceTierLimits = jest.fn(async () => {
  const { useProStore: realUseProStore } = jest.requireActual('@/stores/proStore') as {
    useProStore: typeof useProStore;
  };
  const state = realUseProStore.getState();
  storeStateAtEnforceCall.push({
    status: state.status,
    entitlementActive: state.entitlementActive,
  });
  await realTierLimits.enforceTierLimits();
});

jest.mock('@/services/TierLimits', () => ({
  enforceTierLimits: mockEnforceTierLimits,
  FREE_TIER_MAX_REPOS: 1,
  FREE_TIER_MAX_ACCOUNTS: 1,
}));

export const { bootstrapEntitlement } = jest.requireActual('@/bootstrap/bootstrapEntitlement');

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
    logOut: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(() => (() => undefined)),
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

process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = TEST_API_KEY;
process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = TEST_API_KEY;

export function getPurchasesMock(): typeof import('react-native-purchases')['default'] {
  const mock = _jest.requireMock('react-native-purchases');
  return (mock as { default: typeof import('react-native-purchases')['default'] }).default;
}

export function resetAll(): void {
  __resetConfiguredFlagForTests();
  __setDelayForTests(null);
  const Purchases = getPurchasesMock();
  const mock = _jest.requireMock('react-native-purchases') as {
    __resetPurchasesMocks?: () => void;
  };
  mock.__resetPurchasesMocks?.();
  (Purchases.configure as _jest.Mock).mockResolvedValue(undefined);
  (Purchases.getCustomerInfo as _jest.Mock).mockReset();
  (Purchases.restorePurchases as _jest.Mock).mockReset();
  (Purchases.logIn as _jest.Mock).mockReset();
  (Purchases.addCustomerInfoUpdateListener as _jest.Mock).mockReset();
  storeStateAtEnforceCall.length = 0;
  rebindCalls = [];
  mockEnforceTierLimits.mockClear();
  mockSaveRepositories.mockClear();
  mockRemoveAccount.mockClear();
  mockAuthGetActiveSummary.mockReset();
}
