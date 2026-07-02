import { create } from 'zustand';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';
import { useNoteStore } from './noteStore';
import { useCanvasStore } from './canvasStore';
import { useTodoStore } from './todoStore';
import type { GitHostProvider } from '../services/git/GitHost';

interface RepoState {
  repositories: GitRepository[];
  isLoading: boolean;
}

interface RepoActions {
  loadRepos: () => Promise<void>;
  addRepository: (path: string, name?: string, provider?: GitHostProvider) => Promise<GitRepository>;
  removeRepository: (path: string, provider?: GitHostProvider) => Promise<void>;
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

  addRepository: async (path, name, provider = 'github') => {
    const repo = await GitService.addRepository(path, name, provider);
    const updated = await StorageService.getSavedRepositories();
    set({ repositories: updated });
    return repo;
  },

  removeRepository: async (path, provider = 'github') => {
    await StorageService.removeRepository(path, provider);
    // Drop all locally-cached records that originated from the removed repo
    // before refreshing the dependent stores. Without this, notes/canvases/
    // todos from the now-disconnected repo keep showing up in their lists
    // even though the repo is gone from settings.
    await StorageService.purgeRepoData(path);
    set((state) => ({
      repositories: state.repositories.filter(
        (r) => !(r.path === path && (r.provider ?? 'github') === provider),
      ),
    }));
    await Promise.all([
      useNoteStore.getState().refreshNotes(),
      useCanvasStore.getState().refreshCanvases(),
      useTodoStore.getState().refreshTodos(),
    ]);
  },

  refreshRepos: async () => {
    await get().loadRepos();
  },
}));
