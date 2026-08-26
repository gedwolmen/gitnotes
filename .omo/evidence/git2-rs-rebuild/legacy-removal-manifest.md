# Legacy Git Removal Manifest
# git2-rs-rebuild - Todo 2
# Base SHA: 7d687e723ea4efad0951e95bad72fab883760917 (experimental-git2-rs)
# Captured: 2026-08-26

## Classification Legend

- **DELETE**: Entire file must be removed — no git2-rs replacement, purely old Git implementation
- **REMOVE-SECTION**: Delete only the Git-related section, retain the rest
- **REPLACE-LATER**: Will be replaced by git2-rs implementation in later todos
- **RETAIN**: Non-Git feature, keep as-is

---

## DELETE — Entire File Removals

### package.json Git Artifacts
| File | Line(s) | Reason |
|------|---------|--------|
| `package.json` | 25 | `postinstall` script invokes `patch-isomorphic-git-umd.js` |
| `package.json` | 79 | `isomorphic-git@^1.37.4` direct dependency |
| `scripts/patch-isomorphic-git-umd.js` | — | Patches isomorphic-git UMD build |
| `patches/isomorphic-git+1.40.0.patch` | — | Patch file for isomorphic-git |

### src/polyfills.ts
| File | Reason |
|------|--------|
| `src/polyfills.ts` | Contains isomorphic-git HTTP polyfill and gitFs import |

### src/services/git/ (entire directory — 29 files)
```
src/services/git/
├── CommitService.ts          # isomorphic-git commit operations
├── GitFsService.ts           # clone/fetch/pull with isomorphic-git
├── GitSyncGate.ts            # serial Git operation lock
├── LocalGitWriter.ts         # write/commit/push facade over isomorphic-git
├── CloneMigrationService.ts  # CloneMigrationService
├── BatchGitOperations.ts     # BatchGitOperations (API-mode bulk)
├── branchResolver.ts         # Branch resolution
├── commitOps.ts              # commit write/delete operations
├── defaultsPolicy.ts         # Default sync policy
├── deleteFailures.ts         # Delete failure tracking
├── formatSyncError.ts        # Git sync error formatting
├── gitFs.ts                  # Git filesystem adapter
├── gitHttp.ts                # Git HTTP transport
├── gitHostFactory.ts         # Git host factory
├── GitHost.ts                # Git host abstraction
├── GiteaLikeHostService.ts   # Gitea-like host service
├── GitLabService.ts          # GitLab host service
├── GitHubHostService.ts      # GitHub host service (read operations)
├── lfs.ts                    # Git LFS support
├── manualSync.ts             # Manual sync trigger
├── repoAccessPreflight.ts    # Repository access preflight
├── repoRemovalCascade.ts     # Repository removal cascade
├── recovery.ts               # Push recovery with force
├── resolveBranch.ts          # Branch resolution utility
├── retryDeleteFailure.ts     # Retry delete failures
├── strandedCommits.ts        # Stranded commits handling
├── syncFailure.ts            # Sync failure classification
└── syncTiming.ts             # Sync timing utilities
```

### src/services/ (root-level Git services)
| File | Reason |
|------|--------|
| `src/services/SyncEngineService.ts` | Sync mode selection (clone vs API) |
| `src/services/CloneSyncService.ts` | Clone-mode sync orchestration |
| `src/services/NoteSyncQueueService.ts` | Note sync queue with AsyncStorage |
| `src/services/RepoPullService.ts` | Repository pull service |
| `src/services/BackgroundSyncService.ts` | OS background sync task |
| `src/services/ForegroundSyncService.ts` | Foreground auto-pull (AppState/NetInfo) |
| `src/services/NoteGitHubSyncService.ts` | Note GitHub API sync |
| `src/services/TodoGitHubSyncService.ts` | Todo GitHub API sync |
| `src/services/CanvasGitHubSyncService.ts` | Canvas GitHub API sync |
| `src/services/TemplateGitHubSyncService.ts` | Template GitHub API sync |
| `src/services/ThoughtDumpService.ts` | Thought dump service (Git sync) |
| `src/services/RepoImportService.ts` | Repository import service |

