import { create } from 'zustand';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';

interface RepoState {
  repositories: GitRepository[];
  isLoading: boolean;
}

interface RepoActions {
  loadRepos: () => Promise<void>;
  addRepository: (path: string, name?: string) => Promise<GitRepository>;
  removeRepository: (path: string) => Promise<void>;
  refreshRepos: () => Promise<void>;
}

export const useRepoStore = create<RepoState & RepoActions>()((set, get) => ({
  repositories: [],
  isLoading: true,

  loadRepos: async () => {
    try {
      set({ isLoading: true });
      const repos = await StorageService.getSavedRepositories();
      set({ repositories: repos, isLoading: false });
    } catch (error) {
      console.error('[RepoStore] Failed to load repositories:', error);
      set({ isLoading: false });
    }
  },

  addRepository: async (path, name) => {
    const repo = await GitService.addRepository(path, name);
    const updated = await StorageService.getSavedRepositories();
    set({ repositories: updated });
    return repo;
  },

  removeRepository: async (path) => {
    await StorageService.removeRepository(path);
    set((state) => ({ repositories: state.repositories.filter((r) => r.path !== path) }));
  },

  refreshRepos: async () => {
    await get().loadRepos();
  },
}));
