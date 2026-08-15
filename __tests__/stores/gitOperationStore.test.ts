jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    getAll: jest.fn(async () => []),
    subscribe: jest.fn(() => () => {}),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import type { QueuedMutation } from '../../src/services/NoteSyncQueueService';
import {
  useGitOperationStore,
  gitOperationRegistry,
  hydrate,
  isPathLocked,
  isEntityLocked,
  isRepoBusy,
  hasActivePull,
  pendingRunningCount,
  GIT_OP_ALL_REPOS,
} from '../../src/stores/gitOperationStore';
import type { GitOpKind } from '../../src/stores/gitOperationStore';

const REPO = 'owner/repo';
const BRANCH = 'main';
const PATH = 'notes/hello.md';
const FAILURES_KEY = '@gitnotes:delete_failures_v1';

const upsertMutation = (
  id: string,
  opts: { localNoteId?: string; branch?: string; filePath?: string } = {},
): QueuedMutation => ({
  id,
  type: 'note.upsert',
  createdAt: 1_000,
  attempts: 0,
  localNoteId: opts.localNoteId ?? 'note-1',
  params: {
    repo: REPO,
    branch: opts.branch ?? BRANCH,
    filePath: opts.filePath ?? PATH,
    title: 'Hello',
    content: 'content',
  },
});

const deleteMutation = (
  id: string,
  opts: { branch?: string; filePath?: string } = {},
): QueuedMutation => ({
  id,
  type: 'note.delete',
  createdAt: 2_000,
  attempts: 1,
  params: {
    repo: REPO,
    branch: opts.branch ?? BRANCH,
    filePath: opts.filePath ?? PATH,
    title: 'Hello',
  },
});

const seedFailureMap = (map: Record<string, { error: string; kind: string; at: number }>) =>
  AsyncStorage.setItem(FAILURES_KEY, JSON.stringify(map));

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

const opsState = () => useGitOperationStore.getState().ops;

const beginOp = (
  input: {
    kind?: GitOpKind;
    repo?: string;
    branch?: string;
    path?: string;
    entityIds?: string[];
    status?: 'queued' | 'running';
  } = {},
): string =>
  useGitOperationStore.getState().begin({
    kind: input.kind ?? 'delete',
    repo: input.repo ?? REPO,
    branch: input.branch,
    path: input.path,
    entityIds: input.entityIds ?? [],
    attempts: 0,
    status: input.status ?? 'queued',
  });

