# Stage → Push UX: No Row Locks, Push Buttons, and Push Progress

Stage-then-push model where the *push button* (not the card rows) is the single
coordination point for pending work. Pushes drain immediately on explicit
trigger, show determinate progress, emit body-text notifications, and resume
automatically after foreground re-entry.

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

### 6. Determinate progress ring

`FloatingStageButton` renders a `HoldProgressRing` that shows a determinate arc
during a push. The ring reads `stageStore.pushProgress` (a `number | null`
value, range 0..1):

- When `pushProgress` is a number, `ringProgress` follows it directly, giving
  the user real progress feedback.
- When `pushProgress` is `null` (total unknown, e.g. clone push before
  transport progress lands), the ring holds a small `0.15` arc — it reads
  "working", not "almost done". (Previously clamped at 0.9, which made a push
  look ~90% complete from the start.)
- When no push is in flight, the ring resets to 0.

The progress fraction comes from `StagePushScheduler.drainPushQueue`, which
passes `(fraction) => useStageStore.getState().setPushProgress(fraction)` to
`StagingService.pushStaged`. API-mode drain computes `completed / totalDue`
across parallel (repo, branch) groups; clone-mode push forwards
`loaded / total` from the isomorphic-git transport callback.

### 7. Body-text push notifications

`PushNotificationService.subscribeToPushProgress()` watches the stage store
and emits three notification phases under the constant identifier
`PUSH_NOTIFICATION_ID` (`'gitnotes-push-progress'`):

1. **Start.** When `isPushing` transitions false to true, a notification fires
   with body `"Pushing 0/N files…"` (or `"Pushing staged changes to GitHub"`
   when `pendingCount` is 0). `pushTotal` is captured from `pendingCount` at
   this moment.
2. **Progress.** While pushing, each `pushProgress` change that differs from
   the previous value updates the body to `"Pushing N/M files…"` where
   N = `Math.round(pushProgress * pushTotal)` and M is the total count. Updates
   are throttled to one per second via
   `Date.now() - lastProgressSentAt < PROGRESS_THROTTLE_MS` (1000 ms).
3. **Completion.** When `isPushing` transitions true to false, a final
   notification shows `"Push complete"` / `"All staged changes pushed to
   GitHub"`.

All three phases use `NotificationService.dismissAndReschedule`, which cancels
the scheduled notification and dismisses any presented one, then re-schedules
under the same `PUSH_NOTIFICATION_ID` with a `TIME_INTERVAL` trigger of
`seconds: 1`. This works around expo-notifications having no in-place update
API.

All push progress notifications are **suppressed while the app is in the
foreground** (`AppState.currentState === 'active'`) — the in-app ring and the
githubActivity banner already communicate progress, so a banner would be
redundant noise. Notifications fire only when the push runs while the app is
backgrounded.

### 9. Data safety: note paths and the pull reconcile

A note's backing file path is its identity across devices. Two rules keep a
pushed note from appearing "gone" after a restart:

- **New notes default into `notes/`.** The editor writes a brand-new note
  (no folder) to `notes/<slug>.<ext>` — matching `deriveDefaultNotePath` in
  `noteStore` — so the pull's `notes/*` import filter can re-import it after a
  push + restart. Writing to the repo root would leave the file on GitHub but
  invisible to the app.
- **The reconcile never drops a file that exists on the remote.** The pull
  builds its "still exists" set from **all** tree blobs (not just `notes/*`),
  so a note at the repo root or in a custom folder is not mistaken for a
  remote deletion. Staged-but-unpushed paths are also protected (pending sync
  queue mutations in API mode; the local branch tree in clone mode), so a
  restart mid-push cannot drop local work.

### 8. Resume on foreground

A push interrupted by the app being backgrounded (kill, OS reclaim, user
switching apps) resumes automatically when the app returns to the foreground.

`StagePushScheduler.drainPushQueue` sets an AsyncStorage marker
(`gitnotes-push-session`) when the FIFO loop starts, and clears it when the
queue fully drains. `ForegroundSyncService.handleAppStateChange` checks for
this marker on `AppState → active`:

```
hasPushSession().then((active) => {
  if (active && useStageStore.getState().staged.length > 0) {
    void drainPushQueue();
  }
});
```

If the marker exists and there are staged items remaining, `drainPushQueue` is
called immediately. The re-entrancy guard (`draining` flag) prevents overlap
with a concurrent drain. The push session marker is idempotent: clone push
re-pushes the same refs safely, and API-mode drain re-runs whatever mutations
remain in the sync queue.

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
- `__tests__/components/FloatingStageButton.test.tsx`: progress ring follows
  `storePushProgress`, holds a small 0.15 arc when total is unknown, resets
  when idle.
- `__tests__/services/StagePushScheduler.test.ts`: `drainPushQueue` forwards
  progress fraction to `stageStore.setPushProgress`; resets `pushProgress` to
  null when the queue empties.
- `__tests__/services/PushNotificationService.test.ts`: start notification
  captures `pushTotal` from `pendingCount`; progress notification computes
  `Math.round(progress * total)` body text; completion notification fires on
  `isPushing` false transition; throttled at 1/sec.
- `__tests__/services/ForegroundSyncService.test.ts`: `hasPushSession` returning
  true with staged items triggers `drainPushQueue` on `AppState → active`.