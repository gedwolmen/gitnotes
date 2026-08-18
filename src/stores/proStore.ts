import { create } from 'zustand';

export interface ProState {
  status: 'loading' | 'pro' | 'free';
  entitlementActive: boolean;
  isGrandfathered: boolean;
  trialActive: boolean;
  trialEndsAt: number | null;
  isPurchasing: boolean;
  isRestoring: boolean;
  error: string | null;
  interstitialEligible: boolean;
  monthlyPackage: unknown | null;
  lifetimePackage: unknown | null;
  configured: boolean;
}

export const selectIsPro = (state: ProState): boolean =>
  state.entitlementActive || state.isGrandfathered;

export const useProStore = create<ProState>(() => ({
  status: 'loading',
  entitlementActive: false,
  isGrandfathered: false,
  trialActive: false,
  trialEndsAt: null,
  isPurchasing: false,
  isRestoring: false,
  error: null,
  interstitialEligible: false,
  monthlyPackage: null,
  lifetimePackage: null,
  configured: false,
}));
