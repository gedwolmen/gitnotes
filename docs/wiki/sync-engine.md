# Sync Engine

> Git sync architecture and error handling.

## Overview

GitNotēs uses **isomorphic-git** for Git operations (clone, commit, push, pull) in React Native. Sync runs in background, offline-first, with conflict resolution.

## Architecture

```
User edits note
  ↓
NoteService.save() → AsyncStorage (fast)
  ↓
SyncEngineService.queueChange()
  ↓
GitService.commit() [local]
  ↓
NetworkService.isOnline() ?
  ├─ Yes → GitService.push() [remote]
  └─ No  → Queue in syncStore (retry later)
```

## Key Services

### GitService

Core Git operations:

```typescript
class GitService {
  async cloneRepo(repoUrl: string, branch: string): Promise<void> {
    const fs = this.getFS();
    await git.clone({
      fs,
      http,
      dir: this.getRepoDir(),
      url: repoUrl,
      ref: branch,
      singleBranch: true,
      depth: 1,
    });
  }

  async commit(message: string, files: string[]): Promise<string> {
    const fs = this.getFS();
    await git.add({ fs, dir: this.getRepoDir(), filepath: files });
    const sha = await git.commit({
      fs,
      dir: this.getRepoDir(),
      message,
      author: { name: 'GitNotēs', email: 'app@gitnotes.dev' },
    });
    return sha;
  }

  async push(token: string): Promise<void> {
    const fs = this.getFS();
    await git.push({
      fs,
      http,
      dir: this.getRepoDir(),
      onAuth: () => ({ username: 'x-access-token', password: token }),
    });
  }

  async pull(token: string): Promise<void> {
    const fs = this.getFS();
    await git.pull({
      fs,
      http,
      dir: this.getRepoDir(),
      onAuth: () => ({ username: 'x-access-token', password: token }),
      singleBranch: true,
      fastForward: true,
    });
  }
}
```

### SyncEngineService

Queue-based sync:

```typescript
class SyncEngineService {
  async queueChange(change: SyncChange): Promise<void> {
    const queue = await StorageService.get<SyncChange[]>('syncQueue', []);
    queue.push(change);
    await StorageService.set('syncQueue', queue);
  }

  async processQueue(): Promise<void> {
    const queue = await StorageService.get<SyncChange[]>('syncQueue', []);
    if (queue.length === 0) return;

    const networkStatus = await NetworkService.getStatus();
    if (!networkStatus.isConnected) return;

    try {
      // Commit all queued changes
      const files = queue.map(c => c.filePath);
      const message = `Sync ${queue.length} change(s)`;
      await gitService.commit(message, files);
      
      // Push to remote
      await gitService.push(token);
      
      // Clear queue on success
      await StorageService.set('syncQueue', []);
    } catch (error) {
      console.error('Sync failed:', error);
      // Keep queue for retry
    }
  }
}
```

### NetworkService

Online/offline detection:

```typescript
import NetInfo from '@react-native-community/netinfo';

class NetworkService {
  async getStatus(): Promise<NetworkStatus> {
    const state = await NetInfo.fetch();
    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      type: state.type,
    };
  }

  subscribe(callback: (status: NetworkStatus) => void): () => void {
    return NetInfo.addEventListener(callback);
  }
}
```

## Sync Flows

### Auto-Sync (on app focus)

```typescript
// App.tsx
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      syncEngineService.processQueue();
    }
  });
  return () => subscription.remove();
}, []);
```

### Manual Sync

```typescript
// SyncButton.tsx
const handleSync = async () => {
  setLoading(true);
  await gitService.pull(token);
  await syncEngineService.processQueue();
  setLoading(false);
};
```

### Periodic Sync (background)

```typescript
// App.tsx
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await NetworkService.getStatus();
    if (status.isConnected) {
      await syncEngineService.processQueue();
    }
  }, 5 * 60 * 1000); // 5 minutes
  return () => clearInterval(interval);
}, []);
```

## Conflict Resolution

### 3-Way Merge

```typescript
class ConflictResolverService {
  async resolve(localContent: string, remoteContent: string, baseContent: string): Promise<string> {
    // Use isomorphic-git's merge strategy
    const merged = await git.merge({
      fs,
      dir: repoDir,
      ours: 'HEAD',
      theirs: 'origin/main',
    });
    
    if (merged.conflicts) {
      // Manual resolution UI
      return openConflictResolver(merged.conflicts);
    }
    
    return merged.result;
  }
}
```

