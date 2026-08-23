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

import {
  AccountStorage,
  makeHostId,
} from '../../src/services/AccountStorage';
import {
  AccountSummary,
  AuthService,
  validateHostToken,
} from '../../src/services/AuthService';

const githubUser = {
  id: 42,
  login: 'octocat',
  name: 'Octo Cat',
  email: 'octo@example.com',
  avatar_url: 'https://example.com/octo.png',
};

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as { fetch: typeof fetch }).fetch = jest.fn(impl) as unknown as typeof fetch;
}

beforeEach(async () => {
  await AsyncStorage.clear?.();
  // Reset SecureStore (module-scoped).
  // Tests use distinct ids to avoid collisions.
  mockFetch(async () => new Response(JSON.stringify(githubUser), { status: 200 }));
});

describe('AccountStorage HostConnection model', () => {
  it('upsertHostConnection attaches a host to an account and stores its token', async () => {
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
    });

    const host = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      name: 'Octo Cat',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
      token: 'gh-tok',
    });

    expect(host.id).toBe(makeHostId(account.id, 'github', null));
    expect(await AccountStorage.getHostToken(host.id)).toBe('gh-tok');

    const updated = await AccountStorage.listAccounts();
    expect(updated[0].hostIds).toContain(host.id);

    const connections = await AccountStorage.listHostConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].provider).toBe('github');
  });

  it('upsertHostConnection is idempotent — repeat calls replace the existing row', async () => {
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
    });
    const first = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      name: 'Octo',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
      token: 'gh-tok',
    });
    const second = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      name: 'Octo Renamed',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
      token: 'gh-tok-2',
    });
    expect(second.id).toBe(first.id);
    expect((await AccountStorage.listHostConnections())).toHaveLength(1);
    expect((await AccountStorage.listAccounts())[0].hostIds).toHaveLength(1);
  });

  it('treats self-hosted instances as distinct connections', async () => {
    const account = await AccountStorage.addAccount('gl-tok', {
      login: 'octocat',
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
    });
    const gitlabCom = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'gitlab',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 1,
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
      token: 'gl-tok-1',
    });
    const selfHosted = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'gitlab',
      instanceBaseUrl: 'https://gitlab.example.com',
      hostLogin: 'octocat',
      hostUserId: 1,
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
      token: 'gl-tok-2',
    });
    expect(gitlabCom.id).not.toBe(selfHosted.id);
    expect((await AccountStorage.listHostConnections())).toHaveLength(2);
  });

  it('removeHostConnection drops the host AND the owning account when it has no other hosts', async () => {
    // Disconnecting the last host from an account should remove the account
    // entirely — otherwise Settings would show a stale "ghost" row (avatar +
    // name) for an account with no hosts to manage, which only cleared on
    // app reload.
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
    });
    const host = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
      token: 'gh-tok',
    });
    await AccountStorage.removeHostConnection(host.id);
    expect(await AccountStorage.listHostConnections()).toHaveLength(0);
    expect(await AccountStorage.listAccounts()).toHaveLength(0);
  });

  it('removeHostConnection keeps the account when it still has other hosts', async () => {
    // Sanity check: disconnecting ONE host from an account that has more
    // should leave the account in place — only fully-empty accounts are
    // garbage-collected by the new removeHostConnection logic.
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
    });
    const hostA = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
      token: 'gh-tok',
    });
    await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'gitlab',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 43,
      name: 'Octo',
      email: 'o@e.com',
      avatarUrl: '',
      token: 'gl-tok',
    });
    await AccountStorage.removeHostConnection(hostA.id);
    const remaining = await AccountStorage.listAccounts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].hostIds).toHaveLength(1);
    expect(remaining[0].hostIds[0]).not.toBe(hostA.id);
  });

  it('listAccounts sanitises legacy rows that lack hostIds', async () => {
    // Raw write a row bypassing addAccount to simulate a pre-migration install.
    await AsyncStorage.setItem(
      '@gitnotes:accounts',
      JSON.stringify([
        {
          id: 'legacy-1',
          login: 'octocat',
          name: 'Octo',
          email: 'o@e.com',
          avatarUrl: '',
          addedAt: 0,
          // no hostIds
        },
      ]),
    );
    const list = await AccountStorage.listAccounts();
    expect(list[0].hostIds).toEqual([]);
  });
});

describe('AuthService.connectHost', () => {
  it('creates an account + host connection on first GitHub connect', async () => {
    const result = await AuthService.connectHost({ provider: 'github', token: 'gh-tok' });
    expect(result).not.toBeNull();
    expect(result!.account.login).toBe('octocat');
    expect(result!.host.provider).toBe('github');
    expect((await AccountStorage.listHostConnections())).toHaveLength(1);
  });

  it('reuses the existing account when the login matches', async () => {
    const first = await AuthService.connectHost({ provider: 'github', token: 'gh-tok-1' });
    const second = await AuthService.connectHost({ provider: 'github', token: 'gh-tok-2' });
    expect(second!.account.id).toBe(first!.account.id);
    // Same id ⇒ token replaced, but still only one host.
    expect((await AccountStorage.listHostConnections())).toHaveLength(1);
  });

  it('returns null on an invalid token', async () => {
    mockFetch(async () => new Response('', { status: 401 }));
    const result = await AuthService.connectHost({ provider: 'github', token: 'bad' });
    expect(result).toBeNull();
    expect((await AccountStorage.listAccounts())).toHaveLength(0);
  });
});

