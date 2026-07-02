import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { gitLabService } from '../services/git/GitLabService';
import type { GitHostUser } from '../services/git/GitHost';

interface GitLabAuthContextType {
  user: GitHostUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
  setToken: (token: string, baseUrl?: string) => Promise<GitHostUser | null>;
  clearToken: () => Promise<void>;
}

const GitLabAuthContext = createContext<GitLabAuthContextType | undefined>(undefined);

export function GitLabAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHostUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    gitLabService
      .initialize()
      .then(async () => {
        const u = gitLabService.getUser();
        setUser(
          u
            ? { id: u.id, login: u.username, name: u.name, email: u.email ?? null, avatarUrl: u.avatar_url ?? null }
            : null,
        );
      })
      .catch((err) => console.warn('[GitLabAuthContext] initialize failed:', err))
      .finally(() => setIsReady(true));
  }, []);

  const value: GitLabAuthContextType = {
    user,
    isReady,
    isAuthenticated: gitLabService.isAuthenticated(),
    setToken: async (token, baseUrl) => {
      const u = await gitLabService.setToken(token, baseUrl);
      const hostUser = u
        ? { id: u.id, login: u.username, name: u.name, email: u.email ?? null, avatarUrl: u.avatar_url ?? null }
        : null;
      setUser(hostUser);
      return hostUser;
    },
    clearToken: async () => {
      await gitLabService.clearToken();
      setUser(null);
    },
  };

  return <GitLabAuthContext.Provider value={value}>{children}</GitLabAuthContext.Provider>;
}

export function useGitLabAuth(): GitLabAuthContextType {
  const ctx = useContext(GitLabAuthContext);
  if (!ctx) throw new Error('useGitLabAuth must be used within a GitLabAuthProvider');
  return ctx;
}
