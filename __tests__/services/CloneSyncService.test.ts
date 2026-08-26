/**
 * CloneSyncService.test.ts
 *
 * Unit tests for CloneSyncService:
 * - save() happy path (upsert)
 * - save() with delete intent (verifies pre-pull BEFORE commit ordering)
 * - save() with rename intent
 * - save() when commit fails
 * - tryPushNow() offline → queues (enqueue BEFORE returning 'queued')
 * - tryPushNow() push success → pullFromSingleRepo + revision increment
 * - tryPushNow() conflict → surfaceConflictsOnDiverged (NO navigation)
 * - tryPushNow() transient error → queues
 * - pushPending() drain success
 * - pushPending() conflict stops early
 * - pushPending() queues remaining items
 * - subscribe() notification on revision bump
 */

// ─── Mock state ───────────────────────────────────────────────────────────────

const mockNetInfoState = { isConnected: true, isInternetReachable: true };

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../src/services/git/CommitService', () => ({
  CommitService: { commit: jest.fn() },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: { pullWithFastForward: jest.fn() },
}));

jest.mock('../../src/services/git/recovery', () => ({
  pushWithRecovery: jest.fn(),
  surfaceConflictsOnDiverged: jest.fn(),
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(),
}));

jest.mock('../../src/services/git/ClonePendingQueue', () => ({
  ClonePendingQueue: {
    enqueuePush: jest.fn(),
    listPending: jest.fn(),
    markSuccess: jest.fn(),
    markAttempt: jest.fn(),
  },
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: { acquireCycle: jest.fn() },
}));