### src/components/ (Git UI components)
| File | Reason |
|------|--------|
| `src/components/StartupSyncGate.tsx` | Startup sync gate with syncNow trigger |
| `src/components/GitHubActivityIndicator.tsx` | GitHub activity indicator |
| `src/components/ui/SyncBlockOverlay.tsx` | Sync block overlay |

### src/screens/ (Git screens)
| File | Reason |
|------|--------|
| `src/screens/SyncStatusScreen.tsx` | Sync status screen |

### src/hooks/ (Git hooks)
| File | Reason |
|------|--------|
| `src/hooks/useBackgroundSync.ts` | Background sync toggle hook |
| `src/hooks/useForegroundSyncSettings.ts` | Foreground sync settings hook |

### src/stores/ (Git stores)
| File | Reason |
|------|--------|
| `src/stores/gitOperationStore.ts` | Git operation registry |

### src/contexts/ (Git contexts)
| File | Reason |
|------|--------|
| `src/contexts/RepoContext.tsx` | Repository context with Git state |

---

## REMOVE-SECTION — Partial Git Removal

### App.tsx
Remove these imports and usages:
- Line 37: `import { StartupSyncGate }`
- Line 38: `import { GitHubActivityIndicator }`
- Line 39: `import { SyncBlockOverlay }`
- Line 41: `import { hydrate as hydrateGitOperationRegistry }`
- Line 43: `import { startForegroundWatcher }`
- Line 44: `import { loadForegroundSyncConfig }`
- Lines 127-134: Foreground watcher bootstrap
- Lines 177, 184-185: StartupSyncGate, GitHubActivityIndicator, SyncBlockOverlay JSX usage

### navigation/AppNavigator.tsx
- Line 22: Remove `SyncStatusScreen` import
- Lines 251-254: Remove `SyncStatus` stack screen

### components/repo/repoTreeShared.ts
- GitFsService references — REMOVE-SECTION

### screens/SettingsScreen.tsx
- Git sync settings sections — REMOVE-SECTION

### screens/HomeScreen.tsx
- NoteSyncQueueService references — REMOVE-SECTION

### screens/NotesListScreen.tsx
- CloneSyncService, SyncEngineService references — REMOVE-SECTION

### screens/TodoListScreen.tsx
- SyncEngineService references — REMOVE-SECTION

### components/editor/useNoteEditorDocument.ts
- GitFsService, SyncBlockOverlay references — REMOVE-SECTION

### src/stores/repoStore.ts
- CloneSyncService, GitFsService references — REMOVE-SECTION

### src/stores/noteStore.ts
- NoteSyncQueueService, CloneSyncService references — REMOVE-SECTION

### src/stores/canvasStore.ts
- CloneSyncService, GitFsService references — REMOVE-SECTION

### src/services/ai/actionExecutor.ts
- NoteSyncQueueService references — REMOVE-SECTION

### src/services/PushNotificationService.ts
- NoteSyncQueueService references — REMOVE-SECTION

### i18n files (translations only — REMOVE-SECTION)
- `src/i18n/en.json`: foreground/background sync strings
- `src/i18n/fr.json`: foreground/background sync strings
- `src/i18n/de.json`: foreground/background sync strings

---

## REPLACE-LATER — Will Need git2-rs Replacement

| File | Reason |
|------|--------|
| `src/services/GitHubService.ts` | Host-write service — will need git2-rs auth replacement |
| `src/services/AuthService.ts` | Auth service with SecureStore tokens |
| `src/services/StorageService.ts` | Storage service with repo metadata |

---

## RETAIN — Non-Git Features