### Conflict UI

```typescript
// ConflictResolverScreen.tsx
const handleResolve = (resolution: 'local' | 'remote' | 'merge') => {
  switch (resolution) {
    case 'local':
      return localContent;
    case 'remote':
      return remoteContent;
    case 'merge':
      return manualMerge(localContent, remoteContent);
  }
};
```

## Error Handling

### Network Errors

```typescript
try {
  await gitService.push(token);
} catch (error) {
  if (error.message.includes('Network request failed')) {
    // Queue for retry
    await syncEngineService.queueChange(change);
    showToast('Offline — changes queued for sync');
  } else if (error.message.includes('401')) {
    // Token expired
    await refreshToken();
    await gitService.push(newToken);
  } else {
    throw error;
  }
}
```

### Auth Errors

```typescript
try {
  await gitService.push(token);
} catch (error) {
  if (error.message.includes('403')) {
    alert('No push access to repository');
  } else if (error.message.includes('404')) {
    alert('Repository not found');
  }
}
```

### Sync Queue Persistence

```typescript
interface SyncChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  filePath: string;
  content?: string;
  timestamp: number;
}

// Retry logic
async function processQueue() {
  const queue = await getQueue();
  const networkStatus = await NetworkService.getStatus();
  
  if (!networkStatus.isConnected) {
    return; // Retry later
  }
  
  for (const change of queue) {
    try {
      await applyChange(change);
      await removeFromQueue(change.id);
    } catch (error) {
      console.error('Failed to sync change:', change.id, error);
      // Keep in queue for retry
    }
  }
}
```

## Row Locks (removed)

Rows are never grayed out or disabled. The per-row lock UI — `useEntityLock`
(`src/hooks/useGitOpLock.ts`), the `LockedNoteRow`/`LockedTodoRow`/`LockedDumpRow`
wrappers, and the `note-row.lock-spinner` / `todo-row.lock-spinner` /
`note-row.lock-error` overlays — has been deleted. The push button is the single
coordination point for pending work.

Delete behavior: deleting a note removes the row immediately in both API and
clone modes (`noteStore.deleteNote` stages, then removes from storage + state
and succeeds the git op). The pending delete stays in the sync queue and is
drained by the next push. If the push drops it, the failure is recorded in the
durable `@gitnotes:delete_failures_v1` map and surfaced on the Stage screen's
"Failed to delete" section with a Retry button (`retryDeleteFailure` in
`src/services/git/retryDeleteFailure.ts`).

Repo-level guards remain unchanged: `gateBusy`, `isRepoBusy`, `hasActivePull`,
and `RefreshControl` still gate repo-wide operations, and repo-tree items keep
their path locks via `isPathLocked` (`src/stores/gitOperationStore.ts`).

## Push model

Refresh, startup, and manual sync entry points are pull-only. They pull remote state and refresh the stores, but they never push staged changes:

- `ForegroundSyncService.runPull` (`src/services/ForegroundSyncService.ts`) pulls every tracked repo on app focus, online transitions, and the foreground interval. No queue drain.
- `manualSync.runSyncCycle` (`src/services/git/manualSync.ts`) backs pull-to-refresh, the cloud-icon sync button, and startup sync via `syncNow`. Pull and store refresh only.
- `retryDeleteFailure` (`src/services/git/retryDeleteFailure.ts`) clears the durable delete-failure entry and re-enqueues the delete; it does not drain the sync queue. It is triggered from the Stage screen's "Failed to delete" section.

Pushes flow only through three paths: the stage scheduler (`StagePushScheduler`, a 3-minute idle window that resets on staged changes), the explicit Push / Push-all buttons on the Stage screen, or the OS background task. The sync queue drains only when one of those push paths runs. Saving or deleting a note by itself never starts a push.

### Immediate drain on explicit push

When a user taps Push / Push-all on the Stage screen or long-presses the floating stage button, the call site enqueues keys via `stageStore.pushAll()` or `stageStore.requestPush()` and then immediately calls `void drainPushQueue()`. Previously, explicit push only enqueued work; the actual drain waited for the 3-minute idle timer. Now the drain starts right away, and the idle-timer path (`flushStaged`) continues to serve the auto-push use case.

The circular-import constraint is preserved: `stageStore` must not import `StagePushScheduler`. The drain trigger lives at UI call sites, not in the store.