describe('gitOperationStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGitOperationStore.setState({ ops: {} });
    (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => []);
    (NoteSyncQueueService.subscribe as jest.Mock).mockImplementation(() => () => {});
    return AsyncStorage.clear();
  });

  describe('queue subscription', () => {
    it('subscribes once (module flag) and re-derives live on queue churn', async () => {
      let churn: (() => void) | undefined;
      (NoteSyncQueueService.subscribe as jest.Mock).mockImplementation((cb: () => void) => {
        churn = cb;
        return () => {};
      });

      await hydrate();
      expect(NoteSyncQueueService.subscribe).toHaveBeenCalledTimes(1);
      expect(churn).toBeDefined();

      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [upsertMutation('live-1')]);
      expect(opsState()['live-1']).toBeUndefined();
      churn!();
      await flushAsync();
      expect(opsState()['live-1']).toBeDefined();
      expect(opsState()['live-1'].status).toBe('queued');

      await hydrate();
      await hydrate();
      expect(NoteSyncQueueService.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle actions', () => {
    it('begin → setRunning → succeed removes the op', () => {
      const id = beginOp({ kind: 'upsert', path: PATH, status: 'queued' });
      expect(opsState()[id].status).toBe('queued');

      useGitOperationStore.getState().setRunning(id);
      expect(opsState()[id].status).toBe('running');

      useGitOperationStore.getState().succeed(id);
      expect(opsState()[id]).toBeUndefined();
      expect(Object.keys(opsState())).toHaveLength(0);
    });

    it('fail keeps the op with status failed and the error message', () => {
      const id = beginOp({ kind: 'delete', path: PATH, status: 'running' });

      useGitOperationStore.getState().fail(id, 'HTTP 401');

      const op = opsState()[id];
      expect(op).toBeDefined();
      expect(op.status).toBe('failed');
      expect(op.error).toBe('HTTP 401');
    });

    it('retry on missing id is a no-op', () => {
      expect(() => useGitOperationStore.getState().retry('missing-id')).not.toThrow();
      expect(Object.keys(opsState())).toHaveLength(0);
    });

    it('retry resets a failed op to queued and clears the error', () => {
      const id = beginOp({ kind: 'delete', path: PATH });
      useGitOperationStore.getState().fail(id, 'boom');

      useGitOperationStore.getState().retry(id);

      expect(opsState()[id].status).toBe('queued');
      expect(opsState()[id].error).toBeUndefined();
    });

    it('exposes the same actions through the gitOperationRegistry facade', () => {
      const id = gitOperationRegistry.begin({
        kind: 'push',
        repo: REPO,
        entityIds: [],
        attempts: 0,
        status: 'running',
      });
      expect(opsState()[id].status).toBe('running');

      gitOperationRegistry.succeed(id);
      expect(opsState()[id]).toBeUndefined();
    });
  });

  describe('selectors', () => {
    it('isPathLocked true while queued/running, false after succeed', () => {
      const id = beginOp({ kind: 'delete', branch: BRANCH, path: PATH, status: 'queued' });

      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(true);

      useGitOperationStore.getState().setRunning(id);
      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(true);

      useGitOperationStore.getState().succeed(id);
      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(false);
    });

    it('isPathLocked normalizes undefined branch to main on both sides', () => {
      beginOp({ kind: 'upsert', branch: undefined, path: PATH });
      expect(isPathLocked(opsState(), REPO, 'main', PATH)).toBe(true);

      useGitOperationStore.setState({ ops: {} });
      beginOp({ kind: 'upsert', branch: 'main', path: PATH });
      expect(isPathLocked(opsState(), REPO, undefined, PATH)).toBe(true);
    });

    it('isPathLocked false for different repo, branch, or path', () => {
      beginOp({ kind: 'upsert', branch: BRANCH, path: PATH });
      expect(isPathLocked(opsState(), 'other/repo', BRANCH, PATH)).toBe(false);
      expect(isPathLocked(opsState(), REPO, 'develop', PATH)).toBe(false);
      expect(isPathLocked(opsState(), REPO, BRANCH, 'notes/other.md')).toBe(false);
    });

    it('ops without a path lock every path on their repo+branch (pull/push)', () => {
      beginOp({ kind: 'pull', branch: BRANCH, status: 'running' });
      expect(isPathLocked(opsState(), REPO, BRANCH, 'any/file.md')).toBe(true);
    });

    it('failed ops do not lock paths or entities', () => {
      const id = beginOp({ kind: 'delete', branch: BRANCH, path: PATH, entityIds: ['note-1'] });
      useGitOperationStore.getState().fail(id, 'boom');

      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(false);
      expect(isEntityLocked(opsState(), 'note-1')).toBe(false);
    });

    it('isEntityLocked via entityIds', () => {
      const id = beginOp({ kind: 'upsert', path: PATH, entityIds: ['note-1', 'note-2'] });

      expect(isEntityLocked(opsState(), 'note-1')).toBe(true);
      expect(isEntityLocked(opsState(), 'note-2')).toBe(true);
      expect(isEntityLocked(opsState(), 'note-3')).toBe(false);

      useGitOperationStore.getState().succeed(id);
      expect(isEntityLocked(opsState(), 'note-1')).toBe(false);
    });

    it('isRepoBusy, hasActivePull and pendingRunningCount', () => {
      beginOp({ kind: 'push', repo: REPO, status: 'running' });
      beginOp({ kind: 'pull', repo: 'other/repo', status: 'running' });

      expect(isRepoBusy(opsState(), REPO)).toBe(true);
      expect(isRepoBusy(opsState(), 'third/repo')).toBe(false);
      expect(hasActivePull(opsState(), 'other/repo')).toBe(true);
      expect(hasActivePull(opsState(), REPO)).toBe(false);
      expect(pendingRunningCount(opsState())).toBe(2);
    });

    it('a wildcard-repo pull op counts as busy/pulling for every repo (sync cycle op)', () => {
      const id = beginOp({ kind: 'pull', repo: GIT_OP_ALL_REPOS, status: 'running' });

      expect(isRepoBusy(opsState(), REPO)).toBe(true);
      expect(isRepoBusy(opsState(), 'third/repo')).toBe(true);
      expect(hasActivePull(opsState(), REPO)).toBe(true);
      expect(hasActivePull(opsState(), 'third/repo')).toBe(true);

      useGitOperationStore.getState().succeed(id);
      expect(isRepoBusy(opsState(), REPO)).toBe(false);
      expect(hasActivePull(opsState(), REPO)).toBe(false);
    });
  });

  describe('hydrate (durable derivation)', () => {
    it('maps mocked queue (upsert+delete) and failure entries into ops', async () => {
      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
        upsertMutation('m-upsert', { localNoteId: 'note-42' }),
        deleteMutation('m-delete', { filePath: 'notes/gone.md' }),
      ]);
      await seedFailureMap({
        [`${REPO}::master::notes/failed.md`]: { error: 'HTTP 401', kind: 'delete', at: 12_345 },
      });

      await hydrate();

      const ops = opsState();
      expect(Object.keys(ops)).toHaveLength(3);

      const upsertOp = ops['m-upsert'];
      expect(upsertOp).toMatchObject({
        kind: 'upsert',
        repo: REPO,
        branch: BRANCH,
        path: PATH,
        entityIds: ['note-42'],
        status: 'queued',
      });

      const deleteOp = ops['m-delete'];
      expect(deleteOp).toMatchObject({
        kind: 'delete',
        repo: REPO,
        path: 'notes/gone.md',
        entityIds: [],
        status: 'queued',
      });

      const failedOp = ops[`${REPO}::master::notes/failed.md`];
      expect(failedOp).toMatchObject({
        kind: 'delete',
        repo: REPO,
        branch: 'master',
        path: 'notes/failed.md',
        status: 'failed',
        error: 'HTTP 401',
        createdAt: 12_345,
      });
    });

    it('upsert without localNoteId maps to empty entityIds', async () => {
      const mutation = upsertMutation('m-1');
      delete (mutation as { localNoteId?: string }).localNoteId;
      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [mutation]);

      await hydrate();

      expect(opsState()['m-1'].entityIds).toEqual([]);
    });

    it('corrupted queue JSON → hydrate resolves empty (no throw)', async () => {
      (NoteSyncQueueService.getAll as jest.Mock).mockRejectedValue(new Error('corrupt queue JSON'));
      await expect(hydrate()).resolves.toBeUndefined();
      expect(Object.keys(opsState())).toHaveLength(0);

      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
        null,
        'garbage',
        42,
        { not: 'a mutation' },
        { id: 'no-params' },
      ]);
      await expect(hydrate()).resolves.toBeUndefined();
      expect(Object.keys(opsState())).toHaveLength(0);

      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [upsertMutation('m-ok')]);
      await AsyncStorage.setItem(FAILURES_KEY, '{{{ not json');
      await expect(hydrate()).resolves.toBeUndefined();
      expect(Object.keys(opsState())).toEqual(['m-ok']);

      (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('storage read failure');
      });
      await expect(hydrate()).resolves.toBeUndefined();
      expect(Object.keys(opsState())).toEqual(['m-ok']);
    });

    it('double-hydrate is idempotent (no duplicates per mutation id)', async () => {
      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
        upsertMutation('m-1'),
        deleteMutation('m-2'),
      ]);
      await seedFailureMap({ [`${REPO}::main::notes/f.md`]: { error: 'e', kind: 'delete', at: 1 } });

      await hydrate();
      await hydrate();

      const ops = opsState();
      expect(Object.keys(ops)).toHaveLength(3);
      expect(Object.keys(ops).filter((id) => id === 'm-1')).toHaveLength(1);
      expect(Object.keys(ops).filter((id) => id === 'm-2')).toHaveLength(1);
    });

    it('preserves volatile ops while rebuilding durable-derived ones', async () => {
      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [upsertMutation('m-1')]);
      await hydrate();
      useGitOperationStore.getState().succeed('m-1');

      const pushOpId = gitOperationRegistry.begin({
        kind: 'push',
        repo: REPO,
        branch: BRANCH,
        entityIds: [],
        attempts: 0,
        status: 'running',
      });

      await hydrate();

      expect(opsState()[pushOpId]).toMatchObject({ kind: 'push', status: 'running' });
      expect(opsState()['m-1']).toBeDefined();
      expect(opsState()['m-1'].status).toBe('queued');
    });
  });

  describe('lock durability across store refresh', () => {
    it('path lock survives a simulated refresh that re-creates the note under a new id', async () => {
      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
        upsertMutation('m-1', { localNoteId: 'note-v1' }),
      ]);
      await hydrate();
      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(true);
      expect(isEntityLocked(opsState(), 'note-v1')).toBe(true);

      (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
        upsertMutation('m-1', { localNoteId: 'note-v2' }),
      ]);
      await hydrate();

      expect(isPathLocked(opsState(), REPO, BRANCH, PATH)).toBe(true);
      expect(isEntityLocked(opsState(), 'note-v2')).toBe(true);
      expect(isEntityLocked(opsState(), 'note-v1')).toBe(false);
    });
  });
});
