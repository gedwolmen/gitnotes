# Push Stuck — 10-min Timeout + Cancel Escape (#1013)

> A push on a bad network froze the whole app: `SyncBlockOverlay` covered the UI with no escape while the underlying git HTTP request was allowed to hang for 10 minutes (`FETCH_TIMEOUT_MS = 600_000`). The only unblock was force-quitting the app.

## Root cause

`src/services/git/gitHttp.ts` used one 600-second timeout for every git HTTP request — including `git-receive-pack` pushes, which only upload local objects and should never take 10 minutes. When a push stalled (server hang, DNS, captive portal), `LocalGitWriter.push` → `git.push` stayed pending, the GitSyncGate cycle stayed held, and `SyncBlockOverlay` (issue #926) blocked all input with no cancel affordance.

## Change

### 1. Fail-fast push timeout (`src/services/git/gitHttp.ts`)

- `PUSH_TIMEOUT_MS = 60_000` for URLs containing `git-receive-pack` (the push path).
- `FETCH_TIMEOUT_MS = 600_000` stays for everything else — large clone/fetch **downloads** (`git-upload-pack`) legitimately take minutes on big repos (#790), so the timeout was NOT blanket-reduced.
- Error messages now include the per-request timeout (`timed out after 60000ms`) instead of a hardcoded number.

A bad-network push now fails in ~1 minute with a real error instead of freezing for 10.

### 2. Cancel button on `SyncBlockOverlay` (`src/components/ui/SyncBlockOverlay.tsx`)

- New module-level `cancelInflightGitHttp()` in `gitHttp.ts`: aborts the currently in-flight git HTTP request (tracked per-request `AbortController`) and makes it throw `Git HTTP request cancelled by user` (distinct from a timeout).
- The overlay arms a **Cancel** button only after the block has persisted `CANCEL_ARM_MS = 5s` (short syncs shouldn't invite cancelling). Pressing it haptics, flips the label to "Cancelling…", and calls `cancelInflightGitHttp()`. The abort propagates → `git.push` rejects → the cycle's `finally` releases → the overlay hides and the user is unblocked. Staged changes are untouched and will retry on the next push trigger.
- i18n: `sync.overlay.cancel` / `sync.overlay.cancelling` added to all six locales.

## Out of scope (tracked as follow-ups)

- **Surface push errors to the user** (issue suggestion 3) — the app has no toast/banner primitive; the Stage screen currently has no `pushError` state. The fail-fast timeout + cancel now prevent the *stuck* case, which was the blocking complaint.
- **Allow Clone→API mode switch mid-push** (issue suggestion 4) — interacts with the #984 latch semantics; intentionally deferred.

| Risk | Reversible | Verified |
|---|---|---|
| Medium-low — push timeout is strictly shorter; download path untouched. The cancel aborts only the in-flight request (single-flight sync cycle), and the "cancelled by user" error flows through existing push error handling (no re-clone, no data loss — staged commits stay) | Yes | `__tests__/services/git/gitHttp.test.ts` (7/7 incl. 60s push timeout, 600s download timeout, cancel-in-flight) + `__tests__/components/ui/SyncBlockOverlay.test.tsx` (20/20 incl. cancel arming, press → abort, "Cancelling…", hide-on-clear) + i18n parity |

## Verification

```bash
yarn jest __tests__/services/git/gitHttp.test.ts --no-coverage --forceExit
yarn jest __tests__/components/ui/SyncBlockOverlay.test.tsx --no-coverage --forceExit
yarn jest __tests__/i18n-key-parity.test.ts --no-coverage --forceExit
yarn ts:check
```
