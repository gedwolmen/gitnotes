# GitNotes — AGENTS.md

## Commands

```bash
yarn lint:fix              # ESLint fix
yarn format                # Prettier
npx tsc --noEmit           # Type-check (ts:check)
npx jest <pattern>         # Run tests (NOT --testPathPattern)
npx jest                   # All tests
npm install --legacy-peer-deps  # Required flag for installs
```

- Pre-commit: `lint-staged` runs `eslint --fix` + `prettier --write` on `.ts/.tsx/.json/.md`
- Husky manages the pre-commit hook

---

## Stack

- React Native 0.85, TypeScript 5.7, Expo SDK 56
- State: Zustand (persisted to AsyncStorage, `@gitnotes:` key prefix)
- Nav: React Navigation v7 (bottom tabs + native stacks)
- Git: isomorphic-git (clone mode), GitHub REST API (api mode)
- AI: Vercel AI SDK v6 (`generateText` non-streaming for scheduled learning, `streamText` for chat)
- UI: Reanimated, FlashList, neumorphic theme

---

## Project Structure

```
src/
├── components/     # 60+ components, organized in subdirs (ai/, editor/, home/, notes/, etc.)
├── contexts/       # Auth, BiometricLock, Backlinks, GitHubAuth, Repo, Theme, ViewMode
├── hooks/          # 11 hooks (useNoteTags, useUndoRedo, useNetworkStatus, etc.)
├── i18n/           # en, es, fr, de, ja, ko
├── models/         # Note, Todo, Canvas, Chat, AIProvider, Folder, ScheduledLearning, Neorg*
├── navigation/     # AppNavigator, TabNavigator, types.ts (stack param lists)
├── screens/        # 22 screens
├── services/       # 41 top-level + subdirs (ai/, git/, conflict/, import/)
├── stores/         # 12 Zustand stores
├── theme/          # tokens, elevation
├── types/          # Global TS types
└── utils/          # 44 helper files
```

---

## Conventions

### File Naming

| Type       | Convention           | Example                    |
| ---------- | -------------------- | -------------------------- |
| Services   | PascalCase + Service | `NoteGitHubSyncService.ts` |
| Stores     | camelCase + Store    | `noteStore.ts`             |
| Hooks      | camelCase + use      | `useNoteTags.ts`           |
| Models     | PascalCase, singular | `Note.ts`                  |
| Utils      | camelCase            | `frontmatterParser.ts`     |
| Components | PascalCase           | `NoteCard.tsx`             |
| Screens    | PascalCase + Screen  | `HomeScreen.tsx`           |

### Code Rules

- **Never** use `as any`, `@ts-ignore`, `@ts-expect-error` in production code (tests exempt)
- Always `await` async ops; use `Promise.all()` for parallel
- `throw new Error(\`Descriptive: ${detail}\`)` — never bare errors
- Never swallow errors silently
- Services: <300 lines target (many exceed this — see Issues)
- `import React` is unnecessary (automatic JSX transform via `babel-preset-expo`) — 46 files still have it

### State (Zustand)

- Stores persisted to AsyncStorage with `@gitnotes:` prefix
- Selector pattern for derived state
- Note creation: `noteStore.createNote({ title, content, tags, folderPath, repo, branch, format: 'markdown' })`
- Note update: `noteStore.updateNote({ id, content })` — single object with `id` field

### Theme

- `useTheme()` returns `{ colors, isDark, tokens }` where `tokens` has `spacing` and `type`
- 94 files use `StyleSheet.create`; all use `useTheme()` for colors

### Navigation

- React Navigation v7 with stack param lists in `src/navigation/types.ts`
- BottomTabs: HomeStack, TodoStack, CanvasStack, ChatStack, SettingsStack

### Path Aliases (tsconfig)

- `@/*` → `src/*`
- `@components/*`, `@screens/*`, `@services/*`, `@models/*`, `@utils/*`, `@contexts/*`, `@navigation/*`

---

## Git Workflow

- **Worktrees mandatory** — never commit directly to `main`
- Worktree locations vary: `../gitnotes-<name>`, `.worktrees/<name>`, `.claude/worktrees/<name>`
- Commit format: `type(scope): description`
- Types: `feat|fix|refactor|docs|test|chore`
- Scopes: `ai|sync|storage|ui|etc`

---

## Testing

- `__tests__/` at project root, `*.test.ts|tsx`
- `@react-native/jest-preset` + `@testing-library/react-native`
- Jest config in `jest.config.js`
- `jest.setup.ts` for global mocks
- Coverage collection enabled by default
- Run specific test: `npx jest ScheduledLearning` (not `--testPathPattern`)
- 153 test files total; 65 service files

---

## Issues Found

### Dead Code

- `src/utils/wikiLinkParser.ts` — **DELETE** (unused; `wikiLinksParser.ts` with "s" is the active one)
- `src/services/ai/providerAvailabilityCopy.ts` — **RENAME** to `providerAvailabilityI18n.ts` (imported by 3 files; not dead despite AGENT.md claiming so)