### Parallel group drain and progress aggregation

`drainPushQueue` processes the FIFO queue one key at a time, each inside a `GitSyncGate` cycle. For each key it calls `StagingService.pushStaged(repoPath, branch, onProgress)`, which delegates to `NoteSyncQueueService.drain(onProgress)` for API mode or `LocalGitWriter.push` for clone mode.

`drain()` groups pending mutations by `(repo, branch)` and processes groups in parallel via `Promise.all`. A shared `completed` counter incremented in per-group `.then()` callbacks fires `onProgress(completed / totalDue)` after each group resolves, giving coarse per-group granularity. When `totalDue === 0` (all items skipped by backoff), `onProgress(null)` is called. After the loop, `onProgress(1)` signals completion.

The progress fraction (`number | null`, range 0..1) flows from `drainPushQueue` into `stageStore.setPushProgress`. A `null` value means "unknown total" and the floating button's progress ring clamps at 0.9 to avoid an infinite indeterminate animation. See [Stage Push UX](./stage-push-ux.md) for the full ring and notification behavior.

### Resume on foreground

`drainPushQueue` sets an AsyncStorage marker (`gitnotes-push-session`) when the FIFO loop starts and clears it when the queue drains. If the app is backgrounded mid-push (OS reclaim, user switching apps, kill), the marker persists.

`ForegroundSyncService.handleAppStateChange` checks `hasPushSession()` on `AppState → active`. When the marker exists and `stageStore.staged.length > 0`, it calls `drainPushQueue()` immediately. The re-entrancy guard (`draining` flag) prevents overlap. Clone push re-pushes the same refs safely (idempotent), and API-mode drain re-runs whatever mutations remain in the sync queue.

### Backoff constants

`NoteSyncQueueService` uses exponential backoff for transient failures:

- `BACKOFF_BASE_MS = 500` (initial retry delay)
- `BACKOFF_CAP_MS = 30_000` (maximum retry delay)
- `MAX_ATTEMPTS = 8` (mutations are dropped after 8 failures)

The formula: `Math.min(500 * 2^(attempts-1), 30000)`. This turns a transient network blip from 8 immediate retries into roughly 1 minute of wall-clock retries, giving the foreground/auto-pull path time to resolve the underlying issue.

## Push progress & failure notifications

Immediate local notifications (push progress, push failure, background-pull) use a `TIME_INTERVAL` trigger with `seconds: 1` instead of a near-future date, which avoids expo-notifications rejecting past dates. Date-trigger scheduling (`scheduleDateTrigger` in `src/services/NotificationService.ts`) re-checks the trigger against `Date.now()` after the permission round-trip, so a date that lapses while the permission prompt is open is skipped rather than rejected. Native scheduling failures never throw: they log with `console.warn`, return `null`, and callers fire-and-forget.

## Background pull notification

The OS background sync task (`BackgroundSyncService`) schedules a local notification only when a pull changed something. After `pullAllFromRepos()`, the task sums the `PullResult` counts (`notes + canvases + todos + templates`) and, when the sum is greater than zero, calls `NotificationService.schedulePushProgress('Synced with origin', ...)` with `{ kind: 'background-pull' }`. A background pull that changed nothing stays silent.

## `globalPushing` reset

The stage store's `globalPushing` flag resets to `false` once the push queue drains. `StagePushScheduler.drainPushQueue` calls `setGlobalPushing(false)` after the FIFO loop ends and `dequeueNext()` returns `null`, so the Stage screen "Push all" button and the floating stage button stop spinning as soon as a push completes. While any key is still in flight (`isPushing[key]` true), the flag stays `true`.

## Testing

```typescript
jest.mock('isomorphic-git', () => ({
  clone: jest.fn(() => Promise.resolve()),
  commit: jest.fn(() => Promise.resolve('abc123')),
  push: jest.fn(() => Promise.resolve()),
  pull: jest.fn(() => Promise.resolve()),
}));

describe('GitService', () => {
  it('commits changes', async () => {
    const sha = await gitService.commit('test message', ['file.md']);
    expect(sha).toBe('abc123');
  });

  it('queues changes when offline', async () => {
    jest.mocked(NetworkService.getStatus).mockResolvedValue({ isConnected: false });
    
    await gitService.commit('test', ['file.md']);
    const queue = await StorageService.get('syncQueue');
    expect(queue).toHaveLength(1);
  });
});
```
