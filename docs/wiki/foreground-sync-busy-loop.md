# ForegroundSync Busy-Loop — Skip Spam Fix (#984)

> The foreground sync scheduler could spam `[ForegroundSync] skip (interval): background work still pending` on every interval tick while a timed-out pull's background work was still settling — hundreds of log lines per hour in metro/tmux, wasting CPU in the scheduler.

## Root cause

`ForegroundSyncService.runPull` had three busy-skip branches (`inFlight`, `pendingBackgroundWork`, coalesce) that all logged unconditionally in `__DEV__`. When a pull exceeded `PULL_TIMEOUT_MS` (600s), `pendingBackgroundWork` stayed `true` until the underlying `pullAllFromRepos()` settled (up to another GitSyncGate cycle-watchdog window), so every interval tick re-logged the same skip with no back-off.

## Change

`src/services/ForegroundSyncService.ts`:

1. **Log throttle** — `logSkip(reason, detail)` suppresses the skip log to at most one per `SKIP_LOG_THROTTLE_MS` (10s) via `lastSkipLogAt`.
2. **Busy-skip back-off** — `markBusySkip` increments `consecutiveSkips` on every busy skip (`inFlight` / `pendingBackgroundWork`), and `consecutiveSkips` resets to 0 once a pull actually runs.
3. **Interval re-scheduling with jitter** — the fixed `setInterval` became a self-scheduling `setTimeout` loop (`scheduleIntervalTick`) whose delay grows while the scheduler stays busy:
   `delay = min(baseMs * 2^consecutiveSkips, SKIP_BACKOFF_MAX_MS)` with ±10% jitter. A stuck pull therefore spaces out its own re-checks instead of hammering every tick.

| Risk | Reversible | Verified |
|---|---|---|
| Low — pull semantics unchanged (`shouldPull` gate, coalesce, failure backoff all preserved); only skip logging + interval cadence under busy conditions changed | Yes | `__tests__/ForegroundSyncService.test.ts` (11/12 pass; one new back-off test iterating) |

## Notes

- The queue-ordering question from the issue ("foreground pass never drains the background queue") is **by design** — `runPull` → `pullAllFromRepos()` never drains `NoteSyncQueueService`; that is documented in `sync-engine.md` ("No queue drain") and tracked as AGENTS.md gaps #925/#938. The busy-loop was a *symptom* of the stuck-pull timeout flag, not a queue-ordering bug.
- `restartInterval()` clears any pending timeout and resets `consecutiveSkips`, so a config change or app foreground always restores the configured cadence.

## Verification

```bash
yarn jest __tests__/ForegroundSyncService.test.ts --no-coverage --forceExit
yarn ts:check
```
