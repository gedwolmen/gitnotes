jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
    updateFile: jest.fn(async () => ({ ok: true })),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    getAll: jest.fn(async () => []),
    isTombstoned: jest.fn(async () => false),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    listTree: jest.fn(async () => []),
    isCloned: jest.fn(async () => true),
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
  },
}));

import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';

describe('RepoPullService reconcile data-loss guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
  });

  it('keeps a locally-staged note that has not reached the remote yet (issue: notes gone after push+restart)', async () => {
    // Remote tree does NOT contain the note yet — the push has not landed.
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/remote-only.md', sha: 'a' },
    ]);
    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce('# Remote only');

    // The local note is staged: it has a filePath but its mutation is still
    // pending in the sync queue (API mode). This is the state right after
    // saving a note and before/while the push runs.
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      {
        id: 'local-1',
        title: 'Local staged',
        content: '# Local',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/local-staged.md',
        format: 'markdown',
      },
    ]);
    (NoteSyncQueueService.getAll as jest.Mock).mockResolvedValue([
      {
        id: 'm-1',
        type: 'note.upsert',
        attempts: 0,
        params: {
          repo: 'org/repo',
          branch: 'main',
          filePath: 'notes/local-staged.md',
        },
      },
    ]);

    await pullFromSingleRepo('org/repo');

    // The staged note must survive the reconcile — it was not deleted on the
    // remote, it simply has not been pushed yet.
    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0] as unknown[];
    expect(saved.map((n) => (n as { id: string }).id)).toContain('local-1');
  });

  it('drops a local note whose file was truly deleted on the remote (no pending mutation)', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/remote-only.md', sha: 'a' },
    ]);
    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce('# Remote only');

    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      {
        id: 'local-1',
        title: 'Local staged',
        content: '# Local',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/deleted-remotely.md',
        format: 'markdown',
      },
    ]);
    // No pending mutation for that path — the remote genuinely no longer has it.
    (NoteSyncQueueService.getAll as jest.Mock).mockResolvedValue([]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0] as unknown[];
    expect(saved.map((n) => (n as { id: string }).id)).not.toContain('local-1');
  });
});
