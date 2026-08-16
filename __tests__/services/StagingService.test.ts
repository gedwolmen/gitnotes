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

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(async () => {
    throw new Error('syncNoteToGitHub must not be called at stage time');
  }),
  deleteNoteFromGitHub: jest.fn(async () => {
    throw new Error('deleteNoteFromGitHub must not be called at stage time');
  }),
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    updateFile: jest.fn(async () => {
      throw new Error('GitHubService.updateFile must not be called at stage time');
    }),
    deleteFile: jest.fn(async () => {
      throw new Error('GitHubService.deleteFile must not be called at stage time');
    }),
  },
}));

import { StagingService } from '../../src/services/git/StagingService';
import type { StagedItem } from '../../src/services/git/StagingService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { LocalGitWriter } from '../../src/services/git/LocalGitWriter';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { StorageService } from '../../src/services/StorageService';
import { AuthService } from '../../src/services/AuthService';
import { syncNoteToGitHub, deleteNoteFromGitHub } from '../../src/services/NoteGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';

const enqueueUpsert = NoteSyncQueueService.enqueueNoteUpsert as jest.Mock;
const enqueueDelete = NoteSyncQueueService.enqueueNoteDelete as jest.Mock;
const queueGetAll = NoteSyncQueueService.getAll as jest.Mock;
const queueDrain = NoteSyncQueueService.drain as jest.Mock;

const writeAndCommit = LocalGitWriter.writeAndCommit as jest.Mock;
const deleteAndCommit = LocalGitWriter.deleteAndCommit as jest.Mock;
const writerPush = LocalGitWriter.push as jest.Mock;

const getMode = SyncEngineService.getMode as jest.Mock;
const listOverrides = SyncEngineService.listOverrides as jest.Mock;

const getCommitOid = GitFsService.getCommitOid as jest.Mock;
const getSavedRepositories = StorageService.getSavedRepositories as jest.Mock;
const getToken = AuthService.getToken as jest.Mock;

interface LooseMutation {
  id: string;
  type: 'note.upsert' | 'note.delete';
  createdAt: number;
  attempts: number;
  params: {
    repo: string;
    branch?: string;
    filePath?: string;
    title?: string;
    content?: string;
  };
}

function queueItem(
  type: 'note.upsert' | 'note.delete',
  params: LooseMutation['params'],
): LooseMutation {
  return { id: `${type}-${Math.random()}`, type, createdAt: 0, attempts: 0, params };
}

