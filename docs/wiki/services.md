# Services

> Service layer design and responsibilities.

## Overview

Services encapsulate business logic. They're React-independent, testable with Jest mocks, and called from hooks/components.

## Service Categories

### Data Services

| Service | Responsibility | Persistence |
|---------|---------------|-------------|
| `StorageService.ts` | Low-level storage abstraction | AsyncStorage |
| `StorageBootstrap.ts` | One-time store bootstrapping | AsyncStorage |
| `TemplateService.ts` | Note template CRUD | AsyncStorage |
| `TemplateMarkdownService.ts` | Template Markdown rendering | n/a |
| `TemplateRepoPreferenceService.ts` | Per-repo template selection | AsyncStorage |
| `RenderStyleService.ts` | Markdown render-style registry | AsyncStorage |
| `LastUsedRepoService.ts`, `LastSelectionPreferenceService.ts` | Recents / selections | AsyncStorage |
| `NoteFormatPreferenceService.ts` | Default note format per repo | AsyncStorage |
| `PositionMemoryService.ts` | Scroll-position memory | AsyncStorage |
| `BacklinksService.ts` | Wiki-link backlink index | in-memory + AsyncStorage |
| `JournalService.ts` | Journal entry management | AsyncStorage |
| `ContextService.ts` | Cross-entity context building | AsyncStorage |
| `OnboardingService.ts` | First-run onboarding state | AsyncStorage |
| `AccountStorage.ts` | Multi-account persistence | AsyncStorage |
| `ThoughtDumpService.ts` | Thought-dump persistence | AsyncStorage |
| `ThoughtDumpRepoPreferenceService.ts` | Per-repo thought-dump target | AsyncStorage |
| `ReminderService.ts` | Note reminders + notifications | AsyncStorage + Notifications |

### Sync & Git Services

| Service | Responsibility | Key Dependencies |
|---------|---------------|------------------|
| `SyncEngineService.ts` | Sync mode registry (`clone` / `api`) per repo | AsyncStorage |
| `NoteSyncQueueService.ts` | FIFO mutation queue with exponential backoff | AsyncStorage |
| `BackgroundSyncService.ts` | OS background-task entry point | `expo-background-task`, `expo-task-manager` |
| `ForegroundSyncService.ts` | App-focus / interval pull loop | `NetInfo`, `AppState` |
| `StagePushScheduler.ts` | 3-min idle-push window + explicit drain | AsyncStorage |
| `GitService.ts` | Clone-mode core (isomorphic-git facade) | `isomorphic-git` |
| `NoteGitHubSyncService.ts`, `TodoGitHubSyncService.ts`, `CanvasGitHubSyncService.ts`, `TemplateGitHubSyncService.ts` | Per-entity Git sync | Axios, Git |
| `RepoImportService.ts`, `RepoPullService.ts` | Import + pull from remote | `isomorphic-git` |
| `GitHubService.ts` | GitHub REST API client | Axios |
| `AuthService.ts` | Git-host token storage + multi-host switching | SecureStore |

### Git Subdirectory (`src/services/git/`)

| Service | Responsibility |
|---------|---------------|
| `LocalGitWriter.ts` | Clone-mode write/commit/push (`writeAndCommit`, `deleteAndCommit`) |
| `StagingService.ts` | Stage-then-push mutation staging (`stageUpdate`, `stageDelete`, `pushStaged`) |
| `GitFsService.ts`, `gitFs.ts` | Filesystem facade for isomorphic-git |
| `gitHttp.ts`, `http.ts` | Streaming `git-upload-pack` / `git-receive-pack` with cancel |
| `gitHostFactory.ts`, `GitHost.ts`, `activeHost.ts`, `branchResolver.ts`, `resolveBranch.ts` | Multi-host routing |
| `GitHubHostService.ts`, `GitLabService.ts`, `GiteaLikeHostService.ts` | Per-host implementations |
| `CloneMigrationService.ts` | One-time clone migration |
| `GitSyncGate.ts` | Sync-gate overlay coordination |
| `BatchGitOperations.ts` | Batched read/write helpers |
| `lfs.ts` | LFS pointer scan + smudge |
| `manualSync.ts` | Pull-to-refresh entry point |
| `repoAccessPreflight.ts` | Token / repo preflight |
| `repoRemovalCascade.ts` | Token-removal repo cascade |
| `formatSyncError.ts`, `syncFailure.ts` | Error normalization |
| `syncTiming.ts` | Timing instrumentation seam |
| `deleteFailures.ts`, `retryDeleteFailure.ts` | Durable delete-failure map |
| `featureFlags.ts` | Per-build feature flags |

