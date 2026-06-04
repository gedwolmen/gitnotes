# GitNotēs Agent Guidelines

## Project Overview

GitNotēs is a React Native (Expo SDK 56) mobile notes app with GitHub sync. Notes, todos, canvases, and journals are stored as plain Markdown/Neorg/Org/JSON files in a GitHub repo.

**Stack**: React Native 0.85 · TypeScript 5.7 · isomorphic-git · React Navigation v7 · TanStack Query · Zustand · Vercel AI SDK v6 · Reanimated · FlashList

---

## Architecture

```
src/
├── components/          # UI components
│   ├── editor/          # Note editor components (NoteEditorForm, NoteViewer, EditorToolbar, etc.)
│   ├── backlinks/       # Backlink components (BacklinkItem, BacklinksSection)
│   └── *.tsx            # Shared components (CodeBlock, NoteImage, GitHubPicker, etc.)
├── contexts/            # React contexts
├── hooks/               # Custom hooks
│   ├── useNoteTags.ts, useUndoRedo.ts, useNetworkStatus.ts
│   ├── useGitHubQueries.ts, useForegroundSyncSettings.ts
│   ├── useEntityList.ts, useEntityFilter.ts
│   └── *.ts
├── i18n/                # Internationalization
│   ├── en.json, es.json, fr.json, de.json, ja.json, ko.json
│   └── index.ts
├── models/              # TypeScript interfaces and types
│   ├── Note.ts, Todo.ts, Canvas.ts, Chat.ts
│   ├── AIProvider.ts, Folder.ts, Attachment.ts
│   ├── NeorgDocument.ts, NeorgContent.ts, NeorgInline.ts, NeorgLink.ts
│   └── ScheduledLearning.ts
├── navigation/          # React Navigation setup
├── screens/             # Screen components (22 screens total)
│   ├── HomeScreen.tsx, NotesListScreen.tsx, NoteEditorScreen.tsx
│   ├── TodoListScreen.tsx, CanvasListScreen.tsx, CanvasEditorScreen.tsx
│   ├── ChatScreen.tsx, ChatThreadListScreen.tsx
│   ├── SettingsScreen.tsx, SyncStatusScreen.tsx
│   ├── OnboardingScreen.tsx, ExploreScreen.tsx, GraphViewScreen.tsx
│   ├── TemplateManagerScreen.tsx, RenderStyleSettingsScreen.tsx
│   ├── ConflictResolverScreen.tsx
│   ├── FileViewerScreen.tsx, ImageViewerScreen.tsx, VideoViewerScreen.tsx, PdfViewerScreen.tsx
│   └── __dev__/         # Development/debug screens
├── services/            # Business logic
│   ├── ai/              # AI provider management
│   │   ├── AIService.ts, config.ts, modelLimits.ts
│   │   ├── providerAvailability.ts, providerQuirks.ts
│   │   ├── systemPrompt.ts, tools.ts, actionExecutor.ts
│   │   ├── aiServiceErrors.ts, openrouterPreflight.ts
│   │   └── providerAvailabilityCopy.ts  # ⚠️ DELETE - duplicate file
│   ├── git/             # Git operations
│   │   ├── GitFsService.ts, LocalGitWriter.ts, branchResolver.ts
│   │   ├── lfs.ts, gitFs.ts, gitHttp.ts, formatSyncError.ts
│   │   └── CloneMigrationService.ts
│   ├── conflict/        # Three-way merge, conflict resolution
│   │   ├── ConflictResolverService.ts, threeWayMerge.ts
│   │   └── types.ts
│   ├── import/          # Importers
│   │   ├── AppleNotesImporter.ts, GoogleKeepImporter.ts
│   │   └── types.ts
│   ├── StorageService.ts, GitHubService.ts, SyncEngineService.ts
│   ├── NoteGitHubSyncService.ts, TodoGitHubSyncService.ts
│   ├── TemplateGitHubSyncService.ts, CanvasGitHubSyncService.ts
│   ├── NoteSyncQueueService.ts, RepoPullService.ts
│   ├── RepoFileSyncService.ts, ForegroundSyncService.ts
│   ├── BackgroundSyncService.ts, LastUsedRepoService.ts
│   ├── AccountStorage.ts, ChatStorageService.ts
│   ├── JournalService.ts, TemplateService.ts, TemplateMarkdownService.ts
│   ├── TemplateRepoPreferenceService.ts, NoteFormatPreferenceService.ts
│   ├── ExportService.ts, ShareService.ts, NotificationService.ts
│   ├── PositionMemoryService.ts, RenderStyleService.ts
│   ├── ContextService.ts, OnboardingService.ts
│   ├── AuthService.ts, OrgContentParser.ts, OrgInlineParser.ts
│   ├── NeorgParser.ts, NeorgContentParser.ts, NeorgInlineParser.ts, NeorgLinkParser.ts
│   ├── ScheduledLearningService.ts, ScheduledLearningBackgroundService.ts
│   └── StorageBootstrap.ts
├── stores/              # Zustand state management (12 stores)
│   ├── noteStore.ts, todoStore.ts, canvasStore.ts, chatStore.ts
│   ├── repoStore.ts, folderStore.ts, aiStore.ts
│   ├── templateStore.ts, conflictStore.ts
│   ├── renderStyleStore.ts, githubActivityStore.ts
│   └── scheduledLearningStore.ts
├── theme/               # Design tokens
│   ├── tokens.ts, elevation.ts
├── types/               # Global TypeScript types
└── utils/               # Helper functions
```

