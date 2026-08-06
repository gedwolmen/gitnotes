import { GitService } from '../../src/services/GitService';
import { StorageService } from '../../src/services/StorageService';
import { getActiveGitHost } from '../../src/services/git/activeHost';
import { gitHubHostService } from '../../src/services/git/gitHostFactory';
import { checkGitHubRepoAccess } from '../../src/services/git/repoAccessPreflight';
import { useRepoStore } from '../../src/stores/repoStore';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/GitService', () => ({
  GitService: { addRepository: jest.fn() },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { getSavedRepositories: jest.fn() },
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
    expect(GitService.addRepository).toHaveBeenCalledWith('octo/notes', undefined, 'github');
  });
});
