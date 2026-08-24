import { GitService } from '../../src/services/GitService';
import { StorageService } from '../../src/services/StorageService';
import { TemplateRepoPreferenceService } from '../../src/services/TemplateRepoPreferenceService';
import { LastUsedRepoService } from '../../src/services/LastUsedRepoService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { getActiveGitHost } from '../../src/services/git/activeHost';
import { gitHubHostService } from '../../src/services/git/gitHostFactory';
import { checkGitHubRepoAccess } from '../../src/services/git/repoAccessPreflight';
import type { GitHostProvider } from '../../src/services/git/GitHost';
import type { RemovedHostRef } from '../../src/services/git/repoRemovalCascade';
import { useAIStore } from '../../src/stores/aiStore';
import { useRepoStore } from '../../src/stores/repoStore';
import { beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('../../src/services/GitService', () => ({
  GitService: { addRepository: jest.fn() },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    removeRepository: jest.fn(),
    purgeRepoData: jest.fn(),
  },
}));

jest.mock('../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/services/LastUsedRepoService', () => ({
  LastUsedRepoService: {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
  GitFsService: {
    removeRepo: jest.fn(),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    purgeForRepo: jest.fn(),
  },
}));

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: {
    getState: jest.fn(() => ({
      chatRepoOwner: null,
      chatRepoName: null,
      setChatRepo: jest.fn(),
    })),
  },
}));

jest.mock('../../src/services/git/activeHost', () => ({
  getActiveGitHost: jest.fn(),
}));

jest.mock('../../src/services/git/repoAccessPreflight', () => {
  const actual = jest.requireActual<typeof import('../../src/services/git/repoAccessPreflight')>(
    '../../src/services/git/repoAccessPreflight',
  );
  return { ...actual, checkGitHubRepoAccess: jest.fn() };
});

const repository = {
  id: 'github:1',
  name: 'notes',
  path: 'octo/notes',
  branch: 'main',
  provider: 'github' as const,
};

describe('repoStore addRepository preflight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getActiveGitHost).mockResolvedValue({
      provider: 'github',
      baseUrl: 'https://api.github.com',
      token: 'secret-token',
      host: gitHubHostService,
      hostId: 'host-1',
    });
    jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
      kind: 'write_unverified',
      message: 'Write access not verified. Do you want to add anyway?',
    });
    jest.mocked(GitService.addRepository).mockResolvedValue(repository);
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([repository]);
  });

  it('throws a retryable error when write access is unverified', async () => {
    await expect(useRepoStore.getState().addRepository('octo/notes')).rejects.toMatchObject({
      name: 'RepoAccessPreflightError',
      message: 'Write access not verified. Do you want to add anyway?',
      canRetry: true,
    });
    expect(GitService.addRepository).not.toHaveBeenCalled();
  });

  it('adds the repository when unverified write access is explicitly allowed', async () => {
    await expect(useRepoStore.getState().addRepository(
      'octo/notes',
      { allowUnverifiedWrite: true },
    )).resolves.toEqual(repository);
    expect(GitService.addRepository).toHaveBeenCalledWith('octo/notes', undefined, 'github', 'host-1');
  });
});

