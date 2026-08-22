# Foreground Pull Health — Settings Indicator (#1007)

> A foreground pull that exceeds the 60s watchdog (or fails) was invisible to the user — no status anywhere said "auto-sync is failing". A stalled pull became invisible-but-permanent. This adds the UI surface.

## Background

During the simulator E2E tests, Metro captured one isolated `[ForegroundSync] pull (interval) exceeded 60000ms` warning while pulls otherwise succeeded in 1.3–2.7s. Not blocking (the pull still completes; the cycle is released in `finally`; the next interval fires anyway), but if the timeout becomes persistent the user is effectively offline with **no UI signal**.

The watchdog path was already handled by the failure backoff added in #984: `watchdogTimedOut` forces `success = false` → `consecutiveFailures++` → the 30s→300s exponential backoff applies. What was missing was *surfacing* the failure.

## Change

### `src/services/ForegroundSyncService.ts`

- New health state tracked from each pull outcome:
  - `ForegroundSyncHealth` interface: `{ healthy, lastSyncAt, lastFailedAt }`
  - Success → `lastSyncOutcome = 'ok'`, `lastSyncAt = now`
  - Failure or watchdog timeout → `lastSyncOutcome = 'failed'`, `lastFailedAt = now`
- New `getForegroundSyncHealth()` getter.
- Existing `subscribeForegroundSync` listeners are notified on every pull start/end, so the UI updates reactively.

### `src/hooks/useForegroundSyncHealth.ts` (new)

React hook subscribing to the sync listeners and returning the current `ForegroundSyncHealth`.

### Settings → Sync engine (`SettingsContent.tsx` + `SettingsScreen.tsx`)

When `!health.healthy`, a row appears at the top of the Sync engine group: alert icon + **"Last sync failed"** + relative time (`Nm ago`), testID `settings.row.sync-health-failed`. i18n key `settings.lastSyncFailed` added to all six locales (en/es/fr/de/ja/ko — the `i18n-key-parity` guard requires it).

## Tests

`__tests__/ForegroundSyncService.test.ts` additions:

- healthy after a successful pull (`lastSyncAt > 0`)
- unhealthy after a pull failure (`lastFailedAt > 0`)
- recovers to healthy after a later success (advancing past the 30s failure backoff)

## Notes

- The watchdog itself still does not cancel the pull (by design — the cycle release lives with the work, and the next interval fires anyway). This issue only adds observability; cancelling a stuck pull would need a deeper abort path and is out of scope.
- The `#1007` "consecutive timeout → longer interval" suggestion was already satisfied by the #984 failure backoff (`consecutiveFailures` doubles the wait after failures, capped at 300s).
