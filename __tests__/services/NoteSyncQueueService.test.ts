jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
  deleteNoteFromGitHub: jest.fn(),
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { updateNote: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok'), getTokenById: jest.fn(async () => 'tok') },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: { push: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../../src/services/CloneSyncService', () => ({
  CloneSyncService: {
    pushPending: jest.fn(async () => ({
      succeeded: 1,
      failed: 0,
      conflicted: false,
      queuedItems: 1,
    })),
  },
}));

jest.mock('../../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(),
  batchUpsertFiles: jest.fn(),
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoteSyncQueueService, DroppedMutationEvent } from '../../src/services/NoteSyncQueueService';
import { syncNoteToGitHub, deleteNoteFromGitHub } from '../../src/services/NoteGitHubSyncService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { LocalGitWriter } from '../../src/services/git/LocalGitWriter';
import { CloneSyncService } from '../../src/services/CloneSyncService';
import { batchDeleteFiles, batchUpsertFiles } from '../../src/services/git/BatchGitOperations';
import { resolveBranch } from '../../src/services/git/resolveBranch';
import {
  DELETE_FAILURES_STORAGE_KEY,
  readDeleteFailures,
} from '../../src/services/git/deleteFailures';

const QUEUE_KEY = '@gitnotes:sync_queue_v1';
const TOMBSTONE_KEY = '@gitnotes:delete_tombstones_v1';
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1_000;

const resolveBranchMock = resolveBranch as jest.MockedFunction<typeof resolveBranch>;

// Mirrors the real resolver's contract for these tests: an explicit branch
// short-circuits (no network/fs), otherwise fall back to 'main'. Individual
// tests override the fallback to simulate a non-main host default branch.
function defaultResolveBranch(repoPath: string, hint?: string | null): Promise<string> {
  void repoPath;
  return Promise.resolve(hint ?? 'main');
}

