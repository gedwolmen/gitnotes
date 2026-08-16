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

## Per-Row Lock UI

While a git operation is in flight for a file, the row cards in the Notes and Todo lists gray out and show a small spinner in the card's top-right corner (`note-row.lock-spinner` / `todo-row.lock-spinner`). The state comes from `useEntityLock` (`src/hooks/useGitOpLock.ts`), which mirrors ops from the `gitOperationStore` registry.

Layout rule:

- The spinner overlay is positioned `absolute` with `right: 24, top: 24` relative to the row wrapper (`LockedNoteRow` / `LockedTodoRow`). The 24px offsets keep the spinner inside the card's bounds, clear of the 12px rounded card corner.
- Do not lower the offsets below 24 — the note card is inset by `marginHorizontal: 16` and both cards use `borderRadius: 12`, so smaller offsets make the spinner overhang the card edge.

Tests: `__tests__/notes-delete-lock.test.tsx` asserts the spinner wrapper sits at least 24px from the row wrapper's right/top edges.

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
