import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GitHubService, GitHubUser } from '../services/GitHubService';

interface GitHubAuthContextType {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  isLoading: boolean;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const GitHubAuthContext = createContext<GitHubAuthContextType | undefined>(undefined);

interface GitHubAuthProviderProps {
  children: ReactNode;
}

export function GitHubAuthProvider({ children }: GitHubAuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await GitHubService.initialize();
      setIsAuthenticated(GitHubService.isAuthenticated());
      setUser(GitHubService.getUser());
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (): Promise<boolean> => {
    setIsLoading(true);
    const success = await GitHubService.authenticate();
    setIsAuthenticated(success);
    setUser(GitHubService.getUser());
    setIsLoading(false);
    return success;
  };

  const logout = async () => {
    setIsLoading(true);
    await GitHubService.logout();
    setIsAuthenticated(false);
    setUser(null);
    setIsLoading(false);
  };

  const value: GitHubAuthContextType = {
    isAuthenticated,
    user,
    isLoading,
    login,
    logout,
  };

  return (
    <GitHubAuthContext.Provider value={value}>
      {children}
    </GitHubAuthContext.Provider>
  );
}

export function useGitHubAuth(): GitHubAuthContextType {
  const context = useContext(GitHubAuthContext);
  if (context === undefined) {
    throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
  }
  return context;
}