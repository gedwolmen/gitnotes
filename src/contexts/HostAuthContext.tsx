import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { GitHubService } from '../services/GitHubService';
import { gitLabService } from '../services/git/GitLabService';
import {
  giteaHostService,
  forgejoHostService,
} from '../services/git/gitHostFactory';
import {
  GIT_HOST_API_BASES,
  GIT_HOST_LABELS,
  type GitHostProvider,
  type GitHostUser,
} from '../services/git/GitHost';
import type { GiteaLikeUser } from '../services/git/GiteaLikeHostService';

export type HostAuthStatus = 'unknown' | 'ready';

export interface HostAuthState {
  provider: GitHostProvider;
  label: string;
  user: GitHostUser | null;
  isAuthenticated: boolean;
  baseUrl: string;
}

export interface HostAuthContextValue {
  hosts: Record<GitHostProvider, HostAuthState>;
  status: HostAuthStatus;
  refresh: () => Promise<void>;
  setToken: (
    provider: GitHostProvider,
    token: string,
    baseUrl?: string,
  ) => Promise<GitHostUser | null>;
  clearToken: (provider: GitHostProvider) => Promise<void>;
  setBaseUrl: (provider: GitHostProvider, baseUrl: string) => Promise<void>;
}

const HOST_ORDER: GitHostProvider[] = ['github', 'gitlab', 'gitea', 'forgejo'];

const HostAuthContext = createContext<HostAuthContextValue | undefined>(undefined);

function giteaUserToHostUser(
  provider: GitHostProvider,
  user: GiteaLikeUser | null,
): GitHostUser | null {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    name: user.full_name ?? user.login,
    email: user.email ?? null,
    avatarUrl: user.avatar_url ?? null,
  };
}

function snapshotGitHub(): HostAuthState {
  const u = GitHubService.getUser();
  return {
    provider: 'github',
    label: GIT_HOST_LABELS.github,
    user: u
      ? {
          id: u.id,
          login: u.login,
          name: u.name ?? null,
          email: u.email ?? null,
          avatarUrl: u.avatar_url ?? null,
        }
      : null,
    isAuthenticated: GitHubService.isAuthenticated(),
    baseUrl: GIT_HOST_API_BASES.github,
  };
}

function snapshotGitLab(): HostAuthState {
  const u = gitLabService.getUser();
  return {
    provider: 'gitlab',
    label: GIT_HOST_LABELS.gitlab,
    user: u
      ? {
          id: u.id,
          login: u.username,
          name: u.name,
          email: u.email ?? null,
          avatarUrl: u.avatar_url ?? null,
        }
      : null,
    isAuthenticated: gitLabService.isAuthenticated(),
    baseUrl: gitLabService.getBaseUrl(),
  };
}

async function snapshotGiteaLike(provider: 'gitea' | 'forgejo'): Promise<HostAuthState> {
  const svc = provider === 'gitea' ? giteaHostService : forgejoHostService;
  const user = await svc.getUser();
  return {
    provider,
    label: GIT_HOST_LABELS[provider],
    user: giteaUserToHostUser(provider, user),
    isAuthenticated: svc.isAuthenticated(),
    baseUrl: svc.getBaseUrl(),
  };
}

async function snapshotAll(): Promise<Record<GitHostProvider, HostAuthState>> {
  const [github, gitlab, gitea, forgejo] = await Promise.all([
    snapshotGitHub(),
    snapshotGitLab(),
    snapshotGiteaLike('gitea'),
    snapshotGiteaLike('forgejo'),
  ]);
  return { github, gitlab, gitea, forgejo };
}

interface HostAuthProviderProps {
  children: ReactNode;
}

