// Stub for deleted RepoContext module

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { GitRepository } from '../services/GitService';

interface RepoContextValue {
  repositories: GitRepository[];
  refreshRepos: () => Promise<void>;
  addRepository: (path: string, name?: string, provider?: string, options?: unknown) => Promise<void>;
  removeRepository: (path: string) => Promise<void>;
}

const RepoContext = createContext<RepoContextValue | undefined>(undefined);

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repositories, setRepositories] = useState<GitRepository[]>([]);

  const refreshRepos = useCallback(async () => {
    // Stub - does nothing
  }, []);

  const addRepository = useCallback(async (_path: string, _name?: string, _provider?: string, _options?: unknown) => {
    // Stub - does nothing
  }, []);

  const removeRepository = useCallback(async (_path: string) => {
    // Stub - does nothing
  }, []);

  return (
    <RepoContext.Provider value={{ repositories, refreshRepos, addRepository, removeRepository }}>
      {children}
    </RepoContext.Provider>
  );
}

export const useRepos = (): RepoContextValue => {
  const ctx = useContext(RepoContext);
  if (!ctx) {
    return { 
      repositories: [], 
      refreshRepos: async () => {},
      addRepository: async () => {},
      removeRepository: async () => {},
    };
  }
  return ctx;
};
