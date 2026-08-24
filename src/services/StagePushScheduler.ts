import AsyncStorage from '@react-native-async-storage/async-storage';
import { StagingService, type StagedItem } from './git/StagingService';
import { GitSyncGate, type CycleSource } from './git/GitSyncGate';
import { formatSyncError } from './git/formatSyncError';
import { useStageStore } from '../stores/stageStore';
import { useConflictStore } from '../stores/conflictStore';
import { githubActivity } from '../stores/githubActivityStore';
import type { StageState } from '../stores/stageStore';

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

const PUSH_SESSION_KEY = 'gitnotes-push-session';

export async function hasPushSession(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PUSH_SESSION_KEY)) === 'true';
  } catch {
    return false;
  }
}

async function setPushSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_SESSION_KEY, 'true');
  } catch (error) {
    console.warn('[StagePushScheduler] failed to set push session marker:', error);
  }
}

async function clearPushSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PUSH_SESSION_KEY);
  } catch (error) {
    console.warn('[StagePushScheduler] failed to clear push session marker:', error);
  }
}

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
  const formatted = formatSyncError(error);
  console.warn('[StagePushScheduler] push failed:', formatted);
  onPushFailure?.({ key, error: formatted });
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

function stagedSignature(staged: StagedItem[]): string {
  return staged
    .map((item) => `${item.repoPath}|${item.branch}|${item.filePath}|${item.kind}|${item.mode}|${item.localCommitOid ?? ''}`)
    .join('\n');
}

/** Enqueue every unique staged (repo, branch) key, then start the FIFO drain. */
export async function flushStaged(): Promise<void> {
  // Refresh from git before reading: the store may be stale or empty (a
  // timer that fired before loadStaged populated) — otherwise a just-staged
  // clone-mode commit is missed and nothing re-triggers the push (#1020).
  await useStageStore.getState().loadStaged();

  const store = useStageStore.getState();
  const keys = new Set<string>();
  for (const item of store.staged) {
    keys.add(store.keyFor(item.repoPath, item.branch));
  }
  for (const key of keys) {
    const parts = keyParts(key);
    if (parts !== null) {
      const repoConflicts = useConflictStore.getState().conflicts.filter(
        (c) => c.repoPath === parts.repoPath && c.branch === parts.branch,
      );
      const unresolvedCount = repoConflicts.reduce(
        (sum, c) => sum + c.files.filter((f) => !f.autoResolved).length,
        0,
      );
      if (unresolvedCount > 0) {
        continue;
      }
      store.requestPush(parts.repoPath, parts.branch);
    }
  }
  void drainPushQueue('idle');
}

async function runOnePush(
  source: CycleSource,
  key: string,
  repoPath: string,
  branch: string,
): Promise<void> {
  useStageStore.getState().setPushing(key, true);
  // Everything that flips push UI state MUST be in a try/finally so a stuck
  // acquireCycle (cycle held by a long pull up to GitSyncGate's 10-min
  // watchdog) or a throw from `githubActivity.begin` cannot leave isPushing
  // / globalPushing stuck TRUE. The user sees a grayed + spinner button that
  // never recovers until app restart — the exact "stuck forever" symptom.
  let releaseCycle: (() => void) | null = null;
  try {
    releaseCycle = await GitSyncGate.acquireCycle(source);
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
    }
  } finally {
    if (releaseCycle) releaseCycle();
    useStageStore.getState().setPushing(key, false);
    useStageStore.getState().shiftQueue();
  }
}

/**
 * FIFO executor: serially run one push per queued key. The store's
 * isPushing guard prevents a key from being queued twice, so no two pushes
 * for the same (repo, branch) can overlap; the `draining` guard additionally
 * stops a re-entrant call from starting a second loop over the same queue.
 *
 * globalPushing is reset in the OUTER finally — not after the while-loop —
 * so a re-entrant drain that arrives while the queue still has items cannot
 * leave globalPushing TRUE with no drain running.
 */
export async function drainPushQueue(source: CycleSource): Promise<void> {
  if (draining) return;
  draining = true;
  await setPushSession();
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

      await runOnePush(source, key, repoPath, branch);
    }

    useStageStore.getState().setPushProgress(null);
    if (useStageStore.getState().globalPushing) {
      useStageStore.getState().setGlobalPushing(false);
    }
    await clearPushSession();
  } finally {
    useStageStore.getState().setPushProgress(null);
    useStageStore.getState().setGlobalPushing(false);
    draining = false;
  }
}

/**
 * Force-unlock escape hatch: clear isPushing / globalPushing / pushProgress
 * WITHOUT waiting for the gate or any in-flight push. Use only when an
 * out-of-band event (e.g. SyncBlockOverlay cancel, settings mode switch,
 * app-foreground push-session resume) needs to guarantee the button isn't
 * stuck grayed. The real implementation lives on `useStageStore.getState().forceUnlockPushState`
 * to avoid the import cycle between this module and stageStore.
 */
export function forceUnlockPushState(): void {
  useStageStore.getState().forceUnlockPushState();
}

/**
 * Subscription callback: only a change to the staged SET restarts the idle
 * window. Zustand notifies on every store update — including pushProgress /
 * isPushing / pushQueue churn from an in-flight push — and resetting the
 * countdown on those would keep pushing the auto-push out indefinitely
 * (#1020).
 */
export function onStagedChanged(state: StageState, prevState: StageState): void {
  if (stagedSignature(state.staged) !== stagedSignature(prevState.staged)) {
    resetIdleTimer();
  }
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

/**
 * Test-only seam: reset every piece of module-level state so tests that fire
 * `void drainPushQueue(...)` (never awaited) can't leak a stuck `draining`
 * flag or a live idle timer into the next test. Tests that leave a drain
 * in-flight used to make later assertions flaky depending on test order.
 */
export function __resetForTests(): void {
  clearIdleTimer();
  schedulerRunning = false;
  draining = false;
  unsubscribeStaged?.();
  unsubscribeStaged = null;
  onPushFailure = null;
}
