import { create } from 'zustand';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';
import { TemplateRepoPreferenceService } from '../services/TemplateRepoPreferenceService';
import { LastUsedRepoService } from '../services/LastUsedRepoService';
import { useAIStore } from './aiStore';
import { useNoteStore } from './noteStore';
import { useCanvasStore } from './canvasStore';
import { useTodoStore } from './todoStore';
import type { GitHostProvider } from '../services/git/GitHost';

type RemovedHostRef = { hostId: string; provider: GitHostProvider };

interface RepoState {
  repositories: GitRepository[];
  isLoading: boolean;
}

export type AddRepositoryOptions = {
  readonly allowUnverifiedWrite?: boolean;
};

interface RepoActions {
  loadRepos: () => Promise<void>;
  addRepository: (
    path: string,
    nameOrOptions?: string | AddRepositoryOptions,
    provider?: GitHostProvider,
    options?: AddRepositoryOptions,
  ) => Promise<GitRepository>;
  removeRepository: (path: string, provider?: GitHostProvider) => Promise<void>;
  removeRepositoriesForHosts: (
    removedHosts: RemovedHostRef[],
    providerAccountCount: ReadonlyMap<GitHostProvider, number>,
  ) => Promise<number>;
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

  addRepository: async (path, nameOrOptions, provider) => {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : undefined;
    const resolvedProvider = provider ?? 'github';
    const repo = await GitService.addRepository(path, name, resolvedProvider);
    const updated = await StorageService.getSavedRepositories();
    set({ repositories: updated });
    return repo;
  },

  removeRepository: async (path, provider = 'github') => {
    await StorageService.removeRepository(path, provider);
    await StorageService.purgeRepoData(path);

    const template = await TemplateRepoPreferenceService.get();
    if (template?.repoPath === path) {
      await TemplateRepoPreferenceService.clear();
    }

    const lastUsed = await LastUsedRepoService.get();
    if (lastUsed === path) {
      await LastUsedRepoService.clear();
    }

    const { chatRepoOwner, chatRepoName } = useAIStore.getState();
    if (chatRepoOwner && chatRepoName && `${chatRepoOwner}/${chatRepoName}` === path) {
      await useAIStore.getState().setChatRepo(null, null, 'main', null);
    }

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

  removeRepositoriesForHosts: async (removedHosts) => {
    const targets = get().repositories.filter(
      (r) => removedHosts.some((h) => h.provider === r.provider),
    );
    for (const repo of targets) {
      await get().removeRepository(repo.path, repo.provider);
    }
    return targets.length;
  },

  refreshRepos: async () => {
    await get().loadRepos();
  },
}));
