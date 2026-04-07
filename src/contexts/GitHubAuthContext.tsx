import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GitHubService, GitHubUser } from '../services/GitHubService';

interface GitHubAuthContextType {
  user: GitHubUser | null;
  isReady: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextType | undefined>(undefined);

export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    GitHubService.initialize().then(() => {
      setUser(GitHubService.getUser());
      setIsReady(true);
    });
  }, []);

  return (
    <GitHubAuthContext.Provider value={{ user, isReady }}>
      {children}
    </GitHubAuthContext.Provider>
  );
}

export function useGitHubAuth(): GitHubAuthContextType {
  const context = useContext(GitHubAuthContext);
  if (!context) throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
  return context;
}
