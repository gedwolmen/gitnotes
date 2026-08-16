import { setOnPushFailure } from './StagePushScheduler';
import { useStageStore } from '../stores/stageStore';
import { NotificationService } from './NotificationService';

const PROGRESS_THROTTLE_MS = 1000;

let lastProgressSentAt = 0;
let unsubscribeProgress: (() => void) | null = null;

/** Plain push failures open the stage page; conflict-caused ones open the conflicts page. */
export function resolvePushFailureRoute(conflict: boolean): string {
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

/** Notify once when a push starts (isPushing all-false → any-true), throttled to ≤1/sec. */
export function subscribeToPushProgress(): void {
  if (unsubscribeProgress) return;
  unsubscribeProgress = useStageStore.subscribe((state, prevState) => {
    const wasPushing = Object.values(prevState.isPushing).some(Boolean);
    const isPushing = Object.values(state.isPushing).some(Boolean);
    if (!isPushing || wasPushing) return;

    const now = Date.now();
    if (now - lastProgressSentAt < PROGRESS_THROTTLE_MS) return;
    lastProgressSentAt = now;

    void NotificationService.schedulePushProgress(
      'Pushing changes…',
      'Pushing staged changes to GitHub',
      { kind: 'push-progress' },
    );
  });
}
