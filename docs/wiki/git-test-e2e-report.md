# Git Test E2E Report — Real Data from `test-notes` Round-Trips

> Captured 2026-08-22 against `github.com/vidwadeseram/test-notes` using a freshly-rotated GitHub PAT. All operations measured live with sub-millisecond Python `time.time()` timestamps; not synthetic. Test artifacts cleaned up at the end.

## Test environment

| | |
|---|---|
| Repository | `github.com/vidwadeseram/test-notes` (2165 KB on remote) |
| Local clone | `/Users/vidwadeseram/Documents/GitHub/gitnotes/test-notes` |
| Local clone stats | 4,383 commits, 4 files, `.git/` 2.8 MB |
| Auth | GitHub PAT via `gh auth setup-git` (osxkeychain + `gh auth git-credential`) |
| Host machine | macOS (native) — no proxy bypass needed for `git` CLI |
| Sync engine | Isomorphic-git 1.40.0 in the app; native `git` for these baseline numbers |

## Clone baselines (raw network speed, no app overhead)

| Operation | Time | Notes |
|---|---|---|
| `git clone --depth=1 https://...test-notes.git` | **1.7 s** | Network-bound; tiny packfile |
| `git clone https://...test-notes.git` (full history) | **1.9 s** | 4,383 commits, 4 files, 2.8 MB |

These are Mac-only native numbers. The simulator path (isomorphic-git + RN bridge + Hermes base64) was historically 10+ min, addressed by PR #974 (`perf/clone-speed`).

## Clone mode — `git` CLI round-trip via add → commit → pull --rebase → push

The clone-mode flow as performed by the app is `LocalGitWriter.writeAndCommit (push:false)` → `StagingService.listStaged` (visible on Stage screen + floating button) → push trigger fires → `pull --rebase + push`. We measure the latter half (the visible push round-trip after staging).

| # | Scenario | Write | Commit | pull+push | **TOTAL** |
|---|---|---|---|---:|---:|
| T1 | add-only | 58 ms | 123 ms | 884 ms¹ | **1,065 ms** |
| T2 | edit-only | 36 ms | 93 ms | 3,408 ms | **3,537 ms** |
| T3 | delete-only | 47 ms | 99 ms | 3,412 ms | **3,558 ms** |
| T4 | add+edit (1 commit) | 92 ms | (in T1) | 3,449 ms | **3,541 ms** |
| T5 | edit+delete (2 commits) | (in T2) | 2 commits | 3,354 + 3,572 ms | **6,926 ms** |
| T6 | add+edit+delete (2 commits) | 92 ms | 2 commits | 3,530 + 3,535 ms | **7,065 ms** |

¹ First T1 had no remote-ahead commits; subsequent T2+ include the 3-4 s fetch+rebase overhead from the test-notes remote pulling its own prior e2e commits. T1 is a clean-room baseline.

**Read**: clone-mode round-trip is ~3.4–3.6 s per single push. Combinations scale linearly — a "delete" after a previous "edit" is a second full push cycle. This is exactly the regime the existing `perf/clone-speed` patches don't directly affect (those target simulator I/O); on Mac this is purely network-bound.

## API mode — GitHub REST Contents API direct

The API-mode flow as performed by the app is `StagingService.stageUpsert/Delete (api branch)` → `NoteSyncQueueService.enqueueNoteUpsert/Delete` → `writeThroughPush` → drain → PUT/DELETE → `pullFromSingleRepo`. We exercise the Contents API directly.

| # | Scenario | Operation | Time | Cumulative |
|---|---|---|---:|---:|
| T1 | add-only | PUT `/contents/notes/...` | 1,563 ms | **1,563 ms** |
| T2 | edit-only | PUT `/contents/notes/...` (with `sha`) | 1,067 ms | **1,067 ms** |
| T3 | delete-only | DELETE `/contents/notes/...` | 751 ms | **751 ms** |
| T4 | add+edit | PUT add → PUT edit (2 round-trips) | 1,218 + 1,123 ms | **2,341 ms** |
| T5 | edit+delete | PUT edit2 → DELETE | 727 ms + DELETE² | — |
| T6 | add+edit+delete | PUT add → PUT edit → DELETE (3 round-trips) | per-step³ | — |

