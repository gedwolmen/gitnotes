# Sync Engine Modes

> Per-repo selection between full working-tree clone and GitHub Contents API.

## Overview

Each repository can independently operate in one of two sync modes:

| Mode | Transport | Storage | Offline | Default |
|------|-----------|---------|---------|---------|
| **clone** | Full git clone via `isomorphic-git` | Local working tree under `FileSystem.documentDirectory` | Yes | ✅ |
| **api** | GitHub Contents API (per-file GET/PUT) | In-memory + AsyncStorage | No | |

**Clone mode is the default.** Users who need lightweight per-file sync without a local clone — or who are adding a large repo that would OOM the JS heap during clone — can switch a repo to API mode from Settings → Sync Engine.

## How mode is stored

- `SyncEngineService` (`src/services/SyncEngineService.ts`) manages a per-repo `ModeMap` in AsyncStorage under the key `@gitnotes:sync_engine_modes`.
- `DEFAULT_MODE = 'clone'`. Only repos that have been explicitly switched to API mode store an entry. Repos with no stored entry use the default (clone).
- `setMode(path, 'clone')` removes the stored entry (no-op for the default). `setMode(path, 'api')` persists the override.

## Mode consumers

Every service that performs git I/O calls `SyncEngineService.getMode(repoPath)` and branches on `=== 'clone'`:

| Consumer | Path |
|----------|------|
| `RepoPullService.getRepoReader` | Selects clone reader vs API reader |
| `StagingService.listStaged` | Filters API-mode items so the push button never surfaces in API mode |
| `NoteGitHubSyncService` | Selects sync transport per file |
| `NoteSyncQueueService` | Determines queue routing |
| `CanvasGitHubSyncService` | Canvas sync transport |
| `TodoGitHubSyncService` | Todo sync transport |
| `TemplateGitHubSyncService` | Template sync transport |

## Switching modes

### Clone → API

1. Settings → Sync Engine → tap "Use API" on the repo.
2. Confirmation alert describes what will be removed.
3. The local clone is removed (`GitFsService.removeRepo`).
4. Mode is persisted as `'api'`.

There is **no post-switch warning** — API mode is a fully supported sync engine, and the choice is the user's. The recommended-mode hint surfaces inline in the sync-engine row description instead ("GitHub API (per-file) — recommended for large repos").

### API → Clone

1. Settings → Sync Engine → tap "Clone" on the repo.
2. A progress modal shows clone progress.
3. Optional LFS migration prompt if the repo has LFS objects.
4. Mode entry is deleted (falls back to default `'clone'`).

## Large-repo preflight (#1037 — clone disabled for large repos)

**Clone mode is disabled for repos above `LARGE_REPO_THRESHOLD_KB = 200 MB`.** A large repo OOMs Hermes natively during packfile download/indexing (`hermesvm: GCBase::oom` → SIGABRT) or hangs the main thread past the iOS watchdog (`0x8BADF00D` SIGKILL) — neither is catchable in JS. The only safe behavior is to never attempt the clone:

- **At add time:** if the picker's `repo.size` (KB) exceeds the threshold, the repo is added **directly in API mode** (`SyncEngineService.setMode(repo, 'api')` before import), so the import runs the pull-only API path and never the clone path.
- **At the API → Clone toggle:** `SettingsScreen.handleEnableCloneMode` looks up the repo size via `GitHubService.getRepositorySize(owner, repo)` before cloning. If it exceeds the threshold, clone is refused with an alert (largeRepoCloneBlockedBody) recommending API mode.
- **Manual add (no size in hand):** `importRepoAfterAdd` resolves the size via `getRepositorySize` when the caller didn't supply it, so the `runImport` guard still refuses the clone.
- **Backstop:** `RepoImportService.runImport` returns `{ ok: false, error, retryable: false, largeRepo: true }` and `GitFsService.clone` re-throws `CloneOutOfMemoryError` for the OOM case that JS can catch.

This prevents both crash modes (Hermes OOM SIGABRT and watchdog SIGKILL) during packfile indexing.

## Default mode change (PR #N)

Changed from `'api'` to `'clone'`. Existing users with no stored mode preference silently switch to clone mode. Users who explicitly enabled clone keep their entry; users who explicitly switched to API keep their override.

## Push-button visibility

The push button (floating cloud-upload FAB and per-group Push button on the Staged Changes screen) is only meaningful in **clone mode** — API mode writes are write-through and complete before the save resolves. `StagingService.listStaged` filters out items whose repo is in API mode, so:

- `stageStore.pendingCount` is 0 in API mode for API-only repos → floating button hidden.
- Stage screen shows no grouped items → per-group Push / Push-all absent.

In clone mode the button reappears for any queued mutation or unpushed clone-mode commit, exactly as before.