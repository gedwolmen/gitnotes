import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store', () => {
  const mem: Record<string, string> = {};
  return {
    __esModule: true,
    getItemAsync: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      mem[k] = v;
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      delete mem[k];
    }),
  };
});

import { AccountStorage } from '../../src/services/AccountStorage';

const profile = {
  login: 'octocat',
  name: 'Octo Cat',
  email: 'octo@example.com',
  avatarUrl: 'https://example.com/octo.png',
};

const profile2 = {
  login: 'monalisa',
  name: 'Mona Lisa',
  email: 'mona@example.com',
  avatarUrl: 'https://example.com/mona.png',
};

beforeEach(async () => {
  await AsyncStorage.clear?.();
  // SecureStore mem is module-scoped; reset by deleting known keys is impractical.
  // Tests use distinct ids so collisions are unlikely.
});

describe('AccountStorage', () => {
  it('starts empty', async () => {
    const accounts = await AccountStorage.listAccounts();
    expect(accounts).toEqual([]);
    expect(await AccountStorage.getActiveAccountId()).toBeNull();
    expect(await AccountStorage.getActiveToken()).toBeNull();
  });

  it('addAccount persists, sets active when none, returns the account', async () => {
    const acc = await AccountStorage.addAccount('tok-1', profile);
    expect(acc.login).toBe('octocat');
    expect(acc.id).toMatch(/^acc-/);
    expect(await AccountStorage.getActiveAccountId()).toBe(acc.id);
    expect(await AccountStorage.getActiveToken()).toBe('tok-1');
    expect(await AccountStorage.getTokenById(acc.id)).toBe('tok-1');
    const list = await AccountStorage.listAccounts();
    expect(list).toHaveLength(1);
  });

  it('adding a second account does not steal active', async () => {
    const a = await AccountStorage.addAccount('tok-a', profile);
    const b = await AccountStorage.addAccount('tok-b', profile2);
    expect(b.id).not.toBe(a.id);
    expect(await AccountStorage.getActiveAccountId()).toBe(a.id);
    expect(await AccountStorage.getActiveToken()).toBe('tok-a');
    expect(await AccountStorage.getTokenById(b.id)).toBe('tok-b');
    const list = await AccountStorage.listAccounts();
    expect(list).toHaveLength(2);
  });

  it('addAccount with same login replaces token + profile, no duplicate', async () => {
    const first = await AccountStorage.addAccount('tok-1', profile);
    const updated = await AccountStorage.addAccount('tok-2', { ...profile, name: 'Renamed' });
    expect(updated.id).toBe(first.id);
    expect(updated.name).toBe('Renamed');
    expect(await AccountStorage.getTokenById(first.id)).toBe('tok-2');
    const list = await AccountStorage.listAccounts();
    expect(list).toHaveLength(1);
  });

  it('switching active and removing accounts works end-to-end', async () => {
    const a = await AccountStorage.addAccount('tok-a', profile);
    const b = await AccountStorage.addAccount('tok-b', profile2);
    await AccountStorage.setActiveAccountId(b.id);
    expect(await AccountStorage.getActiveToken()).toBe('tok-b');

    await AccountStorage.removeAccount(b.id);
    // active falls back to a remaining account
    expect(await AccountStorage.getActiveAccountId()).toBe(a.id);
    expect(await AccountStorage.getActiveToken()).toBe('tok-a');
    expect(await AccountStorage.getTokenById(b.id)).toBeNull();

    await AccountStorage.removeAccount(a.id);
    expect(await AccountStorage.getActiveAccountId()).toBeNull();
    expect(await AccountStorage.getActiveToken()).toBeNull();
  });

  it('falls back to legacy token when no accounts list exists', async () => {
    // Simulate legacy install: SecureStore single-key from previous AuthService
    await (SecureStore.setItemAsync as jest.Mock)('gitnotes_github_token', 'legacy-tok');
    expect(await AccountStorage.listAccounts()).toEqual([]);
    expect(await AccountStorage.getActiveToken()).toBe('legacy-tok');
  });
});
