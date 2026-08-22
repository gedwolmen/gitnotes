# Clone-Mode Idle Push — Deterministic 3-min Window (#1020)

> A note saved in clone mode was committed locally but the floating push button didn't surface it and the 3-minute idle auto-push never fired on schedule. Investigation (live repro on the iPhone 17 simulator) confirmed the commit + surfacing + manual push all work — the failure was in the **idle-push trigger timing**.

## Root cause

Two defects in `src/services/StagePushScheduler.ts`:

1. **Idle window reset on any store churn** — `onStagedChanged` was subscribed to the *whole* stage store (`useStageStore.subscribe(...)`), so *any* state update — including `pushProgress`/`isPushing`/`pushQueue` churn from an in-flight push — restarted the 3-minute countdown. A push that was slow or failing kept bumping its own retry window; the auto-push never settled.
2. **Stale-read dead-end in `flushStaged`** — the timer reads `store.staged` directly. If the timer fires before `loadStaged()` has populated the store (cold start, or a notification that arrived while a reload was in flight), `flushStaged` finds nothing, enqueues nothing, and nothing re-triggers it — the committed note sits unpushed with no visible badge.

## Change

`src/services/StagePushScheduler.ts`:

1. **Content-based timer reset** — `onStagedChanged(state, prevState)` now compares a `stagedSignature` (repo/branch/path/kind/mode/commit-oid) of the staged set; the idle window restarts **only** when the staged set actually changes. `pushProgress`/`isPushing` churn no longer resets it.
2. **Fresh-read flush** — `flushStaged` is now async and calls `await loadStaged()` *before* reading `store.staged`, so a timer that fires against a stale/empty store still sees the just-staged clone-mode commit and enqueues the push.

`src/stores/stageStore.ts` — `StageState` interface exported for the scheduler's typed subscriber.

| Risk | Reversible | Verified |
|---|---|---|
| Low — changes only *when* the idle countdown resets and *how fresh* the flush reads are; no push semantics changed | Yes | `__tests__/services/StagePushScheduler.test.ts` (22/22 incl. new: churn does NOT reset the window; staged-set change DOES) |

## Notes

- The downstream push delay (idle push waiting behind a slow `ForegroundSync` pull that holds the `GitSyncGate` cycle) is the #1022 pull-perf issue — a separate fix.
- Manual push (Stage screen / floating button press-and-hold) was verified working end-to-end during the repro: commit → badge → Stage "(unpushed commits)" → push → GitHub.

## Verification

```bash
yarn jest __tests__/services/StagePushScheduler.test.ts --no-coverage --forceExit
yarn ts:check
```
