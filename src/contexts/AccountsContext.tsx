import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  AccountSummary,
  AuthService,
  AuthState,
  ConnectHostInput,
  HostConnectionSummary,
  validateHostToken,
} from '../services/AuthService';
import type { GitHostProvider } from '../services/git/GitHost';
import { GitHubService } from '../services/GitHubService';
import { AccountStorage, StoredAccount } from '../services/AccountStorage';
import { clearActiveGitHostCache } from '../services/git/activeHost';
import { useAIStore } from '../stores/aiStore';

interface ConnectHostResult {
  ok: boolean;
  error?: string;
  host?: HostConnectionSummary;
}

interface AccountsContextValue {
  authState: AuthState;
  /** New multi-host view: every account with all of its host connections. */
  accountSummaries: AccountSummary[];
  /** Legacy flat list of accounts used by existing screens (SettingsScreen, etc.). */
  accounts: StoredAccount[];
  activeHostId: string | null;
  activeAccountId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshAccounts: () => Promise<void>;

  /** Pick a host and validate the supplied token against its API. */
  connectHost: (input: ConnectHostInput) => Promise<ConnectHostResult>;
  /** Remove a host connection from the active account. */
  disconnectHost: (hostId: string) => Promise<void>;
  /** Make this host connection the active one across the app. */
  switchToHost: (hostId: string) => Promise<boolean>;
  /** Make this account the active one (defaults to its first available host). */
  switchAccount: (accountId: string) => Promise<boolean>;
  /** Remove an account and all its host connections. */
  removeAccount: (accountId: string) => Promise<void>;

  /** Validates a token without persisting anything. */
  testToken: (
    provider: GitHostProvider,
    token: string,
    instanceBaseUrl?: string | null,
  ) => Promise<{ ok: boolean; reason?: 'invalid' | 'network' }>;

  // ── Legacy aliases (kept so existing useAuth() callers keep compiling) ──
  setToken: (token: string) => Promise<boolean>;
  clearToken: () => Promise<void>;
  addAccount: (token: string) => Promise<StoredAccount | null>;
}

const AccountsContext = createContext<AccountsContextValue | undefined>(undefined);

const EMPTY_AUTH: AuthState = { isAuthenticated: false, user: null, token: null };

type GhSetTokenUser = Parameters<typeof GitHubService.setToken>[1];

