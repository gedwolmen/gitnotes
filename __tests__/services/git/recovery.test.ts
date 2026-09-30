import { GitFsService } from '@/services/git/GitFsService';
import { pushWithRecovery, repairCloneAfterCorruption } from '@/services/git/recovery';
import * as GitEngine from '@/services/git/engine/GitEngine';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
}));

jest.mock('@/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({
    promises: {
      readFile: jest.fn().mockRejectedValue(new Error('not shallow')),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  })),
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
    pullWithFastForward: jest.fn(),
  },
  repairHeadRef: jest.fn(),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  status: jest.fn(),
  checkoutBranch: jest.fn(),
  fetch: jest.fn(),
  pushWithIntegrate: jest.fn(),
}));

const clone = GitFsService.clone as jest.MockedFunction<typeof GitFsService.clone>;
const removeRepo = GitFsService.removeRepo as jest.MockedFunction<typeof GitFsService.removeRepo>;
const getCommitOid = GitFsService.getCommitOid as jest.MockedFunction<typeof GitFsService.getCommitOid>;
const findMergeBase = GitFsService.findMergeBase as jest.MockedFunction<typeof GitFsService.findMergeBase>;
const pullWithFastForward = GitFsService.pullWithFastForward as jest.MockedFunction<typeof GitFsService.pullWithFastForward>;
const status = GitEngine.status as jest.MockedFunction<typeof GitEngine.status>;
const pushWithIntegrate = GitEngine.pushWithIntegrate as jest.MockedFunction<typeof GitEngine.pushWithIntegrate>;
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
  pullWithFastForward.mockResolvedValue({ ok: true });
  status.mockResolvedValue({ currentBranch: 'main' });
  pushWithIntegrate.mockResolvedValue({ ok: true, message: 'pushed', conflicts: [], pushed: 1 });
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
  it('passes repoId to native push after ensuring the current branch', async () => {
    const result = await pushWithRecovery({
      repoPath: 'owner/repo',
      branch: 'main',
      repoId: 'repo-id',
    });

    expect(result).toEqual({ success: true });
    expect(pushWithIntegrate).toHaveBeenCalledWith(
      'file:///documents/GitNotes/owner/repo',
      'origin',
      'repo-id',
    );
  });

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
