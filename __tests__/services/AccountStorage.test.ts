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

/**
 * Regression tests for the host-adapter schema extension
 * (`hostKind` + `baseUrl` per account). The new fields are
 * optional for backward compatibility — accounts persisted
 * before this refactor lack them and must be coerced to the
 * `'github'` default on read. The tests below cover that
 * coercion, the explicit-persistence path, and the
 * `updateAccountHost` / `getAccount` helpers.
 */
describe('AccountStorage — host info', () => {
  beforeEach(async () => {
    await AsyncStorage.clear?.();
  });

  it('addAccount persists hostKind + baseUrl when supplied', async () => {
    const acc = await AccountStorage.addAccount('tok-1', profile, {
      hostKind: 'gitea',
      baseUrl: 'https://gitea.example.com/',
    });
    expect(acc.hostKind).toBe('gitea');
    expect(acc.baseUrl).toBe('https://gitea.example.com');
    // Trailing slashes are stripped on persist so the host
    // adapter's `apiBaseFor` doesn't have to repeat the work.
    const reloaded = await AccountStorage.getAccount(acc.id);
    expect(reloaded?.hostKind).toBe('gitea');
    expect(reloaded?.baseUrl).toBe('https://gitea.example.com');
  });

  it('addAccount defaults hostKind to "github" when omitted (backward compat)', async () => {
    // The in-memory return is already normalised — callers
    // don't need to know whether the caller passed `hostKind`
    // or relied on the default. Same shape as `getAccount`.
    const acc = await AccountStorage.addAccount('tok-1', profile);
    expect(acc.hostKind).toBe('github');
    const reloaded = await AccountStorage.getAccount(acc.id);
    expect(reloaded?.hostKind).toBe('github');
  });

  it('legacy accounts persisted without hostKind coerce to "github" on read', async () => {
    // Simulate a record written by a build before the
    // host-adapter refactor — the `hostKind` field is
    // absent on disk. The normalisation must default it
    // to `'github'` on read.
    const raw = [
      {
        id: 'acc-legacy',
        login: 'legacy-user',
        name: 'Legacy',
        email: '',
        avatarUrl: '',
        addedAt: 1,
        // no hostKind, no baseUrl
      },
    ];
    await AsyncStorage.setItem('@gitnotes:accounts', JSON.stringify(raw));
    const reloaded = await AccountStorage.getAccount('acc-legacy');
    expect(reloaded?.hostKind).toBe('github');
  });

  it('coerces an invalid hostKind string to "github" on read', async () => {
    // Simulate a record persisted by a future build with a
    // host we don't support yet (e.g. bitbucket). The
    // normalisation must drop the unsupported value rather
    // than throw.
    const raw = [
      {
        id: 'acc-foreign',
        login: 'someone',
        name: 'Someone',
        email: '',
        avatarUrl: '',
        addedAt: 1,
        hostKind: 'bitbucket',
        baseUrl: 'https://bitbucket.example.com',
      },
    ];
    await AsyncStorage.setItem('@gitnotes:accounts', JSON.stringify(raw));
    const list = await AccountStorage.listAccounts();
    expect(list).toHaveLength(1);
    expect(list[0].hostKind).toBe('github');
    // baseUrl is dropped for the github fallback so the host
    // adapter's defaultBaseUrl() wins.
    expect(list[0].baseUrl).toBeUndefined();
  });

  it('drops baseUrl when hostKind is github.com and baseUrl is empty', async () => {
    // Persist a record that was written with an empty
    // baseUrl on github (defensive: the field is meaningless
    // for github.com without an enterprise instance).
    const raw = [
      {
        id: 'acc-gh-no-base',
        login: 'noent',
        name: 'No Ent',
        email: '',
        avatarUrl: '',
        addedAt: 1,
        hostKind: 'github',
        baseUrl: '',
      },
    ];
    await AsyncStorage.setItem('@gitnotes:accounts', JSON.stringify(raw));
    const list = await AccountStorage.listAccounts();
    expect(list[0].baseUrl).toBeUndefined();
  });

  it('keeps baseUrl for self-hosted hosts (gitea, gitlab)', async () => {
    const raw = [
      {
        id: 'acc-gitea',
        login: 'gitea-user',
        name: 'Gitea',
        email: '',
        avatarUrl: '',
        addedAt: 1,
        hostKind: 'gitea',
        baseUrl: 'https://gitea.example.com',
      },
      {
        id: 'acc-gitlab',
        login: 'gitlab-user',
        name: 'GitLab',
        email: '',
        avatarUrl: '',
        addedAt: 2,
        hostKind: 'gitlab',
        baseUrl: 'https://gitlab.example.com',
      },
    ];
    await AsyncStorage.setItem('@gitnotes:accounts', JSON.stringify(raw));
    const list = await AccountStorage.listAccounts();
    expect(list[0].hostKind).toBe('gitea');
    expect(list[0].baseUrl).toBe('https://gitea.example.com');
    expect(list[1].hostKind).toBe('gitlab');
    expect(list[1].baseUrl).toBe('https://gitlab.example.com');
  });

  it('updateAccountHost rewrites the host info on an existing account', async () => {
    const acc = await AccountStorage.addAccount('tok-1', profile);
    // The in-memory return is normalised — `hostKind` defaults
    // to `'github'` even when the caller didn't pass it.
    expect(acc.hostKind).toBe('github');

    const updated = await AccountStorage.updateAccountHost(acc.id, 'gitlab', 'https://gitlab.example.com');
    expect(updated?.hostKind).toBe('gitlab');
    expect(updated?.baseUrl).toBe('https://gitlab.example.com');

    const reloaded = await AccountStorage.getAccount(acc.id);
    expect(reloaded?.hostKind).toBe('gitlab');
    expect(reloaded?.baseUrl).toBe('https://gitlab.example.com');
  });

  it('updateAccountHost returns null for an unknown id', async () => {
    const result = await AccountStorage.updateAccountHost('acc-does-not-exist', 'github');
    expect(result).toBeNull();
  });

  it('getAccount returns null for an unknown id', async () => {
    const result = await AccountStorage.getAccount('acc-does-not-exist');
    expect(result).toBeNull();
  });

  it('re-adding the same login updates host info rather than creating a duplicate', async () => {
    const first = await AccountStorage.addAccount('tok-1', profile, {
      hostKind: 'github',
    });
    const second = await AccountStorage.addAccount('tok-2', profile, {
      hostKind: 'gitea',
      baseUrl: 'https://gitea.example.com',
    });
    expect(second.id).toBe(first.id);
    // Host info from the re-add wins over the existing record.
    expect(second.hostKind).toBe('gitea');
    expect(second.baseUrl).toBe('https://gitea.example.com');
  });
});
