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

jest.mock('../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: { updateNote: jest.fn(async () => undefined) },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok') },
}));

jest.mock('../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: { push: jest.fn(async () => ({ success: true })) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';
import { syncNoteToGitHub } from '../src/services/NoteGitHubSyncService';
import { SyncEngineService } from '../src/services/SyncEngineService';
import { LocalGitWriter } from '../src/services/git/LocalGitWriter';

const QUEUE_KEY = '@gitnotes:sync_queue_v1';

describe('NoteSyncQueueService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
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
      expect(items[0].params.content).toBe('third');
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
      expect(items[0].params.content).toBe('two');
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
        (LocalGitWriter.push as jest.Mock).mockResolvedValue({ success: true });
      });

      afterEach(() => {
        // Reset to api default so non-clone tests in the file aren't affected
        // by ordering. The factory default would otherwise be overridden by
        // the previous mockResolvedValue across describe blocks.
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('runs syncNoteToGitHub with push:false and flushes once per group', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

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

        // One coalesced push at end of group
        expect(LocalGitWriter.push).toHaveBeenCalledTimes(1);
        expect(LocalGitWriter.push).toHaveBeenCalledWith({
          repoPath: 'me/repo',
          branch: 'main',
          token: 'tok',
        });
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

        expect(LocalGitWriter.push).toHaveBeenCalledTimes(3);
        const pushCalls = (LocalGitWriter.push as jest.Mock).mock.calls.map(([a]) => `${a.repoPath}@${a.branch}`);
        expect(pushCalls.sort()).toEqual(['me/repo@dev', 'me/repo@main', 'other/repo@main']);
      });

      test('failed flush keeps items queued and bumps attempts', async () => {
        (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
        (LocalGitWriter.push as jest.Mock).mockResolvedValue({
          success: false,
          error: 'network down',
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
          expect(m.lastError).toBe('network down');
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
        expect(LocalGitWriter.push).not.toHaveBeenCalled();
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

      resolveSync({ success: true });
      const first = await firstDrain;
      expect(first.succeeded).toBe(1);
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
});
