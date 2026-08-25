# Architecture

> GitNotēs project structure and key modules.

## Overview

GitNotēs is a React Native (Expo) note-taking app with **Git sync** (isomorphic-git), **AI assistance** (Vercel AI SDK), and **offline-first design** (AsyncStorage).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 56, React Native 0.85 |
| Language | TypeScript 6 (strict mode) |
| State | Zustand (stores), React Context |
| Styling | NativeWind v5 (Tailwind) |
| Navigation | React Navigation v7 |
| Git | isomorphic-git |
| AI | Vercel AI SDK v6 |
| Storage | AsyncStorage, expo-secure-store |
| i18n | i18next (6 languages) |
| Animations | Reanimated 4 |
| Testing | Jest, React Native Testing Library |

## Key Modules

### `src/services/`

Business logic layer (top-level + subdirectories):

- `AIService.ts` — Vercel AI SDK integration (`buildProviderInstance`, `initializeModel`)
- `AuthService.ts` — Git-host token storage + multi-host switching
- `AccountStorage.ts` — Multi-account persistence
- `DailyQuoteService.ts` — Philosopher quote generation with AI personalization
- `ExportService.ts` — Export notes (Markdown, PDF, share sheet)
- `RepoImportService.ts`, `RepoPullService.ts` — Import + pull from remote
- `NoteGitHubSyncService.ts`, `TodoGitHubSyncService.ts`, `CanvasGitHubSyncService.ts`, `TemplateGitHubSyncService.ts` — Per-entity Git sync
- `NoteSyncQueueService.ts`, `SyncEngineService.ts` — Sync queue + mode registry
- `BackgroundSyncService.ts`, `ForegroundSyncService.ts` — OS background task + foreground sync loop (background is pull-only)
- `CommitService.ts` (in `git/`) — Clone-mode commit-on-save; produces local git commit with `push:false`
- `UnpushedCommitsService.ts` (in `git/`) — Tracks commits between local `HEAD` and remote `origin/<branch>`; exposes count + per-commit summaries
- `LocalGitWriter.ts` (in `git/`) — Clone-mode write/commits/push
- `StagingService.ts` (in `git/`) — **[DEPRECATED]** clone-mode staging; replaced by `CommitService`
- `StagePushScheduler.ts` — **[REMOVED]** idle-push window; replaced by `UnpushedCommitsService` + explicit push triggers
- `ConflictResolverService.ts`, `AiConflictResolver.ts` (in `conflict/`) — 3-way merge + AI assist
- `AtlasComposer.ts`, `AtlasEncoder.ts`, `SparseTileService.ts` (in `canvas/`) — Sparse-tile canvas persistence
- `providerFactory.ts`, `modelLimits.ts`, `anthropicDefaults.ts` (in `ai/`) — AI provider registry

### `src/stores/`

Zustand stores:

- `noteStore.ts` — Active note state, drafts
- `todoStore.ts` — Todo items
- `canvasStore.ts` — Canvas state
- `chatStore.ts` — AI chat threads/messages
- `repoStore.ts` — Selected repository + multi-host registry
- `folderStore.ts` — Folder tree
- `templateStore.ts` — User-defined note templates
- `renderStyleStore.ts` — Custom Markdown render styles
- `draftStore.ts` — Edit drafts
- `reminderStore.ts` — Note reminders
- `conflictStore.ts` — Unresolved merge conflicts
- `stageStore.ts` — Stage-then-push queue + push progress
- `gitOperationStore.ts` — Per-repo/per-path busy locks
- `githubActivityStore.ts` — GitHub activity feed
- `aiStore.ts`, `aiHubStore.ts` — AI providers, model selection
- `proStore.ts` — Pro tier state (RevenueCat)
- `themeStore.ts` — Theme mode (light/dark/system)

### `src/hooks/`

Custom hooks:

- `useDailyQuote.ts` — Daily quote with cache and refresh
- `useEntityList.ts`, `useEntityFilter.ts`, `useNoteTags.ts` — Generic note/todo list filtering
- `useNetworkStatus.ts` — `NetInfo` wrapper
- `useBackgroundSync.ts` — Background sync task trigger
- `useForegroundSyncHealth.ts`, `useForegroundSyncSettings.ts` — Foreground sync introspection
- `useGitHostQueries.ts`, `useGitHubQueries.ts` — Git host data queries
- `useProviderAvailability.ts` — AI provider runtime availability
- `useProGate.ts`, `useProScreenGuard.ts` — Pro tier gate enforcement
- `useUndoRedo.ts` — Editor undo/redo with concurrent-save guard
- `useSafeBack.ts` — Header-back with deep-link safety
- `useResponsive.ts` — Shared `Dimensions` subscription
- `useRecognitionIndexing.ts`, `useLongPressForVision.ts` — Canvas vision helpers
- `useHardWrap.ts` — Hard-wrap text editor

### `src/contexts/`

React contexts:

