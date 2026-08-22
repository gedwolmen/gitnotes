# LFS Pointer Scan — Parallel Walk (#980)

> The clone-side blocking half of #980 was already fixed by `8963e2c0` (scan fires fire-and-forget after clone resolves). What remained was the scan's own cost: `scanForPointers` walked the working tree **one file at a time** — a serial RN-bridge round-trip (`getInfoAsync` + `readAsStringAsync`) per file, occupying the JS thread for the whole scan right after a clone/pull.

## Before

`src/services/git/lfs.ts` `scanForPointers`:

```ts
for (const name of entries) {
  ... await FileSystem.getInfoAsync(childUri);   // serial
  ... await FileSystem.readAsStringAsync(childUri); // serial
}
```

On a repo with thousands of working-tree files this was thousands of sequential bridge hops — the dominant post-clone/post-pull CPU cost.

## Change

`src/services/git/lfs.ts`:

- `SCAN_CONCURRENCY = 16` — bounded parallelism (16 concurrent probes) so the walk is ~10x faster than serial while never flooding the bridge with unbounded parallel reads.
- Small `mapLimit(items, limit, fn)` helper drives three phases per directory level, each with bounded concurrency:
  1. metadata resolution (`getInfoAsync`) for all entries
  2. recursive descent into subdirectories
  3. candidate-file reads (`readAsStringAsync` ≤ 2 KiB) + `parseLfsPointer`

Behavior preserved: `.git` skipped at every level, files > `POINTER_MAX_BYTES` (2 KiB) skipped, non-pointer files ignored, `Map<relPath, LfsPointer>` output identical.

| Risk | Reversible | Verified |
|---|---|---|
| Low — same Map output, same skips; only execution order/concurrency changes | Yes | new `__tests__/services/git/lfsScan.test.ts` (5 tests: nested pointers, `.git` skip, size cap, empty repo, missing tree) |

## Notes

- The pull path (`GitFsService.pullWithFastForward` → `await LfsService.scanRepo` best-effort) is untouched — it benefits from the faster walk automatically.
- `scanRepo` return value is unused by callers; all consumers (`listPending`, `isPending`, `getPointer`, `downloadObject` in `SettingsScreen`) read stored state, which is set identically.

## Verification

```bash
yarn jest __tests__/services/git/lfsScan.test.ts __tests__/parseLfsPointer.test.ts --no-coverage --forceExit
yarn ts:check
```