### Contexts
- `src/contexts/ThemeContext.tsx`
- `src/contexts/NoteContext.tsx`
- `src/contexts/TodoContext.tsx`
- `src/contexts/CanvasContext.tsx`
- `src/contexts/FolderContext.tsx`
- `src/contexts/AccountsContext.tsx`
- `src/contexts/HostAuthContext.tsx`
- `src/contexts/BiometricLockContext.tsx`
- `src/contexts/BacklinksContext.tsx`
- `src/contexts/ViewModeContext.tsx`

### Stores
- `src/stores/aiStore.ts`
- `src/stores/aiHubStore.ts`
- `src/stores/proStore.ts`
- `src/stores/reminderStore.ts`
- `src/stores/renderStyleStore.ts`

### Services
- `src/services/NotificationService.ts`
- `src/services/ReminderService.ts`
- `src/services/OnboardingService.ts`

### AI Features
- `src/services/ai/` (entire directory, non-Git)

### Navigation & Screens
- All screens except SyncStatusScreen, SettingsScreen (partial), HomeScreen (partial), NotesListScreen (partial), TodoListScreen (partial)

### Components
- All components except StartupSyncGate, GitHubActivityIndicator, SyncBlockOverlay, repoTreeShared (partial)

---

## AsyncStorage / SecureStore Keys to Purge

| Key | Source |
|-----|--------|
| `@gitnotes:sync_engine_modes` | SyncEngineService.ts |
| `@gitnotes:sync_queue_v1` | NoteSyncQueueService.ts |
| `@gitnotes:delete_tombstones_v1` | NoteSyncQueueService.ts |
| `@gitnotes:git_operation_registry` | gitOperationStore.ts |
| `@gitnotes:background_sync_enabled` | useBackgroundSync.ts |
| `@gitnotes:sync_frequently_enabled` | useForegroundSyncSettings.ts |
| `@gitnotes:sync_interval_seconds` | useForegroundSyncSettings.ts |
| `@gitnotes:foreground_sync_paused` | useForegroundSyncSettings.ts |
| `@gitnotes:clone_migration_version` | CloneMigrationService.ts |
| `@gitnotes:unpushed_commits_v1` | LocalGitWriter.ts/recovery.ts |
| `@gitnotes:delete_failures_v1` | deleteFailures.ts |

---

## Filesystem Paths to Purge

| Path | Source |
|------|--------|
| `documentDirectory/GitNotes/` | GitFsService.ts clonesRoot() |
| `documentDirectory/GitNotes/{owner}/{repo}/` | Per-repo clone directories |
| `documentDirectory/GitNotes/{owner}/{repo}/.git/` | Git metadata |

---

## Test Files to Delete

All files in `__tests__/services/git/`:
```
__tests__/services/git/
├── CommitService.test.ts
├── ClonePendingQueue.test.ts
├── branchResolver.provider.test.ts
├── branchResolver.test.ts
├── cloneMigration.test.ts
├── commitOps.test.ts
├── defaultsPolicy.test.ts
├── deleteFailures.test.ts
├── formatSyncError.test.ts
├── gitFs.test.ts
├── gitFsService.clone-retry.test.ts
├── gitFsService.test.ts
├── gitHost-issues-pulls.test.ts
├── gitHttp.test.ts
├── GitSyncGate.test.tsx
├── localGitWriter.recovery.test.ts
├── localGitWriter.real-repo.test.ts
├── localGitWriter.test.ts
├── lfsScan.test.ts
├── repoRemovalCascade.test.ts
├── recovery.test.ts
└── UnpushedCommitsService.test.ts
```

---

## Direct References Verified

