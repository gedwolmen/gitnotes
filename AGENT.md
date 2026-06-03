# GitNotēs Agent Guidelines

## Project Overview

GitNotēs is a React Native (Expo SDK 56) mobile notes app with GitHub sync. Notes, todos, canvases, and journals are stored as plain Markdown/Neorg/Org/JSON files in a GitHub repo.

**Stack**: React Native 0.85 · TypeScript 5.7 · isomorphic-git · React Navigation v7 · TanStack Query · Zustand · Vercel AI SDK v6 · Reanimated · FlashList

---

## Architecture

```
src/
├── components/     # UI components (editor, notes, todos, chat, repo, settings)
├── contexts/       # React contexts
├── hooks/          # Custom hooks (useNoteTags, useUndoRedo, useNetworkStatus, etc.)
├── i18n/           # Internationalization (en, es, fr, de, ja, ko)
├── models/         # TypeScript interfaces and types (Note, Todo, Canvas, AIProvider, etc.)
├── navigation/     # React Navigation setup
├── screens/        # Screen components
├── services/       # Business logic
│   ├── ai/         # AI provider management, tools, errors
│   ├── conflict/   # Three-way merge, conflict resolution
│   ├── git/        # Git operations (LocalGitWriter, GitFsService, branchResolver, lfs)
│   ├── import/     # Apple Notes, Google Keep importers
│   └── *.ts        # Core services (StorageService, GitHubService, SyncEngine, etc.)
├── stores/         # Zustand state management
├── theme/          # Design tokens, elevation
├── types/          # Global TypeScript types
└── utils/          # Helper functions
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

Services should follow a consistent structure:

```typescript
// 1. Imports (grouped: external, internal, types)
// 2. Constants (tunable magic numbers)
// 3. Types/Interfaces (only if not in models/)
// 4. Helper functions (private utility functions)
// 5. Main export (class or named exports)
// 6. Keep files under 300 lines; extract logical groups to separate files
```

### Service Responsibilities

| Service                   | Responsibility                              |
| ------------------------- | ------------------------------------------- |
| `StorageService`          | Local AsyncStorage CRUD for notes/repos     |
| `GitHubService`           | GitHub REST API calls (Contents API)        |
| `SyncEngineService`       | Per-repo sync mode selection (api vs clone) |
| `GitFsService`            | Clone-mode filesystem operations            |
| `LocalGitWriter`          | Clone-mode git commits                      |
| `NoteGitHubSyncService`   | Note ↔ GitHub sync logic                    |
| `NoteSyncQueueService`    | Offline queue for note operations           |
| `ConflictResolverService` | Three-way merge and conflict detection      |

**Anti-pattern**: Services that do parsing + formatting + syncing all in one file (e.g., `NoteGitHubSyncService` at 536 lines).

### Sync Service Architecture

Four GitHub sync services exist with similar patterns:

- `NoteGitHubSyncService.ts`
- `TodoGitHubSyncService.ts`
- `TemplateGitHubSyncService.ts`
- `CanvasGitHubSyncService.ts`

**Refactoring Needed**: Extract common patterns into a base sync service:

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

### Current Issues

**DUPLICATE FILE**: `providerAvailabilityCopy.ts` is a renamed copy that creates confusion. Merge or delete.

### AI Service Structure

```
services/ai/
├── config.ts          # Magic numbers and tunables (MAX_CONTEXT_FILE_BYTES, etc.)
├── modelLimits.ts     # Model context window limits
├── providerAvailability.ts  # Device eligibility checking (Apple, Llama)
├── providerQuirks.ts  # Fetch quirks for specific providers
├── systemPrompt.ts    # System prompt construction
├── tools.ts           # AI tool definitions (exposed to the model)
├── actionExecutor.ts  # Tool call execution logic
├── aiServiceErrors.ts # Error parsing and humanization
├── openrouterPreflight.ts  # OpenRouter-specific pre-flight checks
├── AIService.ts       # Model initialization, streaming, chat helpers
└── providerAvailabilityCopy.ts  # ⚠️ DELETE - duplicate of providerAvailability.ts
```

### Adding New AI Providers

1. Add provider type to `models/AIProvider.ts`
2. Add initialization logic in `AIService.ts` → `buildProviderInstance()`
3. Add availability checking in `providerAvailability.ts`
4. Add quirks in `providerQuirks.ts` if needed

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

| Type       | Convention                      | Example                    |
| ---------- | ------------------------------- | -------------------------- |
| Services   | PascalCase, descriptive         | `NoteGitHubSyncService.ts` |
| Stores     | PascalCase, ending with `Store` | `noteStore.ts`             |
| Hooks      | camelCase, prefix with `use`    | `useNoteTags.ts`           |
| Models     | PascalCase, singular            | `Note.ts`, `AIProvider.ts` |
| Utils      | camelCase, descriptive          | `frontmatterParser.ts`     |
| Components | PascalCase                      | `NoteEditor.tsx`           |

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

- Before starting any work, create a worktree: `git worktree add .worktrees/<branch-name>`
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

- `providerAvailabilityCopy.ts` is an unused duplicate file
- `NoteGitHubSyncService.ts` is oversized (536 lines) - needs refactoring
- Sync services have duplicated patterns - need base class extraction
- Some magic strings scattered in services - need consolidation

---

## ESLint & Prettier

Configuration exists. Run before committing:

```bash
yarn lint:fix
yarn format
```

---

## Dependency Guidelines

- **AI**: `@ai-sdk/openai-compatible`, `@react-native-ai/apple`, `@react-native-ai/llama`, `ai` (Vercel SDK)
- **State**: `zustand` for local, `@tanstack/react-query` for server
- **Navigation**: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
- **Git**: `isomorphic-git`
- **Storage**: `@react-native-async-storage/async-storage`, `expo-secure-store`

Avoid adding redundant state management libraries (Redux, MobX, etc.) - Zustand is sufficient.
