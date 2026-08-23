import { AppState } from 'react-native';
import { setOnPushFailure } from './StagePushScheduler';
import { useStageStore } from '../stores/stageStore';
import { NotificationService } from './NotificationService';

const PROGRESS_THROTTLE_MS = 1000;

/** Foregrounded app shows progress in-UI (ring + activity banner) — no banner needed. */
function appIsForegrounded(): boolean {
  return AppState.currentState === 'active';
}

let lastProgressSentAt = 0;
let unsubscribeProgress: (() => void) | null = null;

/** Plain push failures open the stage page; conflict-caused ones open the conflicts page
 *  with specific repo/branch if provided. */
export function resolvePushFailureRoute(
  conflict: boolean,
  repoPath?: string,
  branch?: string,
): string {
  if (conflict && repoPath && branch) {
    return `gitnotes://conflicts/${encodeURIComponent(repoPath)}/${encodeURIComponent(branch)}`;
  }
  return conflict ? 'gitnotes://conflicts' : 'gitnotes://stage';
}

function parsePushKey(key: string): { repoPath: string; branch: string } | null {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex === -1) return null;
  return {
    repoPath: key.slice(0, separatorIndex),
    branch: key.slice(separatorIndex + 2),
  };
}

/** Route StagePushScheduler push failures into a deep-linkable local notification. */
export function attachToScheduler(): void {
  setOnPushFailure(({ key, error }) => {
    const parts = parsePushKey(key);
    if (parts === null) return;
    const { repoPath, branch } = parts;
    const conflict = error.toLowerCase().includes('conflict');
    void NotificationService.schedulePushFailure(
      'Push failed',
      `Could not push staged changes to ${branch}`,
      { kind: 'push-failure', repoPath, branch, conflict },
    );
  });
}

const PUSH_NOTIFICATION_ID = 'gitnotes-push-progress';

/** Notify on push start, throttled body-text progress, and completion. */
export function subscribeToPushProgress(): void {
  if (unsubscribeProgress) return;
  let pushTotal = 0;

  unsubscribeProgress = useStageStore.subscribe((state, prevState) => {
    const wasPushing = Object.values(prevState.isPushing).some(Boolean);
    const isPushing = Object.values(state.isPushing).some(Boolean);
    if (appIsForegrounded()) return;

    if (isPushing && !wasPushing) {
      pushTotal = state.pendingCount;
      lastProgressSentAt = Date.now();
      const body = pushTotal > 0
        ? `Pushing 0/${pushTotal} files…`
        : 'Pushing staged changes to GitHub';
      void NotificationService.dismissAndReschedule(PUSH_NOTIFICATION_ID, {
        title: 'Pushing changes…',
        body,
        data: { kind: 'push-progress' },
      });
      return;
    }

    if (!isPushing && wasPushing) {
      pushTotal = 0;
      void NotificationService.dismissAndReschedule(PUSH_NOTIFICATION_ID, {
        title: 'Push complete',
        body: 'All staged changes pushed to GitHub',
        data: { kind: 'push-complete' },
      });
      return;
    }

    if (
      isPushing
      && state.pushProgress !== null
      && state.pushProgress !== prevState.pushProgress
    ) {
      const now = Date.now();
      if (now - lastProgressSentAt < PROGRESS_THROTTLE_MS) return;
      lastProgressSentAt = now;
      const pushed = pushTotal > 0
        ? Math.round(state.pushProgress * pushTotal)
        : 0;
      const body = pushTotal > 0
        ? `Pushing ${pushed}/${pushTotal} files…`
        : 'Pushing staged changes to GitHub';
      void NotificationService.dismissAndReschedule(PUSH_NOTIFICATION_ID, {
        title: 'Pushing changes…',
        body,
        data: { kind: 'push-progress' },
      });
    }
  });
}
