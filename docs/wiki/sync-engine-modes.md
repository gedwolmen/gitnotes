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

**Clone mode is disabled for repos above `LARGE_REPO_THRESHOLD_KB = 100 MB`.** A large repo OOMs Hermes natively during packfile download/indexing (`hermesvm: GCBase::oom` → SIGABRT) or hangs the main thread past the iOS watchdog (`0x8BADF00D` SIGKILL) — neither is catchable in JS. The only safe behavior is to never attempt the clone:

- **At add time:** if the picker's `repo.size` (KB) exceeds the threshold, the repo is added **directly in API mode** (`SyncEngineService.setMode(repo, 'api')` before import), so the import runs the pull-only API path and never the clone path.
- **At the API → Clone toggle:** `SettingsScreen.handleEnableCloneMode` looks up the repo size via `GitHubService.getRepositorySize(owner, repo)` before cloning. If it exceeds the threshold, clone is refused with an alert (largeRepoCloneBlockedBody) recommending API mode.
- **Manual add (no size in hand):** `importRepoAfterAdd` resolves the size via `getRepositorySize` when the caller didn't supply it, so the `runImport` guard still refuses the clone.
- **Backstop:** `RepoImportService.runImport` returns `{ ok: false, error, retryable: false, largeRepo: true }` and `GitFsService.clone` re-throws `CloneOutOfMemoryError` for the OOM case that JS can catch.

This prevents both crash modes (Hermes OOM SIGABRT and watchdog SIGKILL) during packfile indexing.

## Default mode change (PR #N)

Changed from `'api'` to `'clone'`. Existing users with no stored mode preference silently switch to clone mode. Users who explicitly enabled clone keep their entry; users who explicitly switched to API keep their override.

## Clone mode

Clone mode uses a **commit-on-save** architecture: every user change is committed locally as a git commit with `push:false` at save time, then pushed to GitHub through explicit user action or idle timers.

### Commit on save

`CommitService.commit()` creates a local git commit with `push:false` via `LocalGitWriter` on every save. The commit is atomic (one per mutation) and includes the full diff of changed content. Nothing reaches GitHub at save time — the commit exists only in the local clone.

### Tracking unpushed commits

`UnpushedCommitsService` tracks commits that have been created locally but not yet pushed:

- `count()` — returns the number of unpushed commits per repo (drives the floating button badge)
- `list()` — returns commit metadata (sha, message, author, timestamp) for the PushScreen history
- `listFiles()` — returns the list of files changed in unpushed commits for the per-commit diff view

### Push UI

**`FloatingPushButton`** — the cloud-upload FAB shown in the bottom-right corner of the app. Press-and-hold triggers an immediate push of all unpushed commits. The badge count comes from `UnpushedCommitsService.count()`.

**`PushScreen`** — the Staged Changes screen showing per-commit diffs. Each commit row shows the list of changed files; tapping a row expands the diff. Per-commit **Push** and **Push-all** buttons trigger push for individual commits or all unpushed commits respectively.

### Push triggers

A commit is pushed to GitHub when ONE of these fires:

1. **Press-and-hold** the floating push button — immediate push of all unpushed commits
2. **Push / Push-all** button on the PushScreen — per-commit or bulk push
3. **3-minute foreground idle** — `StagePushScheduler` pushes automatically when the app has been in the foreground for 3 minutes without user interaction and there are unpushed commits
4. **OS background task** — small sets (≤ 10 files) are pushed by the background sync job

> **Deprecated:** The term "stage-then-push" is deprecated. The architecture is commit-on-save, not stage-then-push. The stage concept (staging area before commit) is an implementation detail of `LocalGitWriter` and is not user-facing. The user-facing concept is **unpushed commits**, not staged changes.