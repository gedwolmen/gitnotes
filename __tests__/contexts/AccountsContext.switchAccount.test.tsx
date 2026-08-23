const mockSetToken = jest.fn();
const mockClearToken = jest.fn();

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    setToken: (...args: unknown[]) => mockSetToken(...args),
    clearToken: (...args: unknown[]) => mockClearToken(...args),
    initialize: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    switchAccount: jest.fn(async (accountId: string) => {
      if (accountId === 'acc-A') {
        return {
          ok: true,
          isAuthenticated: true,
          token: 'token-A',
          user: { login: 'alice', id: 1, name: 'Alice' },
          accountId: 'acc-A',
          activeHostId: 'host-A',
        };
      }
      if (accountId === 'acc-B') {
        return {
          ok: true,
          isAuthenticated: true,
          token: 'token-B',
          user: { login: 'bob', id: 2, name: 'Bob' },
          accountId: 'acc-B',
          activeHostId: 'host-B',
        };
      }
      return { ok: false };
    }),
    switchToHost: jest.fn(async () => ({ ok: true })),
    removeAccount: jest.fn(async () => undefined),
    connectHost: jest.fn(async () => null),
    clearToken: jest.fn(async () => undefined),
    checkAuthState: jest.fn(async () => ({
      isAuthenticated: true,
      token: 'token-A',
      user: { login: 'alice', id: 1, name: 'Alice' },
    })),
    listAccountSummaries: jest.fn(async () => []),
    getActiveSummary: jest.fn(async () => null),
  },
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    setAuthState: jest.fn(),
  }),
}));

jest.mock('../../src/services/ChatStorageService', () => ({
  setChatRepoAccount: jest.fn(async () => undefined),
  clearChatRepoIfOrphaned: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        mem[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete mem[k];
      }),
      clear: jest.fn(async () => {
        for (const k of Object.keys(mem)) delete mem[k];
      }),
    },
  };
});

import { renderHook, act } from '@testing-library/react-native';
import { AccountsProvider, useAccounts } from '../../src/contexts/AccountsContext';

beforeEach(() => {
  mockSetToken.mockReset();
  mockClearToken.mockReset();
  mockSetToken.mockResolvedValue(null);
  mockClearToken.mockResolvedValue(undefined);
});

function useAccountsWithProvider() {
  return renderHook(() => useAccounts(), { wrapper: AccountsProvider });
}

describe('AccountsContext.switchAccount re-syncs GitHubService singleton', () => {
  it('calls GitHubService.setToken with the new account token after switching', async () => {
    const { result } = useAccountsWithProvider();
    await act(async () => {
      await result.current.switchAccount('acc-B');
    });
    expect(mockSetToken).toHaveBeenCalledWith('token-B', expect.objectContaining({ login: 'bob' }));
  });

  it('does NOT leak the previous account token: setToken is called with the NEW token, not the old one', async () => {
    const { result } = useAccountsWithProvider();
    await act(async () => {
      await result.current.switchAccount('acc-A');
    });
    expect(mockSetToken).toHaveBeenCalledWith('token-A', expect.objectContaining({ login: 'alice' }));
    mockSetToken.mockClear();

    await act(async () => {
      await result.current.switchAccount('acc-B');
    });
    const calledWith = mockSetToken.mock.calls.map((c) => c[0]);
    expect(calledWith).toContain('token-B');
    expect(calledWith).not.toContain('token-A');
  });
});
