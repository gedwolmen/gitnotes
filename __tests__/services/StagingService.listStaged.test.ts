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
const getMode = SyncEngineService.getMode as jest.Mock;
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
    getMode.mockResolvedValue('clone');
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

describe('StagingService.listStaged — default-clone repos without override (#925a)', () => {
  const defaultCloneRepo = 'owner/default-clone';

  beforeEach(() => {
    jest.clearAllMocks();
    queueGetAll.mockResolvedValue([]);
    // No entry in @gitnotes:sync_engine_modes: the repo runs on the default
    // sync mode, which SyncEngineService.DEFAULT_MODE resolves to 'clone'.
    listOverrides.mockResolvedValue({});
    getMode.mockResolvedValue('clone');
    getSavedRepositories.mockResolvedValue([
      { id: '1', name: 'default-clone', path: defaultCloneRepo, branch: 'main' },
    ]);
  });

  test('default-clone repo without override surfaces unpushed commits', async () => {
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'C' : 'B',
    );
    findMergeBase.mockResolvedValue('A');

    const staged = await StagingService.listStaged();

    const rows = staged.filter((i) => i.filePath === UNPUSHED_COMMITS_PLACEHOLDER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      repoPath: defaultCloneRepo,
      branch: 'main',
      kind: 'upsert',
      mode: 'clone',
      localCommitOid: 'C',
    });
  });

  test('override repo removed from saved repos yields no row', async () => {
    listOverrides.mockResolvedValue({ 'owner/removed': 'clone' });
    getSavedRepositories.mockResolvedValue([]);
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'C' : 'B',
    );
    findMergeBase.mockResolvedValue('A');

    const staged = await StagingService.listStaged();

    const rows = staged.filter((i) => i.filePath === UNPUSHED_COMMITS_PLACEHOLDER);
    expect(rows).toHaveLength(0);
  });
});

describe('StagingService.listStaged — API-mode items never surface (#push-button-in-api-mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMode.mockImplementation(async (path: string) =>
      path === 'api/repo' ? 'api' : 'clone',
    );
  });

  it('drops queue items whose repo is in API mode (no floating button / Stage screen row)', async () => {
    queueGetAll.mockResolvedValueOnce([
      { type: 'note.upsert', params: { repo: 'api/repo', branch: 'main', filePath: 'notes/a.md' } },
      { type: 'note.upsert', params: { repo: 'clone/repo', branch: 'main', filePath: 'notes/b.md' } },
    ]);
    getSavedRepositories.mockResolvedValueOnce([]);

    const staged = await StagingService.listStaged();

    expect(staged).toHaveLength(1);
    expect(staged[0].repoPath).toBe('clone/repo');
    expect(staged[0].mode).toBe('clone');
  });

  it('drops clone-mode unpushed-commits rows for repos in API mode', async () => {
    queueGetAll.mockResolvedValueOnce([]);
    getSavedRepositories.mockResolvedValueOnce([
      { path: 'api/repo', branch: 'main' },
    ]);
    getCommitOid.mockImplementation(async ({ ref }: { ref: string }) =>
      ref.startsWith('refs/heads') ? 'LOCAL_OID' : 'REMOTE_OID',
    );
    findMergeBase.mockResolvedValueOnce('LOCAL_OID');

    const staged = await StagingService.listStaged();

    expect(staged).toHaveLength(0);
  });
});