export function HostAuthProvider({ children }: HostAuthProviderProps) {
  const [hosts, setHosts] = useState<Record<GitHostProvider, HostAuthState>>(
    () => ({
      github: snapshotGitHub(),
      gitlab: {
        provider: 'gitlab',
        label: GIT_HOST_LABELS.gitlab,
        user: null,
        isAuthenticated: gitLabService.isAuthenticated(),
        baseUrl: gitLabService.getBaseUrl(),
      },
      gitea: {
        provider: 'gitea',
        label: GIT_HOST_LABELS.gitea,
        user: null,
        isAuthenticated: giteaHostService.isAuthenticated(),
        baseUrl: giteaHostService.getBaseUrl(),
      },
      forgejo: {
        provider: 'forgejo',
        label: GIT_HOST_LABELS.forgejo,
        user: null,
        isAuthenticated: forgejoHostService.isAuthenticated(),
        baseUrl: forgejoHostService.getBaseUrl(),
      },
    }),
  );
  const [status, setStatus] = useState<HostAuthStatus>('unknown');

  const refresh = useCallback(async () => {
    setHosts(await snapshotAll());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          GitHubService.initialize(),
          gitLabService.initialize(),
          giteaHostService.initialize(),
          forgejoHostService.initialize(),
        ]);
      } catch (err) {
        console.warn('[HostAuthContext] initialize failed:', err);
      }
if (!cancelled) {
        setHosts(await snapshotAll());
        setStatus('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setToken = useCallback(
    async (
      provider: GitHostProvider,
      token: string,
      baseUrl?: string,
    ): Promise<GitHostUser | null> => {
      let user: GitHostUser | null = null;
      if (provider === 'github') {
        const gh = await GitHubService.setToken(token);
user = gh
          ? {
              id: gh.id,
              login: gh.login,
              name: gh.name ?? null,
              avatarUrl: gh.avatar_url ?? null,
            }
          : null;
      } else if (provider === 'gitlab') {
        gitLabService.setToken(token);
        const gl = await gitLabService.getUser();
        user = gl
          ? {
              id: gl.id,
              login: gl.username,
              name: gl.name,
              email: gl.email ?? null,
              avatarUrl: gl.avatar_url ?? null,
            }
          : null;
      } else if (provider === 'gitea' || provider === 'forgejo') {
        const svc = provider === 'gitea' ? giteaHostService : forgejoHostService;
        svc.setToken(token);
        const gl = await svc.getUser();
        user = giteaUserToHostUser(provider, gl);
      }
      await refresh();
      return user;
    },
    [refresh],
  );

  const clearToken = useCallback(
    async (provider: GitHostProvider): Promise<void> => {
      if (provider === 'github') {
        await GitHubService.clearToken();
      } else if (provider === 'gitlab') {
        await gitLabService.clearToken();
      } else if (provider === 'gitea') {
        await giteaHostService.clearToken();
      } else if (provider === 'forgejo') {
        await forgejoHostService.clearToken();
      }
      await refresh();
    },
    [refresh],
  );

  const setBaseUrl = useCallback(
    async (provider: GitHostProvider, baseUrl: string): Promise<void> => {
      if (provider === 'gitea') {
        giteaHostService.setBaseUrl(baseUrl);
        await giteaHostService.initialize();
      } else if (provider === 'forgejo') {
        forgejoHostService.setBaseUrl(baseUrl);
        await forgejoHostService.initialize();
      }
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<HostAuthContextValue>(
    () => ({
      hosts,
      status,
      refresh,
      setToken,
      clearToken,
      setBaseUrl,
    }),
    [hosts, status, refresh, setToken, clearToken, setBaseUrl],
  );

  return (
    <HostAuthContext.Provider value={value}>{children}</HostAuthContext.Provider>
  );
}

export function useHostAuth(): HostAuthContextValue {
  const ctx = useContext(HostAuthContext);
  if (!ctx) {
    throw new Error('useHostAuth must be used within a HostAuthProvider');
  }
  return ctx;
}

export function useHostAuthFor(provider: GitHostProvider): HostAuthState {
  const { hosts } = useHostAuth();
  return hosts[provider];
}

export function useHostProvidersOrder(): readonly GitHostProvider[] {
  return HOST_ORDER;
}

export default HostAuthContext;