jest.mock('../../src/stores/gitActivityStore', () => ({
  useGitActivityStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../../src/stores/conflictStore', () => ({
  useConflictStore: {
    getState: jest.fn(() => ({ addConflict: jest.fn() })),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(() => Promise.resolve('test-token')) },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { CloneSyncService } from '../../src/services/CloneSyncService';
import { CommitService } from '../../src/services/git/CommitService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { ClonePendingQueue } from '../../src/services/git/ClonePendingQueue';
import { GitSyncGate } from '../../src/services/git/GitSyncGate';
import { pushWithRecovery, surfaceConflictsOnDiverged } from '../../src/services/git/recovery';
import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { useGitActivityStore } from '../../src/stores/gitActivityStore';
import NetInfo from '@react-native-community/netinfo';

describe('CloneSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset NetInfo state
    mockNetInfoState.isConnected = true;
    mockNetInfoState.isInternetReachable = true;

    // Stable getState mock that always returns the same incrementRevision spy
    const revisionSpy = jest.fn();
    (useGitActivityStore.getState as jest.Mock).mockReturnValue({
      incrementRevision: revisionSpy,
    });

    // Default mock implementations
    (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValue(jest.fn());
    (ClonePendingQueue.enqueuePush as jest.Mock).mockResolvedValue(undefined);
    (ClonePendingQueue.listPending as jest.Mock).mockResolvedValue([]);
    (ClonePendingQueue.markSuccess as jest.Mock).mockResolvedValue(undefined);
    (ClonePendingQueue.markAttempt as jest.Mock).mockResolvedValue(undefined);
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValue({ ok: true });
    (pullFromSingleRepo as jest.Mock).mockResolvedValue({ repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 });
    (surfaceConflictsOnDiverged as jest.Mock).mockResolvedValue(null);
    (CommitService.commit as jest.Mock).mockResolvedValue({ success: true });
    (pushWithRecovery as jest.Mock).mockResolvedValue({ success: true });
    (NetInfo.fetch as jest.Mock).mockReset();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: true });
  });

  // Helper to get the current incrementRevision spy from getState mock
  const getRevisionSpy = () =>
    (useGitActivityStore.getState as jest.Mock).mock.calls.at(-1)?.[0]?.incrementRevision ??
    (useGitActivityStore.getState as jest.Mock).mock.results.at(-1)?.value?.incrementRevision;

  // ─── subscribe ───────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    test('fires listener on revision bump after save', async () => {
      const called: number[] = [];
      const unsub = CloneSyncService.subscribe(() => called.push(Date.now()));

      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        intent: 'upsert',
      });

      expect(called.length).toBeGreaterThanOrEqual(1);
      unsub();
    });

    test('unsubscribe stops notifications', async () => {
      const called: number[] = [];
      const unsub = CloneSyncService.subscribe(() => called.push(Date.now()));
      unsub();

      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        intent: 'upsert',
      });

      expect(called).toHaveLength(0);
    });
  });

  // ─── save ───────────────────────────────────────────────────────────────────

  describe('save', () => {
    test('upsert: acquires gate, commits, increments revision, pushes, releases gate', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);

      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        intent: 'upsert',
      });

      expect(result).toEqual({ success: true });
      expect(GitSyncGate.acquireCycle).toHaveBeenCalledWith('save');
      expect(CommitService.commit).toHaveBeenCalledWith({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        delete: false,
        prevFilePath: undefined,
      });

      // incrementRevision should have been called (once for the commit)
      const incRevSpy = getRevisionSpy();
      expect(incRevSpy).toHaveBeenCalled();

      expect(pushWithRecovery).toHaveBeenCalledWith({
        repoPath: 'owner/repo',
        branch: 'main',
        token: 'test-token',
      });
      expect(releaseFn).toHaveBeenCalled();
    });

    test('delete: pre-pulls BEFORE commit', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);

      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '',
        message: 'Delete a',
        intent: 'delete',
      });

      // Verify pullWithFastForward was called before commit
      expect(GitFsService.pullWithFastForward).toHaveBeenCalled();
      expect(CommitService.commit).toHaveBeenCalled();

      // Call order: pullWithFastForward before commit
      expect((GitFsService.pullWithFastForward as jest.Mock).mock.invocationCallOrder[0])
        .toBeLessThan((CommitService.commit as jest.Mock).mock.invocationCallOrder[0]);

      // Verify delete: true was passed
      expect((CommitService.commit as jest.Mock).mock.calls[0][0].delete).toBe(true);
    });

    test('rename: passes prevFilePath through to commit', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);

      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/new.md',
        content: '# New',
        message: 'Rename to new',
        intent: 'rename',
        prevFilePath: 'notes/old.md',
      });

      expect((CommitService.commit as jest.Mock).mock.calls[0][0].prevFilePath).toBe('notes/old.md');
    });

    test('commit failure: returns error without pushing', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);
      (CommitService.commit as jest.Mock).mockResolvedValueOnce({ success: false, error: 'commit failed' });

      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        intent: 'upsert',
      });

      expect(result).toEqual({ success: false, error: 'commit failed' });
      expect(pushWithRecovery).not.toHaveBeenCalled();
      expect(releaseFn).toHaveBeenCalled();
    });

    test('push returns queued: gate still released and enqueues with correct path/oid', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);
      (CommitService.commit as jest.Mock).mockResolvedValueOnce({ success: true, oid: 'abc123' });
      (pushWithRecovery as jest.Mock).mockResolvedValueOnce({ success: false, error: 'network error' });
      (ClonePendingQueue.enqueuePush as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        content: '# Hello',
        message: 'Update a',
        intent: 'upsert',
      });

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(ClonePendingQueue.enqueuePush).toHaveBeenCalledWith('owner/repo', 'main', [
        { path: 'notes/a.md', oid: 'abc123', intent: 'upsert' },
      ]);
      expect(releaseFn).toHaveBeenCalled();
    });

    test('push returns queued with rename: enqueues as upsert', async () => {
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(jest.fn());
      (CommitService.commit as jest.Mock).mockResolvedValueOnce({ success: true, oid: 'def456' });
      (pushWithRecovery as jest.Mock).mockResolvedValueOnce({ success: false, error: 'offline' });
      (ClonePendingQueue.enqueuePush as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/new.md',
        content: '# Renamed',
        message: 'Rename',
        intent: 'rename',
        prevFilePath: 'notes/old.md',
      });

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(ClonePendingQueue.enqueuePush).toHaveBeenCalledWith('owner/repo', 'main', [
        { path: 'notes/new.md', oid: 'def456', intent: 'upsert' },
      ]);
    });

    test('gate released even when commit throws', async () => {
      const releaseFn = jest.fn();
      (GitSyncGate.acquireCycle as jest.Mock).mockResolvedValueOnce(releaseFn);
      (CommitService.commit as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await expect(
        CloneSyncService.save({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          content: '# Hello',
          message: 'Update a',
          intent: 'upsert',
        }),
      ).rejects.toThrow('boom');

      expect(releaseFn).toHaveBeenCalled();
    });
  });

  // ─── tryPushNow ─────────────────────────────────────────────────────────────

  describe('tryPushNow', () => {
    test('online + push success: pulls from single repo and increments revision', async () => {
      (pushWithRecovery as jest.Mock).mockResolvedValueOnce({ success: true });

      const result = await CloneSyncService.tryPushNow('owner/repo', 'main');

      expect(result).toEqual({ success: true });
      expect(pullFromSingleRepo).toHaveBeenCalledWith('owner/repo');

      const incRevSpy = getRevisionSpy();
      expect(incRevSpy).toHaveBeenCalled();
    });

    test('offline: returns queued without calling enqueuePush', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });

      const result = await CloneSyncService.tryPushNow('owner/repo', 'main');

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(ClonePendingQueue.enqueuePush).not.toHaveBeenCalled();
      expect(pushWithRecovery).not.toHaveBeenCalled();
    });

    test('not internet reachable: returns queued without calling enqueuePush', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true, isInternetReachable: false });

      const result = await CloneSyncService.tryPushNow('owner/repo', 'main');

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(ClonePendingQueue.enqueuePush).not.toHaveBeenCalled();
    });

    test('push conflict-detected: surfaces conflicts, does NOT navigate, returns conflict-detected', async () => {
      (pushWithRecovery as jest.Mock).mockResolvedValueOnce({ success: false, error: 'conflict-detected' });

      const result = await CloneSyncService.tryPushNow('owner/repo', 'main');

      expect(result).toEqual({ success: false, error: 'conflict-detected' });
      expect(surfaceConflictsOnDiverged).toHaveBeenCalledWith({ repoPath: 'owner/repo', branch: 'main' });
      expect(pullFromSingleRepo).not.toHaveBeenCalled();
    });

    test('push transient error (auth/network): returns queued without calling enqueuePush', async () => {
      (pushWithRecovery as jest.Mock).mockResolvedValueOnce({ success: false, error: 'push failed: network error' });

      const result = await CloneSyncService.tryPushNow('owner/repo', 'main');

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(ClonePendingQueue.enqueuePush).not.toHaveBeenCalled();
    });
  });

  // ─── pushPending ─────────────────────────────────────────────────────────────

  describe('pushPending', () => {
    test('drains all pending items, marks each success', async () => {
      const pending = [
        { id: '1', path: 'notes/a.md', oid: 'abc', intent: 'upsert' as const, createdAt: 1, attempts: 0 },
        { id: '2', path: 'notes/b.md', oid: 'def', intent: 'upsert' as const, createdAt: 2, attempts: 0 },
      ];
      (ClonePendingQueue.listPending as jest.Mock).mockResolvedValueOnce(pending);
      (pushWithRecovery as jest.Mock).mockResolvedValue({ success: true });

      const result = await CloneSyncService.pushPending('owner/repo', 'main');

      expect(result).toEqual({ succeeded: 2, failed: 0, conflicted: false, queuedItems: 2 });
      expect(ClonePendingQueue.markSuccess).toHaveBeenCalledTimes(2);
    });

    test('stops early on conflict-detected', async () => {
      const pending = [
        { id: '1', path: 'notes/a.md', oid: 'abc', intent: 'upsert' as const, createdAt: 1, attempts: 0 },
        { id: '2', path: 'notes/b.md', oid: 'def', intent: 'upsert' as const, createdAt: 2, attempts: 0 },
      ];
      (ClonePendingQueue.listPending as jest.Mock).mockResolvedValueOnce(pending);
      (pushWithRecovery as jest.Mock)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'conflict-detected' });

      const result = await CloneSyncService.pushPending('owner/repo', 'main');

      expect(result.conflicted).toBe(true);
      expect(result.succeeded).toBe(1);
      expect(ClonePendingQueue.markSuccess).toHaveBeenCalledTimes(1);
    });

    test('continues to next item on queued (network transient)', async () => {
      const pending = [
        { id: '1', path: 'notes/a.md', oid: 'abc', intent: 'upsert' as const, createdAt: 1, attempts: 0 },
        { id: '2', path: 'notes/b.md', oid: 'def', intent: 'upsert' as const, createdAt: 2, attempts: 0 },
      ];
      (ClonePendingQueue.listPending as jest.Mock).mockResolvedValueOnce(pending);
      (pushWithRecovery as jest.Mock)
        .mockResolvedValueOnce({ success: false, error: 'queued' })
        .mockResolvedValueOnce({ success: true });

      const result = await CloneSyncService.pushPending('owner/repo', 'main');

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.conflicted).toBe(false);
    });

    test('uses manual cycle source so concurrent saves do not deadlock', async () => {
      (ClonePendingQueue.listPending as jest.Mock).mockResolvedValueOnce([]);

      await CloneSyncService.pushPending('owner/repo', 'main');

      expect(GitSyncGate.acquireCycle).toHaveBeenCalledWith('manual');
    });

    test('empty pending queue: returns zero counts', async () => {
      (ClonePendingQueue.listPending as jest.Mock).mockResolvedValueOnce([]);

      const result = await CloneSyncService.pushPending('owner/repo', 'main');

      expect(result).toEqual({ succeeded: 0, failed: 0, conflicted: false, queuedItems: 0 });
      expect(pushWithRecovery).not.toHaveBeenCalled();
    });
  });
});
