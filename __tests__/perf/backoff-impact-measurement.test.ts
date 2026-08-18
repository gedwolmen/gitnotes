/**
 * Backoff impact measurement for NoteSyncQueueService.drain().
 *
 * This test quantifies the wall-clock / virtual-time cost of the
 * exponential backoff in API-mode drain (MAX_ATTEMPTS=8,
 * BACKOFF_BASE_MS=500, BACKOFF_CAP_MS=30_000).  It answers the
 * question: **is backoff a bottleneck for a normal user push?**
 *
 * Conventions: same mocks as NoteSyncQueueService.test.ts; Date.now()
 * is mocked to control the virtual clock and measure elapsed delay.
 */
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
  AuthService: {
    getToken: jest.fn(async () => 'tok'),
    getTokenById: jest.fn(async () => 'tok'),
  },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: { push: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(),
  batchUpsertFiles: jest.fn(),
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { syncNoteToGitHub } from '../../src/services/NoteGitHubSyncService';
import { resolveBranch } from '../../src/services/git/resolveBranch';

const resolveBranchMock = resolveBranch as jest.MockedFunction<typeof resolveBranch>;

function defaultResolveBranch(repoPath: string, hint?: string | null): Promise<string> {
  void repoPath;
  return Promise.resolve(hint ?? 'main');
}

/**
 * Expected backoff sequence for MAX_ATTEMPTS=8, BACKOFF_BASE_MS=500,
 * BACKOFF_CAP_MS=30_000:
 *
 * Attempt 1 → nextRetryAt = now + 500   (500 * 2^0)
 * Attempt 2 → nextRetryAt = now + 1000  (500 * 2^1)
 * Attempt 3 → nextRetryAt = now + 2000  (500 * 2^2)
 * Attempt 4 → nextRetryAt = now + 4000  (500 * 2^3)
 * Attempt 5 → nextRetryAt = now + 8000  (500 * 2^4)
 * Attempt 6 → nextRetryAt = now + 16000 (500 * 2^5)
 * Attempt 7 → nextRetryAt = now + 30000 (min(500*2^6, 30000))
 * Attempt 8 → dropped (attempts >= MAX_ATTEMPTS)
 *
 * Total theoretical backoff delay across 8 drain cycles:
 *   500 + 1000 + 2000 + 4000 + 8000 + 16000 + 30000 = 61_500 ms
 *
 * (The 8th attempt either succeeds or drops — no further backoff.)
 */
const EXPECTED_BACKOFF_SEQUENCE_MS = [500, 1000, 2000, 4000, 8000, 16_000, 30_000];

describe('Backoff impact measurement (todo 7)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
    resolveBranchMock.mockImplementation(defaultResolveBranch);
  });

  // ------------------------------------------------------------------
  // Scenario 1: All-success (the common user push)
  // ------------------------------------------------------------------
  describe('Scenario 1 — all-success (common user push)', () => {
    test('10 items, all succeed: zero backoff overhead', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      const N = 10;
      for (let i = 0; i < N; i++) {
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'owner/repo',
          branch: 'main',
          filePath: `notes/${i}.md`,
          title: `Note ${i}`,
          content: `content ${i}`,
          format: 'markdown',
        });
      }

      const t0 = Date.now();
      const result = await NoteSyncQueueService.drain();
      const elapsed = Date.now() - t0;

      expect(result.succeeded).toBe(N);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);

      // No item should have a nextRetryAt — backoff was never invoked.
      const items = await NoteSyncQueueService.getAll();
      for (const item of items) {
        expect(item.nextRetryAt).toBeUndefined();
      }

      // Virtual elapsed should be essentially 0 (no Date.now mock
      // advancing = no artificial sleep). The drain itself takes <10ms
      // of real CPU time; we generously cap at 100ms for slow CI.
      console.log(
        `[Scenario 1] ${N} items all-success: elapsed=${elapsed}ms, ` +
          `backoff_sleep_ms=0, items=${N}, succeeded=${result.succeeded}`,
      );
      expect(elapsed).toBeLessThanOrEqual(100);
    });
  });

  // ------------------------------------------------------------------
  // Scenario 2: Transient failure + recovery
  // ------------------------------------------------------------------
  describe('Scenario 2 — transient failure then recovery', () => {
    test('item fails once then succeeds; measures applied backoff delay', async () => {
      let callCount = 0;
      (syncNoteToGitHub as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { success: false, error: '503 Service Unavailable' };
        return { success: true };
      });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'a.md',
        title: 'A',
        content: 'content',
        format: 'markdown',
      });

      // --- Drain 1: fails, backoff set ---
      const r1 = await NoteSyncQueueService.drain();
      expect(r1.succeeded).toBe(0);
      expect(r1.failed).toBe(1);
      expect(r1.remaining).toBe(1);

      const items = await NoteSyncQueueService.getAll();
      expect(items).toHaveLength(1);
      const retryAt = items[0].nextRetryAt!;
      expect(items[0].attempts).toBe(1);
      const backoff1Ms = retryAt - Date.now();
      // backoff1Ms should be 500 (BACKOFF_BASE_MS * 2^0). Allow ±1ms for
      // Date.now() micro-drift between drain() capture and this assertion.
      expect(backoff1Ms).toBeGreaterThanOrEqual(499);
      expect(backoff1Ms).toBeLessThanOrEqual(501);

      // --- Drain 2 (immediately): skipped due to backoff ---
      const r2 = await NoteSyncQueueService.drain();
      expect(r2.succeeded).toBe(0);
      expect(r2.failed).toBe(0);
      expect(r2.remaining).toBe(1); // still in queue, not yet due
      expect(callCount).toBe(1); // syncNoteToGitHub NOT called

      // --- Drain 3 (after backoff elapses): succeeds ---
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => retryAt);
      try {
        const r3 = await NoteSyncQueueService.drain();
        expect(r3.succeeded).toBe(1);
        expect(r3.failed).toBe(0);
        expect(r3.remaining).toBe(0);
      } finally {
        nowSpy.mockRestore();
      }

      console.log(
        `[Scenario 2] transient failure+recovery: backoff_delay=${backoff1Ms}ms ` +
          `(attempt 1), required 3 drain calls to resolve 1 item`,
      );
    });
  });

  // ------------------------------------------------------------------
  // Scenario 3: Repeated failures → MAX_ATTEMPTS exhaustion
  // ------------------------------------------------------------------
  describe('Scenario 3 — repeated failures hitting MAX_ATTEMPTS', () => {
    test('item fails 8 times → dropped; measures cumulative backoff delay', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: '503 Service Unavailable',
      });

      await NoteSyncQueueService.enqueueNoteUpsert({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'a.md',
        title: 'A',
        content: 'content',
        format: 'markdown',
      });

      const recordedBackoffs: number[] = [];
      let virtualNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => virtualNow);

      try {
        for (let i = 0; i < 8; i++) {
          const before = virtualNow;
          await NoteSyncQueueService.drain();
          const queue = await NoteSyncQueueService.getAll();
          if (queue.length > 0 && queue[0].nextRetryAt != null) {
            recordedBackoffs.push(queue[0].nextRetryAt - before);
          }
          // Advance past backoff cap (30s) for next drain cycle
          virtualNow += 60_000;
        }
      } finally {
        nowSpy.mockRestore();
      }

      // Item should be dropped after 8 attempts
      const remaining = await NoteSyncQueueService.pendingCount();
      expect(remaining).toBe(0);

      // The last attempt (attempt 8) hits MAX_ATTEMPTS and drops, so no
      // nextRetryAt is set → only 7 backoff values recorded.
      expect(recordedBackoffs).toHaveLength(7);
      expect(recordedBackoffs).toEqual(EXPECTED_BACKOFF_SEQUENCE_MS.slice(0, 7));

      const totalBackoffMs = recordedBackoffs.reduce((a, b) => a + b, 0);
      console.log(
        `[Scenario 3] MAX_ATTEMPTS exhaustion: ${recordedBackoffs.length} backoff delays ` +
          `= [${recordedBackoffs.join(', ')}] ms, ` +
          `total=${totalBackoffMs}ms, item dropped after 8 attempts`,
      );

      // Theoretical total: 500+1000+2000+4000+8000+16000+30000 = 61,500 ms
      expect(totalBackoffMs).toBe(61_500);
    });
  });

  // ------------------------------------------------------------------
  // Scenario 4: N items with mixed success/failure in one batch
  // ------------------------------------------------------------------
  describe('Scenario 4 — mixed batch (3 success, 2 transient fail)', () => {
    test('measures per-item backoff in a mixed outcome batch', async () => {
      (syncNoteToGitHub as jest.Mock).mockImplementation(
        async ({ filePath }: { filePath: string }) => {
          if (filePath === 'fail1.md' || filePath === 'fail2.md') {
            return { success: false, error: '503 Service Unavailable' };
          }
          return { success: true };
        },
      );

      for (const f of ['ok1.md', 'ok2.md', 'fail1.md', 'fail2.md', 'ok3.md']) {
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'owner/repo',
          branch: 'main',
          filePath: f,
          title: f,
          content: '',
          format: 'markdown',
        });
      }

      const r1 = await NoteSyncQueueService.drain();
      expect(r1.succeeded).toBe(3);
      expect(r1.failed).toBe(2);
      expect(r1.remaining).toBe(2);

      // Loose window (400-501ms) so parallel CI load cannot drift the
      // assertion; still proves a real ~500ms backoff was scheduled.
      const queue = await NoteSyncQueueService.getAll();
      expect(queue).toHaveLength(2);
      for (const item of queue) {
        expect(item.attempts).toBe(1);
        expect(item.nextRetryAt).toBeDefined();
        const delay = item.nextRetryAt! - Date.now();
        expect(delay).toBeGreaterThanOrEqual(400);
        expect(delay).toBeLessThanOrEqual(501);
      }

      console.log(
        `[Scenario 4] mixed batch: 3 succeeded immediately, 2 failed ` +
          `with 500ms backoff each (first retry delay)`,
      );
    });
  });

  // ------------------------------------------------------------------
  // Scenario 5: Backoff suppression comparison
  // ------------------------------------------------------------------
  describe('Scenario 5 — backoff suppression comparison', () => {
    test('same failing items: drain with backoff vs without — measures drain call count difference', async () => {
      // --- Run A: WITH backoff (normal behavior) ---
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: '503 Service Unavailable',
      });

      for (let i = 0; i < 3; i++) {
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'owner/repo',
          branch: 'main',
          filePath: `a${i}.md`,
          title: `A${i}`,
          content: '',
          format: 'markdown',
        });
      }

      let drainCallsA = 0;
      let virtualNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => virtualNow);
      try {
        for (let i = 0; i < 20; i++) {
          const queue = await NoteSyncQueueService.getAll();
          if (queue.length === 0) break;
          await NoteSyncQueueService.drain();
          drainCallsA++;
          virtualNow += 60_000; // skip past any backoff
        }
      } finally {
        nowSpy.mockRestore();
      }

      // --- Run B: Reset and simulate WITH backoff suppressed ---
      (AsyncStorage as unknown as { __reset: () => void }).__reset();
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({
        success: false,
        error: '503 Service Unavailable',
      });

      for (let i = 0; i < 3; i++) {
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'owner/repo',
          branch: 'main',
          filePath: `b${i}.md`,
          title: `B${i}`,
          content: '',
          format: 'markdown',
        });
      }

      // Manually zero out backoff by writing items with nextRetryAt=0
      // to simulate "no backoff" — items are always due.
      const items = await NoteSyncQueueService.getAll();
      const patchedItems = items.map((m) => ({
        ...m,
        nextRetryAt: 0,
        attempts: 0, // reset attempts so they count from 0 each drain
      }));
      await AsyncStorage.setItem(
        '@gitnotes:sync_queue_v1',
        JSON.stringify(patchedItems),
      );

      let drainCallsB = 0;
      virtualNow = Date.now();
      const nowSpy2 = jest.spyOn(Date, 'now').mockImplementation(() => virtualNow);
      try {
        for (let i = 0; i < 20; i++) {
          const queue = await NoteSyncQueueService.getAll();
          if (queue.length === 0) break;
          await NoteSyncQueueService.drain();
          drainCallsB++;
          virtualNow += 60_000;
        }
      } finally {
        nowSpy2.mockRestore();
      }

      // Both consume 8 attempts per item × 3 items, but the backoff
      // version still needs the same number of drain calls (each call
      // processes all due items). The difference is virtual TIME spent
      // waiting between calls, not call count. Here both use virtual
      // clock advances, so the drain call counts should be similar.
      // The real-world difference is that backoff skips items, causing
      // additional drain cycles from future timers.
      console.log(
        `[Scenario 5] 3 items × MAX_ATTEMPTS=8: ` +
          `with backoff: ${drainCallsA} drain calls, ` +
          `without backoff (suppressed): ${drainCallsB} drain calls`,
      );

      // Both paths need the same number of drain calls because items
      // are retried every cycle when virtual clock advances past backoff.
      // The KEY difference is wall-clock time: with backoff, real users
      // wait 500+1000+...+30000ms between retries. Without backoff,
      // all 8 retries happen instantly — but the TOTAL retries are the
      // same (8 per item). Backoff doesn't add retries, it spaces them.
      expect(drainCallsA).toBe(drainCallsB);
    });
  });

  // ------------------------------------------------------------------
  // Scenario 6: Large batch all-success — measure drain overhead
  // ------------------------------------------------------------------
  describe('Scenario 6 — large batch all-success (20 items)', () => {
    test('measures drain time for a realistic push with no backoff', async () => {
      (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });

      const N = 20;
      for (let i = 0; i < N; i++) {
        await NoteSyncQueueService.enqueueNoteUpsert({
          repo: 'owner/repo',
          branch: 'main',
          filePath: `notes/note-${i}.md`,
          title: `Note ${i}`,
          content: `# Note ${i}\n\nContent here.`,
          format: 'markdown',
        });
      }

      const t0 = Date.now();
      const result = await NoteSyncQueueService.drain();
      const elapsed = Date.now() - t0;

      expect(result.succeeded).toBe(N);
      expect(result.remaining).toBe(0);

      console.log(
        `[Scenario 6] ${N}-item all-success drain: elapsed=${elapsed}ms, ` +
          `backoff_sleep_ms=0, per_item_avg=${(elapsed / N).toFixed(2)}ms`,
      );

      // Should complete in well under 200ms (generous for CI)
      expect(elapsed).toBeLessThanOrEqual(200);
    });
  });
});