### Duplicate/Overlapping Code

- `src/utils/useUndo.ts` (108L) vs `src/hooks/useUndoRedo.ts` (101L) — two undo hooks in different dirs → consolidate
- `src/utils/wikiLinkParser.ts` vs `src/utils/wikiLinksParser.ts` — near-duplicate → delete unused one

### Services Exceeding 300-Line Guideline

| File                       | Lines |
| -------------------------- | ----- |
| `GitHubService.ts`         | 902   |
| `RepoPullService.ts`       | 771   |
| `NeorgContentParser.ts`    | 584   |
| `OrgContentParser.ts`      | 568   |
| `ChatStorageService.ts`    | 559   |
| `LocalGitWriter.ts`        | 551   |
| `NoteGitHubSyncService.ts` | 539   |
| `StorageService.ts`        | 514   |
| `AIService.ts`             | 514   |
| `GitFsService.ts`          | 447   |
| `actionExecutor.ts`        | 403   |
| `NoteSyncQueueService.ts`  | 396   |
| `lfs.ts`                   | 377   |
| `ExportService.ts`         | 359   |
| `gitFs.ts`                 | 344   |
| `GitService.ts`            | 332   |
| `ShareService.ts`          | 325   |
| `ContextService.ts`        | 322   |

### Missing Base Class (Sync Services)

All 4 `*GitHubSyncService` files share identical boilerplate → extract `BaseGitHubSyncService`:

- `resolveToken()` / `resolveAuthor()`
- Auth guard, repo path validation
- Clone-vs-API dispatch
- Error normalization, SHA lookup, 404 fallback

### Magic Strings (Repeated Across Files)

| String                            | Occurrences | Files                                                   |
| --------------------------------- | ----------- | ------------------------------------------------------- |
| `'GitHub not authenticated'`      | 9           | All 4 sync services + ChatStorage                       |
| `'Invalid repo path: ...'`        | 20+         | Sync services, GitFs, LocalGitWriter, lfs, conflict     |
| `'Unknown error'`                 | 8           | All 4 sync services                                     |
| `'GitHub API returned no result'` | 9           | All 4 sync services                                     |
| `'gitnotes'` (fallback username)  | 8           | All 4 sync services + CloneMigration                    |
| `@users.noreply.github.com`       | 8           | Same files                                              |
| `'main'` (branch fallback)        | 35+         | Many files — partially addressed by `branchResolver.ts` |
| `'untitled'` (slug fallback)      | 3           | NoteGitHubSync, TodoGitHubSync                          |
| `24 * 60 * 60 * 1000` (1 day ms)  | 2+          | ScheduledLearning, NoteSyncQueue                        |

### `as any` in Production Code

- `src/services/AIService.ts:121` — `chatTools as any` passed to `createAppleProvider()`
- Tests use `as any` extensively (acceptable per convention)

### Unnecessary `import React`

- 46 `.tsx` files have bare `import React from 'react'` (unused with automatic JSX transform)
- 95+ files have `import React, { ... }` where only named imports are needed
- Low priority cleanup

### Naming Inconsistencies

- Parsers in `src/services/` lack `Service` suffix — acceptable but inconsistent
- `AccountStorage.ts` vs `StorageService.ts` — different suffixes
- `http.ts` — no suffix, lowercase
- `useUndo.ts` in `src/utils/` instead of `src/hooks/`

### Services Without Direct Tests

**Completely untested:**

- `http.ts`, `ExportService.ts`, `LastUsedRepoService.ts`
- `ForegroundSyncService.ts`, `BackgroundSyncService.ts`
- `PositionMemoryService.ts`, `NoteFormatPreferenceService.ts`
- `ScheduledLearningBackgroundService.ts`
- `NeorgParser.ts`, `NeorgLinkParser.ts`

**Only mocked, never unit-tested:**

- `GitService.ts`, `GitHubService.ts`, `StorageService.ts`
- `ShareService.ts`, `RepoPullService.ts`, `TemplateService.ts`
- `NotificationService.ts`, `OnboardingService.ts`
- `NoteGitHubSyncService.ts`, `CanvasGitHubSyncService.ts`

### `eslint-disable` Usages

- `src/services/git/formatSyncError.ts:77` — `no-control-regex`
- `src/services/OrgInlineParser.ts:270` — `no-control-regex`
- `src/screens/TemplateManagerScreen.tsx:95` — `react-hooks/exhaustive-deps`
- `src/components/chat/useChatScreenController.ts:543` — `react-hooks/exhaustive-deps`

---

## Feature Checklist

1. Model in `src/models/`
2. Storage in `StorageService` or dedicated
3. Sync logic follows base pattern
4. UI in `src/components/`
5. Hook if needed in `src/hooks/`
6. Zustand store if complex state
7. i18n strings in all 6 locale files
8. Types documented
9. Tests written
10. AGENT.md updated