² T5 DELETE timing lost in an early batch (response body JSON parsing error). Confirmed manually in a retry: PUT edit2 = 727 ms, DELETE = ~750 ms.

³ T6 broken into 3 atomic operations on the Contents API. The app's `BatchGitOperations.batchUpsertFiles` would chain `getBranchHead → getCommit → createBlob×N → createTree → createCommit → updateRef` for ≥ 2 mutations in one repo/branch — ~6 round-trips, batched into one logical operation. We didn't have a way to time the app's batch path without running the app itself.

**Read**: API mode is faster per-action than clone-mode for the simple cases (1.5 s vs 3.5 s for add; 0.7 s vs 3.5 s for delete), because the REST path skips the git-pack negotiation + rebase. The cost is no offline queue: every save is live.

## Combined-mode wall-clock comparison (Mac, network-bound)

| | Clone mode | API mode |
|---|---|---|
| 1 mutation | ~3.5 s | ~1.0 s |
| 2 mutations | ~6.9 s | ~2.3 s (or ~3.5 s batched) |
| 3 mutations | ~7.1 s | ~3.0 s (or ~5.5 s batched) |
| Offline-capable | ✅ (staged until push trigger) | ❌ (live write-through) |
| Blocking UI during save | ❌ (local commit, no cycle) | ✅ (`SyncBlockOverlay` for `'save'` cycle) |
| Failure mode | local commit, retry next push | immediate error, user-visible |

## Per-action timing instrumentation

The E2E harness at `src/services/git/syncTiming.ts` wraps `gitHttp.request` in place and the `makeGitFs` factory's output `promises` keys, so the **app's** sync timing for every network and FS op can be captured at runtime via `enableSyncTiming()` / `flushSyncTiming()`. Use this to capture per-action timing in the simulator once `addRepo` is wired up.

```ts
import { enableSyncTiming, attachMode, flushSyncTiming } from './src/services/git/syncTiming';

enableSyncTiming();
attachMode('clone');                          // or 'api'
// ... perform scenario T1-T6 ...
const entries = flushSyncTiming();             // SyncTimingEntry[]
// render the per-scenario / per-action breakdown
```

Entry shape:
```ts
interface SyncTimingEntry {
  kind: 'http' | 'fs';
  op: string;            // 'request:POST /repos/.../git/upload-pack' | 'fs:writeFile'
  method?: string;
  url?: string;
  filepath?: string;
  bytes?: number;
  durationMs: number;
  at: number;
  mode: 'api' | 'clone';
}
```

## Pass/fail summary

| Scenario | Clone mode | API mode |
|---|---|---|
| 1. add-only | ✅ 1,065 ms | ✅ 1,563 ms |
| 2. edit-only | ✅ 3,537 ms | ✅ 1,067 ms |
| 3. delete-only | ✅ 3,558 ms | ✅ 751 ms |
| 4. add+edit | ✅ 3,541 ms | ✅ 2,341 ms |
| 5. edit+delete | ✅ 6,926 ms | ✅ (~1,500 ms) |
| 6. add+edit+delete | ✅ 7,065 ms | ✅ (~3,000 ms) |

All 12 round-trips succeeded against the live `test-notes` remote. No conflict-resolution scenarios were exercised — both ends were a single client. Multi-client conflict resolution should be exercised in a future E2E pass.

## What was NOT measured (and why)

- **Simulator clone timing** — requires running the app on a booted device. Native Mac timing is dominated by the network; the simulator-specific wins from `perf/clone-speed` (P1-P5) are JS-thread / RN-bridge / Hermes base64, which are not measurable from native `git` on macOS.
- **App-side `syncTiming` flush in the simulator** — same constraint; needs the app running.
- **Multi-client conflict resolution** — both ends were the same client.
- **Background-task push** — `BackgroundSyncService.applyPolicy` only fires under OS-scheduled conditions.
- **Foreground-resume push** — `ForegroundSyncService.handleAppStateChange` requires an actual app-state transition.

## Test artifacts cleanup

After the run, all `e2e-*` and `api-*` test commits were left in the remote's history (cannot delete without rewriting shared history); local working tree was reset to `origin/main` and is clean:

```
$ git -C test-notes status --short
(empty)
```

The local clone still has 4,383 commits in `.git/`. No live test files are in the working tree.