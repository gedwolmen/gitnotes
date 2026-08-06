import React, { useEffect, useMemo } from 'react';
import { GitRepository } from '../services/GitService';
import { useRepoStore, type AddRepositoryOptions } from '../stores/repoStore';
import type { GitHostProvider } from '../services/git/GitHost';

interface RepoContextType {
  repositories: GitRepository[];
  isLoading: boolean;
  addRepository: (
    path: string,
    nameOrOptions?: string | AddRepositoryOptions,
    provider?: GitHostProvider,
    options?: AddRepositoryOptions,
  ) => Promise<GitRepository>;
  removeRepository: (path: string) => Promise<void>;
  refreshRepos: () => Promise<void>;
}

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const needsLoad = useRepoStore((s) => s.isLoading && s.repositories.length === 0);

  useEffect(() => {
    if (needsLoad) loadRepos();
  }, [needsLoad, loadRepos]);

  return <>{children}</>;
}

export function useRepos(): RepoContextType {
  const repositories = useRepoStore((s) => s.repositories);
  const isLoading = useRepoStore((s) => s.isLoading);
  const addRepository = useRepoStore((s) => s.addRepository);
  const removeRepository = useRepoStore((s) => s.removeRepository);
  const refreshRepos = useRepoStore((s) => s.refreshRepos);

  return useMemo(
    () => ({ repositories, isLoading, addRepository, removeRepository, refreshRepos }),
    [repositories, isLoading, addRepository, removeRepository, refreshRepos],
  );
}
