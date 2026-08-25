import { AppState } from 'react-native';
import { NotificationService } from './NotificationService';
import { NoteSyncQueueService } from './NoteSyncQueueService';
import { useGitOperationStore, gitOperationRegistry } from '../stores/gitOperationStore';

/** Dedup window for push-failure notifications: a stuck push that retries
 * every interval cycle otherwise spams the user with identical alerts. */
const PUSH_FAILURE_DEDUP_WINDOW_MS = 2 * 60 * 1000;
const lastFailureNotifiedAt = new Map<string, number>();

/** Foregrounded app shows progress in-UI (ring + activity banner) — no banner needed. */
function appIsForegrounded(): boolean {
  return AppState.currentState === 'active';
}

/** Plain push failures open the home page; conflict-caused ones open the conflicts page
 *  with specific repo/branch if provided. */
export function resolvePushFailureRoute(
  conflict: boolean,
  repoPath?: string,
  branch?: string,
): string {
  if (conflict && repoPath && branch) {
    return `gitnotes://conflicts/${encodeURIComponent(repoPath)}/${encodeURIComponent(branch)}`;
  }
  return conflict ? 'gitnotes://conflicts' : 'gitnotes://home';
}

const PUSH_NOTIFICATION_ID = 'gitnotes-push-progress';

/** Tracks whether we've notified "push starting" to avoid re-notifying on each queue churn. */
let hasNotifiedPushStart = false;

/** Stored unsubscribe functions for listener cleanup on re-subscription. */
let unsubscribeGitOp: (() => void) | null = null;
let unsubscribeQueue: (() => void) | null = null;

export function _resetPushStartState(): void {
  hasNotifiedPushStart = false;
  lastFailureNotifiedAt.clear();
}

/**
 * Wires push-failure notifications to NoteSyncQueueService's permanent-failure path.
 * When a mutation exhausts retries, NoteSyncQueueService emits `onDroppedMutation`;
 * this handler converts that into a `schedulePushFailure` call with dedup.
 */
export function attachToScheduler(): void {
  if (unsubscribeQueue) {
    unsubscribeQueue();
  }
  unsubscribeQueue = NoteSyncQueueService.onDroppedMutation((event) => {
    if (appIsForegrounded()) return;
    if (event.reason !== 'exhausted') return;

    const repo = event.mutation.params.repo;
    const branch = event.mutation.params.branch || 'main';
    const key = `${repo}::${branch}`;

    const now = Date.now();
    const lastNotified = lastFailureNotifiedAt.get(key);
    if (lastNotified !== undefined && now - lastNotified < PUSH_FAILURE_DEDUP_WINDOW_MS) return;
    lastFailureNotifiedAt.set(key, now);

    let errorStr: string;
    if (event.error) {
      errorStr = event.error;
    } else {
      errorStr = 'Push failed after retries';
    }
    const conflict = /conflict/i.test(errorStr);
    void NotificationService.schedulePushFailure('Push failed', errorStr, {
      kind: 'push-failure',
      repoPath: repo,
      branch,
      conflict,
    });
  });
}

interface PushState {
  isPushing: Record<string, boolean>;
  pendingCount: number;
  pushProgress: number | null;
}

function computePushState(): PushState {
  const ops = useGitOperationStore.getState().ops;
  const isPushing: Record<string, boolean> = {};
  for (const op of Object.values(ops)) {
    if (op.kind === 'push' && op.status === 'running') {
      const key = op.branch ? `${op.repo}::${op.branch}` : op.repo;
      isPushing[key] = true;
    }
  }
  return { isPushing, pendingCount: 0, pushProgress: null };
}

/**
 * Wires push-progress / push-complete notifications to the git-operation store.
 * Subscribes to push-operation state changes and fires dismissAndReschedule for:
 *   - Push start ("Pushing changes…")
 *   - Push completion ("Push complete")
 * Throttled to 1 notification/second to avoid spamming during rapid queue churn.
 */
export function subscribeToPushProgress(): void {
  if (unsubscribeGitOp) {
    unsubscribeGitOp();
    unsubscribeGitOp = null;
  }
  if (unsubscribeQueue) {
    unsubscribeQueue();
    unsubscribeQueue = null;
  }

  let lastNotifiedAt = 0;

  const notify = (state: PushState) => {
    if (appIsForegrounded()) return;
    const now = Date.now();
    if (now - lastNotifiedAt < 1000) return;
    lastNotifiedAt = now;

    const count = Object.keys(state.isPushing).length;
    if (count > 0 && !hasNotifiedPushStart) {
      hasNotifiedPushStart = true;
      NoteSyncQueueService.getAll().then((queue) => {
        const pendingCount = queue.length;
        void NotificationService.dismissAndReschedule(PUSH_NOTIFICATION_ID, {
          title: 'Pushing changes…',
          body: `Pushing 0/${pendingCount} files…`,
          data: { kind: 'push-progress' },
        });
      });
    } else if (count === 0 && hasNotifiedPushStart) {
      hasNotifiedPushStart = false;
      void NotificationService.dismissAndReschedule(PUSH_NOTIFICATION_ID, {
        title: 'Push complete',
        body: 'All staged changes pushed to GitHub',
        data: { kind: 'push-complete' },
      });
    }
  };

  unsubscribeGitOp = useGitOperationStore.subscribe((ops) => {
    const isPushing: Record<string, boolean> = {};
    const opsRecord = ops as unknown as Record<string, { kind: string; status: string; repo: string; branch?: string }>;
    for (const op of Object.values(opsRecord)) {
      if (op.kind === 'push' && op.status === 'running') {
        const key = op.branch ? `${op.repo}::${op.branch}` : op.repo;
        isPushing[key] = true;
      }
    }
    void notify({ isPushing, pendingCount: 0, pushProgress: null });
  });

  unsubscribeQueue = NoteSyncQueueService.subscribe(() => {
    void NoteSyncQueueService.getAll().then((queue) => {
      const state = computePushState();
      state.pendingCount = queue.length;
      void notify(state);
    });
  });
}
