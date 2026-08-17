import { create } from 'zustand';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';
import { TemplateRepoPreferenceService } from '../services/TemplateRepoPreferenceService';
import { LastUsedRepoService } from '../services/LastUsedRepoService';
import { SyncEngineService } from '../services/SyncEngineService';
import { GitFsService } from '../services/git/GitFsService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import { useAIStore } from './aiStore';
import { useNoteStore } from './noteStore';
import { useCanvasStore } from './canvasStore';
import { useTodoStore } from './todoStore';
import type { GitHostProvider } from '../services/git/GitHost';
import { getActiveGitHost } from '../services/git/activeHost';
import {
  checkGitHubRepoAccess,
  RepoAccessPreflightError,
} from '../services/git/repoAccessPreflight';

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

  addRepository: async (path, nameOrOptions, provider, options) => {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : undefined;
    const resolvedOptions = typeof nameOrOptions === 'object' ? nameOrOptions : options;
    const resolvedProvider = provider ?? 'github';
    if (resolvedProvider === 'github') {
      const activeHost = await getActiveGitHost();
      if (activeHost?.provider === 'github') {
        const access = await checkGitHubRepoAccess(path, activeHost.token);
        switch (access.kind) {
          case 'ok':
            break;
          case 'write_unverified':
            if (!resolvedOptions?.allowUnverifiedWrite) {
              throw new RepoAccessPreflightError(access, true);
            }
            break;
          case 'no_access':
            throw new RepoAccessPreflightError(access);
          case 'transient':
            console.warn('[RepoStore] GitHub repository access preflight was inconclusive:', access.message);
            break;
          default: {
            const exhaustiveCheck: never = access;
            return exhaustiveCheck;
          }
        }
      }
    }
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

    await SyncEngineService.clear(path);

    if ((await SyncEngineService.getMode(path)) === 'clone') {
      GitFsService.removeRepo({ repoPath: path }).catch(() => undefined);
    }

    const { chatRepoOwner, chatRepoName } = useAIStore.getState();
    if (chatRepoOwner && chatRepoName && `${chatRepoOwner}/${chatRepoName}` === path) {
      await useAIStore.getState().setChatRepo(null, null, 'main', null);
    }

    await NoteSyncQueueService.purgeForRepo(path);

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
