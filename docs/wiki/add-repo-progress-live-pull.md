# Add Repo Progress & Live Pull — Freeze/Crash Fix

Adding a repo via the picker (default sync mode is `clone`) could freeze the app
or crash it, and after the clone finished the post-clone pull ran invisibly.
Three independent problems, all on the add-time import path:

## 1. Clone-phase freeze/crash: unthrottled progress events

`importRepoAfterAdd` in `src/screens/SettingsScreen.tsx` called
`setCloneProgress` on every isomorphic-git progress event. isomorphic-git emits
one event per 1% change for "Receiving objects" and "Resolving deltas", and per
object for "Writing objects" — roughly 300+ events per clone, each re-rendering
the un-memoized settings subtree including the whole repo picker list.

Combined with CPU-heavy pack parsing on the JS thread, the render storm
saturated the thread: native scroll kept working, but taps died and sustained
load crashed the app (iOS watchdog / Hermes heap).

Fix (`src/utils/progressThrottle.ts`, `src/screens/SettingsScreen.tsx`): a
shared `createThrottledEmitter` helper coalesces progress updates — a 200ms
time-throttle with an immediate flush when the phase string changes, and a
guaranteed flush of the terminal event so the bar always reaches its final
state. Phase transitions stay instant while the per-1% storm collapses to a
handful of renders.

## 2. Pull-phase freeze: microtask-only CPU starvation

After the clone, `importRepoAtAdd` ran the post-clone pull with no progress
events and no re-renders — yet the app still froze. `fetchInBatches` in
`src/services/RepoPullService.ts` chains per-batch `Promise.all` continuations
as microtasks only, and React Native's render + touch dispatch are
macrotask-driven, so a long microtask-only loop starves the UI. Each
`GitFsService.readFile` plus the O(F×N) upsert loop and the single-block
`JSON.stringify` in `saveAllNotes` kept the JS thread saturated for
seconds-to-minutes on large repos.

Fix (`src/utils/yieldToMain.ts`, `src/services/RepoPullService.ts`): a
`yieldToMain()` helper (`new Promise(resolve => setTimeout(resolve, 0))`)
inserts macrotask yields between batches in `fetchInBatches` (covering notes,
canvases, todos, and templates pulls in one shared helper) and every ~25 items
in the notes upsert loop, including around `saveAllNotes`. RN gets macrotask
slots to render and dispatch touches between CPU-bound git reads. A yield is
not a worker thread, so this stays inside the existing no-thread boundary.

## 3. Post-clone pull now shows in the same progress bar

The pull previously accepted no progress callback, so the bar froze at the last
clone state while notes/todos/canvases/templates imported silently.

Fix: `RepoPullService.pullFromSingleRepo` (and each per-type pull) now accepts
an optional `CloneProgressCallback (phase, loaded, total)` — the same signature
that already flows through the clone. `RepoImportService.importRepoAtAdd`
forwards the callback it already receives, so the pull phase renders in the
same in-picker progress bar with app-authored phase messages ("Reading
repository…", "Importing notes…", and so on).

## 4. Alive status line

The progress UI had a static "…" and a static phase line, so a long clone or
pull looked stuck. `CloneProgressContent` in
`src/components/settings/CloneProgressModal.tsx` now shows a cycling ellipsis
("." → ".." → "...") at 400ms while progress is active, driven by the
phase-change flush so the text changes instantly on each phase.

## 5. Always refresh stores after a successful import

`importRepoAfterAdd` only refreshed the stores when counts > 0, and pull
failures were swallowed to zero counts — so a silently-failed pull left the
Notes page empty until a later manual pull.

Fix (`src/screens/SettingsScreen.tsx`): drop the `counts > 0` guard and always
refresh note/todo/canvas stores after a successful add-time import
(`refreshNotes` → `loadNotes` re-reads storage and updates the Zustand store,
which the list screens subscribe to reactively). A zero-count outcome logs a
warning instead of hiding behind an empty list.

## Tests

- `SettingsScreen.add-repo-import.test.tsx`: throttle assertion (progress
  updates coalesced to ~200ms intervals with a terminal flush), always-refresh
  on zero counts.
- `RepoImportService.test.tsx`: `importRepoAtAdd` forwards the progress
  callback to the pull path.
- `RepoPullService*.test.ts`: pull progress callbacks emit app-authored phases
  with loaded/total counts; `fetchInBatches` yields to the main thread between
  batches.
- Clone-progress UI: animated status line renders in `CloneProgressContent`.
