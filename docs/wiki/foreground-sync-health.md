# ForegroundSync Watchdog — Sync Health Surfacing (#1007)

> A single pull exceeding the 60-second `PULL_WATCHDOG_MS` watchdog logged one dev-only `console.warn` and was otherwise invisible: the app kept polling, the pull eventually completed or timed out at 600 s, and the user never saw that sync was stalled. On a device where every pull exceeds 60 s, the app is effectively offline with **no status indicator anywhere**.

## Root cause

`ForegroundSyncService.runPull` armed a 60 s watchdog that set a local `watchdogTimedOut` flag and logged. The failure/backoff machinery already existed — `watchdogTimedOut` forces `success = false`, which increments `consecutiveFailures` and arms the existing exponential backoff, and the busy-skip mechanism backs off the interval while a timed-out pull's background work is still pending (`#984`). The missing piece was entirely **user-facing**: nothing exposed pull health, so a stalled sync was indistinguishable from a healthy one.

## Change

`src/services/ForegroundSyncService.ts`:

1. **Health state** — a module-level `ForegroundSyncHealth` (`status: 'idle' | 'syncing' | 'ok' | 'failed' | 'timedout'`, plus `lastRunAt`, `lastCompletedAt`, `lastFailedAt`, `consecutiveFailures`) is updated at each lifecycle point in `runPull`:
   - pull starts → `syncing`
   - success → `ok` (resets `consecutiveFailures`)
   - failure → `failed`
   - watchdog fired before the cycle settled → `timedout`
2. **`getForegroundSyncHealth()`** — snapshot getter; existing `subscribeForegroundSync` listeners are notified on every transition, so no new event plumbing was needed.

`src/hooks/useForegroundSyncHealth.ts` — new hook that subscribes and returns the current health.

`src/components/settings/SettingsContent.tsx` — a **sync health row** in the Sync group (below Background Sync) that renders only once a sync has run:
- `syncing` → spinner + "Syncing…"
- `ok` → primary-colored checkmark + "Sync up to date"
- `failed` / `timedout` → red alert icon + "Last sync failed" / "Last sync timed out", with a "N consecutive failures" subtitle when `consecutiveFailures > 1`.

`src/i18n/en.json` — five new keys (`syncUpToDate`, `syncInProgress`, `syncLastFailed`, `syncLastTimedOut`, `syncFailureCount`); other locales fall back to English via `fallbackLng`.

Backoff behavior was **not** changed — it already covers the watchdog path via `consecutiveFailures` + busy-skip; this issue's gap was visibility.

| Risk | Reversible | Verified |
|---|---|---|
| Low — pull semantics unchanged; health is additive state + one Settings row (hidden until first sync) | Yes | `__tests__/ForegroundSyncService.test.ts` (15/15 incl. idle/syncing/ok/failed/timedout transitions) + `__tests__/components/settings/SettingsContent.sync-health.test.tsx` (4/4 row render states) |

## Notes

- The timedout state is deliberately distinct from `failed`: a watchdog hit means the pull was slow (or the device is memory-starved), which is worth distinguishing from a hard pull error for diagnostics.
- "Last sync failed" shows only failures driven by the foreground sync engine; manual syncs (`Settings → Sync` button) and push failures are out of scope for this health surface.

## Verification

```bash
yarn jest __tests__/ForegroundSyncService.test.ts --no-coverage --forceExit
yarn jest __tests__/components/settings --no-coverage --forceExit
yarn ts:check
```
