import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';

interface RepoContextType {
  repositories: GitRepository[];
  isLoading: boolean;
  addRepository: (path: string, name?: string) => Promise<GitRepository>;
  removeRepository: (path: string) => Promise<void>;
  refreshRepos: () => Promise<void>;
}

const RepoContext = createContext<RepoContextType | undefined>(undefined);

interface RepoProviderProps {
  children: ReactNode;
}

export function RepoProvider({ children }: RepoProviderProps) {
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRepos = useCallback(async () => {
    try {
      setIsLoading(true);
      const repos = await StorageService.getSavedRepositories();
      setRepositories(repos);
    } catch (error) {
      console.error('[RepoContext] Failed to load repositories:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const addRepository = useCallback(async (path: string, name?: string): Promise<GitRepository> => {
    const repo = await GitService.addRepository(path, name);
    const updated = await StorageService.getSavedRepositories();
    setRepositories(updated);
    return repo;
  }, []);

  const removeRepository = useCallback(async (path: string): Promise<void> => {
    await GitService.removeRepository(path);
    const updated = await StorageService.getSavedRepositories();
    setRepositories(updated);
  }, []);

  const refreshRepos = useCallback(async () => {
    await loadRepos();
  }, [loadRepos]);

  const value = useMemo<RepoContextType>(() => ({
    repositories,
    isLoading,
    addRepository,
    removeRepository,
    refreshRepos,
  }), [repositories, isLoading, addRepository, removeRepository, refreshRepos]);

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepos(): RepoContextType {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error('useRepos must be used within a RepoProvider');
  }
  return context;
}

export { RepoContext };