describe('repoStore removeRepository', () => {
  const repoPath = 'octo/notes';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([]);
  });

  it('disconnects all per-repo pointers that match the removed path', async () => {
    jest.mocked(StorageService.removeRepository).mockResolvedValue(undefined);
    jest.mocked(StorageService.purgeRepoData).mockResolvedValue(undefined);
    jest.mocked(TemplateRepoPreferenceService.get).mockResolvedValue({ repoPath, branch: 'main' });
    jest.mocked(TemplateRepoPreferenceService.clear).mockResolvedValue(undefined);
    jest.mocked(LastUsedRepoService.get).mockResolvedValue(repoPath);
    jest.mocked(LastUsedRepoService.clear).mockResolvedValue(undefined);
    jest.mocked(SyncEngineService.clear).mockResolvedValue(undefined);
    jest.mocked(SyncEngineService.getMode).mockResolvedValue('api');
    jest.mocked(NoteSyncQueueService.purgeForRepo).mockResolvedValue(undefined);
    jest.mocked(useAIStore.getState).mockReturnValue({
      chatRepoOwner: 'octo',
      chatRepoName: 'notes',
      chatRepoBranch: 'main',
      chatRepoAccountId: null,
      setChatRepo: jest.fn(),
    } as ReturnType<typeof useAIStore.getState>);

    await useRepoStore.getState().removeRepository(repoPath);

    expect(TemplateRepoPreferenceService.clear).toHaveBeenCalled();
    expect(LastUsedRepoService.clear).toHaveBeenCalled();
    expect(SyncEngineService.clear).toHaveBeenCalledWith(repoPath);
    expect(NoteSyncQueueService.purgeForRepo).toHaveBeenCalledWith(repoPath);
  });

  it('does not clear template/last-used when they point at a different repo', async () => {
    jest.mocked(StorageService.removeRepository).mockResolvedValue(undefined);
    jest.mocked(StorageService.purgeRepoData).mockResolvedValue(undefined);
    jest.mocked(TemplateRepoPreferenceService.get).mockResolvedValue({ repoPath: 'other/repo', branch: 'main' });
    jest.mocked(LastUsedRepoService.get).mockResolvedValue('other/repo');
    jest.mocked(SyncEngineService.clear).mockResolvedValue(undefined);
    jest.mocked(SyncEngineService.getMode).mockResolvedValue('api');
    jest.mocked(NoteSyncQueueService.purgeForRepo).mockResolvedValue(undefined);

    await useRepoStore.getState().removeRepository(repoPath);

    expect(TemplateRepoPreferenceService.clear).not.toHaveBeenCalled();
    expect(LastUsedRepoService.clear).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.purgeForRepo).toHaveBeenCalledWith(repoPath);
  });

  it('removes clone from disk when sync mode is clone', async () => {
    jest.mocked(StorageService.removeRepository).mockResolvedValue(undefined);
    jest.mocked(StorageService.purgeRepoData).mockResolvedValue(undefined);
    jest.mocked(TemplateRepoPreferenceService.get).mockResolvedValue(null);
    jest.mocked(LastUsedRepoService.get).mockResolvedValue(null);
    jest.mocked(SyncEngineService.clear).mockResolvedValue(undefined);
    jest.mocked(SyncEngineService.getMode).mockResolvedValue('clone');
    jest.mocked(GitFsService.removeRepo).mockResolvedValue(undefined);
    jest.mocked(NoteSyncQueueService.purgeForRepo).mockResolvedValue(undefined);

    await useRepoStore.getState().removeRepository(repoPath);

    expect(GitFsService.removeRepo).toHaveBeenCalledWith({ repoPath });
  });
});

describe('repoStore removeRepositoriesForHosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes only repos stamped with a removed host id and returns the count', async () => {
    const stamped = {
      id: 'github:1',
      name: 'notes',
      path: 'octo/notes',
      branch: 'main',
      provider: 'github' as const,
      hostId: 'host-1',
    };
    const other = {
      id: 'github:2',
      name: 'other',
      path: 'octo/other',
      branch: 'main',
      provider: 'github' as const,
      hostId: 'host-2',
    };
    useRepoStore.setState({ repositories: [stamped, other] });

    const removeSpy = jest
      .spyOn(useRepoStore.getState(), 'removeRepository')
      .mockResolvedValue(undefined);

    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);

    const removed = await useRepoStore.getState().removeRepositoriesForHosts(removedHosts, counts);

    expect(removed).toBe(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('octo/notes', 'github');
  });

  it('removes nothing when no repo matches the removed host', async () => {
    useRepoStore.setState({
      repositories: [
        { id: 'github:2', name: 'other', path: 'octo/other', provider: 'github' as const, hostId: 'host-2' },
      ],
    });

    const removeSpy = jest
      .spyOn(useRepoStore.getState(), 'removeRepository')
      .mockResolvedValue(undefined);

    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);

    const removed = await useRepoStore.getState().removeRepositoriesForHosts(removedHosts, counts);

    expect(removed).toBe(0);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