function groupByRepoBranch(items: StagedItem[]): Map<string, StagedItem[]> {
  const groups = new Map<string, StagedItem[]>();
  for (const item of items) {
    const key = `${item.repoPath}::${item.branch}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

describe('StagingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enqueueUpsert.mockResolvedValue(undefined);
    enqueueDelete.mockResolvedValue(undefined);
    queueGetAll.mockResolvedValue([]);
    queueDrain.mockResolvedValue({ succeeded: 0, failed: 0, remaining: 0 });
    writeAndCommit.mockResolvedValue({ success: true });
    deleteAndCommit.mockResolvedValue({ success: true });
    writerPush.mockResolvedValue({ success: true });
    getMode.mockResolvedValue('api');
    listOverrides.mockResolvedValue({});
    getCommitOid.mockResolvedValue(null);
    getSavedRepositories.mockResolvedValue([]);
    getToken.mockResolvedValue('test-token');
  });

  describe('stageUpsert', () => {
    test('api mode enqueues with zero network calls', async () => {
      getMode.mockResolvedValue('api');
      const params = {
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
        content: 'hello',
      };

      const result = await StagingService.stageUpsert(params);

      expect(result).toEqual({ success: true });
      expect(enqueueUpsert).toHaveBeenCalledTimes(1);
      expect(enqueueUpsert).toHaveBeenCalledWith(params);
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
      expect(deleteNoteFromGitHub).not.toHaveBeenCalled();
      expect(GitHubService.updateFile).not.toHaveBeenCalled();
      expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      expect(writeAndCommit).not.toHaveBeenCalled();
    });

    test('api mode surfaces enqueue rejection without touching the remote', async () => {
      getMode.mockResolvedValue('api');
      enqueueUpsert.mockRejectedValueOnce(new Error('queue write failed'));

      const result = await StagingService.stageUpsert({
        repo: 'owner/repo',
        title: 'A',
        content: 'hello',
      });

      expect(result).toEqual({ success: false, error: 'queue write failed' });
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
      expect(GitHubService.updateFile).not.toHaveBeenCalled();
    });

    test('clone mode writes with push:false and never pushes', async () => {
      getMode.mockResolvedValue('clone');
      const params = {
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
        content: 'hello',
      };

      const result = await StagingService.stageUpsert(params);

      expect(result).toEqual({ success: true });
      expect(writeAndCommit).toHaveBeenCalledTimes(1);
      expect(writeAndCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          content: 'hello',
          author: { name: 'Test User', email: 'test@example.com' },
          push: false,
        }),
      );
      expect(writerPush).not.toHaveBeenCalled();
      expect(enqueueUpsert).not.toHaveBeenCalled();
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
    });
  });

  describe('stageDelete', () => {
    test('api mode enqueues a delete', async () => {
      getMode.mockResolvedValue('api');
      const params = {
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/b.md',
        title: 'B',
      };

      const result = await StagingService.stageDelete(params);

      expect(result).toEqual({ success: true });
      expect(enqueueDelete).toHaveBeenCalledTimes(1);
      expect(enqueueDelete).toHaveBeenCalledWith(params);
      expect(deleteAndCommit).not.toHaveBeenCalled();
      expect(deleteNoteFromGitHub).not.toHaveBeenCalled();
    });

    test('clone mode deletes with push:false and never pushes', async () => {
      getMode.mockResolvedValue('clone');
      const params = { repo: 'owner/repo', branch: 'main', filePath: 'notes/b.md' };

      const result = await StagingService.stageDelete(params);

      expect(result).toEqual({ success: true });
      expect(deleteAndCommit).toHaveBeenCalledTimes(1);
      expect(deleteAndCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'notes/b.md',
          author: { name: 'Test User', email: 'test@example.com' },
          push: false,
        }),
      );
      expect(writerPush).not.toHaveBeenCalled();
      expect(enqueueDelete).not.toHaveBeenCalled();
    });
  });

  describe('listStaged', () => {
    test('groups queued upserts and deletes by repo/branch', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.upsert', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
        }),
        queueItem('note.delete', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/b.md',
        }),
        queueItem('note.upsert', {
          repo: 'other/repo',
          branch: 'dev',
          filePath: 'notes/c.md',
          title: 'C',
        }),
      ]);
      getMode.mockResolvedValue('api');

      const staged = await StagingService.listStaged();

      const groups = groupByRepoBranch(staged);
      expect(groups.size).toBe(2);

      const repoMain = groups.get('owner/repo::main');
      expect(repoMain?.map((i) => i.kind).sort()).toEqual(['delete', 'upsert']);
      expect(repoMain?.every((i) => i.mode === 'api')).toBe(true);
      expect(repoMain?.map((i) => i.filePath).sort()).toEqual(['notes/a.md', 'notes/b.md']);

      const otherDev = groups.get('other/repo::dev');
      expect(otherDev).toHaveLength(1);
      expect(otherDev?.[0]).toMatchObject({
        kind: 'upsert',
        mode: 'api',
        filePath: 'notes/c.md',
      });
    });

    test('surfaces clone unpushed commits when local oid differs from remote', async () => {
      listOverrides.mockResolvedValue({ 'owner/repo': 'clone' });
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      const staged = await StagingService.listStaged();

      expect(staged).toHaveLength(1);
      expect(staged[0]).toMatchObject({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: '(unpushed commits)',
        kind: 'upsert',
        mode: 'clone',
        localCommitOid: 'local-oid',
      });
    });

    test('missing remote ref lists all local commits as staged', async () => {
      listOverrides.mockResolvedValue({ 'owner/repo': 'clone' });
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) => (ref.startsWith('refs/heads') ? 'local-oid' : null),
      );

      const staged = await StagingService.listStaged();

      expect(staged).toHaveLength(1);
      expect(staged[0]).toMatchObject({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: '(unpushed commits)',
        kind: 'upsert',
        mode: 'clone',
        localCommitOid: 'local-oid',
      });
    });

    test('fresh clone with no commits on either side is not staged', async () => {
      listOverrides.mockResolvedValue({ 'owner/repo': 'clone' });
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockResolvedValue(null);

      const staged = await StagingService.listStaged();

      expect(staged).toHaveLength(0);
    });

    test('filters by repoPath and branch', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.upsert', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
        }),
        queueItem('note.upsert', {
          repo: 'other/repo',
          branch: 'dev',
          filePath: 'notes/c.md',
          title: 'C',
        }),
      ]);
      getMode.mockResolvedValue('api');

      const byRepo = await StagingService.listStaged('owner/repo');
      expect(byRepo.map((i) => i.repoPath)).toEqual(['owner/repo']);

      const byBranch = await StagingService.listStaged(undefined, 'dev');
      expect(byBranch.map((i) => i.branch)).toEqual(['dev']);
    });
  });

  describe('pushStaged', () => {
    test('api mode drains the queue exactly once', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.upsert', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
        }),
      ]);
      getMode.mockResolvedValue('api');

      const result = await StagingService.pushStaged();

      expect(result).toEqual({ success: true });
      expect(queueDrain).toHaveBeenCalledTimes(1);
      expect(writerPush).not.toHaveBeenCalled();
    });

    test('clone mode pushes once with the correct repoPath and branch', async () => {
      listOverrides.mockResolvedValue({ 'owner/repo': 'clone' });
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      const result = await StagingService.pushStaged('owner/repo', 'main');

      expect(result).toEqual({ success: true });
      expect(writerPush).toHaveBeenCalledTimes(1);
      expect(writerPush).toHaveBeenCalledWith({
        repoPath: 'owner/repo',
        branch: 'main',
        token: 'test-token',
      });
      expect(queueDrain).not.toHaveBeenCalled();
    });

    test('clone push failure surfaces an error', async () => {
      listOverrides.mockResolvedValue({ 'owner/repo': 'clone' });
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );
      writerPush.mockResolvedValue({ success: false, error: 'push rejected' });

      const result = await StagingService.pushStaged('owner/repo', 'main');

      expect(result).toEqual({ success: false, error: 'push rejected' });
      expect(writerPush).toHaveBeenCalledTimes(1);
    });

    test('nothing staged is a successful no-op', async () => {
      const result = await StagingService.pushStaged();

      expect(result).toEqual({ success: true });
      expect(queueDrain).not.toHaveBeenCalled();
      expect(writerPush).not.toHaveBeenCalled();
    });
  });
});
