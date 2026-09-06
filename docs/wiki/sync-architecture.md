# Sync Architecture

> Deep-dive on GitNotēs' two sync modes. See [Architecture](./architecture.md) for context and [Services](./services.md) for the underlying services.

GitNotēs supports two synchronization modes, controlled per-repository via the `@gitnotes:sync_engine_modes` preference. The default mode is **`clone`**.

## Mode Overview

| Aspect | Clone Mode | API Mode |
|--------|-----------|----------|
| Push trigger | Commit-on-save + background push | Immediate on save/complete |
| Network budget | 8 seconds per push | Unlimited (blocking) |
| Offline support | Queue in ClonePendingQueue | Not supported |
| Conflict handling | Block on ConflictResolverScreen | Block on ConflictResolverScreen |
| User blocked during sync? | No (background) | Yes (spinner) |
| Pull frequency | On-demand + background | After each push |

## Clone Mode (Default)

Clone mode is designed for **offline-first** usage. Changes are committed locally and pushed asynchronously.

### Commit-on-Save Flow

```
User edits note
  → NoteEditorScreen saves
    → CloneSyncService.save({ intent: 'upsert', content, filePath, ... })
      → File written to working tree: <documentDir>/GitNotes/<owner>/<repo>/<path>.md
        → GitEngine.stage(repoDir, [relPath])
          → Local git commit created (author: GitNotēs, message: "Update <path>")
            → CloneSyncService returns { success: true }
```

### Push Triggers

After a local commit, push is triggered automatically by any of:

1. **Foreground-active transition** — `AppState` changes to `active`; the app came to the foreground
2. **Online transition** — `NetInfo` fires an event indicating the device is now online
3. **3-minute idle timer** — `ClonePushTriggers` fires after 3 minutes of no user activity
4. **OS background task** — On iOS/Android, `expo-background-task` runs a sync job (up to 50 files per invocation)

```
tryPushNow (8 second budget)
  → GitHub API push (git push origin <branch>)
    → Success: clear pending queue
    → 409 Conflict: → ConflictResolverScreen (blocks user)
    → Network error: → re-queue, retry on next trigger
```

### Offline Queue

When offline, mutations are queued in `ClonePendingQueue` (persisted to AsyncStorage):

```
CloneSyncService.save (offline)
  → ClonePendingQueue.enqueue(mutation)
    → Returns { success: true, queued: true }

Network restored (NetInfo online-transition)
  → ClonePendingQueue.drain()
    → For each queued mutation:
        → Retry CloneSyncService.save
          → Push via tryPushNow
```

### Clone Storage Location

All cloned repositories are stored under:

```
<documentDirectory>/GitNotes/<owner>/<repo>/
```

On iOS: `FileSystem.documentDirectory + "GitNotes/" + owner + "/" + repo + "/"`

### Conflict Resolution

When `git push` returns 409 (non-fast-forward) or the remote has diverged:

```
tryPushNow → 409 Conflict
  → Navigate to ConflictResolverScreen
    → User resolves: keep local / keep remote / manual merge
      → On keep-local: force push (`git push --force`)
      → On keep-remote: discard local changes, re-clone from remote
      → On manual merge: user edits the conflicting file directly, then re-saves (which creates a new commit)
```

### Push Trigger Sources (code references)

| Trigger | Location |
|---------|----------|
| AppState active | `App.ts` / foreground sync hooks |
| NetInfo online | `useNetworkStatus` hook |
| Idle timer | `ClonePushTriggers` |
| Background task | `BackgroundSyncService` |

---

## API Mode

API mode is designed for **real-time collaboration** where changes must appear on other devices immediately.

### Write-Through Push Flow

```
User edits note
  → NoteEditorScreen saves
    → NoteGitHubSyncService.upsert({ content, filePath, ... })
      → GitHub API: PUT /repos/:owner/:repo/contents/:path
        → Success: → RepoPullService.pull() to update local state
          → Returns { success: true }
        → Failure: → show error, do NOT save locally (or save with conflict flag)
```

### User Blocking

During a push or pull in API mode, the UI is locked:

```
API push in progress
  → SyncStatusScreen / blocking spinner
    → User cannot edit
      → Push completes: unlock UI
      → Push fails: show error, unlock UI
```

This prevents concurrent edits from racing the sync operation.

### Pull After Push

After every successful push, a pull is issued to keep local state consistent:

```
API push success
  → RepoPullService.pull()
    → git fetch + git merge (or rebase)
      → File changes merged into working tree
        → noteStore.reload() to pick up changes
```

---

## Per-Repo Override

Each repository can override the sync mode via a Git config key:

```
@gitnotes:sync_engine_modes = {
  "owner/repo": "api",  // override for specific repo
  "another/owner": "clone"
}
```

This is stored in `AsyncStorage` and read by `SyncEngineService.getMode(repoPath)`.

Default: `'clone'` for all repositories.

---

## Sync State Machine

```
                    ┌──────────────────────────────────────┐
                    │                                      │
    ┌──────┐      ┌▼────────┐     ┌──────┐    ┌────────▼────────┐
───►│ IDLE │──────►│ COMMITTING │───►│ PUSHING │───►│ PUSH_COMPLETE │
    └──┬───┘      └──────┬───┘     └──┬────┘    └─────────┬──────┘
       ▲                    │           │                    │
       │                    │ 409       │ error             │ pull
       │                    ▼           ▼                    ▼
       │              ┌──────────┐ ┌────────┐        ┌─────────┐
       └──────────────►│ CONFLICT │ │RETRY   │        │PULLING  │
                       │ (blocked)│ └────────┘        └────┬────┘
                       └──────────┘                          │
                                                            ▼
                                                       ┌─────────┐
                               ┌───────────────────────►│  IDLE  │
                               │                         └─────────┘
                               │ local changes
                               ▼
                         ┌───────────┐
                         │  DIRTY   │◄── new edit
                         └─────┬─────┘
                               │
                               ▼
                         (commit on next save)
```

---

## Key Services

| Service | Role |
|---------|------|
| `CloneSyncService` | Clone mode file write + commit |
| `NoteSyncQueueService` | Offline mutation queue |
| `BackgroundSyncService` | OS background sync task |
| `ForegroundSyncService` | Foreground change monitoring |
| `SyncEngineService` | Mode manager + per-repo overrides |
| `RepoPullService` | Pull changes from remote |
| `ConflictResolverScreen` | User-facing conflict UI |
| `GitEngine.stage` | Stage files for commit (Rust) |

---

## See Also

- [Services](./services.md) — All sync-related services
- [Stores](./stores.md) — RepoStore sync state
- [Architecture](./architecture.md) — Context
