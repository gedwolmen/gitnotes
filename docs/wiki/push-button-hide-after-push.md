# Floating Push Button Not Hiding After a Successful Push

> `StagingService.pushStaged` now broadcasts `notifyStagedChanged()` after the clone-mode push loop succeeds, so `stageStore.loadStaged()` re-runs and `pendingCount` drops to 0 — the floating push button hides immediately instead of lingering until the Stage screen is opened.

## Symptom

In clone mode, after a successful push (press-and-hold the floating button, Push / Push-all on the Stage screen, or the 3-minute idle auto-push), the floating push button sometimes stays visible with its stale badge. Opening the Staged Changes screen forces it to hide.

## Root cause

The button renders `null` only when `useStageStore.pendingCount === 0` (`FloatingStageButton.tsx`). `pendingCount` is recomputed *only* inside `stageStore.loadStaged()`, which re-reads `StagingService.listStaged()` (local HEAD vs `refs/remotes/origin/<branch>`).

The push chain in clone mode:

1. `drainPushQueue` → `StagingService.pushStaged(repo, branch)`.
2. `pushStaged` calls `NoteSyncQueueService.drain()` first, then `LocalGitWriter.push()` for each clone key.
3. `drain()` ends with `saveAll()` → `notify()` → stageStore's queue subscription → `loadStaged()`. **But this fires before the clone pushes run** — at that instant `refs/heads/<branch>` is still ahead of `refs/remotes/origin/<branch>`, so `listStaged()` still returns the `(unpushed commits)` row and `pendingCount` stays > 0.
4. After `LocalGitWriter.push()` succeeds, nothing re-fires `loadStaged()`: `LocalGitWriter` emits no event, and `notifyStagedChanged()` was only ever called on *staging* (clone-mode `stageUpsert`/`stageDelete`), never on *push completion*.

So the store keeps the pre-push snapshot until something else calls `loadStaged()` — the Stage screen does on mount (and pull-to-refresh), which is why opening it "fixes" the button. The "sometimes" is the race: if the drain-triggered `loadStaged()` happens to complete after the push lands (slow ref reads), the count refreshes correctly.

## Fix

`src/services/git/StagingService.ts` — `pushStaged()` now calls `notifyStagedChanged()` after the clone push loop succeeds (only when `cloneKeys.size > 0` and all pushes report success). The stage store already subscribes to this emitter (`subscribeStagedChanged` → `loadStaged()`), so `pendingCount` is recomputed against post-push refs and the button hides.

- Broadcast happens only on **success**: a failed clone push leaves the commits staged and the button visible.
- API-mode pushes do **not** broadcast here — their drain already notifies the queue subscription (notifying both would double-load the stage store, per the existing emitter contract comment).

## Verification

`__tests__/services/StagingService.test.ts` — three new `pushStaged` cases:

- successful clone push fires the staged-changed listener exactly once (button hides),
- failed clone push does not fire it (button stays),
- api-mode push does not fire it (queue notify already covers the refresh).

`yarn ts:check`, the full `yarn jest` suite (2838 tests), and eslint all pass; the single pre-existing `patch-package` ENOENT failure is an environment issue (binary absent from `node_modules`), unrelated to this change.

## Related

- [#925](https://github.com/gedwolmen/gitnotes/issues/925) — clone staging never surfaced the push button (fixed by emitting `notifyStagedChanged` on staging); this fix covers the opposite direction: surfacing the *disappearance* after a push.
