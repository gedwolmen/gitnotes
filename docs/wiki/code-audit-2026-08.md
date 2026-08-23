# Code Audit — 2026-08-23

> First-pass audit of `src/` to identify code-quality wins before any auto-fixes. **This document is a prioritized list, not a TODO board.** Pick from Tier 1 → Tier 4 as time allows.

## How this was generated

| Check | Tool |
|---|---|
| File sizes | `find src/ -name "*.ts" -o -name "*.tsx" \| xargs wc -l` |
| `any` usage | `grep -rn ": any\|<any>\|as any" src/` |
| `unknown` usage | `grep -rn ": unknown\|<unknown>" src/` |
| `// @ts-ignore` family | `grep -rn "@ts-ignore\|@ts-expect-error\|@ts-nocheck" src/` |
| Real `TODO`/`FIXME` | `grep -rn "TODO\\b\|FIXME\\b\|XXX\\b\|HACK\\b" src/` |
| Test coverage | cross-referenced `src/services/`, `src/hooks/`, `src/stores/`, `src/screens/` against `__tests__/` |

## Summary

- **0** `// @ts-ignore` / `@ts-expect-error` / `@ts-nocheck` directives (clean).
- **`no-explicit-any` is `warn`, not `error`** in `eslint.config.js` — that's why ~120 `any` usages survive.
- **30 files use `unknown`** (good — type-safe escape hatches).
- **24 files exceed 250 LOC**, 8 exceed 900 LOC.
- **6 services** in `src/services/` lack a direct unit test file.
- **8 hooks** in `src/hooks/` lack a unit test file.
- **2 explicit TODOs** in `src/` (one is a real stub, one is a navigation pointer).

---

## Tier 1 — high-impact, low-risk

### 1.1 `colors: any` → `ThemeColors`

**Where**: 6+ component props (`FolderTreeView.tsx:41`, `TemplateSelector.tsx:32`, `StructuredRenderer.tsx:281`, `useNoteEditorPreview.ts:38`, plus internal helpers in `SettingsContent.tsx`).

**Fix**: a single `ThemeColors` type already exists inline in `SettingsContent.tsx:33-42`. Promote it to `src/theme/colors.ts` (or `src/types/theme.ts`) and import across consumers.

**Effort**: ~30 min. **Risk**: zero — pure type tightening. **Value**: removes the most common `any` footgun.

### 1.2 `useRef<any>(null)` → `useRef<TextInput>(null)`

**Where**: `RepoTreeRenameDialog.tsx:19`, `RepoTreeMoveDialog.tsx:28`.

**Fix**: import `TextInput` from `react-native`, type the ref.

**Effort**: 5 min. **Risk**: zero.

### 1.3 `(_event: any, selectedDate?: Date)` → typed picker event

**Where**: `TodoListScreen.tsx:502, 517` and `TodoEditorModal.tsx:33-34`.

**Fix**: import `DateTimePickerEvent` from `@react-native-community/datetimepicker` and type the param. The `selectedDate` arg is already typed.

**Effort**: 10 min. **Risk**: zero.

### 1.4 `(err: any)` → `unknown` + narrowing

**Where**: `ChatThreadListScreen.tsx:182, 214, 256`, `ProviderConfigModal.tsx:184, 258`, and ~6 others.

**Fix**: standard `catch (err: unknown) { const message = err instanceof Error ? err.message : String(err); … }`. TypeScript's `useUnknownInCatchVariables` will enforce this once enabled.

**Effort**: 1–2 hours across ~15 sites. **Risk**: zero. **Value**: removes another ~15 `any` usages.

### 1.5 Zustand selector `s: any`

**Where**: `DraftLayerRenderer.tsx:81-87, 159`, `AcceptDiscardBar.tsx:39-49, 62`, `useLongPressForVision.ts:61-77`, `draftStore.ts:76`.

**Fix**: define `DraftCommand` type (or use the inferred `DraftState`) and replace `(s: any)` with `(s: DraftState)`. Same for `useAIStore`.