---

## Code Quality Standards

### Type Safety (MANDATORY)

- **NEVER** use `as any`, `@ts-ignore`, or `@ts-expect-error` in production code
- Test files are the only exception (marked in `.tsconfig.json` exclude)
- If you're hitting a type wall, fix the types or create a properly-typed wrapper

### Error Handling

```typescript
// GOOD - Always use typed errors
throw new Error(`Descriptive message: ${detail}`);

// GOOD - Custom error classes for specific domains
class ProviderUnavailableError extends Error {
  constructor(reason: AvailabilityReason, providerName: string) {
    super(`Provider "${providerName}" is unavailable: ${reason.code}`);
    this.name = 'ProviderUnavailableError';
  }
}

// BAD - Never bare `throw new Error()`
throw new Error('something went wrong');

// BAD - Never swallow errors
catch (error) { /* silent */ }
```

### Async Operations

- Always await async functions; don't fire-and-forget without proper error handling
- Use `Promise.all()` for parallel independent operations
- Wrap async operations in try/catch with meaningful error messages

---

## Service Patterns

### Service File Structure

```typescript
// 1. Imports (grouped: external, internal, types)
// 2. Constants (tunable magic numbers)
// 3. Types/Interfaces (only if not in models/)
// 4. Helper functions (private utility functions)
// 5. Main export (class or named exports)
// 6. Keep files under 300 lines; extract logical groups to separate files
```

### Service Responsibilities

| Service                              | Responsibility                                            |
| ------------------------------------ | --------------------------------------------------------- |
| `StorageService`                     | Local AsyncStorage CRUD for notes/repos                   |
| `GitHubService`                      | GitHub REST API calls (Contents API)                      |
| `SyncEngineService`                  | Per-repo sync mode selection (`api` vs `clone`)           |
| `GitFsService`                       | Clone-mode filesystem operations, working tree management |
| `LocalGitWriter`                     | Clone-mode git commits, branch operations                 |
| `NoteGitHubSyncService`              | Note ↔ GitHub sync logic (536 lines - NEEDS REFACTOR)     |
| `TodoGitHubSyncService`              | Todo ↔ GitHub sync                                        |
| `TemplateGitHubSyncService`          | Template ↔ GitHub sync                                    |
| `CanvasGitHubSyncService`            | Canvas ↔ GitHub sync                                      |
| `NoteSyncQueueService`               | Offline queue for note operations                         |
| `ConflictResolverService`            | Three-way merge and conflict detection                    |
| `RepoPullService`                    | Pull notes from repo (API or clone mode)                  |
| `RepoFileSyncService`                | File-level sync coordination                              |
| `LfsService`                         | Git LFS pointer parsing and on-demand object download     |
| `ForegroundSyncService`              | Foreground sync orchestration                             |
| `BackgroundSyncService`              | Background sync scheduling and execution                  |
| `CloneMigrationService`              | Migration from API mode to clone mode                     |
| `BranchResolverService`              | Git branch resolution and management                      |
| `AppleNotesImporter`                 | Apple Notes import                                        |
| `GoogleKeepImporter`                 | Google Keep import                                        |
| `ScheduledLearningService`           | Scheduled learning content service                        |
| `ScheduledLearningBackgroundService` | Background scheduled learning processing                  |

### Sync Engine Modes

Two sync modes per repository:

```typescript
type SyncEngineMode = 'api' | 'clone';

// 'api' - Uses GitHub Contents API (default)
// Pros: No local storage needed, works on any repo
// Cons: Rate limited, no offline support, no LFS

// 'clone' - Full git clone with working tree
// Pros: Full git features, offline support, LFS support
// Cons: Requires local storage space, more complex
```

### LFS Support (Clone Mode Only)

Git LFS handling in `src/services/git/lfs.ts`:

