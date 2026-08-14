import { NoteSyncQueueService } from '../NoteSyncQueueService';
import { pullAllFromRepos, pullFromSingleRepo } from '../RepoPullService';
import { useCanvasStore } from '../../stores/canvasStore';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { GitSyncGate } from './GitSyncGate';

/**
 * Single manual-sync entry point ("sync now") for user-facing pulls:
 * pull-to-refresh swipes and the cloud-icon sync button. Acquires the
 * app-wide gate cycle, drains queued mutations, waits for in-flight push
 * markers to settle, pulls remote state, and refreshes all three stores
 * before releasing the cycle.
 *
 * Reentrancy: exactly one syncNow runs at a time. Overlapping manual
 * calls return `{ok:false, error:'already-running'}` immediately instead
 * of queueing — the gesture already ran once, and stacking another pull
 * behind a long drain only adds latency. (Auto paths — ForegroundSync
 * runPull / BackgroundSyncService — keep their own gate-wrapped internals
 * and never route through here.)
 *
 * Callers MUST NOT hold a gate cycle before calling syncNow: it acquires
 * the cycle itself, and a held cycle would make that acquisition queue
 * behind the caller's own lock forever.
 *
 * Timeout: the 60s race rejects with 'Sync timed out', but the cycle work
 * keeps running and holds the cycle until it actually settles — the
 * release lives with the work (mirroring ForegroundSyncService.runPull),
 * never with the race, so a timed-out pull cannot interleave with the
 * next cycle.
 */

export interface SyncNowOptions {
  /** Pull exactly one repo path instead of every tracked repo. */
  repos?: string[];
}

export interface SyncNowResult {
  ok: boolean;
  error?: string;
}

const SYNC_TIMEOUT_MS = 60_000;

let running = false;

/** Observable manual-sync activity flag (used by UI guards). */
export function isSyncNowRunning(): boolean {
  return running;
}

/**
 * Wait for in-flight push markers before reading origin. Single-repo syncs
 * wait only on that repo — a push on an unrelated repo never blocks a
 * targeted pull. The all-repos path waits app-wide on ANY marker because
 * it is about to read every repo, and pulling any repo mid-push opens the
 * deleted-note resurrection window. `waitForIdle(false)` (its own 60s
 * budget elapsed) logs and proceeds: a manual sync must remain bounded,
 * and the marker watchdog clears stuck markers within 10 minutes.
 */
async function waitForPushesToSettle(repos?: string[]): Promise<void> {
  const idle =
    repos?.length === 1
      ? await GitSyncGate.waitForIdle(repos[0])
      : await GitSyncGate.waitForIdle();
  if (!idle) {
    console.warn('[Sync] push markers still active after waitForIdle budget; pulling anyway');
  }
}

async function refreshAllStores(): Promise<void> {
  await Promise.all([
    useNoteStore.getState().refreshNotes(),
    useCanvasStore.getState().refreshCanvases(),
    useTodoStore.getState().refreshTodos(),
  ]);
}

async function runSyncCycle(repos?: string[]): Promise<void> {
  // ONE cycle acquisition spans drain + pull + refresh. drain() sees the
  // held cycle via isCycleHeld() and runs inside it (no self-deadlock).
  const releaseCycle = await GitSyncGate.acquireCycle();
  try {
    try {
      await NoteSyncQueueService.drain();
    } catch (error) {
      // A drain failure must not block the remote pull (same recovery
      // semantics as ForegroundSyncService.runPull).
      console.warn('[Sync] drain failed:', error);
    }
    await waitForPushesToSettle(repos);
    if (repos?.length === 1) {
      await pullFromSingleRepo(repos[0]);
    } else {
      // A multi-repo selection falls back to the all-repos pull — the
      // pull service has no subset path, and pulling everything is the
      // safe superset of any selection.
      await pullAllFromRepos();
    }
  } finally {
    // Refresh even when the pull failed so the UI reflects whatever made
    // it into storage (partial pulls land before the failure).
    try {
      await refreshAllStores();
    } catch (error) {
      console.warn('[Sync] store refresh failed:', error);
    }
    releaseCycle();
  }
}

export async function syncNow(options?: SyncNowOptions): Promise<SyncNowResult> {
  if (running) {
    return { ok: false, error: 'already-running' };
  }
  running = true;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      runSyncCycle(options?.repos),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Sync timed out')), SYNC_TIMEOUT_MS);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    console.warn('[Sync] syncNow failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Sync failed' };
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    running = false;
  }
}