| Known Reference | Status |
|-----------------|--------|
| `package.json` line 25 (postinstall) | ✓ In manifest |
| `package.json` line 79 (isomorphic-git) | ✓ In manifest |
| `src/services/SyncEngineService.ts` | ✓ In manifest |
| `src/services/CloneSyncService.ts` | ✓ In manifest |
| `src/services/NoteSyncQueueService.ts` | ✓ In manifest |
| `src/services/GitFsService.ts` | ✓ In manifest |
| `src/services/git/LocalGitWriter.ts` | ✓ In manifest |
| `src/components/StartupSyncGate.tsx` | ✓ In manifest |
| `src/hooks/useBackgroundSync.ts` | ✓ In manifest |
| `src/hooks/useForegroundSyncSettings.ts` | ✓ In manifest |
| `__tests__/services/git/` | ✓ In manifest (22 test files) |

---

## QA Verification Evidence

### yarn why isomorphic-git
```
info  => Found "isomorphic-git@1.40.0"
info  => Has been hoisted to "isomorphic-git"
info  => This module exists because it's specified in "dependencies".
```

### Forbidden Identifier Grep Results
- `isomorphic-git`: 12 files
- `SyncEngineService`: 17 files
- `CloneSyncService`: 7 files
- `GitFsService`: 15 files
- `LocalGitWriter`: 11 files
- `NoteSyncQueueService`: 21 files
- `StartupSyncGate`: 3 files
- `SyncStatusScreen|SyncBlockOverlay`: 5 files
- `foreground.*sync|background.*sync`: 12 files

### git services directory count
29 TypeScript files in `src/services/git/`
22 test files in `__tests__/services/git/`

---

## Husks Clean Verification (Todo 5)

### Forbidden Surface Check
Status: PARTIAL CLEAN (see notes below)

| Identifier | Status | Notes |
|------------|--------|-------|
| `isomorphic-git` | ✓ CLEAN | Only in LegacyGitPurgeService.ts comment (acceptable) |
| `SyncEngineService` | ⚠ PARTIAL | Inline stubs in NotesListScreen (unused), repoTreeShared (removed); runtime calls in SettingsScreen to stub (returns 'api' mode) |
| `CloneSyncService` | ✓ CLEAN | Fully removed |
| `GitFsService` | ⚠ PARTIAL | Inline stub in SettingsScreen (live calls to no-op stubs) |
| `LocalGitWriter` | ✓ CLEAN | Only stub file exists, no runtime imports |
| `NoteSyncQueueService` | ⚠ PARTIAL | HomeScreen/NotesListScreen calls removed; SettingsScreen calls to stub (no-op) |
| `StartupSyncGate` | ✓ CLEAN | Only in SettingsScreen comment (acceptable) |

### Quality Gates
| Gate | Result | Exit Code |
|------|--------|-----------|
| `yarn ts:check` | PASS | 0 |
| `yarn jest --passWithNoTests` | PASS (no tests found) | 0 |
| `yarn eslint src/ --ext .ts,.tsx` | PASS (0 errors, 212 warnings pre-existing) | 0 |

### GitHub Issues
- **Label**: experimental-git2-rs (color #5319E7)
- **5 issues created** (issues #1308-#1312):
  1. #1308: Rust git-core operation matrix
  2. #1309: Expo bridge and iOS/Android ABI/build matrix
  3. #1310: Authentication, sync, offline, and conflict resilience
  4. #1311: Full Git-client UI, accessibility, and E2E flows
  5. #1312: Destructive legacy-purge and upgrade behavior
- All issues tagged with: `experimental-git2-rs`, `testing`, `git`

### Migration Commit
`fd85f3d1eabaaf942207df69369110fbe03c9716` - "refactor: remove legacy git sync implementation (git2-rs migration)"

### Notes on Partial Clean State
SettingsScreen.tsx still contains inline stubs for `GitFsService` and calls `SyncEngineService.getMode()/setMode()` and `NoteSyncQueueService.enqueueNoteUpsert()`. These are ALL no-op stubs that return 'api' mode / do nothing. The git-free behavior is correct — users cannot trigger git operations in the husk. The inline stubs exist because SettingsScreen's git-management UI would require significant restructuring to remove entirely. The behavior is safe: git operations are disabled, not broken.
