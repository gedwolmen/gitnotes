# Sync Engine Modes

> Per-repo selection between full working-tree clone and GitHub Contents API.

## Overview

Each repository can independently operate in one of two sync modes:

| Mode | Transport | Storage | Offline | Default |
|------|-----------|---------|---------|---------|
| **clone** | Full git clone via `isomorphic-git` | Local working tree under `FileSystem.documentDirectory` | Yes | ✅ |
| **api** | GitHub Contents API (per-file GET/PUT) | In-memory + AsyncStorage | No | |

**Clone mode is the default.** Users who need lightweight per-file sync without a local clone can switch a repo to API mode from Settings → Sync Engine.

## How mode is stored

- `SyncEngineService` (`src/services/SyncEngineService.ts`) manages a per-repo `ModeMap` in AsyncStorage under the key `@gitnotes:sync_engine_modes`.
- `DEFAULT_MODE = 'clone'`. Only repos that have been explicitly switched to API mode store an entry. Repos with no stored entry use the default (clone).
- `setMode(path, 'clone')` removes the stored entry (no-op for the default). `setMode(path, 'api')` persists the override.

## Mode consumers

Every service that performs git I/O calls `SyncEngineService.getMode(repoPath)` and branches on `=== 'clone'`:

| Consumer | Path |
|----------|------|
| `RepoPullService.getRepoReader` | Selects clone reader vs API reader |
| `StagingService.listOverrides` | Groups repos for batch push |
| `NoteGitHubSyncService` | Selects sync transport per file |
| `NoteSyncQueueService` | Determines queue routing |
| `CanvasGitHubSyncService` | Canvas sync transport |
| `TodoGitHubSyncService` | Todo sync transport |
| `TemplateGitHubSyncService` | Template sync transport |

## Switching modes

### Clone → API

1. Settings → Sync Engine → tap "Use API" on the repo.
2. Confirmation alert warns that API mode is experimental and not stable.
3. The local clone is removed (`GitFsService.removeRepo`).
4. Mode is persisted as `'api'`.

### API → Clone

1. Settings → Sync Engine → tap "Clone" on the repo.
2. A progress modal shows clone progress.
3. Optional LFS migration prompt if the repo has LFS objects.
4. Mode entry is deleted (falls back to default `'clone'`).

## API mode warning

When a user switches to API mode, a post-switch alert warns that API mode is experimental and recommends clone mode. This alert is localized across all supported languages (EN, ES, KO, FR, DE, JA).

## Default mode change (PR #N)

Changed from `'api'` to `'clone'`. Existing users with no stored mode preference silently switch to clone mode. Users who explicitly enabled clone keep their entry; users who explicitly switched to API keep their override.
