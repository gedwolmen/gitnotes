import { create } from 'zustand';
import { GitRepository, GitService } from '../services/GitService';
import { StorageService } from '../services/StorageService';
import { TemplateRepoPreferenceService } from '../services/TemplateRepoPreferenceService';
import { LastUsedRepoService } from '../services/LastUsedRepoService';
import { GitFsService } from '../services/git/GitFsService';
import { useAIStore } from './aiStore';
import { useNoteStore } from './noteStore';
import { useCanvasStore } from './canvasStore';
import { useTodoStore } from './todoStore';
import { GIT_HOST_LABELS, type GitHostProvider } from '../services/git/GitHost';
import { getActiveGitHost } from '../services/git/activeHost';
import {
  checkGitHubRepoAccess,
  RepoAccessPreflightError,
} from '../services/git/repoAccessPreflight';
import { reposAffectedByRemovedHosts, type RemovedHostRef } from '../services/git/repoRemovalCascade';

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

  addRepository: async (path, nameOrOptions, provider, options) => {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : undefined;
    const resolvedOptions = typeof nameOrOptions === 'object' ? nameOrOptions : options;
    const resolvedProvider = provider ?? 'github';
    const activeHost = await getActiveGitHost();
    if (resolvedProvider === 'github') {
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
    const repo = await GitService.addRepository(path, name, resolvedProvider, activeHost?.hostId);

    if (!activeHost) {
      throw new Error(
        `No connected ${GIT_HOST_LABELS[resolvedProvider] ?? 'host'} account. Add a ${GIT_HOST_LABELS[resolvedProvider] ?? 'host'} connection first.`,
      );
    }
    if (!activeHost.token) {
      throw new Error(
        `No auth token for ${GIT_HOST_LABELS[resolvedProvider] ?? 'host'}. Re-connect your ${GIT_HOST_LABELS[resolvedProvider] ?? 'host'} account.`,
      );
    }

    try {
      await GitFsService.cloneExclusive({
        repoPath: repo.path,
        branch: repo.branch ?? 'main',
        token: activeHost.token,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Clone failed: ${msg}`);
    }

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

    GitFsService.removeRepo({ repoPath: path }).catch(() => undefined);

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

  removeRepositoriesForHosts: async (removedHosts, providerAccountCount) => {
    const targets = reposAffectedByRemovedHosts(get().repositories, removedHosts, providerAccountCount);
    for (const repo of targets) {
      await get().removeRepository(repo.path, repo.provider);
    }
    return targets.length;
  },

  refreshRepos: async () => {
    await get().loadRepos();
  },
}));
