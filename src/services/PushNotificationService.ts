import { AppState } from 'react-native';
import { NotificationService } from './NotificationService';

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

export function _resetPushStartState(): void {
  // Stub: functionality removed
}

/**
 * Wires push-failure notifications to NoteSyncQueueService's permanent-failure path.
 * When a mutation exhausts retries, NoteSyncQueueService emits `onDroppedMutation`;
 * this handler converts that into a `schedulePushFailure` call with dedup.
 */
export function attachToScheduler(): void {
  // Stub: functionality removed
}



/**
 * Wires push-progress / push-complete notifications to the git-operation store.
 * Subscribes to push-operation state changes and fires dismissAndReschedule for:
 *   - Push start ("Pushing changes…")
 *   - Push completion ("Push complete")
 * Throttled to 1 notification/second to avoid spamming during rapid queue churn.
 */
export function subscribeToPushProgress(): void {
  // Stub: functionality removed
}
