# Sync Engine Modes

> Clone-only sync mode (full working-tree clone).

## Overview

Each repository uses clone mode:

| Mode | Transport | Storage | Offline | Default |
|------|-----------|---------|---------|---------|
| **clone** | Full git clone | Local working tree under `FileSystem.documentDirectory` | Yes | ✅ |

**Clone mode is the default and only supported mode.** It provides full offline capability with a local git clone.

## How mode is stored

- `SyncEngineService` (`src/services/SyncEngineService.ts`) manages sync mode in AsyncStorage under the key `@gitnotes:sync_engine_modes`.
- `DEFAULT_MODE = 'clone'`. All repos use clone mode by default.

## Mode consumers

All git operations use clone mode:

| Consumer | Path |
|----------|------|
| `RepoPullService.getRepoReader` | Clone reader for pull operations |
| `NoteGitHubSyncService` | Sync transport for notes |
| `CanvasGitHubSyncService` | Canvas sync transport |
| `TodoGitHubSyncService` | Todo sync transport |
| `TemplateGitHubSyncService` | Template sync transport |

## Switching modes

Clone mode is the only available mode. Users cannot switch to alternative sync modes.

## Large-repo preflight (#1037 — clone disabled for large repos)

**Clone mode is disabled for repos above `LARGE_REPO_THRESHOLD_KB = 100 MB`.** A large repo OOMs Hermes natively during packfile download/indexing (`hermesvm: GCBase::oom` → SIGABRT) or hangs the main thread past the iOS watchdog (`0x8BADF00D` SIGKILL) — neither is catchable in JS. The only safe behavior is to never attempt the clone:

- **At add time:** if the picker's `repo.size` (KB) exceeds the threshold, clone is refused with an alert recommending a smaller repo.
- **At manual clone:** `SettingsScreen.handleEnableCloneMode` looks up the repo size via `GitHubService.getRepositorySize(owner, repo)` before cloning. If it exceeds the threshold, clone is refused with an alert (largeRepoCloneBlockedBody).
- **Manual add (no size in hand):** `importRepoAfterAdd` resolves the size via `getRepositorySize` when the caller didn't supply it, so the `runImport` guard still refuses the clone.
- **Backstop:** `RepoImportService.runImport` returns `{ ok: false, error, retryable: false, largeRepo: true }` and `GitFsService.clone` re-throws `CloneOutOfMemoryError` for the OOM case that JS can catch.

This prevents both crash modes (Hermes OOM SIGABRT and watchdog SIGKILL) during packfile indexing.

## Default mode

Clone mode is the default and only supported sync mode.

## Clone mode

Clone mode uses a **commit-on-save + write-through push** architecture: every user change is committed locally as a git commit, then a push is attempted automatically after a short delay. If offline, changes queue locally until connectivity returns. If a conflict blocks the push, the user must resolve it before continuing.

### Save flow: `CloneSyncService.save`

When the user saves a change, `CloneSyncService.save()` executes a two-step flow:

1. **Commit** — `CommitService.commit()` creates a local git commit with the changed content via `LocalGitWriter`. The commit is atomic (one per mutation) and includes the full diff.
2. **Push attempt** — 8 seconds after the commit, `CloneSyncService` attempts to push the commit to GitHub. If the push succeeds, the change is complete. If it fails, the commit remains unpushed and retry logic kicks in.

This is not the old "commit locally, push later" model. The push is attempted automatically, delivering changes to GitHub without requiring explicit user action.

### Offline: `ClonePendingQueue`

When the device is offline, the push attempt fails silently. The commit remains in the local clone, and the mutation is queued in `ClonePendingQueue`:

- Queued items are retried on the next connectivity event
- The queue persists across app restarts
- `UnpushedCommitsService` still counts these pending commits, so the floating button badge and PushScreen reflect the correct state

### Conflict: `ConflictResolverScreen`

If GitHub has newer changes on the same branch (conflict), the push fails with a conflict error. Clone mode blocks the user on `ConflictResolverScreen` until the conflict is resolved:

- The screen shows the conflicting file and both versions (local and remote)
- User chooses local, remote, or manually merges
- After resolution, the push retries automatically

The user cannot make further changes until the conflict is resolved, preventing race conditions.

### Push triggers: `ClonePushTriggers`

Beyond the automatic 8-second push, additional triggers handle edge cases:

1. **Auto-push on connectivity** — when the device comes back online, `ClonePendingQueue` drains and pushes queued commits
2. **Press-and-hold** the floating push button — immediate manual push of all unpushed commits
3. **Push / Push-all** button on the PushScreen — per-commit or bulk push from the history screen
4. **3-minute foreground idle** — `ClonePushTriggers` pushes when the app has been in the foreground for 3 minutes without user interaction
5. **OS background task** — small sets (≤ 10 files) are pushed by the background sync job

The 8-second delay gives the user time to make additional edits before the first push fires, while the other triggers ensure eventual delivery even if the device goes offline or the app is backgrounded.