describe('NoteSyncQueueService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
    resolveBranchMock.mockImplementation(defaultResolveBranch);
  });

  describe('enqueueNoteUpsert', () => {
    test('appends a new mutation', async () => {
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
        content: '...',
        format: 'markdown',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('note.upsert');
      expect(items[0].attempts).toBe(0);
      expect(items[0].params.title).toBe('A');
    });

    test('dedupes by repo + branch + filePath + title (latest wins)', async () => {
      const base = {
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
        format: 'markdown' as const,
      };
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, content: 'first' });
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, content: 'second' });
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, content: 'third' });

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      const m = items[0];
      expect(m.type).toBe('note.upsert');
      if (m.type === 'note.upsert') expect(m.params.content).toBe('third');
    });

    test('dedupes a rename: same path with a different title drops the prior upsert (#880)', async () => {
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'x', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'B', content: 'y', format: 'markdown',
      });

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      const m = items[0];
      expect(m.type).toBe('note.upsert');
      if (m.type === 'note.upsert') {
        expect(m.params.title).toBe('B');
        expect(m.params.content).toBe('y');
      }
    });

    test('treats missing branch as "main" for dedupe', async () => {
      const base = {
        repo: 'owner/repo',
        filePath: 'notes/a.md',
        title: 'A',
        format: 'markdown' as const,
      };
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, content: 'one' });
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, branch: 'main', content: 'two' });

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      const m = items[0];
      expect(m.type).toBe('note.upsert');
      if (m.type === 'note.upsert') expect(m.params.content).toBe('two');
    });

    test('keeps separate entries for different files', async () => {
      const base = {
        repo: 'owner/repo',
        branch: 'main',
        title: 'A',
        format: 'markdown' as const,
        content: 'x',
      };
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, filePath: 'a.md' });
      await NoteSyncQueueService.enqueueNoteUpsert({ ...base, filePath: 'b.md' });
      const items = await NoteSyncQueueService.getAll();
      expect(items.map((m) => m.params.filePath)).toEqual(['a.md', 'b.md']);
    });

    test('upsert drops a pending delete for the same path (#565 phase B.2)', async () => {
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'x', format: 'markdown',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('note.upsert');
    });
  });

  describe('enqueueNoteDelete', () => {
    test('appends a delete mutation', async () => {
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'notes/a.md', title: 'A',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('note.delete');
      expect(items[0].params.filePath).toBe('notes/a.md');
    });

    test('drops pending upserts for the same file (#565 phase B.2)', async () => {
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'x', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'y', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('note.delete');
    });

    test('coalesces back-to-back deletes', async () => {
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md',
      });
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
    });

    test('keeps separate deletes for different files', async () => {
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md',
      });
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'b.md',
      });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(2);
    });
  });

  describe('pendingCount', () => {
    test('returns 0 for empty queue', async () => {
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('returns the queue length', async () => {
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'b', title: 'B', content: '', format: 'markdown',
      });
      expect(await NoteSyncQueueService.pendingCount()).toBe(2);
    });
  });

  describe('getAll resilience', () => {
    test('returns [] for malformed JSON', async () => {
      await AsyncStorage.setItem(QUEUE_KEY, '{not json');
      expect(await NoteSyncQueueService.getAll()).toEqual([]);
    });

    test('returns [] for non-array payload', async () => {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify({ foo: 'bar' }));
      expect(await NoteSyncQueueService.getAll()).toEqual([]);
    });
  });

  describe('drain', () => {
    test('removes successfully-synced items', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'b', title: 'B', content: '', format: 'markdown',
      });

      const result = await NoteSyncQueueService.drain();
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('keeps failed items and bumps attempts', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'network' });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      const before = Date.now();
      const result = await NoteSyncQueueService.drain();
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(1);

      const items = await NoteSyncQueueService.getAll();
      expect(items[0].attempts).toBe(1);
      expect(items[0].lastError).toBe('network');
      // Backoff scheduled (issue #565 phase D). First retry: 500ms cap.
      expect(items[0].nextRetryAt).toBeDefined();
      expect(items[0].nextRetryAt!).toBeGreaterThanOrEqual(before + 500);
    });

    test.each([
      ['authentication', '401 Unauthorized'],
      ['permission', '403 Forbidden'],
      ['conflict', '409 Conflict'],
    ])('drops %s failures without retaining a queue entry', async (_kind, error) => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      const result = await NoteSyncQueueService.drain();

      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('drops a generic 403 failure using its structured status', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Permission denied',
        status: 403,
      });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      const result = await NoteSyncQueueService.drain();

      expect(result.remaining).toBe(0);
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('retains transient failures for retry', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: '503 Service Unavailable' });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      const result = await NoteSyncQueueService.drain();

      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(1);
      expect((await NoteSyncQueueService.getAll())[0].attempts).toBe(1);
    });

    test('drops items after MAX_ATTEMPTS', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'fatal' });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      // Backoff would skip the item on every immediate retry (#565 phase D).
      // Advance virtual clock past the backoff cap (30s) between drains.
      let virtualNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => virtualNow);
      try {
        for (let i = 0; i < 8; i++) {
          await NoteSyncQueueService.drain();
          virtualNow += 60_000;
        }
      } finally {
        nowSpy.mockRestore();
      }
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('skips items whose backoff has not elapsed', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'transient' });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      // First drain — fails, sets backoff.
      await NoteSyncQueueService.drain();
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(1);

      // Second drain immediately after — backoff hasn't elapsed, item is skipped.
      const second = await NoteSyncQueueService.drain();
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(1);
      expect(second.succeeded).toBe(0);
      expect(second.failed).toBe(0);
      expect(second.remaining).toBe(1);

      // Advance past the 500ms backoff for attempt #1, drain again — runs.
      const items = await NoteSyncQueueService.getAll();
      const past = items[0].nextRetryAt! + 1;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => past);
      try {
        await NoteSyncQueueService.drain();
      } finally {
        nowSpy.mockRestore();
      }
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(2);
    });

    test('mixes successes and failures', async () => {
      (syncNoteToGitHub as jest.Mock).mockImplementation(async ({ filePath }: { filePath: string }) =>
        filePath === 'a' ? { success: true } : { success: false, error: 'nope' },
      );

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'b', title: 'B', content: '', format: 'markdown',
      });

      const result = await NoteSyncQueueService.drain();
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      const items = await NoteSyncQueueService.getAll();
      expect(items.map((m) => m.params.filePath)).toEqual(['b']);
    });

    describe('clone-mode coalesced push', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
          succeeded: 3,
          failed: 0,
          conflicted: false,
          queuedItems: 3,
        });
      });

      afterEach(() => {
        // Reset to api default so non-clone tests in the file aren't affected
        // by ordering. The factory default would otherwise be overridden by
        // the previous mockResolvedValue across describe blocks.
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('runs syncNoteToGitHub with push:false and flushes once per group', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
        (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
          succeeded: 3, failed: 0, conflicted: false, queuedItems: 0,
        });

        for (const f of ['a', 'b', 'c']) {
          await NoteSyncQueueService.enqueueNoteUpsert({
            repo: 'me/repo', branch: 'main', filePath: f, title: f, content: '', format: 'markdown',
          });
        }

        const result = await NoteSyncQueueService.drain();
        expect(result.succeeded).toBe(3);
        expect(result.remaining).toBe(0);

        // Every item ran with push:false
        const calls = (syncNoteToGitHub as jest.Mock).mock.calls;
        expect(calls).toHaveLength(3);
        for (const [args] of calls) {
          expect(args.push).toBe(false);
        }

        // One coalesced push via CloneSyncService at end of group
        expect(CloneSyncService.pushPending).toHaveBeenCalledTimes(1);
        expect(CloneSyncService.pushPending).toHaveBeenCalledWith('me/repo', 'main');
      });

      test('separate flush per (repo, branch) group', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'main', filePath: 'a', title: 'a', content: '', format: 'markdown',
        });
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'dev', filePath: 'b', title: 'b', content: '', format: 'markdown',
        });
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'other/repo', branch: 'main', filePath: 'c', title: 'c', content: '', format: 'markdown',
        });

        await NoteSyncQueueService.drain();

        expect(CloneSyncService.pushPending).toHaveBeenCalledTimes(3);
        const pushCalls = (CloneSyncService.pushPending as jest.Mock).mock.calls.map(([rp, br]) => `${rp}@${br}`);
        expect(pushCalls.sort()).toEqual(['me/repo@dev', 'me/repo@main', 'other/repo@main']);
      });

      test('failed flush keeps items queued and bumps attempts', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
        (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
          succeeded: 0, failed: 2, conflicted: false, queuedItems: 0,
        });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'main', filePath: 'a', title: 'a', content: '', format: 'markdown',
        });
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'main', filePath: 'b', title: 'b', content: '', format: 'markdown',
        });

        const result = await NoteSyncQueueService.drain();
        expect(result.succeeded).toBe(0);
        expect(result.failed).toBe(2);
        expect(result.remaining).toBe(2);

        const items = await NoteSyncQueueService.getAll();
        expect(items).toHaveLength(2);
        for (const m of items) {
          expect(m.attempts).toBe(1);
          // CloneSyncService returns aggregate counts, no per-item error string
          expect(m.lastError).toBeUndefined();
        }
      });

      test('does not flush when every item failed locally', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({
          success: false,
          error: 'write failed',
        });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'main', filePath: 'a', title: 'a', content: '', format: 'markdown',
        });

        await NoteSyncQueueService.drain();
        expect(CloneSyncService.pushPending).not.toHaveBeenCalled();
      });
    });

    describe('note.delete drain', () => {
      test('routes delete items through deleteNoteFromGitHub', async () => {
        (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

        await NoteSyncQueueService.enqueueNoteDelete({
          repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
        });

        const result = await NoteSyncQueueService.drain();
        expect(result.succeeded).toBe(1);
        expect(result.remaining).toBe(0);
        expect(deleteNoteFromGitHub).toHaveBeenCalledTimes(1);
      });

      test('clone-mode delete defers push and flushes once with upsert siblings', async () => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
          succeeded: 2, failed: 0, conflicted: false, queuedItems: 0,
        });
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
        (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'x', format: 'markdown',
        });
        await NoteSyncQueueService.enqueueNoteDelete({
          repo: 'r', branch: 'main', filePath: 'b.md', title: 'B',
        });

        await NoteSyncQueueService.drain();

        expect(CloneSyncService.pushPending).toHaveBeenCalledTimes(1);
        expect((deleteNoteFromGitHub as jest.Mock).mock.calls[0][0].push).toBe(false);
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('clears a leftover clone-mode delete from the queue after a successful flush (issue #901)', async () => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
          succeeded: 1, failed: 0, conflicted: false, queuedItems: 0,
        });
        (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

        await NoteSyncQueueService.enqueueNoteDelete({
          repo: 'r', branch: 'main', filePath: 'stale.md', title: 'stale',
        });

        const result = await NoteSyncQueueService.drain();

        expect(result.succeeded).toBe(1);
        expect(result.remaining).toBe(0);
        expect(result.failed).toBe(0);
        // The item must not linger at attempts 0 in the durable queue.
        const items = await NoteSyncQueueService.getAll();
        expect(items).toHaveLength(0);
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });
    });

    describe('api-mode (no coalescing)', () => {
      test('does not call LocalGitWriter.push and runs syncNoteToGitHub without push:false', async () => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'me/repo', branch: 'main', filePath: 'a', title: 'a', content: '', format: 'markdown',
        });
        await NoteSyncQueueService.drain();

        expect(LocalGitWriter.push).not.toHaveBeenCalled();
        const [[args]] = (syncNoteToGitHub as jest.Mock).mock.calls;
        expect(args.push).toBeUndefined();
      });
    });

    test('is reentrancy-guarded', async () => {
      let resolveSync: (value: { success: boolean }) => void = () => {};
      (syncNoteToGitHub as jest.Mock).mockImplementation(
        () => new Promise((res) => { resolveSync = res; }),
      );

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      const firstDrain = NoteSyncQueueService.drain();
      const secondDrain = await NoteSyncQueueService.drain();
      expect(secondDrain.succeeded).toBe(0);
      expect(secondDrain.remaining).toBe(1);

      // The sync gate adds one acquisition hop inside drain(); give the
      // in-flight drain enough turns to reach its awaiting syncNoteToGitHub
      // call (assigning resolveSync) before we resolve it.
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      resolveSync({ success: true });
      const first = await firstDrain;
      expect(first.succeeded).toBe(1);
    });

    describe('onProgress', () => {
      test('receives advancing fractions 0→1 across parallel groups', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

        for (const f of ['a', 'b', 'c']) {
          await NoteSyncQueueService.enqueueNoteUpsert({
            repo: 'repo-a', branch: 'main', filePath: f, title: f, content: '', format: 'markdown',
          });
        }
        for (const f of ['d', 'e']) {
          await NoteSyncQueueService.enqueueNoteUpsert({
            repo: 'repo-b', branch: 'main', filePath: f, title: f, content: '', format: 'markdown',
          });
        }

        const fractions: Array<number | null> = [];
        const result = await NoteSyncQueueService.drain((f) => fractions.push(f));

        expect(result.succeeded).toBe(5);
        expect(result.remaining).toBe(0);

        expect(fractions.length).toBeGreaterThanOrEqual(2);
        expect(fractions[fractions.length - 1]).toBe(1);
        for (const f of fractions) {
          expect(f).not.toBeNull();
          expect((f as number)).toBeLessThanOrEqual(1);
          expect((f as number)).toBeGreaterThan(0);
        }
      });

      test('fraction never exceeds 1 and reaches 1 on completion', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

        for (let i = 0; i < 4; i++) {
          await NoteSyncQueueService.enqueueNoteUpsert({
            repo: 'r', branch: 'main', filePath: `${i}.md`, title: `${i}`, content: '', format: 'markdown',
          });
        }

        const fractions: Array<number | null> = [];
        await NoteSyncQueueService.drain((f) => fractions.push(f));

        expect(fractions.length).toBeGreaterThanOrEqual(1);
        expect(fractions[fractions.length - 1]).toBe(1);
        for (const f of fractions) {
          expect(f).not.toBeNull();
          expect((f as number)).toBeLessThanOrEqual(1);
        }
      });

      test('empty queue calls onProgress(null)', async () => {
        const fractions: Array<number | null> = [];
        await NoteSyncQueueService.drain((f) => fractions.push(f));

        expect(fractions).toContain(null);
        expect(fractions[fractions.length - 1]).toBeNull();
      });

      test('calls onProgress(null) when all items have backoff', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'transient' });

        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
        });

        await NoteSyncQueueService.drain();
        const items = await NoteSyncQueueService.getAll();
        const retryAt = items[0].nextRetryAt!;

        const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => retryAt - 1);
        try {
          const fractions: Array<number | null> = [];
          await NoteSyncQueueService.drain((f) => fractions.push(f));
          expect(fractions).toContain(null);
        } finally {
          nowSpy.mockRestore();
        }
      });
    });
  });

  describe('subscribe', () => {
    test('notifies on enqueue', async () => {
      const fn = jest.fn();
      const unsub = NoteSyncQueueService.subscribe(fn);

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      expect(fn).toHaveBeenCalled();
      unsub();
    });

    test('unsubscribe stops notifications', async () => {
      const fn = jest.fn();
      const unsub = NoteSyncQueueService.subscribe(fn);
      unsub();

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });
      expect(fn).not.toHaveBeenCalled();
    });

    test('listener errors do not break the chain', async () => {
      const bad = jest.fn(() => { throw new Error('boom'); });
      const good = jest.fn();
      const u1 = NoteSyncQueueService.subscribe(bad);
      const u2 = NoteSyncQueueService.subscribe(good);

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });

      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalled();
      u1();
      u2();
    });
  });

  describe('onDroppedMutation', () => {
    test('unsubscribe stops drop events', async () => {
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
        success: false, error: 'Bad credentials', status: 401,
      });
      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));
      unsub();

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md',
      });
      await NoteSyncQueueService.drain();
      expect(events).toHaveLength(0);
    });

    test('listener errors do not break the drain', async () => {
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
        success: false, error: 'Bad credentials', status: 401,
      });
      const unsub = NoteSyncQueueService.onDroppedMutation(() => {
        throw new Error('boom');
      });

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md',
      });
      const result = await NoteSyncQueueService.drain();
      expect(result.remaining).toBe(0);
      unsub();
    });
  });

  describe('resolved-branch tombstones', () => {
    test('enqueueNoteDelete with undefined branch persists the resolved branch (acceptance 1)', async () => {
      resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'master');

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'owner/repo', filePath: 'notes/a.md', title: 'A',
      });

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].params.branch).toBe('master');
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'notes/a.md')).toBe(true);

      // The raw undefined->'main' fallback key is gone (the original bug).
      const rawTombstones = await AsyncStorage.getItem(TOMBSTONE_KEY);
      expect(rawTombstones).not.toContain('owner/repo::main::notes/a.md');
    });

    test('enqueueNoteUpsert with undefined branch persists the resolved branch', async () => {
      resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'master');

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo', filePath: 'notes/a.md', title: 'A', content: 'x', format: 'markdown',
      });

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].params.branch).toBe('master');
    });
  });

  describe('durable-drop surfacing + failure pinning', () => {
    test('durable 401 delete drops with an event and pins the tombstone past TTL (acceptance 2)', async () => {
      resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'master');
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
        success: false, error: 'Bad credentials', status: 401,
      });

      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'owner/repo', filePath: 'notes/a.md', title: 'A',
      });
      const result = await NoteSyncQueueService.drain();

      // Drop is a side channel: drain() contract stays {succeeded, failed, remaining}
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);

      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('durable');
      expect(events[0].error).toBe('Bad credentials');
      expect(events[0].status).toBe(401);
      expect(events[0].mutation.type).toBe('note.delete');
      expect(events[0].mutation.params.branch).toBe('master');

      const failures = await readDeleteFailures();
      expect(Object.keys(failures)).toEqual(['owner/repo::master::notes/a.md']);
      expect(failures['owner/repo::master::notes/a.md']).toMatchObject({
        error: 'Bad credentials',
        kind: 'authentication',
      });
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'notes/a.md')).toBe(true);

      // Advance past the 24h TTL — the failure entry keeps it tombstoned.
      const base = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => base + TOMBSTONE_TTL_MS + 60_000);
      try {
        expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'notes/a.md')).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      unsub();
    });

    test('durable upsert drop records no delete failure', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: false, error: '401 Unauthorized' });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
      });
      const result = await NoteSyncQueueService.drain();

      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(await readDeleteFailures()).toEqual({});
    });

    test('exhausted delete (8 transient failures) drops with an event and pins (acceptance 3)', async () => {
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
        success: false, error: 'network down',
      });

      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });

      let virtualNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => virtualNow);
      let lastResult = { succeeded: 0, failed: 0, remaining: 1 };
      try {
        for (let i = 0; i < 8; i++) {
          lastResult = await NoteSyncQueueService.drain();
          virtualNow += 60_000;
        }
      } finally {
        nowSpy.mockRestore();
      }

      expect(lastResult.failed).toBe(1);
      expect(lastResult.remaining).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('exhausted');
      expect(events[0].error).toBe('network down');
      expect(events[0].mutation.type).toBe('note.delete');

      const failures = await readDeleteFailures();
      expect(failures['r::main::a.md']).toMatchObject({
        error: 'network down',
        kind: 'exhausted',
      });

      // Pinned past the TTL like the durable case.
      const futureSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => virtualNow + TOMBSTONE_TTL_MS + 60_000);
      try {
        expect(await NoteSyncQueueService.isTombstoned('r', 'main', 'a.md')).toBe(true);
      } finally {
        futureSpy.mockRestore();
      }
      unsub();
    });

    test('retry re-enqueue clears the pinned failure entry (acceptance 4)', async () => {
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
        success: false, error: 'Bad credentials', status: 401,
      });

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });
      await NoteSyncQueueService.drain();
      expect(Object.keys(await readDeleteFailures())).toEqual(['r::main::a.md']);
      expect(await NoteSyncQueueService.isTombstoned('r', 'main', 'a.md')).toBe(true);

      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });
      expect(await readDeleteFailures()).toEqual({});

      // Fresh tombstone covers the retry window...
      expect(await NoteSyncQueueService.isTombstoned('r', 'main', 'a.md')).toBe(true);
      // ...but without the pin it expires normally past the TTL.
      const futureSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => Date.now() + TOMBSTONE_TTL_MS + 60_000);
      try {
        expect(await NoteSyncQueueService.isTombstoned('r', 'main', 'a.md')).toBe(false);
      } finally {
        futureSpy.mockRestore();
      }
    });

    test('failure map survives corrupted JSON', async () => {
      await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, '{not json');
      expect(await readDeleteFailures()).toEqual({});
      expect(await NoteSyncQueueService.isTombstoned('r', 'main', 'a.md')).toBe(false);
    });
  });

  describe('clone-mode resolved-branch push', () => {
    beforeEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      (CloneSyncService.pushPending as jest.Mock).mockResolvedValue({
        succeeded: 2, failed: 0, conflicted: false, queuedItems: 0,
      });
    });

    afterEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    });

    test('group with undefined branch commits and pushes on the resolved branch (acceptance 5)', async () => {
      resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'master');
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'me/repo', filePath: 'a.md', title: 'A', content: 'x', format: 'markdown',
      });
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'me/repo', filePath: 'b.md', title: 'B',
      });

      const result = await NoteSyncQueueService.drain();
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);

      // Each mutation ran against the resolved branch (commit target).
      expect((syncNoteToGitHub as jest.Mock).mock.calls[0][0].branch).toBe('master');
      expect((deleteNoteFromGitHub as jest.Mock).mock.calls[0][0].branch).toBe('master');

      // The single coalesced push targets the same resolved branch.
      expect(CloneSyncService.pushPending).toHaveBeenCalledTimes(1);
      expect(CloneSyncService.pushPending).toHaveBeenCalledWith('me/repo', 'master');
    });
  });

  describe('enqueueNoteDeletes (batch)', () => {
    test('3 deletes -> ONE queue write + ONE tombstone pass with 3 tombstones (acceptance)', async () => {
      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B' },
        { repo: 'owner/repo', filePath: 'c.md', title: 'C' },
      ]);

      const queueWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === QUEUE_KEY,
      );
      expect(queueWrites).toHaveLength(1);
      const tombstoneWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === TOMBSTONE_KEY,
      );
      expect(tombstoneWrites).toHaveLength(1);

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(3);
      // Branch resolved once per unique (repo, hint) and persisted (c.md hinted undefined).
      expect(items.map((m) => m.params.branch)).toEqual(['main', 'main', 'main']);

      const rawTombstones = await AsyncStorage.getItem(TOMBSTONE_KEY);
      expect(Object.keys(JSON.parse(rawTombstones!)).sort()).toEqual([
        'owner/repo::main::a.md',
        'owner/repo::main::b.md',
        'owner/repo::main::c.md',
      ]);
    });

    test('dedup holds across batch + existing queue; pinned failures clear', async () => {
      resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'master');
      await AsyncStorage.setItem(
        DELETE_FAILURES_STORAGE_KEY,
        JSON.stringify({ 'owner/repo::master::a.md': { error: 'old', kind: 'server', at: 1 } }),
      );
      // Pre-existing pending upsert for b.md must be dropped by the batch delete.
      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo', filePath: 'b.md', title: 'B', content: 'x', format: 'markdown',
      });

      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', filePath: 'a.md' },
        { repo: 'owner/repo', filePath: 'b.md' },
        { repo: 'owner/repo', filePath: 'b.md' },
        { repo: 'owner/repo', filePath: 'a.md' },
      ]);

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(2);
      expect(items.map((m) => m.params.filePath).sort()).toEqual(['a.md', 'b.md']);
      for (const m of items) {
        expect(m.type).toBe('note.delete');
        expect(m.params.branch).toBe('master');
      }

      // Pinned failure cleared for retried delete; tombstones pinned on resolved branch.
      expect(await readDeleteFailures()).toEqual({});
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'a.md')).toBe(true);
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'b.md')).toBe(true);
    });

    test('resolveBranch runs once per unique (repo, hint), not per item', async () => {
      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'r1', filePath: 'a.md' },
        { repo: 'r1', filePath: 'b.md' },
        { repo: 'r1', branch: 'dev', filePath: 'c.md' },
        { repo: 'r2', filePath: 'd.md' },
      ]);
      expect(resolveBranchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('enqueueNoteUpserts (batch)', () => {
    test('3 upserts -> ONE queue write; same-path+title dedup within the batch', async () => {
      await NoteSyncQueueService.enqueueNoteUpserts(
        [
          { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'first' },
          { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'second' },
          { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'x' },
        ],
        ['note-1', 'note-1', 'note-2'],
      );

      const queueWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: [string]) => key === QUEUE_KEY,
      );
      expect(queueWrites).toHaveLength(1);

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(2);
      const a = items.find((m) => m.params.filePath === 'a.md');
      expect(a?.type).toBe('note.upsert');
      if (a?.type === 'note.upsert') {
        expect(a.params.content).toBe('second');
        expect(a.localNoteId).toBe('note-1');
      }
    });

    test('batch upsert drops pending deletes for matching paths', async () => {
      await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'r', branch: 'main', filePath: 'a.md', title: 'A',
      });
      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: 'rebuilt' },
      ]);

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('note.upsert');
    });
  });

  describe('api-mode batch delete drain', () => {
    test('3 due deletes -> ONE batchDeleteFiles with all 3 paths; mixed outcomes mapped (acceptance)', async () => {
      (batchDeleteFiles as jest.Mock).mockResolvedValue({
        success: false,
        deleted: ['a.md', 'b.md'],
        failed: [{ path: 'c.md', error: '401 Unauthorized' }],
      });
      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));

      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B' },
        { repo: 'owner/repo', branch: 'main', filePath: 'c.md', title: 'C' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchDeleteFiles).toHaveBeenCalledTimes(1);
      expect((batchDeleteFiles as jest.Mock).mock.calls[0][0]).toMatchObject({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        paths: ['a.md', 'b.md', 'c.md'],
        message: 'Delete 3 notes',
      });
      // Per-item API path never ran for the batched group.
      expect(deleteNoteFromGitHub).not.toHaveBeenCalled();

      // Durable drop is a side channel: succeeded counts only real deletes.
      expect(result).toEqual({ succeeded: 2, failed: 0, remaining: 0 });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('durable');
      expect(events[0].status).toBe(401);
      expect(events[0].mutation.params.filePath).toBe('c.md');

      const failures = await readDeleteFailures();
      expect(Object.keys(failures)).toEqual(['owner/repo::main::c.md']);
      // Tombstones cleared for the deleted paths, pinned for the dropped one.
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'a.md')).toBe(false);
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'b.md')).toBe(false);
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'c.md')).toBe(true);
      unsub();
    });

    test('retryable per-path failure keeps the mutation queued with backoff', async () => {
      (batchDeleteFiles as jest.Mock).mockResolvedValue({
        success: false,
        deleted: ['a.md'],
        failed: [{ path: 'b.md', error: 'network down' }],
      });
      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));

      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(result).toEqual({ succeeded: 1, failed: 1, remaining: 1 });
      expect(events).toHaveLength(0);
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].params.filePath).toBe('b.md');
      expect(items[0].attempts).toBe(1);
      expect(items[0].lastError).toBe('network down');
      expect(items[0].nextRetryAt).toBeDefined();
      unsub();
    });

    test('groups under 2 deletes and cross-repo deletes never batch together', async () => {
      (batchDeleteFiles as jest.Mock).mockResolvedValue({
        success: true,
        deleted: ['a.md', 'b.md'],
        failed: [],
      });
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md' },
        { repo: 'other/repo', branch: 'main', filePath: 'solo.md' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchDeleteFiles).toHaveBeenCalledTimes(1);
      expect((batchDeleteFiles as jest.Mock).mock.calls[0][0].paths).toEqual(['a.md', 'b.md']);
      // Single-delete group kept the per-item path (no trees API for singles).
      expect(deleteNoteFromGitHub).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ succeeded: 3, failed: 0, remaining: 0 });
    });

    test('batch that throws reverts the group to per-item deleteNoteFromGitHub', async () => {
      (batchDeleteFiles as jest.Mock).mockRejectedValue(new Error('boom'));
      (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md' },
        { repo: 'owner/repo', branch: 'main', filePath: 'c.md' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchDeleteFiles).toHaveBeenCalledTimes(1);
      expect(deleteNoteFromGitHub).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ succeeded: 3, failed: 0, remaining: 0 });
    });
  });

  describe('api-mode batch upsert drain', () => {
    test('2 clean upserts -> ONE batchUpsertFiles; both removed from queue', async () => {
      (batchUpsertFiles as jest.Mock).mockResolvedValue({
        success: true,
        upserted: ['a.md', 'b.md'],
        failed: [],
      });

      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'aaa', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'bbb', format: 'markdown' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchUpsertFiles).toHaveBeenCalledTimes(1);
      expect((batchUpsertFiles as jest.Mock).mock.calls[0][0]).toMatchObject({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        files: [
          { path: 'a.md', content: 'aaa' },
          { path: 'b.md', content: 'bbb' },
        ],
        message: 'Update 2 notes',
      });
      // The batched group never hit the per-item API path.
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
      expect(result).toEqual({ succeeded: 2, failed: 0, remaining: 0 });
      expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    });

    test('knownSha upsert is excluded from the batch and runs per-item', async () => {
      (batchUpsertFiles as jest.Mock).mockResolvedValue({
        success: true,
        upserted: ['a.md', 'b.md'],
        failed: [],
      });
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'aaa', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'bbb', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'c.md', title: 'C', content: 'ccc', format: 'markdown', knownSha: 'sha-c' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchUpsertFiles).toHaveBeenCalledTimes(1);
      expect((batchUpsertFiles as jest.Mock).mock.calls[0][0].files).toEqual([
        { path: 'a.md', content: 'aaa' },
        { path: 'b.md', content: 'bbb' },
      ]);
      // The knownSha item stayed on the per-item path.
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(1);
      expect((syncNoteToGitHub as jest.Mock).mock.calls[0][0].filePath).toBe('c.md');
      expect(result).toEqual({ succeeded: 3, failed: 0, remaining: 0 });
    });

    test('upsert whose content references a local image URI is NOT batched', async () => {
      (batchUpsertFiles as jest.Mock).mockResolvedValue({
        success: true,
        upserted: ['a.md', 'b.md'],
        failed: [],
      });
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'aaa', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'bbb', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'c.md', title: 'C', content: '![img](file:///tmp/img.png)', format: 'markdown' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchUpsertFiles).toHaveBeenCalledTimes(1);
      expect((batchUpsertFiles as jest.Mock).mock.calls[0][0].files).toEqual([
        { path: 'a.md', content: 'aaa' },
        { path: 'b.md', content: 'bbb' },
      ]);
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(1);
      expect((syncNoteToGitHub as jest.Mock).mock.calls[0][0].filePath).toBe('c.md');
      expect(result).toEqual({ succeeded: 3, failed: 0, remaining: 0 });
    });

    test('batch that throws reverts the group to per-item syncNoteToGitHub', async () => {
      (batchUpsertFiles as jest.Mock).mockRejectedValue(new Error('boom'));
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'aaa', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'bbb', format: 'markdown' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(batchUpsertFiles).toHaveBeenCalledTimes(1);
      expect(syncNoteToGitHub).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ succeeded: 2, failed: 0, remaining: 0 });
    });

    test('durable per-path failure drops the mutation via the side channel', async () => {
      (batchUpsertFiles as jest.Mock).mockResolvedValue({
        success: false,
        upserted: ['a.md'],
        failed: [{ path: 'b.md', error: '401 Unauthorized' }],
      });
      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));

      await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'owner/repo', branch: 'main', filePath: 'a.md', title: 'A', content: 'aaa', format: 'markdown' },
        { repo: 'owner/repo', branch: 'main', filePath: 'b.md', title: 'B', content: 'bbb', format: 'markdown' },
      ]);
      const result = await NoteSyncQueueService.drain();

      expect(result).toEqual({ succeeded: 1, failed: 0, remaining: 0 });
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('durable');
      expect(events[0].status).toBe(401);
      expect(events[0].mutation.params.filePath).toBe('b.md');
      expect(syncNoteToGitHub).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('enqueue returns created mutation ids (#927 infra)', () => {
    test('enqueueNoteUpsert returns the created mutation id', async () => {
      const result = await NoteSyncQueueService.enqueueNoteUpsert(
        {
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/a.md',
          title: 'A',
          content: 'x',
          format: 'markdown',
        },
        'local-note-1',
      );

      expect(result).toEqual({ id: expect.any(String) });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(result.id);
      expect(items[0].type).toBe('note.upsert');
      if (items[0].type === 'note.upsert') {
        expect(items[0].localNoteId).toBe('local-note-1');
      }
    });

    test('enqueueNoteDelete returns the id', async () => {
      const result = await NoteSyncQueueService.enqueueNoteDelete({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
      });

      expect(result).toEqual({ id: expect.any(String) });
      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(result.id);
      expect(items[0].type).toBe('note.delete');
    });

    test('enqueueNoteUpserts returns array of ids in insertion order', async () => {
      const result = await NoteSyncQueueService.enqueueNoteUpserts([
        { repo: 'r', branch: 'main', filePath: 'a.md', title: 'A', content: '1' },
        { repo: 'r', branch: 'main', filePath: 'b.md', title: 'B', content: '2' },
        { repo: 'r', branch: 'main', filePath: 'c.md', title: 'C', content: '3' },
      ]);

      expect(result).toEqual({ ids: expect.any(Array) });
      expect(result.ids).toHaveLength(3);
      for (const id of result.ids) expect(id).toEqual(expect.any(String));
      expect(new Set(result.ids).size).toBe(3);

      const items = await NoteSyncQueueService.getAll();
      expect(items.map((m) => m.params.filePath)).toEqual(['a.md', 'b.md', 'c.md']);
      expect(items.map((m) => m.id)).toEqual(result.ids);
    });

    test('enqueueNoteDeletes returns array of ids', async () => {
      const result = await NoteSyncQueueService.enqueueNoteDeletes([
        { repo: 'r', branch: 'main', filePath: 'a.md' },
        { repo: 'r', branch: 'main', filePath: 'b.md' },
      ]);

      expect(result).toEqual({ ids: expect.any(Array) });
      expect(result.ids).toHaveLength(2);
      expect(new Set(result.ids).size).toBe(2);

      const items = await NoteSyncQueueService.getAll();
      expect(items.map((m) => m.params.filePath)).toEqual(['a.md', 'b.md']);
      expect(items.map((m) => m.id)).toEqual(result.ids);
    });

    test('the returned id is the same id carried by the drop event (durable failure)', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: '409 Conflict',
        status: 409,
      });

      const { id } = await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'r',
        branch: 'main',
        filePath: 'a.md',
        title: 'A',
        content: 'x',
        format: 'markdown',
      });

      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));
      try {
        await NoteSyncQueueService.drain();
      } finally {
        unsub();
      }

      expect(events).toHaveLength(1);
      expect(events[0].mutation.id).toBe(id);
    });
  });

  describe('onDroppedMutation event shape (#927 infra)', () => {
    test('subscribers receive event with shape {mutation, reason, error?, status?} for durable failure', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: '409 Conflict',
        status: 409,
      });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/a.md',
        title: 'A',
        content: 'x',
        format: 'markdown',
      });
      const queued = await NoteSyncQueueService.getAll();

      const events: DroppedMutationEvent[] = [];
      const unsub = NoteSyncQueueService.onDroppedMutation((e) => events.push(e));
      try {
        await NoteSyncQueueService.drain();
      } finally {
        unsub();
      }

      expect(events).toHaveLength(1);
      const event = events[0];
      // Exact key set: mutation + reason (+ optional error/status pair) —
      // subscribers derive id/repo/type from event.mutation (nested, not
      // flattened).
      expect(Object.keys(event).sort()).toEqual(['error', 'mutation', 'reason', 'status']);
      expect(event.reason).toBe('durable');
      expect(event.error).toBe('409 Conflict');
      expect(event.status).toBe(409);
      expect(event.mutation).toEqual(queued[0]);
      expect(event.mutation.id).toBe(queued[0].id);
      expect(event.mutation.type).toBe('note.upsert');
      expect(event.mutation.params.repo).toBe('owner/repo');
    });
  });
});
