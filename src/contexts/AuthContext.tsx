import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AuthService, AuthState } from '../services/AuthService';
import { GitHubService } from '../services/GitHubService';
import { AccountStorage, type AddAccountOpts, type StoredAccount } from '../services/AccountStorage';

interface AuthContextType {
  authState: AuthState;
  accounts: StoredAccount[];
  activeAccountId: string | null;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
  setToken: (token: string, opts?: AddAccountOpts) => Promise<boolean>;
  clearToken: () => Promise<void>;
  addAccount: (token: string, opts?: AddAccountOpts) => Promise<StoredAccount | null>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const EMPTY_AUTH: AuthState = { isAuthenticated: false, user: null, token: null };

type GhSetTokenUser = Parameters<typeof GitHubService.setToken>[1];

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>(EMPTY_AUTH);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    const list = await AuthService.listAccounts();
    const activeId = await AuthService.getActiveAccountId();
    setAccounts(list);
    setActiveAccountIdState(activeId);
  }, []);

  const refreshAuth = useCallback(async () => {
    const state = await AuthService.checkAuthState();
    setAuthState(state);
    await refreshAccounts();
  }, [refreshAccounts]);

  const setToken = useCallback(async (token: string, opts: AddAccountOpts = {}): Promise<boolean> => {
    setIsLoading(true);
    // For self-hosted hosts (Gitea, GitLab), there's no
    // GitHub user to fetch — we skip the `GitHubService`
    // validation. The host context the caller passed in `opts`
    // (if any) is persisted on the account so the per-repo
    // dispatch in `SyncEngineService` reads the right kind.
    const isSelfHosted = opts.hostKind === 'gitea' || opts.hostKind === 'gitlab';
    if (isSelfHosted) {
      // Self-hosted accounts: persist the token as a new
      // account and set it active. There's no `/user` round
      // trip to validate against — the token is accepted on
      // faith and validated lazily on the first API call.
      const account = await AccountStorage.addAccount(token, {
        login: opts.hostKind === 'gitea' ? 'gitea-user' : 'gitlab-user',
        name: opts.hostKind === 'gitea' ? 'Gitea User' : 'GitLab User',
        email: '',
        avatarUrl: '',
      }, opts);
      await AccountStorage.setActiveAccountId(account.id);
      const state: AuthState = { isAuthenticated: true, user: null, token };
      setAuthState(state);
      await refreshAccounts();
      setIsLoading(false);
      return true;
    }
    // GitHub flow (existing).
    const state = await AuthService.setToken(token);
    if (!state.isAuthenticated) {
      setIsLoading(false);
      return false;
    }
    const ghUser = await GitHubService.setToken(token, state.user as unknown as GhSetTokenUser);
    if (!ghUser) {
      await AuthService.clearToken();
      setAuthState(EMPTY_AUTH);
      await refreshAccounts();
      setIsLoading(false);
      return false;
    }
    setAuthState(state);
    await refreshAccounts();
    setIsLoading(false);
    return true;
  }, [refreshAccounts]);

  const clearToken = useCallback(async () => {
    await AuthService.clearToken();
    await GitHubService.clearToken();
    setAuthState(EMPTY_AUTH);
    await refreshAccounts();
    const remaining = await AuthService.listAccounts();
    if (remaining.length > 0) {
      const promoted = remaining[0];
      const next = await AuthService.setActiveAccount(promoted.id);
      if (next.isAuthenticated && next.token) {
        await GitHubService.setToken(next.token, next.user as unknown as GhSetTokenUser);
        setAuthState(next);
      }
      await refreshAccounts();
    }
  }, [refreshAccounts]);

  const addAccount = useCallback(async (token: string, opts: AddAccountOpts = {}): Promise<StoredAccount | null> => {
    // Self-hosted accounts: skip the GitHub `/user` round trip
    // (the token isn't for github.com) and persist directly with
    // a stub profile. The host kind is in `opts`; the stub
    // profile's `login` is overwritten by the real GitLab/Gitea
    // `/user` call on the first authenticated API request.
    const isSelfHosted = opts.hostKind === 'gitea' || opts.hostKind === 'gitlab';
    if (isSelfHosted) {
      const account = await AccountStorage.addAccount(
        token,
        {
          login: opts.hostKind === 'gitea' ? 'gitea-user' : 'gitlab-user',
          name: opts.hostKind === 'gitea' ? 'Gitea User' : 'GitLab User',
          email: '',
          avatarUrl: '',
        },
        opts,
      );
      await refreshAccounts();
      return account;
    }
    // GitHub flow (existing): fetch the user, then persist.
    const account = await AuthService.addAccount(token);
    if (account) await refreshAccounts();
    return account;
  }, [refreshAccounts]);

  const removeAccount = useCallback(async (id: string) => {
    const wasActive = (await AuthService.getActiveAccountId()) === id;
    await AuthService.removeAccount(id);
    await refreshAccounts();

    if (wasActive) {
      const remaining = await AuthService.listAccounts();
      if (remaining.length > 0) {
        const next = await AuthService.setActiveAccount(remaining[0].id);
        if (next.isAuthenticated && next.token) {
          await GitHubService.setToken(next.token, next.user as unknown as GhSetTokenUser);
          setAuthState(next);
        }
      } else {
        await GitHubService.clearToken();
        setAuthState(EMPTY_AUTH);
      }
      await refreshAccounts();
    }
  }, [refreshAccounts]);

  const switchAccount = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    const next = await AuthService.setActiveAccount(id);
    if (!next.isAuthenticated || !next.token) {
      setIsLoading(false);
      return false;
    }
    const ghUser = await GitHubService.setToken(next.token, next.user as unknown as GhSetTokenUser);
    if (!ghUser) {
      setIsLoading(false);
      return false;
    }
    setAuthState(next);
    await refreshAccounts();
    setIsLoading(false);
    return true;
  }, [refreshAccounts]);

  useEffect(() => {
    (async () => {
      try {
        await refreshAuth();
        await GitHubService.initialize();
        const { removed } = await AuthService.validateAllAccounts();
        if (removed.length > 0) {
          const state = await AuthService.checkAuthState();
          if (state.isAuthenticated && state.token) {
            await GitHubService.setToken(state.token, state.user as unknown as GhSetTokenUser);
          } else {
            await GitHubService.clearToken();
          }
          setAuthState(state);
          await refreshAccounts();
        }
      } catch (err) {
        console.warn('[AuthContext] auth bootstrap failed:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      authState,
      accounts,
      activeAccountId,
      isLoading,
      refreshAuth,
      setToken,
      clearToken,
      addAccount,
      removeAccount,
      switchAccount,
    }),
    [authState, accounts, activeAccountId, isLoading, refreshAuth, setToken, clearToken, addAccount, removeAccount, switchAccount],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * True when account-aware UI (picker, badges, filters) should render.
 * Hidden in the single-account default.
 */
export function useShouldShowAccountUI(): boolean {
  const { accounts } = useAuth();
  return accounts.length >= 2;
}

export default AuthContext;