```typescript
// Pointer file spec parsing
parseLfsPointer(buffer: string | Uint8Array): LfsPointer | null

// Service for tracking + resolving LFS pointers
class LfsService {
  static async scanRepo(repoPath, workingTreeUri): Promise<Map<string, LfsPointer>>
  static async isPending(repoPath, filePath): Promise<boolean>
  static async getPointer(repoPath, filePath): Promise<LfsPointer | null>
  static async downloadObject(opts): Promise<void>
  static async clearRepo(repoPath): Promise<void>
}
```

### Sync Service Architecture

Four GitHub sync services with similar patterns - **Refactoring Needed**:

- `NoteGitHubSyncService.ts` (536 lines - oversized)
- `TodoGitHubSyncService.ts`
- `TemplateGitHubSyncService.ts`
- `CanvasGitHubSyncService.ts`

**Proposed: Extract common patterns into base sync service:**

```typescript
// Proposed: src/services/sync/BaseGitHubSync.ts
interface SyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

abstract class BaseGitHubSyncService {
  abstract sync(params: SyncParams): Promise<SyncResult>;
  abstract delete(params: DeleteParams): Promise<SyncResult>;

  // Common helpers
  protected resolveAuthor(): Promise<{ name: string; email: string }>;
  protected resolveToken(accountId?: string): Promise<string | undefined>;
  protected checkMode(repoPath: string): Promise<SyncEngineMode>;
  protected uploadImages(content: string, ...): Promise<string>;
}
```

---

## AI Services Architecture

### AI Service Structure

```
services/ai/
├── config.ts          # Magic numbers and tunables (MAX_CONTEXT_FILE_BYTES, etc.)
├── modelLimits.ts      # Model context window limits
├── providerAvailability.ts  # Device eligibility checking (Apple, Llama)
├── providerQuirks.ts   # Fetch quirks for specific providers
├── systemPrompt.ts     # System prompt construction
├── tools.ts            # AI tool definitions (exposed to the model)
├── actionExecutor.ts   # Tool call execution logic
├── aiServiceErrors.ts  # Error parsing and humanization
├── openrouterPreflight.ts  # OpenRouter-specific pre-flight checks
├── AIService.ts        # Model initialization, streaming, chat helpers
└── providerAvailabilityCopy.ts  # ⚠️ DELETE - duplicate of providerAvailability.ts
```

### Adding New AI Providers

1. Add provider type to `models/AIProvider.ts`
2. Add initialization logic in `AIService.ts` → `buildProviderInstance()`
3. Add availability checking in `providerAvailability.ts`
4. Add quirks in `providerQuirks.ts` if needed

### Supported Providers

- OpenAI-compatible (via `@ai-sdk/openai-compatible`)
- Apple Intelligence (via `@react-native-ai/apple`)
- On-device Llama (via `@react-native-ai/llama`)
- Vercel AI SDK core `ai` package

---

## State Management (Zustand)

### Store Patterns

```typescript
export const useNoteStore = create<NoteState & NoteActions>()((set, get) => ({
  // State
  notes: [],
  isLoading: true,
  error: null,

  // Actions
  loadNotes: async () => {
    try {
      set({ isLoading: true, error: null });
      // ... implementation
    } catch (err) {
      set({ error: 'Failed to load notes', isLoading: false });
      console.error('Error loading notes:', err);
    }
  },
}));
```

### All Stores

| Store                    | Purpose                          |
| ------------------------ | -------------------------------- |
| `noteStore`              | Notes CRUD and state             |
| `todoStore`              | Todos CRUD and state             |
| `canvasStore`            | Canvas CRUD and state            |
| `chatStore`              | Chat messages and threads        |
| `repoStore`              | Repository connections and state |
| `folderStore`            | Folder hierarchy                 |
| `aiStore`                | AI provider config and state     |
| `templateStore`          | Template management              |
| `conflictStore`          | Conflict resolution state        |
| `renderStyleStore`       | Render style preferences         |
| `githubActivityStore`    | GitHub activity tracking         |
| `scheduledLearningStore` | Scheduled learning content       |

### Selector Pattern for Derived State

```typescript
// Prefer useMemo for filtered/sorted derived state
export const useFilteredNotes = () => {
  const notes = useNoteStore((s) => s.notes);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  return useMemo(() => filterNotesBySearch(notes, searchQuery), [notes, searchQuery]);
};
```

---

## File Naming Conventions

| Type       | Convention                       | Example                    |
| ---------- | -------------------------------- | -------------------------- |
| Services   | PascalCase, descriptive          | `NoteGitHubSyncService.ts` |
| Stores     | PascalCase, ending with `Store`  | `noteStore.ts`             |
| Hooks      | camelCase, prefix with `use`     | `useNoteTags.ts`           |
| Models     | PascalCase, singular             | `Note.ts`, `AIProvider.ts` |
| Utils      | camelCase, descriptive           | `frontmatterParser.ts`     |
| Components | PascalCase                       | `NoteEditor.tsx`           |
| Screens    | PascalCase, ending with `Screen` | `HomeScreen.tsx`           |
| i18n       | lowercase, ISO codes             | `en.json`, `es.json`       |

