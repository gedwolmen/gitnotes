# E2E Sync Testing

> End-to-end test harness for the gitnotes sync engine. Covers 6 scenarios × 2 modes with timing instrumentation, push-trigger verification, uncommitted-changes sub-checks, blocking-overlay verification, and remote verification.

## Running the Harness

```bash
# Type check
yarn ts:check

# Run syncTiming unit tests
yarn jest __tests__/e2e/syncTiming.test.ts --no-coverage --forceExit

# Run the full E2E suite (requires live PAT + test-notes remote)
yarn jest __tests__/e2e --no-coverage --forceExit

# Lint
yarn eslint . --ext .ts,.tsx
```

## Architecture

```
src/services/git/syncTiming.ts    # Runtime instrumentation (wraps gitHttp.request + makeGitFs promises)
__tests__/e2e/test-notes-fixture.ts  # 6 scenario op-sequences + content factories
__tests__/e2e/e2e-runner.ts      # runScenario(scenario, mode) → ScenarioReport
__tests__/e2e/report.ts           # assembleReport(rows) → Markdown + JSON
```

### Timing Instrumentation

`syncTiming.ts` monkey-patches two chokepoints without editing source files:

1. **`gitHttp.request`** (plain exported object) — wrapped in place at `enableSyncTiming()` call time. Every HTTP call to GitHub is intercepted and recorded with method, URL, duration, and byte count.
2. **`makeGitFs(root)`** factory — each returned `PromiseFsClient.promises` object has its `readFile / writeFile / unlink / mkdir / readdir / stat` methods wrapped. All clone-mode FS traffic passes through this single chokepoint.

`flushSyncTiming()` returns all buffered `SyncTimingEntry[]` and clears the buffer. `attachMode('api'|'clone')` labels subsequent entries so timing data can be correlated with mode switches mid-run.

## Test Matrix — 6 Scenarios × 2 Modes

| # | Scenario | API mode | Clone mode | Clone push trigger | Timing checkpoints |
|---|---|---|---|---|---|
| 1 | add-only | PUT → file on GitHub immediately | local commit → floating push btn count | long-press floating btn | T0→T1→T2→T3 |
| 2 | edit-only | PUT w/ sha → updated immediately | committed edit → push | Push all | T0→T1→T2→T3 |
| 3 | delete-only | DELETE (sha-cached) → gone | committed delete → push | per-group push | T0→T1→T2→T3 |
| 4 | add+edit | 2 PUTs batched → GitHub immediately | 2 commits → push | 3-min idle auto-push | T0→T1→T2→T3 |
| 5 | edit+delete | PUT + DELETE → both live | committed edit+delete → push | OS bg task (≤10 files) | T0→T1→T2→T3 |
| 6 | add+edit+delete | full batch chain → live | all committed → push | foreground resume | T0→T1→T2→T3 |

### Timing Checkpoints

| Checkpoint | Meaning |
|---|---|
| T0 | Save start — user triggers save/complete |
| T1 | Commit/enqueue — local commit formed (clone) or queue insert (API) |
| T2 | Git ops complete — last HTTP or FS call returned |
| T3 | GitHub visible — remote reflects the change (verified via `git pull` + `gh api`) |

## Push-Trigger Sub-Checks (Clone Mode)

For each clone-mode scenario the runner asserts:

1. **Uncommitted-visibility before push**: after executing ops but before the trigger fires:
   - `UnpushedCommitsService.listUnpushed(repoPath, branch)` returns the expected unpushed commits
   - `unpushedCommitsStore.pendingCount > 0`
   - Floating push button count reflects the uncommitted set

2. **No remote change before push**: before the trigger fires, `gh api` returns the pre-scenario state for all affected paths.

3. **Push-trigger fires**: the designated trigger (`long-press-floating-btn`, `stage-push-all`, `per-group-push`, `3-min-idle-autopush`, `os-bg-task`, `foreground-resume`) is called.

4. **Uncommitted cleared after push**: `UnpushedCommitsService.listUnpushed` returns an empty set post-trigger.

## Blocking-Overlay Verification (API Mode)

Per [Sync Write Modes](./sync-write-modes.md#blocking-ui-syncblockoverlay), `SyncBlockOverlay` renders a fullscreen blocking overlay whenever the git operation store has an active cycle with `source === 'save'` or `source === 'manual'`.

API-mode scenarios assert:

- **`blockOverlayFired`**: `gitOperationStore` recorded a `source:'save'` cycle during the save window — proxy for `SyncBlockOverlay` having rendered and blocked input.
- **`pullAfterPush`**: `pullFromSingleRepo` was called after push, confirming the pull-after-push refresh path.

## Remote Verification Commands

After each scenario completes (both modes), run on the Mac host to confirm remote truth:

```bash
# Pull latest state from test-notes
git -C /Users/vidwadeseram/Documents/GitHub/gitnotes/test-notes pull origin main

# Verify a file is present
gh api "repos/vidwadeseram/test-notes/contents/notes/<id>.md" --jq .sha   # must return SHA

# Verify a file is absent
gh api "repos/vidwadeseram/test-notes/contents/notes/<id>.md" --jq . 2>&1 | grep "Not Found"  # expect 404

# Verify file content
gh api "repos/vidwadeseram/test-notes/contents/notes/<id>.md" --jq .content | base64 -d
```

## Scenario Report Template (per scenario per mode)

```
## Scenario N — <name> · Mode <api|clone> · <date/time>

| Checkpoint | Time (ms) | Notes |
|---|---|---|
| T0 save start | — | |
| T1 commit/enqueue | +T1-T0 | API: queue insert; clone: local commit w/ push:false |
| T2 git ops (http+fs) | +T2-T0 | from syncTiming: http ops count/bytes, fs ops count |
| T3 GitHub visible | +T3-T0 | via git pull (Mac) + gh api |
| Push propagation latency | T3-T2 | |

Push trigger used: [floating long-press | Push all | per-group push | 3-min idle | OS bg task | foreground resume]
Remote verification: [files present/absent/content-sha — PASS/FAIL]
Blocking overlay (API only): [blocked during save / released after — PASS/FAIL]
Overall: PASS / FAIL (reason)
```

## Sync Engine Mode Contract

| Contract element | Clone mode | API mode |
|---|---|---|
| Save behaviour | local commit with `push:false` | write-through to GitHub immediately |
| Push screen | shows unpushed commits + pending count | shows queue depth |
| Floating button | shows pending count badge | shows sync-in-flight spinner |
| Push trigger | required — user action | not applicable (immediate) |
| `UnpushedCommitsService.listUnpushed` | returns local unpushed commits | returns queue-backed items |
| `SyncBlockOverlay` | never fires | fires during `source:'save'` cycle |
| Pull after push | not on save path | `pullFromSingleRepo` after push |

See [Sync Write Modes](./sync-write-modes.md) for full contract documentation.

## Implementation Notes

- **No source edits**: `gitHttp.ts` and `gitFs.ts` are never modified by this harness. All instrumentation happens at runtime via monkey-patch.
- **WT-B compatible**: because WT-B patches preserve function signatures, `syncTiming` wrappers keep working post-WT-B-merge with no changes needed.
- **Mock strategy**: the harness runs cleanly against mocks in CI (`yarn jest`); the full E2E run with real git/network requires the `test-notes` remote and a valid `GITHUB_TOKEN` in shell env.
- **PAT handling**: the token is read from shell environment only (`process.env.GITHUB_TOKEN`), never stored in code or `.env`.
