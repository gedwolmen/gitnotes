# Services Reference

> Every service file in `src/services/` catalogued with its purpose. Grouped by domain. See [Architecture](./architecture.md) for how these fit together.

## Git / Clone Operations (`src/services/git/`)

### Host Services

| File | Purpose |
|------|---------|
| `GitHost.ts` | Core host interface — abstract interface defining clone/push/pull/fetch/commit operations. All host services implement this. |
| `GitHubHostService.ts` | GitHub-specific implementation of GitHost. Handles GitHub API authentication, rate limits, and GitHub-specific sync logic. |
| `GitLabService.ts` | GitLab-specific implementation of GitHost. Handles GitLab API authentication and GitLab sync logic. |
| `GiteaLikeHostService.ts` | Gitea/Forgejo implementation of GitHost. Handles Gitea-compatible API authentication and sync logic. |
| `HostService.ts` | Factory/registry for GitHost implementations. Resolves which host service to use based on repo URL. |
| `activeHost.ts` | Tracks the currently active host service for the selected repository. |

### Core Git Operations

| File | Purpose |
|------|---------|
| `CommitService.ts` | Creates git commits with metadata (author, message, timestamp). Handles commit message generation. |
| `BatchGitOperations.ts` | Batches multiple git operations (stage, commit, push) for efficiency. Reduces round-trips. |
| `GitFsService.ts` | Git filesystem operations — read/write files in working tree, list directory contents. |
| `LocalGitWriter.ts` | Writes changes to the local working tree and stages them for commit. Coordinates with CloneSyncService. |
| `GitSyncGate.ts` | Gate/keeper that prevents concurrent sync operations. Ensures push/pull don't race each other. |
| `LfsService.ts` | Git LFS (Large File Storage) support — tracks LFS pointers, handles LFS file uploads/downloads. |
| `GitHttp.ts` | Low-level HTTP transport for Git smart protocol over HTTP/HTTPS. |

### Branch & Repo Management

| File | Purpose |
|------|---------|
| `resolveBranch.ts` | Resolves which branch to sync to based on repo config, user preference, and conflict state. Re-exports from `branchResolver.ts`. |
| `RepoRemovalCascade.ts` | Handles complete removal of a cloned repository — deletes files, clears caches, removes from store. |
| `RepoAccessPreflight.ts` | Pre-flight checks before granting access to a repo — verifies credentials, permissions, API availability. |

### Sync & Recovery

| File | Purpose |
|------|---------|
| `Recovery.ts` | Detects and recovers from corrupted git state, stranded commits, and partial sync failures. |
| `SyncFailure.ts` | Classifies sync failures (network, auth, conflict, corruption) and routes to appropriate recovery. |
| `SyncTiming.ts` | Timing/throttling for sync operations — enforces minimum intervals between pushes, debounces rapid changes. |
| `StrandedCommits.ts` | Detects commits that exist in the local repo but are not connected to the current branch head. |
| `MultiRepoGitOps.ts` | Coordinates sync operations across multiple repositories simultaneously. |
| `ManualSync.ts` | User-triggered manual sync (pull, push, full reload). Bypasses automatic sync triggers. |
| `DeleteFailures.ts` | Tracks and retries failed file deletions. Handles cases where delete fails due to permissions or lock. |
| `RetryDeleteFailure.ts` | Retries delete operations that failed due to transient errors (network timeout, file locked). |
| `DefaultsPolicy.ts` | Defines default sync policy when no per-repo override exists — default mode, push frequency, conflict behavior. |

### Migration & Progress

| File | Purpose |
|------|---------|
| `CloneMigrationService.ts` | Migrates old-style cloned repos to the current GitEngine format. Handles schema upgrades. |

## Canvas (`src/services/canvas/`)

| File | Purpose |
|------|---------|
| `AtlasComposer.ts` | Composes multiple canvas tiles into a single canvas document. Handles tile layout and z-ordering. |
| `SparseTileService.ts` | Manages sparse tile storage — only stores tiles that have content, not empty space. |
| `CanvasVisionService.ts` | Vision/AI capabilities for canvas — OCR, object detection, smart tile placement. |
| `TilePersistenceService.ts` | Persists individual canvas tiles to disk/cache. Handles tile serialization and deserialization. |
| `VisionCapabilityChecker.ts` | Checks device capability for vision features (ONNX runtime availability, memory). |
| `RecognizedTextService.ts` | Extracts and indexes text recognized from canvas images via OCR. |
| `VisionResponseParser.ts` | Parses AI/vision model responses into structured canvas data (shapes, text, connections). |
| `HotspotGrid.ts` | Manages interactive hotspot grid on canvases — regions that trigger actions when tapped. |
| `AtlasEncoder.ts` | Encodes canvas data to/from the atlas format used for storage and transmission. |

## Documents (`src/services/documents/`)

> **Local-first architecture:** Files are the source of truth. `DocumentIndex` is a SQLite mirror of frontmatter metadata for fast listing/search — no document bodies are stored in SQLite.

| File | Purpose |
|------|---------|
| `DocumentService.ts` | Core local-first document service. Creates/reads/updates/deletes files with YAML-ish frontmatter (`---` delimiter). All note content is a plain file on disk. |
| `WorkingTreeDocumentService.ts` | Document operations scoped to the current git working tree. |
| `DocumentIndex.ts` | SQLite index of document metadata (id, title, folder, tags, timestamps). Used for fast listing, folder tree, tag autocomplete, and search without reading file bodies. |

## Sync (`src/services/`)

