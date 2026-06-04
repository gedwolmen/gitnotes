# GitNotēs Agent Guidelines

## Stack

React Native 0.85 · TypeScript 5.7 · Expo SDK 56 · isomorphic-git · React Navigation v7 · TanStack Query · Zustand · Vercel AI SDK v6 · Reanimated · FlashList

---

## Architecture

```
src/
├── components/     # editor/, backlinks/, *.tsx (CodeBlock, NoteImage, GitHubPicker)
├── contexts/       # React contexts
├── hooks/          # useNoteTags, useUndoRedo, useNetworkStatus, useEntityList, useEntityFilter, useForegroundSyncSettings, useGitHubQueries, useBackgroundSync, useResponsive, useHardWrap, useProviderAvailability
├── i18n/           # en, es, fr, de, ja, ko
├── models/         # Note, Todo, Canvas, Chat, AIProvider, Folder, Attachment, ScheduledLearning, NeorgDocument, NeorgContent, NeorgInline, NeorgLink
├── navigation/     # React Navigation v7 (bottom tabs + native stacks)
├── screens/        # 22 screens (Home, NotesList, NoteEditor, TodoList, CanvasList, CanvasEditor, Chat, ChatThreadList, Settings, SyncStatus, Onboarding, Explore, GraphView, TemplateManager, RenderStyleSettings, ConflictResolver, FileViewer, ImageViewer, VideoViewer, PdfViewer, __dev__)
├── services/
│   ├── ai/         # AIService, config, modelLimits, providerAvailability, providerQuirks, systemPrompt, tools, actionExecutor, aiServiceErrors, openrouterPreflight
│   ├── git/        # GitFsService, LocalGitWriter, branchResolver, lfs, gitFs, gitHttp, formatSyncError, CloneMigrationService
│   ├── conflict/   # ConflictResolverService, threeWayMerge, types
│   ├── import/     # AppleNotesImporter, GoogleKeepImporter, types
│   ├── StorageService, GitHubService, SyncEngineService
│   ├── NoteGitHubSyncService, TodoGitHubSyncService, TemplateGitHubSyncService, CanvasGitHubSyncService
│   ├── NoteSyncQueueService, RepoPullService, RepoFileSyncService
│   ├── ForegroundSyncService, BackgroundSyncService, LastUsedRepoService
│   ├── AccountStorage, ChatStorageService
│   ├── JournalService, TemplateService, TemplateMarkdownService
│   ├── TemplateRepoPreferenceService, NoteFormatPreferenceService
│   ├── ExportService, ShareService, NotificationService
│   ├── PositionMemoryService, RenderStyleService, ContextService, OnboardingService, AuthService
│   ├── OrgContentParser, OrgInlineParser, NeorgParser, NeorgContentParser, NeorgInlineParser, NeorgLinkParser
│   ├── ScheduledLearningService, ScheduledLearningBackgroundService, StorageBootstrap
├── stores/         # noteStore, todoStore, canvasStore, chatStore, repoStore, folderStore, aiStore, templateStore, conflictStore, renderStyleStore, githubActivityStore, scheduledLearningStore
├── theme/          # tokens, elevation
├── types/          # Global TypeScript types
└── utils/          # Helper functions
```

---

## Code Quality

### Type Safety (MANDATORY)

- **NEVER** use `as any`, `@ts-ignore`, `@ts-expect-error` in production code
- Test files only exception

### Error Handling

```typescript
// GOOD
throw new Error(`Descriptive: ${detail}`);
class CustomError extends Error { constructor(msg: string) { super(msg); this.name = 'CustomError'; } }

// BAD
throw new Error('oops');          // bare error
catch (e) { /* silent */ }         // swallowed error
```

### Async

- Always await; use `Promise.all()` for parallel ops

---

## Services

| Service                                     | Responsibility                 |
| ------------------------------------------- | ------------------------------ |
| `StorageService`                            | AsyncStorage CRUD              |
| `GitHubService`                             | GitHub REST API                |
| `SyncEngineService`                         | Per-repo mode (`api`\|`clone`) |
| `GitFsService`                              | Clone-mode filesystem          |
| `LocalGitWriter`                            | Clone-mode commits             |
| `NoteGitHubSyncService`                     | Note ↔ GitHub (536 lines ⚠️)   |
| `TodoGitHubSyncService`                     | Todo ↔ GitHub                  |
| `TemplateGitHubSyncService`                 | Template ↔ GitHub              |
| `CanvasGitHubSyncService`                   | Canvas ↔ GitHub                |
| `NoteSyncQueueService`                      | Offline queue                  |
| `ConflictResolverService`                   | Three-way merge                |
| `RepoPullService`                           | Pull notes (api/clone)         |
| `RepoFileSyncService`                       | File sync coordination         |
| `LfsService`                                | LFS pointer + download         |
| `ForegroundSyncService`                     | Foreground sync                |
| `BackgroundSyncService`                     | Background sync                |
| `CloneMigrationService`                     | API → clone migration          |
| `BranchResolverService`                     | Branch resolution              |
| `AppleNotesImporter` / `GoogleKeepImporter` | Importers                      |

### Sync Engine Modes

```typescript
type SyncEngineMode = 'api' | 'clone';
// 'api': Contents API, no offline, no LFS (default)
// 'clone': Full git, offline, LFS, requires storage
```

### LFS Service (`src/services/git/lfs.ts`)

```typescript
parseLfsPointer(buffer): LfsPointer | null
LfsService.scanRepo(repoPath, workingTreeUri): Promise<Map>
LfsService.isPending(repoPath, filePath): Promise<boolean>
LfsService.downloadObject({repoPath, filePath, fileUri, accessToken}): Promise<void>
LfsService.clearRepo(repoPath): Promise<void>
```

