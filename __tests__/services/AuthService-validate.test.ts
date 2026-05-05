import AsyncStorage from '@react-native-async-storage/async-storage';

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

import { AuthService } from '../../src/services/AuthService';
import { AccountStorage } from '../../src/services/AccountStorage';

const okUser = {
  login: 'octocat',
  id: 1,
  avatar_url: 'a',
  html_url: 'h',
  name: 'Octo',
  email: 'o@e.com',
};

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  (globalThis as { fetch: typeof fetch }).fetch = jest.fn(impl) as unknown as typeof fetch;
}

beforeEach(async () => {
  await AsyncStorage.clear?.();
});

describe('AuthService.validateToken', () => {
  it('returns ok with user on 200', async () => {
    mockFetch(async () => new Response(JSON.stringify(okUser), { status: 200 }));
    const result = await AuthService.validateToken('good');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.login).toBe('octocat');
  });

  it('returns invalid on 401', async () => {
    mockFetch(async () => new Response('', { status: 401 }));
    const result = await AuthService.validateToken('bad');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns invalid on 403', async () => {
    mockFetch(async () => new Response('', { status: 403 }));
    const result = await AuthService.validateToken('bad');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns network on 5xx', async () => {
    mockFetch(async () => new Response('', { status: 503 }));
    const result = await AuthService.validateToken('any');
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('returns network when fetch throws', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    const result = await AuthService.validateToken('any');
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});

describe('AuthService.validateAllAccounts', () => {
  const profileA = { login: 'a', name: 'A', email: 'a@x', avatarUrl: 'a.png' };
  const profileB = { login: 'b', name: 'B', email: 'b@x', avatarUrl: 'b.png' };

  it('removes only accounts whose tokens are 401/403', async () => {
    const a = await AccountStorage.addAccount('good-token', profileA);
    const b = await AccountStorage.addAccount('bad-token', profileB);

    mockFetch(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
      if (auth.includes('good-token')) return new Response(JSON.stringify(okUser), { status: 200 });
      return new Response('', { status: 401 });
    });

    const { removed } = await AuthService.validateAllAccounts();
    expect(removed).toEqual([b.id]);
    const remaining = await AccountStorage.listAccounts();
    expect(remaining.map((x) => x.id)).toEqual([a.id]);
  });

  it('keeps accounts on network error', async () => {
    const a = await AccountStorage.addAccount('any-token', profileA);
    mockFetch(async () => {
      throw new Error('offline');
    });
    const { removed } = await AuthService.validateAllAccounts();
    expect(removed).toEqual([]);
    const remaining = await AccountStorage.listAccounts();
    expect(remaining.map((x) => x.id)).toEqual([a.id]);
  });

  it('promotes next account when active is removed', async () => {
    const a = await AccountStorage.addAccount('bad-token', profileA);
    const b = await AccountStorage.addAccount('good-token', profileB);
    expect(await AccountStorage.getActiveAccountId()).toBe(a.id);

    mockFetch(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
      if (auth.includes('good-token')) return new Response(JSON.stringify(okUser), { status: 200 });
      return new Response('', { status: 401 });
    });

    const { removed } = await AuthService.validateAllAccounts();
    expect(removed).toEqual([a.id]);
    expect(await AccountStorage.getActiveAccountId()).toBe(b.id);
  });
});