### AI Services

| Service | Responsibility | Key Dependencies |
|---------|---------------|------------------|
| `AIService.ts` | Vercel AI SDK integration (`buildProviderInstance`, `initializeModel`) | `ai` SDK, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` |
| `DailyQuoteService.ts` | Philosopher quote generation | `AIService`, AsyncStorage |
| `ai/providerFactory.ts` | Provider registry and factory | `ai` SDK |
| `ai/providerAvailability.ts`, `ai/providerAvailabilityCopy.ts` | Runtime availability checks | per-provider |
| `ai/providerQuirks.ts` | Provider-specific workarounds | per-provider |
| `ai/modelLimits.ts` | Context window limits per provider | Provider metadata |
| `ai/anthropicDefaults.ts` | Anthropic constants + default models | `@ai-sdk/anthropic` |
| `ai/modelDiscoveryService.ts` | Lazy model discovery with caching | `@ai-sdk/anthropic` |
| `ai/AIMemoryIndexService.ts`, `ai/thoughtDumpIndexing.ts` | Thought-dump indexing | AsyncStorage |
| `ai/systemPrompt.ts` | Shared system prompts | n/a |
| `ai/tools.ts`, `ai/actionExecutor.ts` | AI tool-call surface | `ai` SDK |
| `ai/openrouterPreflight.ts` | OpenRouter preflight checks | `@ai-sdk/openai-compatible` |
| `ai/aiServiceErrors.ts` | Typed AI errors | n/a |
| `ai/config.ts` | AI feature flags / config | n/a |

### Canvas Services (`src/services/canvas/`)

| Service | Responsibility |
|---------|---------------|
| `AtlasComposer.ts`, `AtlasEncoder.ts` | Sparse-tile canvas atlas encode/decode |
| `SparseTileService.ts` | Tile persistence + retrieval |
| `TilePersistenceService.ts` | Tile flush chain |
| `RecognizedTextService.ts`, `CanvasVisionService.ts` | Vision pipeline |
| `VisionCapabilityChecker.ts` | Capability detection |
| `VisionResponseParser.ts` | Vision response parsing |
| `HotspotGrid.ts` | Hotspot layout |

### Conflict Services (`src/services/conflict/`)

| Service | Responsibility |
|---------|---------------|
| `ConflictResolverService.ts` | 3-way merge orchestrator |
| `AiConflictResolver.ts` | AI-assisted merge suggestions |
| `threeWayMerge.ts` | Pure merge primitives |
| `types.ts` | Conflict types |

### Auth / Paywall / Monetization

| Service | Responsibility |
|---------|---------------|
| `RevenueCatService.ts` | StoreKit 2 wrapper (trial / $3.99 mo / $39.99 lifetime) |
| `PaywallAnalytics.ts` | Impression + conversion telemetry |
| `GrandfatherService.ts` | Pre-Pro-tier user grandfathering |

### Utility / Export / Notifications

| Service | Responsibility | Dependencies |
|---------|---------------|--------------|
| `ExportService.ts` | Export notes (MD, PDF, share sheet) | `expo-sharing`, `expo-print` |
| `ShareService.ts` | OS share sheet | `expo-sharing` |
| `NotificationService.ts` | Local notifications | `expo-notifications` |
| `PushNotificationService.ts` | Push token registration | `expo-notifications` |
| `ChatStorageService.ts` | AI chat thread persistence | AsyncStorage |

> Online/offline detection lives in the `useNetworkStatus` hook (`@react-native-community/netinfo`), not in a dedicated service class.

## Service Patterns

### Singleton Pattern

Most services are singletons:

```typescript
class DailyQuoteService {
  async fetchQuote(): Promise<DailyQuote | null> {
    // ...
  }
}

export const dailyQuoteService = new DailyQuoteService();
```

### Error Handling

Services catch errors and return `null` or throw typed errors:

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error('DailyQuoteService error:', error);
  return null;
}
```

### Dependency Injection

Services use `useStore.getState()` for store access (avoids React dependency):

```typescript
class DailyQuoteService {
  async fetchQuote() {
    const aiStore = useAIStore.getState();
    // ...
  }
}
```

## Service Testing

```typescript
// __tests__/services/DailyQuoteService.test.ts

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    textStream: (async function* () { yield 'response'; })(),
  })),
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: jest.fn(() => ({
    getState: jest.fn(() => ({
      aiPersonalizationEnabled: true,
    })),
  })),
}));

describe('DailyQuoteService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-13T12:00:00Z'));
    jest.clearAllMocks();
  });

  it('returns cached quote', async () => {
    // ...
  });
});
```
