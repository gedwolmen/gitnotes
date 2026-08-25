import { AccountStorage } from './AccountStorage';
import { StorageService } from './StorageService';
import { selectIsPro, useProStore } from '../stores/proStore';

/**
 * Free-tier caps. The UI add-flows (SettingsScreen / SettingsContent) refuse
 * to add a repo or account beyond these for non-Pro users. Android Auto
 * Backup restores the AsyncStorage DB directly, which can resurrect an
 * over-limit set of repos/accounts without ever passing through those flows
 * (#1233). Enforcing the same caps at load time closes that hole.
 */
export const FREE_TIER_MAX_REPOS = 1;
export const FREE_TIER_MAX_ACCOUNTS = 1;

function isPro(): boolean {
  return selectIsPro(useProStore.getState());
}

/**
 * Enforce the free-tier repo/account caps against data restored from a device
 * backup. Must run AFTER the Pro entitlement has resolved (see
 * `useProStore.initialize`) and BEFORE the stores surface restored data, so an
 * over-limit backup is truncated instead of displayed.
 *
 * No-op for Pro / grandfathered users. Truncation is persisted so it survives
 * a reload.
 */
export async function enforceTierLimits(): Promise<void> {
  if (isPro()) return;
  await enforceRepoCap();
  await enforceAccountCap();
}

async function enforceRepoCap(): Promise<void> {
  const repos = await StorageService.getSavedRepositories();
  if (repos.length <= FREE_TIER_MAX_REPOS) return;
  // Repos are stored in add order (oldest first). Keep the most recently
  // added, which is the set the user is most likely still using.
  await StorageService.saveRepositories(repos.slice(repos.length - FREE_TIER_MAX_REPOS));
}

async function enforceAccountCap(): Promise<void> {
  const accounts = await AccountStorage.listAccounts();
  if (accounts.length <= FREE_TIER_MAX_ACCOUNTS) return;
  // Keep the most recently added account; drop the rest. `removeAccount`
  // cleans up each account's token and host connections and re-homes the
  // active pointers, so a restored over-limit set is actually removed rather
  // than merely hidden.
  const keepIds = new Set(
    accounts
      .slice()
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .slice(0, FREE_TIER_MAX_ACCOUNTS)
      .map((a) => a.id),
  );
  for (const account of accounts) {
    if (!keepIds.has(account.id)) {
      await AccountStorage.removeAccount(account.id);
    }
  }
}