**Effort**: 30 min. **Risk**: low (state shape is already typed in the store's interface).

---

## Tier 2 — oversized files (decomposition candidates)

| File | LOC | Suggested split | Priority |
|---|---|---|---|
| `src/components/canvas/CanvasEditorContent.tsx` | **1969** | Split by feature: `CanvasToolbar`, `CanvasDraftingLayer`, `CanvasTilesLayer`, `CanvasSelectionLayer`, `CanvasKeyboardShortcuts`. Each <300 LOC. | **High** — biggest single file in the repo; changes here touch a lot. |
| `src/components/settings/SettingsContent.tsx` | **1319** | Extract per-section components: `SettingsSyncGroup`, `SettingsAccountGroup`, `SettingsAIGroup`, `SettingsProGroup`, etc. | **High** — settings has grown organically; new sections always risk merge conflicts. |
| `src/services/GitHubService.ts` | **1263** | Split by responsibility: `GitHubRepoOps`, `GitHubIssueOps`, `GitHubFileOps`, `GitHubAuthOps`. The existing `GitHubHostService` / `GitHubHostWriteService` / `GitLabService` siblings suggest the right granularity. | **Medium** — already partly decomposed; the remaining monolith is the legacy `GitHubService` class. |
| `src/screens/SettingsScreen.tsx` | **1106** | Move modals + flows to `SettingsModals.tsx` (already partial) and per-flow components. | **Medium** |
| `src/services/ai/actionExecutor.ts` | **1093** | Group by action type (note, canvas, todo, search, etc.) into per-domain executors that share a common `ActionContext`. | **Medium** |
| `src/services/RepoPullService.ts` | **955** | Split `pullFromSingleRepo` into per-type pullers (`pullNotes`, `pullCanvases`, `pullTodos`, `pullTemplates`) — currently a single 600+ LOC method. | **Medium** |
| `src/services/NoteSyncQueueService.ts` | **904** | Split out the durable-op persistence and the queue draining into separate concerns. | **Low** — works but tightly coupled. |
| `src/components/StructuredRenderer.tsx` | **893** | Already partial decomposition; remaining bulk is the renderer pipeline. Lower priority. | **Low** |

**Effort estimate**: Tier 2 work is multi-day. Do **one** per sprint — never refactor + add a feature in the same PR.

---

## Tier 3 — test coverage gaps

### 3.1 Services without direct unit tests

| Service | LOC | Has test? | Suggested coverage |
|---|---|---|---|
| `ExportService.ts` | — | ❌ | round-trip export → import equivalence; format coverage (.md, .json, .zip) |
| `OnboardingService.ts` | — | ❌ | step ordering, persistence, completion predicate |
| `ShareService.ts` | — | ❌ | URL scheme, payload formatting, fallback handling |
| `StorageService.ts` | — | ❌ | CRUD on note/todo/canvas + storage-backend selection |
| `TemplateService.ts` | — | ❌ | template CRUD, slug derivation, folder routing |
| `TodoGitHubSyncService.ts` | — | only integration | serialization round-trip, branch routing, conflict surface |
| `TemplateGitHubSyncService.ts` | — | ❌ | serialization, repo routing |
| `RepoFileSyncService.ts` | — | ❌ | file copy semantics, conflict detection |
| `PositionMemoryService.ts` | — | ❌ | persistence, restore, key derivation |
| `LastUsedRepoService.ts` | — | ❌ | preference ordering, migration |
| `NoteFormatPreferenceService.ts` | — | ❌ | default + override resolution |

### 3.2 Hooks without direct unit tests

| Hook | Notes |
|---|---|
| `useBackgroundSync.ts` | OS background-task registration, lifecycle transitions |
| `useEntityFilter.ts` | filter state + URL deep-link sync (only `useEntityList` is tested) |
| `useForegroundSyncHealth.ts` | new surface; coverage needed for `idle/syncing/ok/failed/timedout` transitions |
| `useForegroundSyncSettings.ts` | interval + timeout persistence |
| `useGitHubQueries.ts` | query key derivation, error → toast mapping |
| `useProviderAvailability.ts` | provider reachability logic |
| `useRecognitionIndexing.ts` | see Tier 4.1 — stubbed with `null as any` |
| `useResponsive.ts` | breakpoint selection (low priority — visually verifiable) |

**Effort**: Tier 3 work is mostly mechanical. Aim for **2–3 new test files per week** until the gap closes.

---

## Tier 4 — explicit stubs / deferred work in code

### 4.1 `useRecognitionIndexing.ts:36`

```ts
fileStorage: null as any, // TODO: wire actual FileStorageService
```

This is the **single most concrete deferred work** in the codebase. The hook is shipped with a typed `any` placeholder. Resolution requires either wiring `FileStorageService` or deleting the hook.

**Decision needed**: keep (and wire), or remove (and remove dead callers)?

### 4.2 `AppNavigator.tsx:219`

```tsx
{/* TODO(todo 11): point Conflicts at the upgraded SyncStatusScreen … */}
```

The Conflicts route points at a legacy screen while the new one exists. Resolve by repointing to `SyncStatusScreen.tsx` and removing the legacy `ConflictResolverScreen.tsx` if no other consumers.

---

## Tier 5 — patterns to watch (not bugs yet)

These are stylistic patterns that don't break anything but indicate the codebase was grown (and possibly AI-augmented) at speed. None warrant an immediate rewrite.

- **Per-screen custom hook controllers** (`useChatScreenController.ts`, `useNoteEditorDocument.ts`, `useStageButtonPosition.ts`, etc.) — each owns a slice of screen state. Fine for now; the line where they cross 500 LOC is the line to split.
- **Inline `type` aliases** at the top of large files (e.g. `SettingsContent.tsx:33-49`) — should be promoted to `src/types/` once the second consumer appears.
- **Wide imports** — many files import 20+ symbols from `react-native` / `src/services/`. Not a perf issue, but increases merge-conflict surface.

---

## Tier 6 — dead-code detection

`ts-prune` would catch unused exports but it's not installed. Recommend adding it to a CI job:

```jsonc
// package.json scripts (proposed)
"find:dead": "ts-prune --error 2>&1 | grep -v '__mocks__\\|node_modules'"
```

Run once to baseline, then every PR.

---

## Recommended order of operations

1. **Tier 1.1 → 1.5** in a single PR ("type tightening pass"); no behavior change, ~50 `any` removed.
2. **Tier 4.2** as its own PR (small, mechanical, ships to main quickly).
3. **Tier 2: CanvasEditorContent split** — pick the biggest offender first; biggest readability win.
4. **Tier 3** — fill test gaps incrementally; gate new services with required tests.
5. **Tier 4.1** — needs design call, not mechanical work.

## Out of scope (intentionally)

- **README overhaul** — picked for OSS work but user deferred.
- **CONTRIBUTING.md depth** — picked for OSS work but user deferred.
- **Repo hygiene files** (`CODEOWNERS`, `.editorconfig`) — picked for OSS work but user deferred.
