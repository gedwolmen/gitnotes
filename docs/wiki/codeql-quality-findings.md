# Code Quality Findings (Standard)

> How GitHub CodeQL "Standard findings" (Maintainability / Reliability scores) are tracked and resolved in this repo.

## GitHub "Security and quality" surface

The repo runs **CodeQL code-quality analysis** on every push to `main` and on every pull request, surfacing "Standard findings" (Maintainability / Reliability scores) and AI suggestions on the Security tab.

The REST alerts API returns no data for this analysis — the findings are visible only in the GitHub UI under `Security → Code scanning → Standard findings`.

## Reproducing locally

The CodeQL CLI is installed via `brew install codeql` (v2.26.3+). The findings come from the `javascript-code-quality.qls` suite in the `codeql/javascript-queries` pack:

```bash
codeql pack download codeql/javascript-queries
codeql database create .worktrees/codeql-analysis \
  --language=javascript-typescript \
  --source-root=.worktrees/codeql-analysis \
  --threads=0
codeql database analyze .worktrees/codeql-analysis \
  --format=sarif-latest --output=results.sarif \
  codeql/javascript-queries:codeql-suites/javascript-code-quality.qls \
  --threads=0
```

## Current findings (on `main`, 2026-08-21)

| Rule | Count | Resolution |
|---|---|---|
| `js/unused-local-variable` | 1 | Intentional future-UX hook (`ConnectHostModal.verifiedLogin`, has `eslint-disable` + comment). Dismissed in UI. |
| `js/unknown-directive` | 35 | `'worklet'` — required by `react-native-reanimated`. False positive. Dismissed in UI. |
| `js/call-to-non-callable` | 25 | `__setProState` from `src/stores/proStore` (real export; CodeQL can't resolve it through the module's structure). False positive. Dismissed in UI. |
| `js/trivial-conditional` | 14 | 8 × `FEATURE_USE_MULTI_HOST_WRITE` always-false (intentional off-flag); 4 × `repo`/`todoRepo` always-true guards in data-critical save paths; 1 × `isTesting` in `ConnectHostModal` (state IS toggled); 1 × `!yielded` in `AIService` streaming error path. Documented. |
| `js/use-before-declaration` | 2 | `jest` global at line 1 in two test files. False positive. Dismissed in UI. |
| `js/comparison-between-incompatible-types` | 1 | `node !== null` guard in `header-blur.test.tsx` helper. Legitimate. Dismissed in UI. |
| `js/useless-assignment-to-local` | 0 | Cleared (AIService.ts:363 dead `yielded = true;` removed). |

## How `fix/codeql-quality-findings` cleared 46 findings

The branch removed genuinely dead code across 28 files — unused imports, unused destructured variables, an unused local function, an unused `useCallback`, an unused `useRef`-backed var, and one dead local assignment. **No behavior change**: `yarn ts:check`, `yarn jest` (298 suites / 2752 tests), `yarn eslint` (0 errors), and `yarn format:check` all stay green.

### Files changed

`__tests__/AccountsContext.test.tsx`, `__tests__/ChatStore.test.ts` (only the two `updateMessage` tests; the other 8 createThread tests where `thread` IS used were deliberately left alone), `__tests__/ThoughtDumpScreen.test.tsx`, `__tests__/editor-search.test.tsx`, `__tests__/filter-modal-overflow.test.tsx`, `__tests__/link-routing.test.ts`, `__tests__/notes-delete-lock.test.tsx`, `__tests__/offline-gray-uncached.test.tsx`, `__tests__/screens/NoteEditorScreen.test.tsx`, `__tests__/screens/NotesListScreen.test.tsx`, `__tests__/screens/SettingsScreen.add-repo-import.test.tsx`, `__tests__/services/StagingService.test.ts`, `__tests__/stores/aiStore.test.ts`, `__tests__/swipe-delete.test.tsx`, `__tests__/useChatScreenController.test.ts`, `plugins/withGitQuicWorkaround.js`, `src/components/ai/ChatLoadingStrip.tsx`, `src/components/canvas/DraftLayerRenderer.tsx`, `src/components/chat/ChatThreadCard.tsx`, `src/components/settings/SettingsContent.tsx`, `src/components/ui/Group.tsx`, `src/components/ui/ScreenHeader.tsx`, `src/hooks/useLongPressForVision.ts`, `src/screens/GraphViewScreen.tsx`, `src/screens/TodoListScreen.tsx`, `src/services/AIService.ts`, `src/services/GitService.ts`, `src/services/conflict/ConflictResolverService.ts`.

### Cascading cleanups

Removing a few of the targeted vars left their imports unused too — those were cleaned up in the same pass:

- `withGitQuicWorkaround.js`: `withInfoPlist` removed.
- `ChatLoadingStrip.tsx`: `spacing`, `type`, `radii` removed from `useTokens()` destructure.
- `ChatThreadCard.tsx`: `type` removed from destructure + `typography` line removed + `TYPE` import removed (cascading).
- `Group.tsx`, `ScreenHeader.tsx`: `type` removed from destructure.
- `useLongPressForVision.ts`: `GestureDetector` import removed + `abortControllerRef` removed + `useRef` import removed (cascading).
- `swipe-delete.test.tsx`: `act` import removed after `confirmLatestDeleteAlert` (its only consumer) was removed.
- `TodoListScreen.tsx`: `View` import removed.
- `GitService.ts`: `GitHubService` import removed.
- `ConflictResolverService.ts`: `makeGitFs` import alias removed (kept `makeGitFs as makeFs`).
- `AIService.ts`: dead `yielded = true;` in fallback chunk loop removed.

### What's intentionally NOT changed

- **`'worklet'` directives** (35 × `js/unknown-directive`): required by `react-native-reanimated` to mark functions that run on the UI thread. Removing them breaks the canvas editor and animated components.
- **`__setProState`** (25 × `js/call-to-non-callable`): a real export from `src/stores/proStore`. CodeQL can't resolve the type through the module's circular structure; tests prove it works at runtime.
- **`FEATURE_USE_MULTI_HOST_WRITE` trivial conditionals** (8 ×): an intentional feature flag currently disabled. The dead branches keep the sync engine's mode-switching seams intact and per `docs/wiki/sync-engine.md` source-of-truth rule, sync-architecture flags are not refactored without an explicit migration.
- **Repo/todoRepo guards in save paths** (4 ×): redundant given the current hook contracts, but they sit in data-critical save paths (canvas save, todo save, new-note default-path) where a defensive null guard is preferred over removing the condition.
- **`isTesting` in `ConnectHostModal`**: the state IS toggled by `setIsTesting(true|false)` in handlers; CodeQL's "always false" is a flow-sensitive inference, not a real dead branch.
- **`!yielded` in `AIService` streaming**: the generator's error-path flag is intentionally defensive; the streaming flow has a `#691` regression history.
- **`jest` global at line 1 in two test files**: `jest` is the Jest global from `@jest/globals`; line-1 `jest.mock(...)` precedes the implicit binding declaration that CodeQL's analysis can't see.
- **`node !== null` in `header-blur.test.tsx`**: a legitimate null guard in a test helper that walks `node.parent`.

## How to re-check after a push

The PR's "Code Quality" check on GitHub reruns CodeQL automatically — the per-PR SARIF reduces findings to whatever's left at the new commit.
