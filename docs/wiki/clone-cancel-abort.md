# Clone Cancel — Real HTTP Abort + Unstuck Tabs (#1016, #1017)

> Tapping Cancel during a clone registered the tap but the clone kept running — the cancel flag was only checked inside isomorphic-git's `onProgress` callback, which **never fires while the clone is stuck inside the HTTP fetch**. The `CloneProgressModal` (full-screen backdrop + bottom sheet) stayed open, so the translucent backdrop sat over the tab bar: tabs stayed *visible* but swallowed every tap.

## Root cause

`src/screens/SettingsScreen.tsx` — `handleCancelClone` only set `cloneAbortedRef.current = true`. The actual abort check lived in the `onProgress` callback passed to `GitFsService.clone`:

```ts
onProgress: (phase, loaded, total) => {
  if (cloneAbortedRef.current) throw new Error('CLONE_CANCELLED');
  ...
}
```

When the clone hung inside `gitHttp.request` (server stall, slow network — never reaching a progress update), `onProgress` never fired, so the flag was never observed. The clone continued until the 600s HTTP timeout, and the modal's backdrop blocked all navigation — the "tab bar visible but unresponsive" symptom of #1017.

## Change

`src/screens/SettingsScreen.tsx` — `handleCancelClone` now calls `cancelInflightGitHttp()` (the abort hook added in #1013) before the grace-timer dance:

1. User taps Cancel → `cancelInflightGitHttp()` aborts the in-flight git HTTP request (the clone's `git-upload-pack` POST) → `gitHttp.request` throws `Git HTTP request cancelled by user`.
2. `GitFsService.clone` rejects → `handleEnableCloneMode`'s catch sees `cloneAbortedRef.current` and returns → `finally` clears `cloningRepo` + `cloneProgress`.
3. The modal closes immediately (no 10-minute wait), the backdrop lifts, and the tab bar responds again.

The pre-existing 800ms grace-timer force-close remains as a fallback for the case where no HTTP request is in flight (e.g. cancelling during isomorphic-git's post-download packfile indexing).

| Risk | Reversible | Verified |
|---|---|---|
| Low — cancelling an in-flight request is the intended outcome of the Cancel button; abort propagates through the existing catch/finally cleanup | Yes | `__tests__/screens/SettingsScreen.test.tsx` (18/18, new: cancel press calls `cancelInflightGitHttp`) + `gitHttp.test.ts` Case F (cancel aborts in-flight request) |

## Notes

- The two issues share one root cause: a clone stuck inside the fetch leaves the blocking modal up. #1016 is the direct fix (cancel actually aborts); #1017 (dead tab bar) is the same modal backdrop — fixed by the same change.
- The 600s clone HTTP timeout itself (why a stuck clone takes so long without cancelling) is tracked under #1021 (clone perf).

## Verification

```bash
yarn jest __tests__/screens/SettingsScreen.test.tsx --no-coverage --forceExit
yarn ts:check
```
