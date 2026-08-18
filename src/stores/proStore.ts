import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  configureRevenueCat,
  getCustomerInfo,
  getPackages,
  onCustomerInfoUpdate,
  purchasePackage as purchasePackageWith,
  restorePurchases,
} from '../services/RevenueCatService';
import { resolveGrandfatherStatus } from '../services/GrandfatherService';

const TRIAL_WAS_ACTIVE_KEY = '@gitnotes:trial_was_active';
const TRIAL_EXPIRED_AT_KEY = '@gitnotes:trial_expired_at';
const INTERSTITIAL_SHOWN_KEY = '@gitnotes:interstitial_offer_shown';
const INTERSTITIAL_DELAY = 3 * 24 * 60 * 60 * 1000;

export type ProStatus = 'loading' | 'pro' | 'free';

interface ProState {
  status: ProStatus;
  entitlementActive: boolean;
  isGrandfathered: boolean;
  trialActive: boolean;
  trialEndsAt: number | null;
  entitlementExpiresAt: number | null;
  offeringsReady: boolean;
  monthlyPackage: PurchasesPackage | null;
  lifetimePackage: PurchasesPackage | null;
  isPurchasing: boolean;
  isRestoring: boolean;
  error: string | null;
  interstitialEligible: boolean;
  configured: boolean;
}

interface ProActions {
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  purchaseMonthly: () => Promise<void>;
  purchaseLifetime: () => Promise<void>;
  restore: () => Promise<void>;
  loadOfferingsIfNeeded: () => Promise<void>;
  markInterstitialShown: () => Promise<void>;
}

export const selectIsPro = (state: ProState): boolean =>
  state.entitlementActive || state.isGrandfathered;

interface CustomerInfoLike {
  entitlements?: {
    active?: Record<
      string,
      { isActive?: boolean; periodType?: string; expiresDate?: string | null }
    >;
  };
  originalApplicationVersion?: string | null;
}

function deriveTrialInfo(customerInfo: CustomerInfoLike | null): {
  entitlementActive: boolean;
  trialActive: boolean;
  trialEndsAt: number | null;
  entitlementExpiresAt: number | null;
} {
  const entitlement = customerInfo?.entitlements?.active?.pro;
  const entitlementActive = Boolean(entitlement?.isActive);
  const trialActive = entitlementActive && entitlement?.periodType === 'TRIAL';
  const expiresMs = entitlement?.expiresDate ? Date.parse(entitlement.expiresDate) : NaN;
  return {
    entitlementActive,
    trialActive,
    trialEndsAt: trialActive && Number.isFinite(expiresMs) ? expiresMs : null,
    entitlementExpiresAt: entitlementActive && Number.isFinite(expiresMs) ? expiresMs : null,
  };
}

async function readStored(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

async function evaluateInterstitial(
  entitlementActive: boolean,
  set: (partial: Partial<ProState>) => void,
): Promise<void> {
  if (entitlementActive) {
    await AsyncStorage.setItem(TRIAL_WAS_ACTIVE_KEY, 'true');
    return;
  }
  const wasActive = (await readStored(TRIAL_WAS_ACTIVE_KEY)) === 'true';
  if (!wasActive) return;
  const expiredAtRaw = await readStored(TRIAL_EXPIRED_AT_KEY);
  const expiredAt = expiredAtRaw ? Number.parseInt(expiredAtRaw, 10) : NaN;
  if (!Number.isFinite(expiredAt)) {
    await AsyncStorage.setItem(TRIAL_EXPIRED_AT_KEY, String(Date.now()));
    return;
  }
  const shown = (await readStored(INTERSTITIAL_SHOWN_KEY)) === 'true';
  if (!shown && Date.now() >= expiredAt + INTERSTITIAL_DELAY) {
    set({ interstitialEligible: true });
  }
}

export const useProStore = create<ProState & ProActions>()((set, get) => ({
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

  initialize: async () => {
    try {
      const { configured } = await configureRevenueCat();
      set({ configured });
      let customerInfo: CustomerInfoLike | null = null;
      if (configured) {
        customerInfo = await getCustomerInfo();
        onCustomerInfoUpdate((info) => {
          const derived = deriveTrialInfo(info);
          set((state) => ({
            ...derived,
            status: derived.entitlementActive || state.isGrandfathered ? 'pro' : 'free',
          }));
          void evaluateInterstitial(derived.entitlementActive, set);
        });
      }
      const grandfather = await resolveGrandfatherStatus(customerInfo);
      const derived = deriveTrialInfo(customerInfo);
      set({
        ...derived,
        isGrandfathered: grandfather.isGrandfathered,
        status: derived.entitlementActive || grandfather.isGrandfathered ? 'pro' : 'free',
      });
      await evaluateInterstitial(derived.entitlementActive, set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to initialize Pro', status: 'free' });
    }
  },

  refresh: async () => {
    try {
      const customerInfo = await getCustomerInfo();
      const derived = deriveTrialInfo(customerInfo);
      set((state) => ({
        ...derived,
        status: derived.entitlementActive || state.isGrandfathered ? 'pro' : 'free',
        error: null,
      }));
      await evaluateInterstitial(derived.entitlementActive, set);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to refresh Pro' });
    }
  },

  purchaseMonthly: async () => {
    const pkg = get().monthlyPackage;
    if (!pkg) return;
    set({ isPurchasing: true, error: null });
    const result = await purchasePackageWith(pkg);
    set({ isPurchasing: false });
    if (result.kind === 'purchased') {
      await get().refresh();
    } else if (result.kind === 'error') {
      set({ error: result.message });
    }
  },

  purchaseLifetime: async () => {
    const pkg = get().lifetimePackage;
    if (!pkg) return;
    set({ isPurchasing: true, error: null });
    const result = await purchasePackageWith(pkg);
    set({ isPurchasing: false });
    if (result.kind === 'purchased') {
      await get().refresh();
    } else if (result.kind === 'error') {
      set({ error: result.message });
    }
  },

  restore: async () => {
    set({ isRestoring: true, error: null });
    const result = await restorePurchases();
    set({ isRestoring: false });
    if (result.kind === 'purchased') {
      await get().refresh();
    } else if (result.kind === 'error') {
      set({ error: result.message });
    }
  },

  loadOfferingsIfNeeded: async () => {
    if (get().offeringsReady) return;
    try {
      const packages = await getPackages();
      set({
        monthlyPackage: packages?.monthly ?? null,
        lifetimePackage: packages?.lifetime ?? null,
        offeringsReady: true,
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load offerings' });
    }
  },

  markInterstitialShown: async () => {
    await AsyncStorage.setItem(INTERSTITIAL_SHOWN_KEY, 'true');
    set({ interstitialEligible: false });
  },
}));