| File | Purpose |
|------|---------|
| `CloneSyncService.ts` | Clone mode sync — writes files to working tree, stages via GitEngine, triggers push. Implements commit-on-save pattern. |
| `NoteSyncQueueService.ts` | Queues note mutations when offline. Drains queue when connectivity returns. |
| `BackgroundSyncService.ts` | OS background task for sync — runs when app is backgrounded, syncs up to 50 files. |
| `ForegroundSyncService.ts` | Active sync when app is in foreground — monitors file changes, triggers incremental sync. |
| `SyncEngineService.ts` | Central sync orchestrator — manages mode (clone vs API), per-repo overrides, sync scheduling. |
| `RepoFileSyncService.ts` | Syncs individual files to/from the repo — handles note files, attachment files, canvas files. |
| `RepoPullService.ts` | Pulls changes from remote — fetch + merge/rebase into local working tree. |

## GitHub Sync (`src/services/`)

| File | Purpose |
|------|---------|
| `NoteGitHubSyncService.ts` | Syncs note content to GitHub — handles note-to-file mapping, conflict detection. |
| `TodoGitHubSyncService.ts` | Syncs todo items to GitHub issues/checklists. Maps todos to GitHub issue comments. |
| `CanvasGitHubSyncService.ts` | Syncs canvas data (tiles, hotspots) to GitHub as JSON or image attachments. |
| `TemplateGitHubSyncService.ts` | Syncs templates to GitHub — imports/exports note templates from the repo. |
| `ThoughtDumpService.ts` | Captures rapid thought dumps and syncs them as notes. Batch-optimized for quick capture. |
| `TemplateRepoPreferenceService.ts` | Stores per-repo template preferences in GitHub Gist or repo config. |
| `ThoughtDumpRepoPreferenceService.ts` | Stores per-repo thought dump preferences. |

## Parsers (`src/services/`)

| File | Purpose |
|------|---------|
| `NeorgParser.ts` | Parses `.norg` Neorg format notes into Note model. Handles todo items, headings, links. |
| `NeorgContentParser.ts` | Parses Neorg document content blocks (paragraphs, lists, quotes). |
| `NeorgLinkParser.ts` | Parses Neorg `[[wiki-links]]` and `[[#anchors]]`. Resolves link targets. |
| `OrgContentParser.ts` | Parses Org mode (`.org`) files into Note model. Handles org headlines, properties, deadlines. |
| `OrgInlineParser.ts` | Parses inline Org elements — bold, italic, code, links within Org documents. |
| `NeorgInlineParser.ts` | Parses inline Neorg elements — bold, italic, code, links within Neorg documents. |

## AI (`src/services/ai/`)

| File | Purpose |
|------|---------|
| `providerFactory.ts` | Factory for AI providers (Anthropic, OpenAI-compatible, Apple Intelligence, Llama on-device). Configures model defaults, rate limits, and token budgets. |
| `providerAvailability.ts` | Probes provider availability — configured, credentials valid, quota remaining. |
| `config.ts` | AI service configuration — API base URLs, default models per provider. |
| `modelLimits.ts` | Token and rate limits per AI model. |
| `thoughtDumpIndexing.ts` | Indexes thought dumps for chat recall. |
| `AIMemoryIndexService.ts` | In-memory index for AI chat context. |
| Other AI services | Tool execution (`tools.ts`), system prompts (`systemPrompt.ts`), action execution (`actionExecutor.ts`). |

## Top-Level Services

| File | Purpose |
|------|---------|
| `AuthService.ts` | Handles app authentication (biometric, PIN). Manages auth state and lock screen. |
| `OnboardingService.ts` | Manages first-run onboarding flow — repo selection, initial clone, preferences. |
| `StorageService.ts` | Wraps AsyncStorage for app preferences and local settings. |
| `RevenueCatService.ts` | RevenueCat SDK wrapper — configures StoreKit 2, handles purchases, entitlements, customer info. |
| `PushNotificationService.ts` | Registers for and handles push notifications from GitHub (PR mentions, sync alerts). |
| `NotificationService.ts` | Local notification scheduling and delivery — reminders, sync reminders, conflict alerts. |
| `DailyQuoteService.ts` | Serves the daily philosopher quote from `src/data/philosopher_quotes.json`. |
| `ChatStorageService.ts` | Persists AI chat threads and messages locally. |
| `BacklinksService.ts` | Computes and caches backlinks — notes that link to the current note via `[[wiki-links]]`. |
| `ExportService.ts` | Exports notes/canvases to PDF, plain text, JSON, or GitHub-flavoured Markdown. |
| `ShareService.ts` | Native share sheet integration — share notes via iOS/Android share UI. |
| `TemplateService.ts` | Manages note templates — create from template, template metadata, template storage. |
| `TierLimits.ts` | Enforces per-tier feature limits (free vs Pro). Checks entitlement before Pro features. |
| `PaywallAnalytics.ts` | Tracks paywall events in RevenueCat — impressions, purchase attempts, outcomes, restores. |
| `ReminderService.ts` | Schedules and fires local notifications for note/todo reminders. |
| `RenderStyleService.ts` | Manages render style preferences (markdown vs rich text vs plaintext). |
| `FeatureFlags.ts` | Feature flag provider — enables/disables features per user, cohort, or experiment. |
| `http.ts` | GitHub API axios instance — handles auth headers (Bearer token), timeouts (120s), and request auth overrides for the GitHub API. |

## See Also

- [Architecture](./architecture.md) — How these services fit together
- [Sync Architecture](./sync-architecture.md) — Clone vs API sync modes
- [Stores](./stores.md) — State managed by these services
