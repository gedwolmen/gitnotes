# ForegroundSync Pull — Skip Idle LFS Walk (#1022)

> Pulls for a 45-file repo took 7-8s (spikes to 27s) while the pull interval was comparable — the app was effectively always syncing, starving other sync work (see the #1020 cascade). One structural waste stood out: **every `pullWithFastForward` ran a full working-tree LFS-pointer walk even when the fetch brought nothing new.**

## Root cause

`GitFsService.pullWithFastForward` ran three steps unconditionally:

1. `git.fetch` — smart-HTTP fetch (the dominant cost on the bridge-fs JS thread).
2. `git.fastForward` — local branch update.
3. `LfsService.scanRepo` — **walk the entire working tree** (`readDirectoryAsync` + `getInfoAsync` per entry, bounded concurrency) and persist the pointer map.

Step 3 ran even when the fetch produced no new objects (remote unchanged). On an idle pull cadence — the exact scenario in the QA logs — the whole tree walk was pure waste every cycle.

## Change

`src/services/git/GitFsService.ts` — `pullWithFastForward` now resolves `refs/remotes/origin/<branch>` *before* and *after* the fetch and runs the LFS scan **only when the ref moved**:

- ref moved → new objects arrived → new LFS placeholders can exist → scan.
- ref unchanged → nothing new → skip the walk entirely.

Correctness argument: LFS pointers only enter the working tree via fetched content; a no-op fetch cannot introduce them.

Also added a `__DEV__` timing log (`pullWithFastForward (repo@branch) in Nms (fetched|no new objects)`) so pull-phase costs stay observable — the diagnostic the issue asked for.

| Risk | Reversible | Verified |
|---|---|---|
| Low — the scan is skipped only when the remote ref is provably unchanged; the fetch/fast-forward path is untouched | Yes | `__tests__/services/git/gitFsService.test.ts` (23/23, new: scan skipped on unchanged ref, scan runs on moved ref) + all pull-path suites (152/152) |

## Notes

- The remaining pull cost is the isomorphic-git fetch itself (pack processing on the JS thread through the expo-file-system bridge) — a deeper fix belongs to #1021's true-streaming track.
- The idle-push starvation that #1020 hit is reduced here: idle pulls no longer hold the GitSyncGate cycle while walking the tree.

## Verification

```bash
yarn jest __tests__/services/git/gitFsService.test.ts --no-coverage --forceExit
yarn ts:check
```
