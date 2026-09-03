# Sync Engine

> Git sync architecture and error handling.

## Overview

GitNotēs uses **git2** for Git operations (clone, commit, push, pull) in React Native. Sync runs in background, offline-first, with conflict resolution.

## Architecture

```
User edits note
  ↓
repoStore.saveNote() → AsyncStorage (fast)
  ↓
Sync mode (per repo, see SyncEngineService.getMode):
  ├─ clone → CommitService.commit(..., push: false)
  │           → FloatingPushButton (unpushed badge) / PushScreen /
  │             3-min foreground idle / OS background-task drain (≤ 10 files)
  │           → LocalGitWriter.push
  └─ api   → NoteSyncQueueService.enqueue
             → on push trigger: drainPushQueue → NoteSyncQueueService.drain
```

Network state is read from the `useNetworkStatus` hook (NetInfo) — pull and push both gate on `isConnected && isInternetReachable`.

## Key Services

### GitService (clone-mode facade)

Core clone-mode Git operations live behind `GitService.ts`; low-level write/commit/push is in `src/services/git/LocalGitWriter.ts`.

```typescript
// GitService.ts — public surface
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
      noCheckout: true, // batched full checkout via checkout-orphan
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

Per-repo sync-mode registry. `getMode(repoPath)` returns `'clone' | 'api'`; the per-repo override map is persisted under `@gitnotes:sync_engine_modes` (default `'clone'`).

```typescript
class SyncEngineService {
  async getMode(repoPath: string): Promise<'clone' | 'api'> {
    const overrides = await StorageService.get<Record<string, 'clone' | 'api'>>(
      '@gitnotes:sync_engine_modes',
      {},
    );
    return overrides[repoPath] ?? 'clone';
  }

  async setMode(repoPath: string, mode: 'clone' | 'api'): Promise<void> {
    // Persist override
  }
}
```

The mutation queue lives in `ClonePendingQueue` (replaces the deprecated `StagingService` / `stageStore` / `StagePushScheduler` pattern). Pull orchestration lives in `ForegroundSyncService` and the OS background task.

### Network status (hook, not service)

Online/offline detection is a hook, not a service:

```typescript
// src/hooks/useNetworkStatus.ts
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });

  useEffect(() => {
    return NetInfo.addEventListener(setStatus);
  }, []);

  return status;
}
```

## Sync Flows

### Foreground pull (app focus, online transitions, interval)

```typescript
// ForegroundSyncService.runPull — called from App.tsx / hook subscriptions
await foregroundSyncService.runPull({ reason: 'appFocus' | 'onlineTransition' | 'interval' });
```

### Manual sync (pull-only)

```typescript
// src/services/git/manualSync.ts
import { runSyncCycle } from '../src/services/git/manualSync';

const handleSync = async () => {
  setLoading(true);
  await runSyncCycle({ reason: 'manual' }); // pull + store refresh, never pushes
  setLoading(false);
};
```

### Background sync (OS task)

`BackgroundSyncService` is the entry point registered with `expo-background-task`. It calls `pullAllFromRepos()` and surfaces a single local notification when the pull changed something (sum of `notes + canvases + todos + templates` > 0). Pushes never run from the OS background task except for small sets (≤ 10 files) via the dedicated background-push path.

## Conflict Resolution

### 3-Way Merge

```typescript
// src/services/conflict/ConflictResolverService.ts
import { threeWayMerge } from './threeWayMerge';

class ConflictResolverService {
  async resolve(
    localContent: string,
    remoteContent: string,
    baseContent: string,
  ): Promise<{ merged: string; conflicts: ConflictBlock[] }> {
    return threeWayMerge({ base: baseContent, ours: localContent, theirs: remoteContent });
  }
}
```

`AiConflictResolver.ts` (same folder) layers AI suggestions on top when an AI provider is configured.

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
import { formatSyncError } from '../src/services/git/formatSyncError';

try {
  await gitService.push(token);
} catch (error) {
  const msg = formatSyncError(error);
  if (msg.kind === 'offline') {
    // Clone mode keeps the commit staged; retries via ClonePendingQueue backoff
    showToast('Offline — changes will sync when online');
  } else if (msg.kind === 'unauthorized') {
    // Token expired / revoked
    await refreshToken();
    await gitService.push(newToken);
  } else {
    throw error;
  }
}
```

