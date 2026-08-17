# Stage → Push UX: Card Locks, Push Buttons, and Push Progress

Stage-then-push rework that separates the *stage* phase from the *push* phase
in the user-visible locking and progress model.

## Problem

- Note/todo/canvas cards stayed **locked (grayed + spinner) until the push
  completed** — in API mode that could mean minutes (idle auto-push at 3 min).
  The card was only supposed to be locked while its edit was being staged.
- The Stage screen push buttons showed an `ActivityIndicator` while pushing,
  replacing the label.
- Clone-mode pushes (which go through isomorphic-git directly, bypassing
  `http.ts`) never surfaced in the GitHubActivity pill.

## Changes

### 1. Upsert ops are `staged`, not `queued` — cards unlock after stage

`src/stores/gitOperationStore.ts`:
- Added a `'staged'` status to `GitOpStatus`.
- `opFromQueuedMutation` now maps `note.upsert` queue mutations to
  `status: 'staged'` instead of `'queued'`. These ops stay in the registry
  (stage screen stays consistent) but are **not** "active" — `isActiveStatus`
  still covers only `queued`/`running` — so `useEntityLock`, `isPathLocked`,
  and `isEntityLocked` no longer lock the card after staging.
- `note.delete` mutations keep `status: 'queued'`: the local row stays
  visible-but-locked until the push removes it (pinned by the delete-lock
  integration tests).

Net effect: editing a note stages it, the card unlocks immediately, and new
edits queue for the next push cycle. The editor already had a stage-scoped
volatile op (`useNoteEditorDocument`), which is unchanged.

### 2. Push buttons: disabled, no spinner

`src/screens/StageScreen.tsx`: the group-Push and Push-all buttons no longer
swap their label for an `ActivityIndicator` while pushing. They render the
label (`Push` / `Push all`) always and rely on `disabled` + grayed background
during a push. `accessibilityState.disabled` and the `stage.push.*` testIDs
are unchanged.

### 3. Push progress in the GitHubActivity pill

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

## Tests

- `__tests__/stores/gitOperationStore.test.ts`: staged upserts do **not** lock
  paths/entities; queued deletes still lock; the lock-durability-across-refresh
  test now exercises delete mutations (upserts no longer lock by design).
- `__tests__/screens/StageScreen.test.tsx`: pushing buttons keep their label
  and render no `ActivityIndicator`.
- `__tests__/services/StagePushScheduler.test.ts`: each push is wrapped in
  `githubActivity.begin('Pushing changes')` / `end()`; `end()` still runs on
  failure.
- `__tests__/services/git/localGitWriter.test.ts`: `push` forwards
  `onProgress` to `git.push`.
- `__tests__/services/StagingService.test.ts`: clone-mode push forwards
  `onProgress` to `githubActivity.setProgress`.
- `__tests__/sync-locking.integration.test.ts` + `notes-delete-lock.test.tsx`:
  unchanged — deletes keep locking until the push completes.
