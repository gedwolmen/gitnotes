# Sync Architecture

> Deep-dive on GitNotēs' clone sync. See [Architecture](./architecture.md) for context and [Services](./services.md) for the underlying services.

GitNotēs uses **clone mode**: local git working tree with commit-on-save and write-through push.

## Clone Mode

Clone mode is designed for **offline-first** usage. Changes are written locally, then staged and committed by the user before being pushed asynchronously.

### Save Flow

```
User edits note
  → NoteEditorScreen saves
    → CloneSyncService.save({ intent: 'upsert', content, filePath, ... })
      → File written to working tree: <documentDir>/GitNotes/<owner>/<repo>/<path>.md
        → CloneSyncService returns { success: true }
          → User stages and commits from the Git workspace or floating Git button
```

Delete operations remove the working-tree file without staging the deletion, so the user can review, stage, and commit it from the Git workspace.

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
| `RepoPullService` | Pull changes from remote |
| `ConflictResolverScreen` | User-facing conflict UI |
| `GitEngine.stage` | Stage files for commit (Rust) |

---

## See Also

- [Services](./services.md) — All sync-related services
- [Stores](./stores.md) — RepoStore sync state
- [Architecture](./architecture.md) — Context
