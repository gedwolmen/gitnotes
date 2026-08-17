jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => undefined),
    enqueueNoteDelete: jest.fn(async () => undefined),
    getAll: jest.fn(async () => []),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
  },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: jest.fn(async () => ({ success: true })),
    deleteAndCommit: jest.fn(async () => ({ success: true })),
    push: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
    listOverrides: jest.fn(async () => ({})),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCommitOid: jest.fn(async () => null),
    findMergeBase: jest.fn(async () => null),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(async () => 'test-token'),
  },
}));

jest.mock('../../src/services/git/gitHostFactory', () => ({
  getGitHostService: jest.fn(() => ({
    getAuthenticatedUser: jest.fn(async () => ({
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    })),
  })),
}));

import { StagingService } from '../../src/services/git/StagingService';
import type { StagedItem } from '../../src/services/git/StagingService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { StorageService } from '../../src/services/StorageService';

const queueGetAll = NoteSyncQueueService.getAll as jest.Mock;
const listOverrides = SyncEngineService.listOverrides as jest.Mock;
const getSavedRepositories = StorageService.getSavedRepositories as jest.Mock;
const getCommitOid = GitFsService.getCommitOid as jest.Mock;
const findMergeBase = GitFsService.findMergeBase as jest.Mock;

const UNPUSHED_COMMITS_PLACEHOLDER = '(unpushed commits)';
const repo = 'owner/repo';

function unpushedRows(items: StagedItem[]): StagedItem[] {
  return items.filter((i) => i.filePath === UNPUSHED_COMMITS_PLACEHOLDER && i.repoPath === repo);
}

describe('StagingService.listStaged — unpushed-commits merge-base gating (#879)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueGetAll.mockResolvedValue([]);
    listOverrides.mockResolvedValue({ [repo]: 'clone' });
    getSavedRepositories.mockResolvedValue([
      { id: '1', name: 'repo', path: repo, branch: 'main' },
    ]);
  });

  test('strictly behind origin (local is the merge base) emits no (unpushed commits) row', async () => {
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'A' : 'B',
    );
    findMergeBase.mockResolvedValue('A');

    const staged = await StagingService.listStaged();

    expect(unpushedRows(staged)).toHaveLength(0);
  });

  test('ahead of origin emits the (unpushed commits) row', async () => {
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'C' : 'B',
    );
    findMergeBase.mockResolvedValue('A');

    const staged = await StagingService.listStaged();

    const rows = unpushedRows(staged);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      repoPath: repo,
      branch: 'main',
      kind: 'upsert',
      mode: 'clone',
      localCommitOid: 'C',
    });
  });

  test('missing remote ref still lists the whole local branch as unpushed', async () => {
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'C' : null,
    );
    findMergeBase.mockResolvedValue(null);

    const staged = await StagingService.listStaged();

    const rows = unpushedRows(staged);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      repoPath: repo,
      branch: 'main',
      localCommitOid: 'C',
    });
  });
});
