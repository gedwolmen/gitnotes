# Clone-Perf Optimization — PR #974 (perf/clone-speed)

> Five ordered patches closing the gap between the existing pack-index yield fix (`45bc468b`) and a usable clone on the iOS simulator.

## Baseline (before P1)

- **macOS**: ~20s end-to-end clone for `test-notes`
- **iOS simulator**: 10+ minutes, frequent app freeze / crash
- Root cause: every FS op is an RN-bridge round-trip through the simulator sandbox + Hermes JS-thread base64. The simulator's I/O is orders of magnitude slower than native macFS. Combined with the full working-tree materialization (interleaved with object writes), ~5 tree walks per pull, per-blob reads, and **3 concurrent fetch+fastForward+LFS scans** on the same repo, the JS thread saturates and the app appears frozen.

## P1 — `perf(clone): noCheckout + batched full checkout`

**File**: `src/services/git/GitFsService.ts` (`clone()` method).

Pass `noCheckout: true` to `git.clone()` so all object downloads finish before any working-tree writes start. Then call `git.checkout({ fs: makeRepoFs(), dir, ref: opts.branch, batchSize: 64 })` to materialise the working tree in 64-file batches with the existing yield path (`YIELD_EVERY_N_WRITES=50` in `gitFs.ts`) handling JS-thread breathing.

**Data-integrity constraint (critical)**: kept the checkout FULL — no sparse paths. Reason: `LocalGitWriter.writeAndCommit` (`src/services/git/LocalGitWriter.ts:264-279`) writes the file → `git.add` → `git.commit`; `git.commit` builds the tree from the **index**. A sparse checkout would produce a sparse tree and **DELETE every un-checked-out file on the next push**. Sparse checkout requires a blob-direct write path (issue I-10).

| Risk | Reversible | Verified |
|---|---|---|
| Low — same end-state working tree; only ordering changes | Yes (revert commit) | clone round-trip + `git.status` clean + `LocalGitWriter` write+delete commit cycle |

## P2 — `perf(pull): dedup 3-concurrent pull per repo`

**File**: `src/services/RepoPullService.ts` (`pullFromSingleRepo`, `pullAllFromRepos`).

`pullNotesFromRepo` / `pullCanvasesFromRepo` / `pullTodosFromRepo` each called `getRepoReader()` → `pullWithFastForward()` → its own `git.fetch (depth 3)` + `git.fastForward` + `LfsService.scanRepo`. **3 redundant network fetches + 3 redundant full-tree LFS walks per pull on the same repo**.

Resolution: resolve the reader ONCE before the `Promise.all` and thread the shared reader through the scope functions. The per-scope `listTree` and `readFile` calls remain ref-scoped (cheap). Only the fetch / fast-forward / LFS scan is deduplicated.

The diverged-conflict path (`RepoPullService.ts:100-121`) is preserved — the shared reader still exposes `mode` (`reader.mode` consumed at `:394`).

| Risk | Reversible | Verified |
|---|---|---|
| Medium — shared-reader contract must keep `mode` exposure | Yes | `__tests__/services/RepoPullService*.test.ts` (4 files) + `syncTiming` shows exactly 1 `POST .../upload-pack` per pull (was 3) |

## P3 — `perf(clone): LFS scan moves off clone critical path`

**Files**: `src/services/git/GitFsService.ts:186-190`, `src/services/git/lfs.ts:89-132`.

`LfsService.scanRepo` previously ran inline during `git.clone` — `lfs.ts:89-132` walked every working-tree file (`readDirectoryAsync` + `readAsStringAsync` per file) **before** clone resolved.

Change: fire `LfsService.scanRepo` as a detached best-effort task after clone resolves (`void scanRepo(...).catch(() => {})`). Pointer detection is now **eventually-consistent** — UI must check `LfsService.isPending()` (or equivalent) before surfacing a "Download" affordance.

| Risk | Reversible | Verified |
|---|---|---|
| Low-medium (pointer detection is eventually-consistent) | Yes | clone timing delta + LFS pointer tests if any |

## P4 — `perf(gitFs): UTF-8 fast path for text content`

**File**: `src/services/git/gitFs.ts`.

Every `readFile` / `writeFile` previously base64-round-tripped through the RN bridge (`base64ToBytesAsync` L15-57, `bytesToBase64Async` L80-94). Most note content is UTF-8 text.

Change: detect text by extension (`md` | `norg` | `org` | `txt` | `json`); for text, use `FileSystem.readAsStringAsync(uri)` (utf8) and `FileSystem.writeAsStringAsync(uri, text)` directly. Binary paths keep the base64 branch unchanged.

| Risk | Reversible | Verified |
|---|---|---|
| Medium — misclassifying binary as text corrupts blobs | Yes | round-trip test asserts sha-identical blobs before/after |

## P5 — `perf(git): depth-3 floor — measurement flag`

**File**: `src/services/git/GitFsService.ts`.

The default `MIN_DIVERGENCE_HISTORY_DEPTH = 3` (L19) forces `fetch` and `pullWithFastForward` to depth 3 (`L233, L273`). This is the floor required for `findMergeBase` (L432-449) to detect divergence.

Change: **do not change the default**. Add an env-gated flag `process.env.GITNOTES_EXPERIMENT_DEPTH_2 === '1'` that allows depth 2 for the E2E harness to measure whether divergence detection still works at depth 2. Default behavior unchanged.

| Risk | Reversible | Verified |
|---|---|---|
| High if wrong (silently disables conflict detection) | Yes | gated by env, default path unchanged |

## Stretch (deferred — see issues I-10, I-12)

- **I-10**: Sparse checkout requires rewriting `LocalGitWriter` to build trees via `git.writeBlob` → `git.updateIndex` → `git.writeTree` → `git.commit` instead of `git.commit` from the index. High risk (data loss via index/tree-merge bugs).
- **I-12**: Stream packfile response to a temp file via `expo-file-system` instead of buffering the full response into one `Uint8Array`. Touches the code that fixed #790.

## Verification commands

```bash
cd .worktrees/perf-clone-speed
yarn ts:check
yarn jest __tests__/services/RepoPullService*.test.ts __tests__/services/StagingService*.test.ts __tests__/services/gitFs*.test.ts --no-coverage --forceExit
yarn eslint . --ext .ts,.tsx
```

The E2E harness (`__tests__/e2e/`) measures per-action wall-clock time on both macOS and the iOS simulator. Pre/post numbers go in the `docs/wiki/e2e-sync-testing.md` report table.

## Follow-up issues filed

I-1 (`noCheckout` unused), I-2 (3-concurrent pull), I-3 (LFS-on-critical-path), I-4 (depth-3 floor), I-5 (packfile buffer), I-10 (sparse-checkout blob-direct), I-11 (depth measurement), I-12 (packfile streaming).