/**
 * Bootstrap entitlement sequence.
 *
 * Exposes the cold-start entitlement bootstrap as an isolated function so it can be
 * tested without running the full App component. The correct order is:
 *   1. useProStore.initialize()  — resolve stable identity + entitlement
 *   2. rebindRevenueCatToActiveAccount()  — confirm account binding (safety net)
 *   3. enforceTierLimits()  — enforce free-tier caps AFTER identity confirmed
 *
 * App.tsx calls this function from checkOnboarding(). The sequence must not change
 * without a corresponding test update.
 */
import { useProStore } from '../stores/proStore';
import { enforceTierLimits } from '../services/TierLimits';
import { rebindRevenueCatToActiveAccount } from '../contexts/AccountsContext';

export async function bootstrapEntitlement(): Promise<void> {
  await useProStore.getState().initialize();
  await rebindRevenueCatToActiveAccount();
  await enforceTierLimits();
}