- `ThemeContext.tsx` — Theme colors, mode, tokens
- `NoteContext.tsx` — Active note, unsaved changes
- `TodoContext.tsx` — Active todo
- `CanvasContext.tsx` — Canvas state
- `FolderContext.tsx` — Folder navigation
- `RepoContext.tsx` — Active repository + sync mode
- `AccountsContext.tsx`, `AuthContext.tsx` — Multi-account/token state
- `GitHubAuthContext.tsx`, `HostAuthContext.tsx` — Per-host auth
- `BacklinksContext.tsx` — Wiki-link backlinks
- `BiometricLockContext.tsx` — Face/Touch ID lock
- `ViewModeContext.tsx` — List/grid view toggle

### `src/screens/`

Screen components:

- `HomeScreen.tsx` — Recent + pinned feed
- `NotesListScreen.tsx`, `NoteEditorScreen.tsx` — Note CRUD
- `TodoListScreen.tsx` — Todo CRUD
- `CanvasListScreen.tsx`, `CanvasEditorScreen.tsx` — Canvas CRUD
- `ChatScreen.tsx`, `ChatThreadListScreen.tsx` — AI chat
- `SettingsScreen.tsx` — App settings + AI config
- `StageScreen.tsx` — **[DEPRECATED]** Stage-then-push UI; replaced by `PushScreen`
- `PushScreen.tsx` — Unpushed commits + Push / Push-all with diff review
- `SyncStatusScreen.tsx` — Sync health row
- `PaywallScreen.tsx` — StoreKit 2 paywall
- `OnboardingScreen.tsx` — First-run onboarding
- `ConflictResolverScreen.tsx` — 3-way merge UI
- `ExploreScreen.tsx` — Repo browse (files, PRs, issues, branches)
- `GraphViewScreen.tsx` — Backlink graph
- `TemplateManagerScreen.tsx` — Note template CRUD
- `RenderStyleSettingsScreen.tsx`, `RenderStyleEditorScreen.tsx` — Render style CRUD
- `ThoughtDumpScreen.tsx` — Quick capture
- `FileViewerScreen.tsx`, `ImageViewerScreen.tsx`, `PdfViewerScreen.tsx`, `VideoViewerScreen.tsx` — File viewers

## Data Flow

### Note Creation

```
User types in editor
  → NoteEditorScreen state (local)
  → repoStore.saveNote() (AsyncStorage + dirty mark)
  → Stage-or-queue: clone mode → LocalGitWriter.writeAndCommit
                   API mode   → NoteSyncQueueService.enqueue
  → StagePushScheduler drains on the 3-min idle window, on the
    Stage screen's Push / Push-all, on a long-press of the floating
    push button, or on the OS background task (≤ 10 files)
```

### AI Chat

```
User sends message
  → ChatScreen state
  → AIService.chat(messages, provider)
  → Vercel AI SDK (streamText) via providerFactory
  → Token budget check (modelLimits.ts)
  → Provider selection (AIProviderType: apple | llama | openai-compatible | anthropic)
  → Stream response to UI
```

### Daily Quote

```
HomeScreen mounts
  → useDailyQuote() hook
  → Check cache (cacheKey + Date.now())
  → If stale: DailyQuoteService.fetchQuote()
    → Check aiPersonalizationEnabled
    → If disabled: return generic quote from src/data/philosopher_quotes.json
    → If enabled: generate with AI (journals context)
  → Update cache (AsyncStorage)
  → Render DailyQuoteCard
```

## State Management

| Store | Purpose | Persistence |
|-------|---------|-------------|
| `aiStore`, `aiHubStore` | AI settings | AsyncStorage + SecureStore (API keys) |
| `noteStore` | Active note + drafts | AsyncStorage |
| `todoStore` | Todo items | AsyncStorage |
| `canvasStore` | Canvas state | AsyncStorage |
| `chatStore` | AI chat threads | AsyncStorage |
| `repoStore` | Multi-host repo registry + sync mode | AsyncStorage + SecureStore |
| `folderStore` | Folder tree | AsyncStorage |
| `templateStore` | Note templates | AsyncStorage |
| `renderStyleStore` | Markdown render styles | AsyncStorage |
| `draftStore` | Unsaved drafts | AsyncStorage |
| `reminderStore` | Note reminders | AsyncStorage + Notifications |
| `conflictStore` | Unresolved merge conflicts | AsyncStorage |
| `stageStore` | Stage-then-push queue + push progress | AsyncStorage |
| `gitOperationStore` | Per-repo/per-path busy locks | in-memory |
| `githubActivityStore` | GitHub activity feed | AsyncStorage |
| `proStore` | Pro tier state | SecureStore + RevenueCat |
| `themeStore` | Theme mode | AsyncStorage |

## Offline Strategy

1. **Write to AsyncStorage first** (fast, reliable)
2. **Clone mode: commit-on-save via `CommitService`** — every save produces a local git commit with `push:false`; tracked by `UnpushedCommitsService`
3. **API mode: queue via `NoteSyncQueueService`** — pushes immediately on save (write-through)
4. **Explicit push** — user triggers push via `FloatingPushButton` (long-press) or `PushScreen` (Push / Push-all with diff review); no automatic staging drain
5. **OS background task** — `BackgroundSyncService` drains ≤ 10 unpushed files when policy fires; pull-only on foreground idle
6. **Pull on app focus** — `ForegroundSyncService.runPull` checks `NetInfo`, app state, and pull intervals
7. **Resolve conflicts** — `ConflictResolverService` (3-way merge) with optional AI assist via `AiConflictResolver`
