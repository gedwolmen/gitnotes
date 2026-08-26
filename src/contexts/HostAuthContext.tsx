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

type GitHostProvider = 'github' | 'gitlab' | 'gitea' | 'forgejo';
interface GitHostUser { id: number; login: string; username?: string; name?: string; email?: string | null; avatar_url?: string | null; }

interface GitLabServiceLike {
  setToken(token: string, baseUrl?: string): Promise<GitHostUser | null>;
  getUser(): GitHostUser | null;
  isAuthenticated(): boolean;
  getBaseUrl(): string;
  clearToken(): Promise<void>;
  setBaseUrl(baseUrl: string): void;
  initialize(): Promise<void>;
}

interface GiteaServiceLike {
  setToken(token: string, baseUrl?: string): Promise<GitHostUser | null>;
  getUser(): GitHostUser | null;
  isAuthenticated(): boolean;
  getBaseUrl(): string;
  clearToken(): Promise<void>;
  setBaseUrl(baseUrl: string): void;
  initialize(): Promise<void>;
}

const gitLabService: GitLabServiceLike = {
  setToken: async () => null,
  getUser: () => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  clearToken: async () => {},
  setBaseUrl: () => {},
  initialize: async () => {},
};
const giteaHostService: GiteaServiceLike = {
  setToken: async () => null,
  getUser: () => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  clearToken: async () => {},
  setBaseUrl: () => {},
  initialize: async () => {},
};
const forgejoHostService: GiteaServiceLike = {
  setToken: async () => null,
  getUser: () => null,
  isAuthenticated: () => false,
  getBaseUrl: () => '',
  clearToken: async () => {},
  setBaseUrl: () => {},
  initialize: async () => {},
};
const GIT_HOST_API_BASES = { github: 'https://api.github.com', gitlab: 'https://gitlab.com/api/v4', gitea: '', forgejo: '' };
const GIT_HOST_LABELS = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Gitea', forgejo: 'Forgejo' };
type GiteaLikeUser = GitHostUser;

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
  _provider: GitHostProvider,
  user: GiteaLikeUser | null,
): GitHostUser | null {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    name: (user as { full_name?: string }).full_name ?? user.login,
    email: user.email ?? null,
    avatar_url: user.avatar_url ?? null,
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
          avatar_url: u.avatar_url ?? null,
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
          login: u.username ?? u.login,
          name: u.name,
          email: u.email ?? null,
          avatar_url: u.avatar_url ?? null,
        }
      : null,
    isAuthenticated: gitLabService.isAuthenticated(),
    baseUrl: gitLabService.getBaseUrl(),
  };
}

function snapshotGiteaLike(provider: 'gitea' | 'forgejo'): HostAuthState {
  const svc = provider === 'gitea' ? giteaHostService : forgejoHostService;
  return {
    provider,
    label: GIT_HOST_LABELS[provider],
    user: giteaUserToHostUser(provider, svc.getUser()),
    isAuthenticated: svc.isAuthenticated(),
    baseUrl: svc.getBaseUrl(),
  };
}

function snapshotAll(): Record<GitHostProvider, HostAuthState> {
  return {
    github: snapshotGitHub(),
    gitlab: snapshotGitLab(),
    gitea: snapshotGiteaLike('gitea'),
    forgejo: snapshotGiteaLike('forgejo'),
  };
}

interface HostAuthProviderProps {
  children: ReactNode;
}

export function HostAuthProvider({ children }: HostAuthProviderProps) {
  const [hosts, setHosts] = useState<Record<GitHostProvider, HostAuthState>>(
    () => snapshotAll(),
  );
  const [status, setStatus] = useState<HostAuthStatus>('unknown');

  const refresh = useCallback(async () => {
    setHosts(snapshotAll());
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
        setHosts(snapshotAll());
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
              email: gh.email ?? null,
              avatar_url: gh.avatar_url ?? null,
            }
          : null;
      } else if (provider === 'gitlab') {
        const gl = await gitLabService.setToken(token, baseUrl);
        user = gl
          ? {
              id: gl.id,
              login: gl.username ?? gl.login,
              name: gl.name,
              email: gl.email ?? null,
              avatar_url: gl.avatar_url ?? null,
            }
          : null;
      } else if (provider === 'gitea' || provider === 'forgejo') {
        const svc = provider === 'gitea' ? giteaHostService : forgejoHostService;
        const gl = await svc.setToken(token, baseUrl);
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
      if (provider === 'gitlab') {
        gitLabService.setBaseUrl(baseUrl);
        await gitLabService.initialize();
      } else if (provider === 'gitea') {
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