---

## Testing Conventions

- Unit tests in `__tests__/` directories alongside source files
- Test files named: `*.test.ts` or `*.test.tsx`
- Use `@react-native/jest-preset` and `@testing-library/react-native`
- E2E tests in `e2e/` with Maestro

---

## Git Workflow

### Worktrees (MANDATORY)

**ALWAYS work in Git worktrees.** Never make direct commits to `main` or long-lived branches.

```bash
# Create a worktree for new work
git worktree add .worktrees/<branch-name>

# List existing worktrees
git worktree list

# Remove a worktree when done
git worktree remove .worktrees/<branch-name>
```

- If a worktree doesn't exist for your task, create one before starting
- Only work in the main clone if the user explicitly requests it
- Keep worktrees clean — rebase or merge when pulling from upstream

### Commit Message Format

```
type(scope): description

Types: feat | fix | refactor | docs | test | chore
Scope: ai | sync | storage | ui | etc.
```

### Branch Naming

```
feature/description
fix/description
refactor/description
```

---

## Navigation Structure

React Navigation v7 with bottom tabs and native stacks:

```
BottomTabs
├── HomeStack
│   ├── HomeScreen
│   ├── NotesListScreen
│   ├── NoteEditorScreen
│   └── ... (note-related screens)
├── TodoStack
│   ├── TodoListScreen
│   └── ... (todo screens)
├── CanvasStack
│   ├── CanvasListScreen
│   ├── CanvasEditorScreen
│   └── ... (canvas screens)
├── ChatStack
│   ├── ChatThreadListScreen
│   ├── ChatScreen
│   └── ... (chat screens)
└── SettingsStack
    ├── SettingsScreen
    ├── SyncStatusScreen
    ├── TemplateManagerScreen
    └── ... (settings sub-screens)
```

---

## Adding New Features

### Checklist Before Implementation

1. [ ] Model exists in `src/models/` (create if needed)
2. [ ] Storage persistence in `StorageService` or create dedicated storage
3. [ ] Sync logic follows base pattern or create new sync service
4. [ ] UI components in appropriate `src/components/` subdirectory
5. [ ] Hook for state management if needed
6. [ ] Zustand store if complex state needed
7. [ ] i18n strings added to `src/i18n/` (en.json base + others)
8. [ ] Types documented
9. [ ] Tests written
10. [ ] AGENT.md updated if architecture changes

---

## Known Issues

- `providerAvailabilityCopy.ts` is an unused duplicate file - **DELETE**
- `NoteGitHubSyncService.ts` is oversized (536 lines) - needs refactoring into base class
- Sync services have duplicated patterns - need base class extraction
- Some magic strings scattered in services - need consolidation
- Missing LFS UI for clone mode - need user-facing LFS download progress

---

## ESLint & Prettier

Configuration exists. Run before committing:

```bash
yarn lint:fix
yarn format
```

---

## Dependency Guidelines

| Category   | Libraries                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------- |
| AI         | `@ai-sdk/openai-compatible`, `@react-native-ai/apple`, `@react-native-ai/llama`, `ai` (Vercel SDK) |
| State      | `zustand` (local), `@tanstack/react-query` (server)                                                |
| Navigation | `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`      |
| Git        | `isomorphic-git`                                                                                   |
| Storage    | `@react-native-async-storage/async-storage`, `expo-secure-store`                                   |
| UI         | `react-native-reanimated`, `@shopify/flash-list`                                                   |

**Avoid** adding redundant state management libraries (Redux, MobX, etc.) - Zustand is sufficient.

---

## Context Parsers

The app supports multiple note formats:

| Format   | Parser Service          | Location           |
| -------- | ----------------------- | ------------------ |
| Markdown | Built-in (React Native) | `MarkdownBody.tsx` |
| Neorg    | `NeorgParser.ts`        | `src/services/`    |
| Org      | `OrgContentParser.ts`   | `src/services/`    |
| JSON     | Built-in                | Model parsing      |

### Neorg Parser Services

- `NeorgParser.ts` - Document parsing
- `NeorgContentParser.ts` - Content block parsing
- `NeorgInlineParser.ts` - Inline element parsing
- `NeorgLinkParser.ts` - Wiki-link parsing

### Org Parser Services

- `OrgContentParser.ts` - Content parsing
- `OrgInlineParser.ts` - Inline element parsing

---

(End of file - total lines: ~500)
