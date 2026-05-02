import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AuthService, AuthState } from '../services/AuthService';
import { GitHubService } from '../services/GitHubService';
import type { StoredAccount } from '../services/AccountStorage';

interface AuthContextType {
  authState: AuthState;
  accounts: StoredAccount[];
  activeAccountId: string | null;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
  setToken: (token: string) => Promise<boolean>;
  clearToken: () => Promise<void>;
  addAccount: (token: string) => Promise<StoredAccount | null>;
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

  const setToken = useCallback(async (token: string): Promise<boolean> => {
    setIsLoading(true);
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

  const addAccount = useCallback(async (token: string): Promise<StoredAccount | null> => {
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
    refreshAuth()
      .then(() => GitHubService.initialize())
      .catch((err) => {
        console.warn('[AuthContext] auth bootstrap failed:', err);
      })
      .finally(() => setIsLoading(false));
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