function flattenAccounts(summaries: AccountSummary[]): StoredAccount[] {
  return summaries.map((s) => s.account);
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(EMPTY_AUTH);
  const [accountSummaries, setAccountSummaries] = useState<AccountSummary[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    const summaries = await AuthService.listAccountSummaries();
    const activeSummary = await AuthService.getActiveSummary();
    setAccountSummaries(summaries);
    setActiveAccountId(activeSummary?.account.id ?? null);
    setActiveHostId(activeSummary?.activeHostId ?? null);
    const token = activeSummary ? await AuthService.getToken() : null;
    if (activeSummary) {
      const host =
        activeSummary.hosts.find((h) => h.id === activeSummary.activeHostId) ??
        activeSummary.hosts[0];
      const user = host
        ? {
            id: host.hostUserId,
            login: host.hostLogin,
            name: host.name ?? host.hostLogin,
            email: host.email ?? '',
            avatar_url: host.avatarUrl ?? '',
          }
        : null;
      setAuthState({ isAuthenticated: !!token && !!user, user, token });
    } else {
      setAuthState(EMPTY_AUTH);
    }
    clearActiveGitHostCache();
  }, []);

  // Hydrate legacy GitHub service on first mount so any code paths that
  // still touch GitHubService.getUser()/getToken() before going through the
  // active host continue to work for SaaS-GitHub users.
  useEffect(() => {
    (async () => {
      try {
        await refreshAccounts();
        await GitHubService.initialize();
        const { removed } = await AuthService.validateAllAccounts();
        if (removed.length > 0) {
          const active = await AuthService.getActiveSummary();
          const token = await AuthService.getToken();
          if (active && token) {
            const host = active.hosts[0];
            if (host) {
              await GitHubService.setToken(token, {
                id: host.hostUserId,
                login: host.hostLogin,
                name: host.name,
                email: host.email ?? '',
                avatar_url: host.avatarUrl ?? '',
              } as unknown as GhSetTokenUser).catch(() => undefined);
            }
          } else {
            await GitHubService.clearToken();
          }
          await refreshAccounts();
        } else {
          // Hydrate GitHubService with the active GitHub token if any.
          const summary = await AuthService.getActiveSummary();
          const githubHost = summary?.hosts.find((h) => h.provider === 'github');
          if (githubHost) {
            const tok = await AuthService.getToken();
            if (tok) {
              await GitHubService.setToken(tok, {
                id: githubHost.hostUserId,
                login: githubHost.hostLogin,
                name: githubHost.name,
                email: githubHost.email ?? '',
                avatar_url: githubHost.avatarUrl ?? '',
              } as unknown as GhSetTokenUser).catch(() => undefined);
            }
          }
        }
      } catch (err) {
        console.warn('[AccountsContext] bootstrap failed:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshAccounts]);

  const clearChatRepoIfOrphaned = useCallback(
    (removedAccountId: string, wasActive: boolean) => {
      const { chatRepoAccountId } = useAIStore.getState();
      const isBound = chatRepoAccountId === removedAccountId;
      const wasActiveBound = chatRepoAccountId === null && wasActive;
      if (isBound || wasActiveBound) {
        useAIStore.getState().setChatRepo(null, null, 'main', null);
      }
    },
    [],
  );

  const connectHost = useCallback(
    async (input: ConnectHostInput): Promise<ConnectHostResult> => {
      const result = await AuthService.connectHost(input);
      await refreshAccounts();
      if (!result) return { ok: false, error: 'Invalid token' };
      // Keep the legacy GitHubService singleton in sync so repo listing /
      // preflight checks (which gate on GitHubService.isAuthenticated) work
      // immediately after connecting a host, not just after an app restart.
      // Mirrors the addAccount/setToken/switchToHost hydration pattern.
      if (result.host.provider === 'github') {
        await GitHubService.setToken(input.token, {
          id: result.host.hostUserId,
          login: result.host.hostLogin,
          name: result.host.name ?? result.host.hostLogin,
          email: result.host.email ?? '',
          avatar_url: result.host.avatarUrl ?? '',
        } as unknown as GhSetTokenUser).catch(() => undefined);
      }
      return { ok: true, host: result.host };
    },
    [refreshAccounts],
  );

  const disconnectHost = useCallback(
    async (hostId: string) => {
      const summary = accountSummaries.find((s) => s.hosts.some((h) => h.id === hostId));
      const owningAccountId = summary?.account.id ?? null;
      const wasActive = owningAccountId !== null && activeAccountId === owningAccountId;
      await AuthService.disconnectHost(hostId);
      await refreshAccounts();
      if (owningAccountId) {
        clearChatRepoIfOrphaned(owningAccountId, wasActive);
      }
    },
    [accountSummaries, activeAccountId, refreshAccounts, clearChatRepoIfOrphaned],
  );

  const switchToHost = useCallback(
    async (hostId: string): Promise<boolean> => {
      const result = await AuthService.switchToHost(hostId);
      if (!result.ok) return false;
      await refreshAccounts();
      // Re-sync GitHubService if we just switched to a GitHub host.
      const active = await AuthService.getActiveSummary();
      if (active?.hosts.find((h) => h.id === active.activeHostId)?.provider === 'github') {
        const tok = await AuthService.getToken();
        const host = active.hosts.find((h) => h.id === active.activeHostId);
        if (tok && host) {
          await GitHubService.setToken(tok, {
            id: host.hostUserId,
            login: host.hostLogin,
            name: host.name,
            email: host.email ?? '',
            avatar_url: host.avatarUrl ?? '',
          } as unknown as GhSetTokenUser).catch(() => undefined);
        }
      }
      return true;
    },
    [refreshAccounts],
  );

  const switchAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      const result = await AuthService.switchAccount(accountId);
      if (!result.ok) return false;
      await refreshAccounts();
      return true;
    },
    [refreshAccounts],
  );

  const removeAccount = useCallback(
    async (accountId: string) => {
      const wasActive = activeAccountId === accountId;
      await AuthService.removeAccount(accountId);
      await refreshAccounts();
      clearChatRepoIfOrphaned(accountId, wasActive);
      if (wasActive) {
        const state = await AuthService.checkAuthState();
        if (state.isAuthenticated && state.token) {
          await GitHubService.setToken(state.token, state.user as unknown as GhSetTokenUser).catch(
            () => undefined,
          );
          setAuthState(state);
        } else {
          await GitHubService.clearToken();
          setAuthState(EMPTY_AUTH);
        }
      }
    },
    [activeAccountId, refreshAccounts, clearChatRepoIfOrphaned],
  );

  const setToken = useCallback(
    async (token: string): Promise<boolean> => {
      const result = await AuthService.connectHost({ provider: 'github', token });
      await refreshAccounts();
      if (!result) {
        setAuthState(EMPTY_AUTH);
        return false;
      }
      const ghUser = await GitHubService.setToken(token, {
        id: result.host.hostUserId,
        login: result.host.hostLogin,
        name: result.host.name ?? result.host.hostLogin,
        email: result.host.email ?? '',
        avatar_url: result.host.avatarUrl ?? '',
      } as unknown as GhSetTokenUser);
      if (!ghUser) {
        await AuthService.disconnectHost(result.host.id);
        setAuthState(EMPTY_AUTH);
        await refreshAccounts();
        return false;
      }
      return true;
    },
    [refreshAccounts],
  );

  const clearToken = useCallback(async () => {
    if (activeHostId) await AuthService.disconnectHost(activeHostId);
    await AuthService.clearToken();
    await GitHubService.clearToken();
    setAuthState(EMPTY_AUTH);
    await refreshAccounts();
    useAIStore.getState().setChatRepo(null, null, 'main', null);
    // Guard against unused imports.
    void AccountStorage;
  }, [activeHostId, refreshAccounts]);

  const addAccount = useCallback(
    async (token: string): Promise<StoredAccount | null> => {
      const result = await AuthService.connectHost({ provider: 'github', token });
      await refreshAccounts();
      if (result) {
        // Keep the legacy GitHubService singleton in sync so repo listing /
        // preflight checks (which gate on GitHubService.isAuthenticated) work
        // immediately after adding an account, not just after an app restart.
        await GitHubService.setToken(token, {
          id: result.host.hostUserId,
          login: result.host.hostLogin,
          name: result.host.name ?? result.host.hostLogin,
          email: result.host.email ?? '',
          avatar_url: result.host.avatarUrl ?? '',
        } as unknown as GhSetTokenUser).catch(() => undefined);
      }
      return result?.account ?? null;
    },
    [refreshAccounts],
  );

  const testToken = useCallback(
    async (
      provider: GitHostProvider,
      token: string,
      instanceBaseUrl?: string | null,
    ): Promise<{ ok: boolean; reason?: 'invalid' | 'network' }> => {
      const result = await validateHostToken(provider, token, instanceBaseUrl ?? null);
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    },
    [],
  );

  const accounts = useMemo(() => flattenAccounts(accountSummaries), [accountSummaries]);

  const value = useMemo<AccountsContextValue>(
    () => ({
      authState,
      accountSummaries,
      accounts,
      activeHostId,
      activeAccountId,
      isAuthenticated: authState.isAuthenticated,
      isLoading,
      refreshAccounts,
      connectHost,
      disconnectHost,
      switchToHost,
      switchAccount,
      removeAccount,
      testToken,
      setToken,
      clearToken,
      addAccount,
    }),
    [
      authState,
      accountSummaries,
      accounts,
      activeHostId,
      activeAccountId,
      isLoading,
      refreshAccounts,
      connectHost,
      disconnectHost,
      switchToHost,
      switchAccount,
      removeAccount,
      testToken,
      setToken,
      clearToken,
      addAccount,
    ],
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsContextValue {
  const ctx = useContext(AccountsContext);
  if (ctx === undefined) throw new Error('useAccounts must be used within an AccountsProvider');
  return ctx;
}

/**
 * @deprecated — alias of `useAccounts()`. Kept so legacy code paths compile.
 */
export function useAuth(): AccountsContextValue {
  return useAccounts();
}

export function useShouldShowAccountUI(): boolean {
  const { accountSummaries } = useAccounts();
  return (
    accountSummaries.length >= 2 ||
    accountSummaries.some((a) => a.hosts.length >= 2)
  );
}

export default AccountsContext;
export type { StoredAccount } from '../services/AccountStorage';
