jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => ({ id: 'mut_upsert' })),
    enqueueNoteDelete: jest.fn(async () => ({ id: 'mut_delete' })),
    getAll: jest.fn(async () => []),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
    onDroppedMutation: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(async () => jest.fn()),
    isCycleHeld: jest.fn(() => false),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(async () => ({
    repos: 1,
    notes: 0,
    canvases: 0,
    todos: 0,
    templates: 0,
  })),
}));

jest.mock('../../src/stores/noteStore', () => ({
  useNoteStore: { getState: jest.fn() },
}));

jest.mock('../../src/stores/canvasStore', () => ({
  useCanvasStore: { getState: jest.fn() },
}));

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: { getState: jest.fn() },
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

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: {
    begin: jest.fn(),
    end: jest.fn(),
    setProgress: jest.fn(),
  },
}));

import { __resetImportDedupForTest } from '../../src/services/RepoImportService';
import { StagingService, subscribeStagedChanged } from '../../src/services/git/StagingService';
import type { StagedItem } from '../../src/services/git/StagingService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { LocalGitWriter } from '../../src/services/git/LocalGitWriter';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { StorageService } from '../../src/services/StorageService';
import { AuthService } from '../../src/services/AuthService';
import { syncNoteToGitHub, deleteNoteFromGitHub } from '../../src/services/NoteGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { githubActivity } from '../../src/stores/githubActivityStore';
import { GitSyncGate } from '../../src/services/git/GitSyncGate';
import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { useNoteStore } from '../../src/stores/noteStore';
import { useCanvasStore } from '../../src/stores/canvasStore';
import { useTodoStore } from '../../src/stores/todoStore';

const enqueueUpsert = NoteSyncQueueService.enqueueNoteUpsert as jest.Mock;
const enqueueDelete = NoteSyncQueueService.enqueueNoteDelete as jest.Mock;
const queueGetAll = NoteSyncQueueService.getAll as jest.Mock;
const queueDrain = NoteSyncQueueService.drain as jest.Mock;
const onDroppedMutation = NoteSyncQueueService.onDroppedMutation as jest.Mock;

const writeAndCommit = LocalGitWriter.writeAndCommit as jest.Mock;
const deleteAndCommit = LocalGitWriter.deleteAndCommit as jest.Mock;
const writerPush = LocalGitWriter.push as jest.Mock;

const getMode = SyncEngineService.getMode as jest.Mock;
const listOverrides = SyncEngineService.listOverrides as jest.Mock;