### Auth Errors

`formatSyncError` distinguishes rate-limit 403s from permission/scope 403s (the latter includes the exact scopes needed — fine-grained `Contents: Read and write` with the repo selected, or a classic token with the `repo` scope). 404s surface "Repository not found" with a re-auth path.

### Sync Queue Persistence

```typescript
// ClonePendingQueue — clone mode
interface PendingMutation {
  id: string;
  type: 'create' | 'update' | 'delete';
  filePath: string;
  content?: string;
  attempts: number;
  nextAttemptAt: number; // epoch ms
}

// Retry loop with exponential backoff (BACKOFF_BASE_MS = 500, BACKOFF_CAP_MS = 30_000, MAX_ATTEMPTS = 8)
async function drain(onProgress?: (fraction: number | null) => void) {
  const queue = await getQueue();
  const now = Date.now();
  const due = queue.filter(m => m.nextAttemptAt <= now);
  // ... group by (repo, branch), Promise.all per group, fire onProgress per resolution
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

All clone-mode saves go through `CloneSyncService.save`, which commits locally and immediately attempts a push (8s budget). If offline, the mutation is durably queued in `ClonePendingQueue` and pushed when connectivity returns. If a conflict is detected (409/non-fast-forward), the user is blocked on `ConflictResolverScreen` with editor-first UX.

### Commit on save

Every clone-mode save entry point — `noteStore.upsert`, `noteStore.deleteNote`, `NoteGitHubSyncService`, `TodoGitHubSyncService`, `CanvasGitHubSyncService`, `TemplateGitHubSyncService` — calls `CloneSyncService.save` instead of any staging API:

```typescript
const result = await CloneSyncService.save({
  repoPath, branch, filePath, content, message, intent: 'upsert' | 'delete'
});
```

`CloneSyncService.save` runs commit + `tryPushNow` under one gate. On conflict, returns `{ error: 'conflict-detected' }` — the calling screen navigates to `ConflictResolverScreen`.

### Push triggers

Push is triggered automatically by `ClonePushTriggers`:

| Trigger | Code path | Behavior |
|---------|-----------|----------|
| AppState → active | `ClonePushTriggers` (foreground-active) | Calls `pushPending` for all repos with pending items |
| Online transition | `ClonePushTriggers` (NetInfo listener) | Calls `pushPending` for all repos with pending items (1s debounce) |
| 3-minute idle | `ClonePushTriggers` (idle timer) | Calls `pushPending` for all repos; resets on every `gitActivityStore.commitRevision` bump |
| OS background task | `ClonePushTriggers` (background handler) | Logs intent; actual scheduling via OS task runner |

Manual push: FAB long-press, PushScreen Push-all button, and ConflictResolver "Commit & Push" all call `CloneSyncService.pushPending(repoPath, branch)`.

### Push execution

`CloneSyncService.pushPending` drains `ClonePendingQueue.listPending(repoPath, branch)` in insertion order, calling `tryPushNow` per item. On conflict, it breaks and routes to `ConflictResolverScreen`. On offline/timeout, it re-queues with exponential backoff (max 8 attempts, then `SyncDropNotifier`).

The floating button count is driven by `ClonePendingQueue.listAllPending()` — refreshed via `gitActivityStore.subscribe` (no polling).

### Durable pending queue

`ClonePendingQueue` persists to AsyncStorage (`@gitnotes:clone_pending_push`). Items survive app kill. On retry exhaustion, emits `onDroppedMutation` event → `SyncDropNotifier` surfaces a localized alert.

References: `CloneSyncService.ts`, `ClonePushTriggers.ts`, `ClonePendingQueue.ts`.

## Testing

Tests mock the git2 module directly or use integration tests against a local bare repo.