### Service Structure

```
1. Imports (external → internal → types)
2. Constants (magic numbers)
3. Types/Interfaces (if not in models/)
4. Helper functions
5. Main export (class or named)
6. <300 lines; extract logical groups
```

### Refactoring Needed

- `providerAvailabilityCopy.ts` → **DELETE** (duplicate)
- `NoteGitHubSyncService.ts` (536 lines) → extract `BaseGitHubSyncService`

---

## AI Services

### Structure (`services/ai/`)

- `AIService.ts` - model init, streaming, chat
- `config.ts` - magic numbers
- `modelLimits.ts` - context window limits
- `providerAvailability.ts` - device eligibility
- `providerQuirks.ts` - fetch quirks
- `systemPrompt.ts` - prompt construction
- `tools.ts` - AI tool definitions
- `actionExecutor.ts` - tool execution
- `aiServiceErrors.ts` - error parsing
- `openrouterPreflight.ts` - OpenRouter checks

### Adding Providers

1. Add type to `models/AIProvider.ts`
2. Add init in `AIService.ts` → `buildProviderInstance()`
3. Add availability in `providerAvailability.ts`
4. Add quirks in `providerQuirks.ts` if needed

### Supported

- OpenAI-compatible (`@ai-sdk/openai-compatible`)
- Apple Intelligence (`@react-native-ai/apple`)
- On-device Llama (`@react-native-ai/llama`)

---

## State (Zustand)

```typescript
export const useNoteStore = create<NoteState & NoteActions>()((set, get) => ({
  notes: [],
  isLoading: true,
  error: null,
  loadNotes: async () => {
    try {
      set({ isLoading: true, error: null });
    } catch (err) {
      set({ error: 'Failed to load notes', isLoading: false });
    }
  },
}));

// Selector for derived state
export const useFilteredNotes = () => {
  const notes = useNoteStore((s) => s.notes);
  const search = useNoteStore((s) => s.searchQuery);
  return useMemo(() => filterNotesBySearch(notes, search), [notes, search]);
};
```

### All Stores

`noteStore` · `todoStore` · `canvasStore` · `chatStore` · `repoStore` · `folderStore` · `aiStore` · `templateStore` · `conflictStore` · `renderStyleStore` · `githubActivityStore` · `scheduledLearningStore`

---

## File Naming

| Type       | Convention           | Example                    |
| ---------- | -------------------- | -------------------------- |
| Services   | PascalCase           | `NoteGitHubSyncService.ts` |
| Stores     | PascalCase + Store   | `noteStore.ts`             |
| Hooks      | camelCase + use      | `useNoteTags.ts`           |
| Models     | PascalCase, singular | `Note.ts`                  |
| Utils      | camelCase            | `frontmatterParser.ts`     |
| Components | PascalCase           | `NoteEditor.tsx`           |
| Screens    | PascalCase + Screen  | `HomeScreen.tsx`           |
| i18n       | ISO codes            | `en.json`                  |

---

## Navigation (React Navigation v7)

```
BottomTabs
├── HomeStack     (Home, NotesList, NoteEditor, …)
├── TodoStack     (TodoList, …)
├── CanvasStack   (CanvasList, CanvasEditor, …)
├── ChatStack     (ChatThreadList, Chat, …)
└── SettingsStack (Settings, SyncStatus, TemplateManager, …)
```

---

## Context Parsers

| Format   | Parser                                                                                  | Location           |
| -------- | --------------------------------------------------------------------------------------- | ------------------ |
| Markdown | Built-in                                                                                | `MarkdownBody.tsx` |
| Neorg    | `NeorgParser.ts`, `NeorgContentParser.ts`, `NeorgInlineParser.ts`, `NeorgLinkParser.ts` | `src/services/`    |
| Org      | `OrgContentParser.ts`, `OrgInlineParser.ts`                                             | `src/services/`    |
| JSON     | Built-in                                                                                | Model parsing      |

---

## Testing

- `__tests__/` alongside source, `*.test.ts|tsx`
- `@react-native/jest-preset` + `@testing-library/react-native`
- E2E: `e2e/` with Maestro

---

## Git Workflow

### Worktrees (MANDATORY)

```bash
git worktree add .worktrees/<branch-name>   # create
git worktree list                           # list
git worktree remove .worktrees/<branch-name> # remove
```

Never commit directly to `main` or long-lived branches.

### Commit Format

```
type(scope): description
feat(sync): add clone mode
fix(ai): handle provider errors
```

Types: `feat|fix|refactor|docs|test|chore` · Scopes: `ai|sync|storage|ui|etc`

---

## Adding Features Checklist

1. Model in `src/models/`
2. Storage in `StorageService` or dedicated
3. Sync logic follows base pattern
4. UI in `src/components/`
5. Hook if needed
6. Zustand store if complex state
7. i18n strings in `src/i18n/`
8. Types documented
9. Tests written
10. AGENT.md updated

---

## Known Issues

- `providerAvailabilityCopy.ts` → **DELETE**
- `NoteGitHubSyncService.ts` (536 lines) → needs base class refactor
- Sync services → extract `BaseGitHubSyncService`
- Magic strings → need consolidation
- LFS UI missing for clone mode

---

## Lint & Format

```bash
yarn lint:fix && yarn format
```

---

## Dependencies

- **AI**: `@ai-sdk/openai-compatible`, `@react-native-ai/apple`, `@react-native-ai/llama`, `ai`
- **State**: `zustand`, `@tanstack/react-query`
- **Nav**: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
- **Git**: `isomorphic-git`
- **Storage**: `@react-native-async-storage/async-storage`, `expo-secure-store`
- **UI**: `react-native-reanimated`, `@shopify/flash-list`

Avoid Redux/MobX — Zustand is sufficient.