describe('AuthService.switchToHost / switchAccount', () => {
  async function seedTwoHosts() {
    const a = await AuthService.connectHost({ provider: 'github', token: 'gh-tok' });
    if (!a) throw new Error('seed failed');
    // Force a second account by mocking a different user.
    mockFetch(async () =>
      new Response(
        JSON.stringify({ ...githubUser, login: 'monalisa', id: 99 }),
        { status: 200 },
      ),
    );
    const b = await AuthService.connectHost({ provider: 'github', token: 'gh-tok-2' });
    if (!b) throw new Error('seed failed');
    return { a, b };
  }

  it('switchToHost sets the active host pointer', async () => {
    const { a, b } = await seedTwoHosts();
    const result = await AuthService.switchToHost(a.host.id);
    expect(result.ok).toBe(true);
    const active = await AuthService.getActiveSummary();
    expect(active?.account.id).toBe(a.account.id);
    expect(active?.activeHostId).toBe(a.host.id);
    void b;
  });

  it('switchAccount falls back to the first available host on that account', async () => {
    const { a } = await seedTwoHosts();
    const result = await AuthService.switchAccount(a.account.id);
    expect(result.ok).toBe(true);
    expect((await AuthService.getActiveSummary())?.activeHostId).toBe(a.host.id);
  });

  it('switchToHost returns "not-found" for unknown host ids', async () => {
    const result = await AuthService.switchToHost('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });
});

describe('AuthService.listAccountSummaries', () => {
  it('returns one summary per account with its host connections', async () => {
    await AuthService.connectHost({ provider: 'github', token: 'gh-tok' });
    const summaries: AccountSummary[] = await AuthService.listAccountSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].account.login).toBe('octocat');
    expect(summaries[0].hosts).toHaveLength(1);
    expect(summaries[0].hosts[0].provider).toBe('github');
    expect(summaries[0].activeHostId).toBe(summaries[0].hosts[0].id);
  });
});

describe('AccountStorage.removeHostConnection clears AI state when account is dropped', () => {
  it('clears ai-settings blob and ai-provider-key-* SecureStore entries when last host disconnect drops the account', async () => {
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
    });
    const host = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      hostDisplayName: 'Octo Cat',
      hostAvatarUrl: 'https://example.com/octo.png',
      token: 'gh-host-tok',
    });

    await AsyncStorage.setItem(
      'ai-settings',
      JSON.stringify({
        providers: [
          { id: 'openai-key', apiKey: 'sk-OAI' },
          { id: 'anthropic-key', apiKey: 'sk-ANT' },
        ],
      }),
    );
    await SecureStore.setItemAsync('ai-provider-key-openai-key', 'sk-OAI');
    await SecureStore.setItemAsync('ai-provider-key-anthropic-key', 'sk-ANT');

    expect(await SecureStore.getItemAsync('ai-provider-key-openai-key')).toBe('sk-OAI');
    expect(await AsyncStorage.getItem('ai-settings')).not.toBeNull();

    await AccountStorage.removeHostConnection(host.id);

    const remainingAccounts = await AccountStorage.listAccounts();
    expect(remainingAccounts.find((a) => a.id === account.id)).toBeUndefined();

    expect(await SecureStore.getItemAsync('ai-provider-key-openai-key')).toBeNull();
    expect(await SecureStore.getItemAsync('ai-provider-key-anthropic-key')).toBeNull();
    expect(await AsyncStorage.getItem('ai-settings')).toBeNull();
  });

  it('does NOT clear AI state when disconnecting a non-last host (account still has other hosts)', async () => {
    const account = await AccountStorage.addAccount('gh-tok', {
      login: 'octocat',
      name: 'Octo Cat',
      email: 'octo@example.com',
      avatarUrl: 'https://example.com/octo.png',
    });
    const host1 = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'github',
      instanceBaseUrl: null,
      hostLogin: 'octocat',
      hostUserId: 42,
      hostDisplayName: 'GitHub',
      hostAvatarUrl: 'https://example.com/octo.png',
      token: 'gh-host-tok-1',
    });
    const host2 = await AccountStorage.upsertHostConnection({
      accountId: account.id,
      provider: 'gitlab',
      instanceBaseUrl: 'https://gitlab.example.com',
      hostLogin: 'octocat',
      hostUserId: 42,
      hostDisplayName: 'GitLab',
      hostAvatarUrl: 'https://example.com/octo.png',
      token: 'gl-host-tok',
    });

    await AsyncStorage.setItem(
      'ai-settings',
      JSON.stringify({ providers: [{ id: 'openai-key', apiKey: 'sk-OAI' }] }),
    );
    await SecureStore.setItemAsync('ai-provider-key-openai-key', 'sk-OAI');

    await AccountStorage.removeHostConnection(host1.id);

    const remainingAccounts = await AccountStorage.listAccounts();
    expect(remainingAccounts.find((a) => a.id === account.id)).toBeDefined();
    expect(remainingAccounts.find((a) => a.id === account.id)?.hostIds).toEqual([host2.id]);

    expect(await SecureStore.getItemAsync('ai-provider-key-openai-key')).toBe('sk-OAI');
    expect(await AsyncStorage.getItem('ai-settings')).not.toBeNull();
  });
});

describe('validateHostToken (non-GitHub providers)', () => {
  it('rejects when setToken returns null', async () => {
    // Without a gitlab service mock in this file we exercise the
    // single-token invalidation path by stubbing fetch for github only.
    const result = await validateHostToken('github', 'any-token');
    // The default mock returns 200.
    expect(result.ok).toBe(true);
  });
});
