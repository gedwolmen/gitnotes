import { GitFsService } from '@/services/git/GitFsService';
import { repairCloneAfterCorruption } from '@/services/git/recovery';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
}));

jest.mock('@/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({ promises: { readFile: jest.fn(), unlink: jest.fn() } })),
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getHostConnection: jest.fn(),
    getActiveHostConnection: jest.fn(),
  },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    clone: jest.fn(),
    removeRepo: jest.fn(),
    getCommitOid: jest.fn(),
    findMergeBase: jest.fn(),
  },
  repairHeadRef: jest.fn(),
}));

const clone = GitFsService.clone as jest.MockedFunction<typeof GitFsService.clone>;
const removeRepo = GitFsService.removeRepo as jest.MockedFunction<typeof GitFsService.removeRepo>;
const getCommitOid = GitFsService.getCommitOid as jest.MockedFunction<typeof GitFsService.getCommitOid>;
const findMergeBase = GitFsService.findMergeBase as jest.MockedFunction<typeof GitFsService.findMergeBase>;
const { StorageService } = jest.requireMock('@/services/StorageService') as {
  StorageService: { getSavedRepositories: jest.Mock };
};
const { AccountStorage } = jest.requireMock('@/services/AccountStorage') as {
  AccountStorage: { getHostConnection: jest.Mock; getActiveHostConnection: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  clone.mockResolvedValue(undefined);
  removeRepo.mockResolvedValue(undefined);
  getCommitOid.mockResolvedValue(null);
  findMergeBase.mockResolvedValue(null);
  StorageService.getSavedRepositories.mockResolvedValue([
    {
      id: 'repo-id',
      path: 'owner/repo',
      provider: 'gitlab',
      hostId: 'host-id',
    },
  ]);
  AccountStorage.getHostConnection.mockResolvedValue({
    id: 'host-id',
    provider: 'gitlab',
    instanceBaseUrl: 'https://gitlab.example.com',
  });
  AccountStorage.getActiveHostConnection.mockResolvedValue(null);
});

describe('clone recovery credential identity', () => {
  it('passes repoId when repairing a corrupted clone', async () => {
    await repairCloneAfterCorruption({
      repoPath: 'owner/repo',
      branch: 'main',
      repoId: 'repo-id',
      token: 'token',
    });

    expect(clone).toHaveBeenCalledWith({
      repoPath: 'owner/repo',
      branch: 'main',
      repoId: 'repo-id',
      token: 'token',
      provider: 'gitlab',
      instanceBaseUrl: 'https://gitlab.example.com',
    });
  });
});
