# Stage → Push UX: No Row Locks, Push Buttons, and Push Progress

Stage-then-push model where the *push button* (not the card rows) is the single
coordination point for pending work.

## Problem

- Note/todo/canvas cards stayed **locked (grayed + spinner) until the push
  completed** — in API mode that could mean minutes (idle auto-push at 3 min).
  Deleting a note left its row grayed out until a push happened to drain, and
  new edits made mid-push couldn't be pushed until the in-flight push finished.
- The floating push button showed an `ActivityIndicator` while pushing,
  replacing the icon.
- Delete failures were only surfaced as an inline locked row with a Retry
  alert — the row that the user had just deleted.

## Changes

### 1. No row locks — rows are always interactive

All per-row lock UI has been removed. Notes, todos, canvases, and thought-dump
rows never gray out, never disable, and never show a lock spinner or failure
icon. The `useEntityLock` hook (`src/hooks/useGitOpLock.ts`) was deleted along
with its consumers (`LockedNoteRow`, `LockedTodoRow`, `LockedDumpRow`,
`BentoTile`'s lock overlay, `EditorHeader`'s save lock). Deleting a note in
either API or clone mode now removes the row immediately:

- `noteStore.deleteNote` stages the delete, then removes the note from storage
  and state and succeeds the git op synchronously. The queue holds the pending
  delete mutation, which the next push drains.
- The queue's success/drop side-channel handlers (`onDeleteMutationSucceeded` /
  `onDeleteMutationDropped`) stay armed but are idempotent no-ops: by the time
  the queue reports, the note and op are already gone.
- `EditorHeader`'s Save button is disabled only by `isSaving`. The
  `hasActiveDeleteLock` guard in `useNoteEditorDocument` still blocks a save of
  a note whose delete is pending (Alert, no sync call).

### 2. Deletes are staged, not pinned

A drop by the push (durable error / exhausted retries) is recorded in the
durable `@gitnotes:delete_failures_v1` map (`src/services/git/deleteFailures.ts`)
by the queue's drain path and by the drop handler. Failures surface on the
Stage screen's **Failed to delete** section, not on a row:

- `StageScreen` reads `readDeleteFailures()` and renders path/repo/error with a
  Retry button per entry.
- Retry calls `retryDeleteFailure` (`src/services/git/retryDeleteFailure.ts`),
  which clears the durable entry, succeeds any leftover registry ops on the
  path, re-enqueues the delete, and does **not** drain — the user pushes when
  ready.

### 3. Push buttons: grayed, no spinner

- `src/screens/StageScreen.tsx`: group-Push and Push-all buttons keep their
  label and render no `ActivityIndicator`; they rely on `disabled` + grayed
  background during a push.
- `src/components/git/FloatingStageButton.tsx`: the floating button no longer
  swaps its cloud icon for a spinner. While any push is in flight it keeps the
  icon, grays its background (`colors.border`), dims the icon, and disables
  tap/long-press. New edits made mid-push stage normally and are drained by the
  next push once the current one finishes.

### 4. Push progress in the GitHubActivity pill

- `LocalGitWriter.push` accepts an optional `onProgress` callback and forwards
  it to the isomorphic-git `git.push` calls (initial + retry paths).
- `StagingService.pushStaged` wires the clone-mode push loop's `onProgress` to
  `githubActivity.setProgress({ phase: 'Pushing changes', loaded, total })`.
- `StagePushScheduler.drainPushQueue` wraps each `pushStaged` in a
  `githubActivity.begin('Pushing changes')` / `githubActivity.end()` cycle
  (end runs in `finally`, so a failed push still clears the pill).

The pill's existing `ProgressBar` renders a determinate percentage when
`total > 0` and an indeterminate bar otherwise — clone pushes now show real
object-transfer progress.

### 5. Immediate drain on explicit push

Previously, pressing Push on the Stage screen or long-pressing the floating
button only enqueued work into `StagePushScheduler`. The actual drain started
only when the 3-minute idle timer (`STAGE_PUSH_IDLE_MS`) fired — meaning an
explicit push could sit idle for up to 3 minutes before anything happened.

Now, both call sites trigger `drainPushQueue()` immediately after enqueuing:

- `FloatingStageButton.handleLongPress`: calls `drainPushQueue()` after
  `pushAll()`.
- `StageScreen.handlePushAll`: calls `drainPushQueue()` after `pushAll()`.
- `StageScreen.handlePushGroup`: calls `drainPushQueue()` after
  `requestPush()`.

`drainPushQueue` has a re-entrancy guard (`draining` flag), so redundant calls
are safe and fire-and-forget (`void`). The idle-timer auto-push path
(`flushStaged`) is unchanged.

The circular-import constraint (`stageStore` must not import
`StagePushScheduler`) is preserved: drain is triggered from UI call sites, not
from the store.

## Tests

- `__tests__/stores/gitOperationStore.test.ts`: staged upserts do **not** lock
  paths/entities; queued deletes still register as durable ops but rows no
  longer consume locks.
- `__tests__/screens/StageScreen.test.tsx`: pushing buttons keep their label
  and render no `ActivityIndicator`.
- `__tests__/components/FloatingStageButton.test.tsx`: pushing grays the button,
  hides no spinner, keeps the icon.
- `__tests__/services/StagePushScheduler.test.ts`: each push is wrapped in
  `githubActivity.begin('Pushing changes')` / `end()`; `end()` still runs on
  failure. New tests verify immediate drain after explicit `pushAll` and
  `requestPush` calls, plus an idle auto-push regression guard.
- `__tests__/services/git/localGitWriter.test.ts`: `push` forwards
  `onProgress` to `git.push`.
- `__tests__/services/StagingService.test.ts`: clone-mode push forwards
  `onProgress` to `githubActivity.setProgress`.
- `__tests__/notes-delete-lock.test.tsx` + `__tests__/sync-locking.integration.test.ts`:
  rewritten for the vanish contract — deletes remove rows immediately, failures
  surface via the Stage screen, and no row ever renders a lock spinner.