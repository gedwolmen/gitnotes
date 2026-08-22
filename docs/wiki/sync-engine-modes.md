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

## Large-repo preflight (#clone-crash-on-large)

Repos whose `repo.size` (KB, from the GitHub `GET /repos` payload) exceeds **`LARGE_REPO_THRESHOLD_KB = 200 MB`** are intercepted before `git.clone` is invoked:

- `RepoImportService.runImport` returns `{ ok: false, error, retryable: false, largeRepo: true }` with the actual repo size in the message.
- `SettingsScreen.importRepoAfterAdd` surfaces a confirmation alert offering **Use API** as a one-tap recovery.
- `GitFsService.clone` additionally catches `RangeError` (Hermes heap allocation failure) and `error.message` matching `out of memory|allocation failed|heap` and re-throws as `CloneOutOfMemoryError`, which `runImport` maps to `largeRepo: true`.

This prevents the OOM during packfile indexing that would otherwise leave the app on the splash screen with no recovery path.

## Default mode change (PR #N)

Changed from `'api'` to `'clone'`. Existing users with no stored mode preference silently switch to clone mode. Users who explicitly enabled clone keep their entry; users who explicitly switched to API keep their override.

## Push-button visibility

The push button (floating cloud-upload FAB and per-group Push button on the Staged Changes screen) is only meaningful in **clone mode** — API mode writes are write-through and complete before the save resolves. `StagingService.listStaged` filters out items whose repo is in API mode, so:

- `stageStore.pendingCount` is 0 in API mode for API-only repos → floating button hidden.
- Stage screen shows no grouped items → per-group Push / Push-all absent.

In clone mode the button reappears for any queued mutation or unpushed clone-mode commit, exactly as before.