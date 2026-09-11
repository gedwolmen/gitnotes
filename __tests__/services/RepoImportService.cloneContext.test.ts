import { importRepoAtAdd } from '@/services/RepoImportService';
import { AccountStorage } from '@/services/AccountStorage';
import { AuthService } from '@/services/AuthService';
import { StorageService } from '@/services/StorageService';
import { GitFsService } from '@/services/git/GitFsService';
import { resolveBranch } from '@/services/git/branchResolver';

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getActiveHostConnection: jest.fn(),
    getHostConnection: jest.fn(),
    getHostUseSsh: jest.fn(),
  },
}));

jest.mock('@/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(),
  },
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(),
    cloneExclusive: jest.fn(),
    getCommitOid: jest.fn(),
  },
}));

jest.mock('@/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  setCredential: jest.fn(),
}));

jest.mock('@/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(),
}));

describe('importRepoAtAdd clone context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(AuthService.getToken).mockResolvedValue('gitlab-token');
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([
      {
        id: 'gitlab:repo-123',
        path: 'group/project',
        name: 'project',
        provider: 'gitlab',
        hostId: 'account-1:gitlab:default',
        branch: 'main',
      },
    ]);
    jest.mocked(resolveBranch).mockResolvedValue('main');
    jest.mocked(AccountStorage.getActiveHostConnection).mockResolvedValue(null);
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue({
      id: 'account-1:gitlab:default',
      accountId: 'account-1',
      provider: 'gitlab',
      instanceBaseUrl: 'https://gitlab.example.com',
      hostLogin: 'alice',
      hostUserId: 42,
      name: 'Work GitLab',
      email: 'alice@example.com',
      avatarUrl: null,
      addedAt: 1,
    });
    jest.mocked(AccountStorage.getHostUseSsh).mockResolvedValue(false);
    jest.mocked(GitFsService.isCloned).mockResolvedValue(false);
    jest.mocked(GitFsService.cloneExclusive).mockResolvedValue(undefined);
    jest.mocked(GitFsService.getCommitOid).mockResolvedValue(null);
  });

  it('uses the repository host metadata when no active host is selected', async () => {
    await importRepoAtAdd('group/project', 'project');

    expect(AccountStorage.getHostConnection).toHaveBeenCalledWith('account-1:gitlab:default');
    expect(GitFsService.cloneExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: 'gitlab:repo-123',
        provider: 'gitlab',
        instanceBaseUrl: 'https://gitlab.example.com',
      }),
    );
  });
});
