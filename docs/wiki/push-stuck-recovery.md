# Push Button — Stuck Grayed-Spinner Recovery (#push-stuck)

The stage push button could stay **grayed out with a spinner forever** after a
git push hit a stuck network condition or a long-held sync-gate cycle. Users
were forced to force-quit and lose any in-flight push. This change makes the
button self-healing.

## The leak

`StagePushScheduler.drainPushQueue` flips `isPushing[key]` and `globalPushing`
to TRUE at the start of a push and is supposed to reset them in `finally`.
The reset lived **outside the try** for two critical awaits:

```ts
// StagePushScheduler.drainPushQueue (BEFORE)
setPushing(key, true);
const releaseCycle = await GitSyncGate.acquireCycle(source); // ← outside try
githubActivity.begin('Pushing changes');                     // ← outside try
try {
  await StagingService.pushStaged(...);
} catch (e) { notifyPushFailure(...); }
finally {
  githubActivity.end();
  releaseCycle();
  setPushing(key, false);   // only reached if line above throws
  shiftQueue();
}
// globalPushing reset lived inside the try after the while loop —
// NOT in a finally — so a re-entrant drain early-return (draining guard)
// combined with a non-empty queue would leave globalPushing TRUE.
```

Two race windows:

1. **`acquireCycle` wait.** If the cycle is held by a slow pull (up to the
   GitSyncGate 10-min watchdog), the key stays grayed and spinning for the
   whole hold. After #1013 the network timeout is 60s but the gate wait is
   still unbounded.
2. **`globalPushing` not in finally.** A re-entrant `drainPushQueue` call
   (e.g. user long-press → `pushAll` while the previous drain's tail awaits
   `clearPushSession`) early-returns at the `draining` guard. The first
   drain's `await clearPushSession()` resolves, sees `globalPushing` still
   TRUE, and skips the reset. Queue has items but no drain runs → the
   button stays grayed with the 0.15 indeterminate ring.

## The fix

`StagePushScheduler.drainPushQueue` (`src/services/StagePushScheduler.ts`)
now wraps **every state mutation that flips the push UI** in a try/finally
and resets `globalPushing` + `pushProgress` in the OUTER finally:

- `setPushing(key, true)` → finally `setPushing(key, false)` (always runs).
- `githubActivity.begin` → wrapped in its own try/finally so a throw never
  leaks the activity indicator.
- `setGlobalPushing(false)` + `setPushProgress(null)` → moved into the
  outer finally so a re-entrant drain can't leave them TRUE.

`runOnePush` is a new internal helper that owns the per-key cycle acquisition
and keeps the finally structure flat — no nested state-reset anti-pattern.

### `forceUnlockPushState` escape hatch

`stageStore` now exposes `forceUnlockPushState()` which clears `globalPushing`,
`pushProgress`, and per-key `isPushing` entries without awaiting any drain.
The hook is exported on `StagePushScheduler` as a thin re-export so out-of-band
callers (SyncBlockOverlay cancel handler, foreground re-entry, settings mode
switch) can guarantee the button is unlocked if it ever sits stuck. The
underlying `pushQueue` contents are preserved — pending pushes drain on the
next idle-timer / foreground / explicit trigger.

## Verification

- `StagePushScheduler.drainPushQueue` resets `globalPushing` in the OUTER
  finally even when `pushStaged` throws.
- `drainPushQueue` releases the gate cycle and resets `isPushing` even if
  `acquireCycle` hangs (set finally covers the pre-cycle state flip).
- `forceUnlockPushState` clears stuck `isPushing` / `globalPushing` /
  `pushProgress` without draining (queue preserved).