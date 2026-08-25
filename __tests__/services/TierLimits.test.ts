const mockProState = { status: 'free', entitlementActive: false, isGrandfathered: false };
jest.mock('../../src/stores/proStore', () => ({
  __esModule: true,
  selectIsPro: (state: { entitlementActive?: boolean; isGrandfathered?: boolean }) =>
    Boolean(state?.entitlementActive || state?.isGrandfathered),
  useProStore: { getState: () => mockProState },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
    saveRepositories: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/AccountStorage', () => ({
  AccountStorage: {
    listAccounts: jest.fn(async () => []),
    removeAccount: jest.fn(async () => undefined),
  },
}));

import {
  enforceTierLimits,
  FREE_TIER_MAX_REPOS,
  FREE_TIER_MAX_ACCOUNTS,
} from '../../src/services/TierLimits';
import { StorageService } from '../../src/services/StorageService';
import { AccountStorage } from '../../src/services/AccountStorage';
import type { GitRepository } from '../../src/services/GitService';
import type { StoredAccount } from '../../src/services/AccountStorage';

const __setProState = (partial: Record<string, unknown>) => Object.assign(mockProState, partial);
const getSavedRepositories = StorageService.getSavedRepositories as jest.Mock;
const saveRepositories = StorageService.saveRepositories as jest.Mock;
const listAccounts = AccountStorage.listAccounts as jest.Mock;
const removeAccount = AccountStorage.removeAccount as jest.Mock;

function repo(id: string): GitRepository {
  return { id, name: id, path: `owner/${id}` };
}

function account(id: string, addedAt: number): StoredAccount {
  return { id, login: id, name: id, email: '', avatarUrl: '', addedAt, hostIds: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
  getSavedRepositories.mockResolvedValue([]);
  listAccounts.mockResolvedValue([]);
  saveRepositories.mockResolvedValue(undefined);
  removeAccount.mockResolvedValue(undefined);
});

describe('enforceTierLimits', () => {
  it('does nothing for Pro users', async () => {
    __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
    getSavedRepositories.mockResolvedValue([repo('a'), repo('b')]);
    listAccounts.mockResolvedValue([account('x', 1), account('y', 2)]);

    await enforceTierLimits();

    expect(saveRepositories).not.toHaveBeenCalled();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it('does nothing for grandfathered users', async () => {
    __setProState({ status: 'pro', entitlementActive: false, isGrandfathered: true });
    getSavedRepositories.mockResolvedValue([repo('a'), repo('b')]);
    listAccounts.mockResolvedValue([account('x', 1), account('y', 2)]);

    await enforceTierLimits();

    expect(saveRepositories).not.toHaveBeenCalled();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it('leaves a free user at or under the cap untouched', async () => {
    getSavedRepositories.mockResolvedValue([repo('a')]);
    listAccounts.mockResolvedValue([account('x', 1)]);

    await enforceTierLimits();

    expect(saveRepositories).not.toHaveBeenCalled();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it('truncates restored repos down to the cap, keeping the most recent', async () => {
    const a = repo('a');
    const b = repo('b');
    const c = repo('c');
    getSavedRepositories.mockResolvedValue([a, b, c]);

    await enforceTierLimits();

    expect(saveRepositories).toHaveBeenCalledTimes(1);
    expect(saveRepositories).toHaveBeenCalledWith([c]);
  });

  it('truncates restored accounts down to the cap, removing the extras', async () => {
    listAccounts.mockResolvedValue([
      account('oldest', 10),
      account('middle', 20),
      account('newest', 30),
    ]);

    await enforceTierLimits();

    expect(removeAccount).toHaveBeenCalledTimes(2);
    expect(removeAccount).toHaveBeenCalledWith('oldest');
    expect(removeAccount).toHaveBeenCalledWith('middle');
    expect(removeAccount).not.toHaveBeenCalledWith('newest');
  });

  it('caps are one repo and one account', () => {
    expect(FREE_TIER_MAX_REPOS).toBe(1);
    expect(FREE_TIER_MAX_ACCOUNTS).toBe(1);
  });
});
