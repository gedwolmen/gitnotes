import { StagingService } from './git/StagingService';
import { GitSyncGate } from './git/GitSyncGate';
import { useStageStore } from '../stores/stageStore';
import { githubActivity } from '../stores/githubActivityStore';

/**
 * Foreground idle-timeout auto-push for staged changes.
 *
 * A 3-minute idle window resets on every staged-changes notification. When it
 * fires, every unique (repo, branch) key with staged items is enqueued for
 * push and the FIFO executor drains the queue serially — one `pushStaged` in
 * flight at a time, each inside a GitSyncGate cycle.
 *
 * Restart safety: `isPushing`/`pushQueue` live in memory and reset on app
 * restart. A push interrupted by a kill is safe to re-run: clone push is
 * idempotent (the same refs are re-pushed) and api-mode drain re-runs
 * whatever mutations remain in the sync queue.
 */

export const STAGE_PUSH_IDLE_MS = 3 * 60 * 1000;

export interface PushFailure {
  key: string;
  error: string;
}

type PushFailureHandler = (failure: PushFailure) => void;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let schedulerRunning = false;
let draining = false;
let unsubscribeStaged: (() => void) | null = null;
let onPushFailure: PushFailureHandler | null = null;

/** Register the push-failure hook (notification wiring lands in todo 9). */
export function setOnPushFailure(handler: PushFailureHandler | null): void {
  onPushFailure = handler;
}

function notifyPushFailure(key: string, error: string): void {
  onPushFailure?.({ key, error });
}

function keyParts(key: string): { repoPath: string; branch: string } | null {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex === -1) return null;
  return {
    repoPath: key.slice(0, separatorIndex),
    branch: key.slice(separatorIndex + 2),
  };
}

/** Restart the idle countdown; fires `flushStaged` when the window elapses. */
export function resetIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void flushStaged();
  }, STAGE_PUSH_IDLE_MS);
}

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Enqueue every unique staged (repo, branch) key, then start the FIFO drain. */
export function flushStaged(): void {
  const store = useStageStore.getState();
  const keys = new Set<string>();
  for (const item of store.staged) {
    keys.add(store.keyFor(item.repoPath, item.branch));
  }
  for (const key of keys) {
    const parts = keyParts(key);
    if (parts !== null) {
      store.requestPush(parts.repoPath, parts.branch);
    }
  }
  void drainPushQueue();
}

/**
 * FIFO executor: serially run one push per queued key. The store's
 * isPushing guard prevents a key from being queued twice, so no two pushes
 * for the same (repo, branch) can overlap; the `draining` guard additionally
 * stops a re-entrant call from starting a second loop over the same queue.
 */
export async function drainPushQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const key = useStageStore.getState().dequeueNext();
      if (key === null) break;

      const parts = keyParts(key);
      if (parts === null) {
        useStageStore.getState().shiftQueue();
        continue;
      }
      const { repoPath, branch } = parts;

      useStageStore.getState().setPushing(key, true);
      const releaseCycle = await GitSyncGate.acquireCycle();
      githubActivity.begin('Pushing changes');
      try {
        const result = await StagingService.pushStaged(repoPath, branch, (fraction) => {
          useStageStore.getState().setPushProgress(fraction);
        });
        if (!result.success) {
          notifyPushFailure(key, result.error ?? 'Staged push failed');
        }
      } catch (error) {
        notifyPushFailure(key, error instanceof Error ? error.message : String(error));
      } finally {
        githubActivity.end();
        releaseCycle();
        useStageStore.getState().setPushing(key, false);
        useStageStore.getState().shiftQueue();
      }
    }

    if (useStageStore.getState().dequeueNext() === null) {
      useStageStore.getState().setPushProgress(null);
      if (useStageStore.getState().globalPushing) {
        useStageStore.getState().setGlobalPushing(false);
      }
    }
  } finally {
    draining = false;
  }
}

/** Subscription callback: any staged change resets the idle window. */
export function onStagedChanged(): void {
  resetIdleTimer();
}

/** Start the scheduler. */
export function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;
  useStageStore.getState().registerQueueSubscription();
  // Seed pendingCount at boot so the staged-changes UI reflects the current
  // state immediately, not only after later queue-churn notifications.
  void useStageStore.getState().loadStaged();
  unsubscribeStaged = useStageStore.subscribe(onStagedChanged);
  resetIdleTimer();
}

/** Stop the scheduler: clear the idle timer and drop the subscriptions. */
export function stopScheduler(): void {
  if (!schedulerRunning) return;
  schedulerRunning = false;
  clearIdleTimer();
  unsubscribeStaged?.();
  unsubscribeStaged = null;
}
