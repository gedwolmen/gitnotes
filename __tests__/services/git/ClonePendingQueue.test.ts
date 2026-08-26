/**
 * ClonePendingQueue.test.ts
 *
 * Unit tests for ClonePendingQueue:
 * - enqueuePush / listPending / listAllPending
 * - markAttempt (backoff computation)
 * - markSuccess
 * - dropAfterMaxAttempts (event emission)
 * - subscribe (change notifications)
 * - onDroppedMutation (drop event emitter)
 * - deduplication
 */

const QUEUE_KEY = '@gitnotes:clone_pending_push';
const MIGRATED_KEY = '@gitnotes:clone_pending_push:migrated';

const mockUnpushedList = jest.fn();
const mockUnpushedListFiles = jest.fn();

let mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (key in mockStore ? mockStore[key] : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStore[key];
    }),
    clear: jest.fn(async () => {
      mockStore = {};
    }),
  },
}));

jest.mock('../../../src/services/git/UnpushedCommitsService', () => ({
  UnpushedCommitsService: {
    list: mockUnpushedList,
    listFiles: mockUnpushedListFiles,
  },
}));

import { ClonePendingQueue, DroppedMutationEvent, ClonePendingItem } from '../../../src/services/git/ClonePendingQueue';

function storedValue(key: string): unknown {
  const v = mockStore[key];
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

beforeEach(() => {
  mockStore = {};
  mockUnpushedList.mockReset().mockResolvedValue([]);
  mockUnpushedListFiles.mockReset().mockResolvedValue([]);
});

describe('ClonePendingQueue', () => {
  describe('enqueuePush', () => {
    test('writes items to AsyncStorage under correct repo/branch key', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/a.md', oid: 'abc123', intent: 'upsert' },
        { path: 'notes/b.md', oid: 'def456', intent: 'delete' },
      ]);

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      expect(store).toEqual({
        'owner/repo': {
          main: {
            items: expect.arrayContaining([
              expect.objectContaining({ path: 'notes/a.md', oid: 'abc123', intent: 'upsert', attempts: 0 }),
              expect.objectContaining({ path: 'notes/b.md', oid: 'def456', intent: 'delete', attempts: 0 }),
            ]),
          },
        },
      });
    });

    test('deduplicates by path — newer item replaces prior one', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc123', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'xyz999', intent: 'upsert' },
      ]);

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const items: ClonePendingItem[] = (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items;
      expect(items).toHaveLength(1);
      expect(items[0].oid).toBe('xyz999');
    });

    test('allows delete and upsert for same path — last one wins', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc123', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: undefined, intent: 'delete' },
      ]);

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const items: ClonePendingItem[] = (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items;
      expect(items).toHaveLength(1);
      expect(items[0].intent).toBe('delete');
    });

    test('new item has attempts=0 and nextRetryAt due immediately', async () => {
      const before = Date.now();
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      const after = Date.now();

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const item: ClonePendingItem = (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0];
      expect(item.attempts).toBe(0);
      expect(item.nextRetryAt).toBeGreaterThanOrEqual(before);
      expect(item.nextRetryAt).toBeLessThanOrEqual(after);
    });
  });

  describe('listPending', () => {
    test('returns empty array when repo/branch unknown', async () => {
      const result = await ClonePendingQueue.listPending('owner/repo', 'main');
      expect(result).toEqual([]);
    });

    test('returns due items sorted by nextRetryAt ascending', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/old.md', oid: 'aaa', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/new.md', oid: 'bbb', intent: 'upsert' },
      ]);

      // Manually set createdAt ordering
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].createdAt = 100;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].nextRetryAt = 0;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[1].createdAt = 200;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[1].nextRetryAt = 0;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      const result = await ClonePendingQueue.listPending('owner/repo', 'main');
      expect(result.map((i) => i.path)).toEqual(['notes/old.md', 'notes/new.md']);
    });

    test('due items (nextRetryAt <= now) first, then non-due items', async () => {
      // Add future item
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/future.md', oid: 'aaa', intent: 'upsert' },
      ]);
      let store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].createdAt = 200;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].nextRetryAt = Date.now() + 9999;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      // Add due item
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/due.md', oid: 'bbb', intent: 'upsert' },
      ]);
      store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[1].createdAt = 100;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[1].nextRetryAt = 0;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      const result = await ClonePendingQueue.listPending('owner/repo', 'main');
      expect(result[0].path).toBe('notes/due.md');
      expect(result[1].path).toBe('notes/future.md');
    });
  });

  describe('listAllPending', () => {
    test('returns all items across repos and branches', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/a.md', oid: 'aaa', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('owner/repo', 'feature', [
        { path: 'notes/b.md', oid: 'bbb', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('other/repo', 'main', [
        { path: 'notes/c.md', oid: 'ccc', intent: 'delete' },
      ]);

      const result = await ClonePendingQueue.listAllPending();
      expect(result).toHaveLength(3);
      expect(result.find((r) => r.repoPath === 'owner/repo' && r.branch === 'main')!.items.map((i) => i.path)).toContain('notes/a.md');
      expect(result.find((r) => r.repoPath === 'owner/repo' && r.branch === 'feature')!.items.map((i) => i.path)).toContain('notes/b.md');
      expect(result.find((r) => r.repoPath === 'other/repo' && r.branch === 'main')!.items.map((i) => i.path)).toContain('notes/c.md');
    });

    test('returns empty array when store is empty', async () => {
      const result = await ClonePendingQueue.listAllPending();
      expect(result).toEqual([]);
    });
  });

  describe('markAttempt', () => {
    beforeEach(async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
    });

    test('increments attempts', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      let item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.attempts).toBe(1);

      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.attempts).toBe(2);
    });

    test('sets lastError', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md', 'network timeout');
      const item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.lastError).toBe('network timeout');
    });

    test('computes exponential backoff: attempt 1 = 500ms', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      const item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.nextRetryAt!).toBeGreaterThanOrEqual(Date.now() + 500 - 5);
      expect(item.nextRetryAt!).toBeLessThanOrEqual(Date.now() + 505);
    });

    test('exponential backoff doubles each attempt', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      const item1 = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      const backoff1 = item1.nextRetryAt! - Date.now();

      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      const item2 = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      const backoff2 = item2.nextRetryAt! - Date.now();

      expect(backoff2).toBeGreaterThan(backoff1);
    });

    test('backoff caps at 30000ms', async () => {
      for (let i = 0; i < 10; i++) {
        await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');
      }
      const item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      const backoff = item.nextRetryAt! - Date.now();
      expect(backoff).toBeLessThanOrEqual(30000 + 10);
    });

    test('no-op when branch does not exist', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'nonexistent', 'notes/foo.md');
      const item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.attempts).toBe(0);
    });

    test('no-op when item path does not exist', async () => {
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/nope.md');
      const item = (await ClonePendingQueue.listPending('owner/repo', 'main'))[0];
      expect(item.attempts).toBe(0);
    });
  });

  describe('markSuccess', () => {
    beforeEach(async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
        { path: 'notes/bar.md', oid: 'def', intent: 'upsert' },
      ]);
    });

    test('removes only the specified item', async () => {
      await ClonePendingQueue.markSuccess('owner/repo', 'main', 'notes/foo.md');
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const items: ClonePendingItem[] = (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items;
      expect(items.map((i) => i.path)).toEqual(['notes/bar.md']);
    });

    test('no-op when repo/branch does not exist', async () => {
      await ClonePendingQueue.markSuccess('owner/repo', 'nonexistent', 'notes/foo.md');
      const items = await ClonePendingQueue.listPending('owner/repo', 'main');
      expect(items).toHaveLength(2);
    });

    test('no-op when item path does not exist', async () => {
      await ClonePendingQueue.markSuccess('owner/repo', 'main', 'notes/nope.md');
      const items = await ClonePendingQueue.listPending('owner/repo', 'main');
      expect(items).toHaveLength(2);
    });
  });

  describe('dropAfterMaxAttempts', () => {
    test('removes the item from the store', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
        { path: 'notes/bar.md', oid: 'def', intent: 'delete' },
      ]);

      // Set attempts to MAX_ATTEMPTS
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      const updated = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const items: ClonePendingItem[] = (updated['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items;
      expect(items.map((i) => i.path)).toEqual(['notes/bar.md']);
    });

    test('emits onDroppedMutation with correct event shape', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);

      const emitted: DroppedMutationEvent[] = [];
      ClonePendingQueue.onDroppedMutation((e) => emitted.push(e));

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].lastError = 'final error';
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        type: 'clone.upsert',
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        attempts: 8,
        lastError: 'final error',
      });
    });

    test('emits clone.delete for delete intent', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/bar.md', oid: 'def', intent: 'delete' },
      ]);

      const emitted: DroppedMutationEvent[] = [];
      ClonePendingQueue.onDroppedMutation((e) => emitted.push(e));

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/bar.md');

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('clone.delete');
      expect(emitted[0].filePath).toBe('notes/bar.md');
    });

    test('unsubscribe stops events', async () => {
      const emitted: DroppedMutationEvent[] = [];
      const unsub = ClonePendingQueue.onDroppedMutation((e) => emitted.push(e));
      unsub();

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');
      expect(emitted).toHaveLength(0);
    });

    test('does nothing when attempts < MAX_ATTEMPTS — no emit, no removal', async () => {
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
        { path: 'notes/bar.md', oid: 'def', intent: 'delete' },
      ]);

      const emitted: DroppedMutationEvent[] = [];
      ClonePendingQueue.onDroppedMutation((e) => emitted.push(e));

      // Set attempts to 7 (below MAX_ATTEMPTS=8)
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 7;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      // Should not emit
      expect(emitted).toHaveLength(0);
      // Should not remove — both items still present
      const updated = storedValue(QUEUE_KEY) as Record<string, unknown>;
      const items: ClonePendingItem[] = (updated['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items;
      expect(items.map((i) => i.path)).toEqual(['notes/foo.md', 'notes/bar.md']);
    });
  });

  describe('subscribe', () => {
    test('notifies listener after enqueuePush', async () => {
      const called: number[] = [];
      const unsub = ClonePendingQueue.subscribe(() => called.push(Date.now()));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/bar.md', oid: 'def', intent: 'upsert' },
      ]);

      unsub();
      expect(called.length).toBeGreaterThanOrEqual(2);
    });

    test('notifies listener after markSuccess', async () => {
      const called: number[] = [];
      const unsub = ClonePendingQueue.subscribe(() => called.push(Date.now()));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      await ClonePendingQueue.markSuccess('owner/repo', 'main', 'notes/foo.md');

      unsub();
      expect(called.length).toBeGreaterThanOrEqual(2);
    });

    test('notifies listener after markAttempt', async () => {
      const called: number[] = [];
      const unsub = ClonePendingQueue.subscribe(() => called.push(Date.now()));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      await ClonePendingQueue.markAttempt('owner/repo', 'main', 'notes/foo.md');

      unsub();
      expect(called.length).toBeGreaterThanOrEqual(2);
    });

    test('notifies listener after dropAfterMaxAttempts', async () => {
      const called: number[] = [];
      const unsub = ClonePendingQueue.subscribe(() => called.push(Date.now()));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      unsub();
      expect(called.length).toBeGreaterThanOrEqual(2);
    });

    test('unsubscribe stops notifications', async () => {
      const called: number[] = [];
      const unsub = ClonePendingQueue.subscribe(() => called.push(Date.now()));
      unsub();

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);

      expect(called).toHaveLength(0);
    });

    test('listener errors do not propagate', async () => {
      const called: number[] = [];
      ClonePendingQueue.subscribe(() => {
        called.push(Date.now());
        throw new Error('listener error');
      });

      // Should not throw
      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);

      expect(called.length).toBe(1);
    });
  });

  describe('onDroppedMutation event emitter', () => {
    test('emits event when dropAfterMaxAttempts is called', async () => {
      const emitted: DroppedMutationEvent[] = [];
      ClonePendingQueue.onDroppedMutation((e) => emitted.push(e));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);

      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('clone.upsert');
      expect(emitted[0].repoPath).toBe('owner/repo');
      expect(emitted[0].branch).toBe('main');
      expect(emitted[0].filePath).toBe('notes/foo.md');
    });

    test('supports multiple listeners', async () => {
      const a: DroppedMutationEvent[] = [];
      const b: DroppedMutationEvent[] = [];
      ClonePendingQueue.onDroppedMutation((e) => a.push(e));
      ClonePendingQueue.onDroppedMutation((e) => b.push(e));

      await ClonePendingQueue.enqueuePush('owner/repo', 'main', [
        { path: 'notes/foo.md', oid: 'abc', intent: 'upsert' },
      ]);
      const store = storedValue(QUEUE_KEY) as Record<string, unknown>;
      (store['owner/repo'] as Record<string, { items: ClonePendingItem[] }>)['main'].items[0].attempts = 8;
      mockStore[QUEUE_KEY] = JSON.stringify(store);

      await ClonePendingQueue.dropAfterMaxAttempts('owner/repo', 'main', 'notes/foo.md');

      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });

  describe('bootstrap migration', () => {
    test('skips when migration flag is already set', async () => {
      mockStore[MIGRATED_KEY] = 'true';
      await ClonePendingQueue.bootstrap();
      expect(mockUnpushedList).not.toHaveBeenCalled();
    });

    test('sets migration flag even when store is empty', async () => {
      await ClonePendingQueue.bootstrap();
      expect(mockStore[MIGRATED_KEY]).toBe('true');
    });

    test('second call is a no-op after flag is set', async () => {
      mockUnpushedList.mockClear();

      await ClonePendingQueue.bootstrap();
      await ClonePendingQueue.bootstrap();

      expect(mockUnpushedList).not.toHaveBeenCalled();
    });
  });
});