const getCommitOid = GitFsService.getCommitOid as jest.Mock;
const findMergeBase = GitFsService.findMergeBase as jest.Mock;
const getSavedRepositories = StorageService.getSavedRepositories as jest.Mock;
const getToken = AuthService.getToken as jest.Mock;
const acquireCycle = GitSyncGate.acquireCycle as jest.Mock;
const mockPullFromSingleRepo = pullFromSingleRepo as jest.Mock;
const mockRefreshNotes = jest.fn(async () => {});
const mockRefreshCanvases = jest.fn(async () => {});
const mockRefreshTodos = jest.fn(async () => {});

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
    jest.useRealTimers();
    enqueueUpsert.mockResolvedValue({ id: 'mut_upsert' });
    enqueueDelete.mockResolvedValue({ id: 'mut_delete' });
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
    acquireCycle.mockResolvedValue(jest.fn());
    mockPullFromSingleRepo.mockResolvedValue({ repos: 1, notes: 1, canvases: 0, todos: 0, templates: 0 });
    onDroppedMutation.mockReturnValue(jest.fn());
    mockRefreshNotes.mockClear();
    mockRefreshCanvases.mockClear();
    mockRefreshTodos.mockClear();
    (useNoteStore.getState as jest.Mock).mockReturnValue({ refreshNotes: mockRefreshNotes });
    (useCanvasStore.getState as jest.Mock).mockReturnValue({ refreshCanvases: mockRefreshCanvases });
    (useTodoStore.getState as jest.Mock).mockReturnValue({ refreshTodos: mockRefreshTodos });
  });

  afterEach(() => {
    __resetImportDedupForTest();
  });

  describe('stageUpsert', () => {
    test('api mode enqueues then writes through: drain, pull, success', async () => {
      getMode.mockResolvedValue('api');
      queueGetAll.mockResolvedValue([]);
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
      expect(acquireCycle).toHaveBeenCalledWith('save');
      expect(queueDrain).toHaveBeenCalledWith(undefined, 'save');
      expect(mockPullFromSingleRepo).toHaveBeenCalledWith('owner/repo');
      expect(mockRefreshNotes).toHaveBeenCalled();
      expect(mockRefreshCanvases).toHaveBeenCalled();
      expect(mockRefreshTodos).toHaveBeenCalled();
      expect(githubActivity.begin).toHaveBeenCalledWith('Syncing');
      expect(githubActivity.end).toHaveBeenCalled();
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
      expect(writeAndCommit).not.toHaveBeenCalled();
    });

    test('api mode write-through returns pendingSync when mutation stays in queue', async () => {
      getMode.mockResolvedValue('api');
      const queuedMutation = {
        id: 'mut_upsert',
        type: 'note.upsert' as const,
        createdAt: 0,
        attempts: 0,
        params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/a.md', title: 'A', content: 'hello' },
      };
      queueGetAll.mockResolvedValue([queuedMutation]);

      const result = await StagingService.stageUpsert({
        repo: 'owner/repo',
        title: 'A',
        content: 'hello',
      });

      expect(result).toEqual({ success: true, pendingSync: true });
      expect(queueDrain).toHaveBeenCalled();
      expect(mockPullFromSingleRepo).not.toHaveBeenCalled();
    });

    test('api mode write-through returns droppedConflict when drop event fires', async () => {
      getMode.mockResolvedValue('api');
      queueGetAll.mockResolvedValue([]);

      const dropListeners: Array<(event: { mutation: { id: string } }) => void> = [];
      onDroppedMutation.mockImplementation((fn: (event: { mutation: { id: string } }) => void) => {
        dropListeners.push(fn);
        return jest.fn();
      });

      new Promise<{ succeeded: number; failed: number; remaining: number }>((resolve) => {
        queueDrain.mockImplementation(async () => {
          for (const listener of dropListeners) {
            listener({ mutation: { id: 'mut_upsert' } });
          }
          resolve({ succeeded: 0, failed: 1, remaining: 0 });
          return { succeeded: 0, failed: 1, remaining: 0 };
        });
      });

      const result = await StagingService.stageUpsert({
        repo: 'owner/repo',
        title: 'A',
        content: 'hello',
      });

      expect(result).toEqual({
        success: false,
        error: 'conflict',
        droppedConflict: true,
      });
      expect(mockPullFromSingleRepo).not.toHaveBeenCalled();
    });

    test('api mode write-through times out after 45s and returns pendingSync', async () => {
      jest.useFakeTimers();
      getMode.mockResolvedValue('api');
      queueGetAll.mockResolvedValue([]);

      acquireCycle.mockReturnValue(new Promise<() => void>(() => {}));

      const resultPromise = StagingService.stageUpsert({
        repo: 'owner/repo',
        title: 'A',
        content: 'hello',
      });

      await jest.advanceTimersByTimeAsync(45_000);
      const result = await resultPromise;

      expect(result).toEqual({ success: true, pendingSync: true });
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
      expect(acquireCycle).not.toHaveBeenCalled();
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
    test('api mode enqueues a delete then writes through: drain, pull, success', async () => {
      getMode.mockResolvedValue('api');
      queueGetAll.mockResolvedValue([]);
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
      expect(acquireCycle).toHaveBeenCalledWith('save');
      expect(queueDrain).toHaveBeenCalledWith(undefined, 'save');
      expect(mockPullFromSingleRepo).toHaveBeenCalledWith('owner/repo');
      expect(githubActivity.begin).toHaveBeenCalledWith('Syncing');
      expect(githubActivity.end).toHaveBeenCalled();
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
      getMode.mockResolvedValue('clone');
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
      getMode.mockResolvedValue('clone');
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

    test('strictly-behind local branch (local === merge base) emits no phantom unpushed row (#879)', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      // Local is the ancestor of origin: localOid === merge base, remote descendants.
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'ancestor-oid' : 'descendant-oid',
      );
      findMergeBase.mockResolvedValue('ancestor-oid');

      const staged = await StagingService.listStaged();

      expect(staged).toHaveLength(0);
    });

    test('fresh clone with no commits on either side is not staged', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
getCommitOid.mockResolvedValue(null);
    findMergeBase.mockResolvedValue(null);

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
      getMode.mockResolvedValue('clone');
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
      expect(writerPush).toHaveBeenCalledWith(
        expect.objectContaining({
          repoPath: 'owner/repo',
          branch: 'main',
          token: 'test-token',
        }),
      );
      // drain() is now unconditional so stale API-mode queue items in a
      // clone-mode repo (issue #900) never get stranded.
      expect(queueDrain).toHaveBeenCalledTimes(1);
    });

    test('clone push forwards onProgress to githubActivity.setProgress', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      let capturedOnProgress: ((p: { phase: string; loaded: number; total: number }) => void) | undefined;
      writerPush.mockImplementation(async (opts: { onProgress?: (p: { phase: string; loaded: number; total: number }) => void }) => {
        capturedOnProgress = opts.onProgress;
        return { success: true };
      });

      const result = await StagingService.pushStaged('owner/repo', 'main');

      expect(result).toEqual({ success: true });
      expect(capturedOnProgress).toBeDefined();
      capturedOnProgress?.({ phase: 'Writing objects', loaded: 2, total: 5 });
      expect(githubActivity.setProgress).toHaveBeenCalledWith({
        phase: 'Pushing changes',
        loaded: 2,
        total: 5,
      });
    });

    test('clone push failure surfaces an error', async () => {
      getMode.mockResolvedValue('clone');
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

    test('clone-mode repo with leftover API-mode queue items still drains (issue #900)', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.delete', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/stale.md',
          title: 'stale',
        }),
      ]);
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      const result = await StagingService.pushStaged('owner/repo', 'main');

      expect(result).toEqual({ success: true });
      // The stale API-mode delete would previously be stranded: listStaged
      // tags queue items with the repo's current mode (clone), so the old
      // hasApi gate skipped drain entirely and the item sat at attempts 0.
      expect(queueDrain).toHaveBeenCalledTimes(1);
      expect(writerPush).toHaveBeenCalledTimes(1);
    });

    test('nothing staged is a successful no-op', async () => {
      const result = await StagingService.pushStaged();

      expect(result).toEqual({ success: true });
      expect(queueDrain).not.toHaveBeenCalled();
      expect(writerPush).not.toHaveBeenCalled();
    });

    test('api mode forwards onProgress to NoteSyncQueueService.drain', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.upsert', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
        }),
      ]);
      getMode.mockResolvedValue('api');

      const onProgress = jest.fn();
      const result = await StagingService.pushStaged(undefined, undefined, onProgress);

      expect(result).toEqual({ success: true });
      expect(queueDrain).toHaveBeenCalledTimes(1);
      expect(queueDrain).toHaveBeenCalledWith(onProgress);
    });

    test('clone mode forwards onProgress fraction and githubActivity.setProgress', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      let capturedOnProgress: ((p: { phase: string; loaded: number; total: number }) => void) | undefined;
      writerPush.mockImplementation(async (opts: { onProgress?: (p: { phase: string; loaded: number; total: number }) => void }) => {
        capturedOnProgress = opts.onProgress;
        return { success: true };
      });

      const onProgress = jest.fn();
      const result = await StagingService.pushStaged('owner/repo', 'main', onProgress);

      expect(result).toEqual({ success: true });
      expect(capturedOnProgress).toBeDefined();

      capturedOnProgress?.({ phase: 'Writing objects', loaded: 2, total: 5 });
      expect(onProgress).toHaveBeenCalledWith(0.4);
      expect(githubActivity.setProgress).toHaveBeenCalledWith({
        phase: 'Pushing changes',
        loaded: 2,
        total: 5,
      });

      capturedOnProgress?.({ phase: 'Writing objects', loaded: 5, total: 5 });
      expect(onProgress).toHaveBeenCalledWith(1);
    });

    test('clone mode calls onProgress(null) when total is 0', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      let capturedOnProgress: ((p: { phase: string; loaded: number; total: number }) => void) | undefined;
      writerPush.mockImplementation(async (opts: { onProgress?: (p: { phase: string; loaded: number; total: number }) => void }) => {
        capturedOnProgress = opts.onProgress;
        return { success: true };
      });

      const onProgress = jest.fn();
      await StagingService.pushStaged('owner/repo', 'main', onProgress);

      capturedOnProgress?.({ phase: 'Writing objects', loaded: 0, total: 0 });
      expect(onProgress).toHaveBeenCalledWith(null);
    });

    test('successful clone push broadcasts staged-changed so the floating push button hides', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );

      const listener = jest.fn();
      const unsubscribe = subscribeStagedChanged(listener);

      try {
        const result = await StagingService.pushStaged('owner/repo', 'main');

        expect(result).toEqual({ success: true });
        expect(writerPush).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
      }
    });

    test('failed clone push does NOT broadcast staged-changed (button stays)', async () => {
      getMode.mockResolvedValue('clone');
      getSavedRepositories.mockResolvedValue([
        { id: '1', name: 'repo', path: 'owner/repo', branch: 'main' },
      ]);
      getCommitOid.mockImplementation(
        async ({ ref }: { ref: string }) =>
          ref.startsWith('refs/heads') ? 'local-oid' : 'remote-oid',
      );
      writerPush.mockResolvedValue({ success: false, error: 'push rejected' });

      const listener = jest.fn();
      const unsubscribe = subscribeStagedChanged(listener);

      try {
        const result = await StagingService.pushStaged('owner/repo', 'main');

        expect(result).toEqual({ success: false, error: 'push rejected' });
        expect(listener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });

    test('api-mode push does NOT broadcast staged-changed (queue notify covers it)', async () => {
      queueGetAll.mockResolvedValue([
        queueItem('note.upsert', {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
        }),
      ]);
      getMode.mockResolvedValue('api');

      const listener = jest.fn();
      const unsubscribe = subscribeStagedChanged(listener);

      try {
        const result = await StagingService.pushStaged();

        expect(result).toEqual({ success: true });
        expect(listener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    });
  });
});
