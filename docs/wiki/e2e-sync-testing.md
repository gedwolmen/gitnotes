# E2E Sync Testing

> End-to-end test harness for the gitnotes sync engine. Covers 6 original scenarios × 2 modes plus 5 write-through clone pipeline scenarios, with timing instrumentation, push-trigger verification, conflict/corruption checks, blocking-overlay verification, and remote verification.

## Running the Harness

```bash
# Type check
yarn ts:check

# Run syncTiming unit tests
yarn jest __tests__/e2e/syncTiming.test.ts --no-coverage --forceExit

# Run the full E2E suite (requires live PAT + test-notes remote)
yarn jest __tests__/e2e --no-coverage --forceExit

# Run write-through pipeline scenarios only
yarn jest __tests__/e2e/write-through-pipeline.test.ts --no-coverage --forceExit

# Lint
yarn eslint . --ext .ts,.tsx
```

## Architecture

```
src/services/git/syncTiming.ts    # Runtime instrumentation (wraps gitHttp.request + makeGitFs promises)
src/services/git/ClonePushTriggers.ts  # Push trigger constants (foreground-active, online-transition, 3-min-idle, os-bg-task)
__tests__/e2e/test-notes-fixture.ts  # 6 scenario op-sequences + content factories
__tests__/e2e/e2e-runner.ts      # runScenario(scenario, mode) → ScenarioReport
__tests__/e2e/report.ts           # assembleReport(rows) → Markdown + JSON
__tests__/e2e/write-through-pipeline.test.ts  # 5 write-through clone pipeline scenarios
```

### Timing Instrumentation

`syncTiming.ts` monkey-patches two chokepoints without editing source files:

1. **`gitHttp.request`** (plain exported object) — wrapped in place at `enableSyncTiming()` call time. Every HTTP call to GitHub is intercepted and recorded with method, URL, duration, and byte count.
2. **`makeGitFs(root)`** factory — each returned `PromiseFsClient.promises` object has its `readFile / writeFile / unlink / mkdir / readdir / stat` methods wrapped. All clone-mode FS traffic passes through this single chokepoint.

`flushSyncTiming()` returns all buffered `SyncTimingEntry[]` and clears the buffer. `attachMode('api'|'clone')` labels subsequent entries so timing data can be correlated with mode switches mid-run.

## Push Triggers — Clone Mode (`ClonePushTriggers.ts`)

The write-through clone pipeline defines four automatic triggers in `src/services/git/ClonePushTriggers.ts`. These replace the old manual staging push model; `tryPushNow` fires on every save when online (8s budget), and these four cover the rest:

| Trigger constant | Fires when | Scope |
|---|---|---|
| `foreground-active` | `AppState` transitions to `active` | All pending changes for the repo |
| `online-transition` | `NetInfo` reports connectivity restored | All pending changes for the repo |
| `3-min-idle` | 3-minute timer fires after last activity | All pending changes for the repo |
| `os-bg-task` | OS background task fires (≤50 files) | Batched set from `ClonePendingQueue` |

On save, `CloneSyncService.save` commits locally then calls `tryPushNow`. If the device is online, push begins within the 8s budget. If offline, changes queue in `ClonePendingQueue` and one of the four triggers above pushes them when connectivity returns.

## Test Matrix — 6 Original Scenarios × 2 Modes

These scenarios test the core CRUD sync paths against both API and clone modes. API-mode behaviour is unchanged from the original harness. Clone-mode scenarios now reference the write-through pipeline triggers from `ClonePushTriggers.ts`.

| # | Scenario | Clone mode | Clone push trigger | Timing checkpoints |
|---|---|---|---|---|---|
| 1 | add-only | PUT → file on GitHub immediately | local commit → tryPushNow fires | `online-transition` | T0→T1→T2→T3 |
| 2 | edit-only | PUT w/ sha → updated immediately | committed edit → tryPushNow fires | `online-transition` | T0→T1→T2→T3 |
| 3 | delete-only | DELETE (sha-cached) → gone | committed delete → tryPushNow fires | `online-transition` | T0→T1→T2→T3 |
| 4 | add+edit | 2 PUTs batched → GitHub immediately | 2 commits → tryPushNow fires | `3-min-idle` | T0→T1→T2→T3 |
| 5 | edit+delete | PUT + DELETE → both live | committed edit+delete → tryPushNow fires | `os-bg-task` | T0→T1→T2→T3 |
| 6 | add+edit+delete | full batch chain → live | all committed → tryPushNow fires | `foreground-active` | T0→T1→T2→T3 |

### Timing Checkpoints

| Checkpoint | Meaning |
|---|---|
| T0 | Save start — user triggers save/complete |
| T1 | Commit/enqueue — local commit formed (clone) or queue insert (API) |
| T2 | Git ops complete — last HTTP or FS call returned |
| T3 | GitHub visible — remote reflects the change (verified via `git pull` + `gh api`) |

## Write-Through Clone Pipeline — 5 New Scenarios

These scenarios test the new clone-mode write-through pipeline: immediate push on save (online), offline queueing, conflict resolution, corruption recovery, and idle auto-push.

### Scenario 7 — Online Save

**Objective:** Edit a note while online, verify push happens within the 8s budget, and FAB appears then disappears.

| Step | Action | Assertion |
|---|---|---|
| 1 | Mock `NetInfo` as online | `NetInfo.fetch()` returns `{ isConnected: true }` |
| 2 | Edit note (provide pre-seeded SHA) | `CloneSyncService.save` commits locally with `push:false` |
| 3 | Assert `tryPushNow` called | Push begins within `PUSH_BUDGET_MS` (8 000 ms) |
| 4 | Assert FAB shows pending count | `unpushedCommitsStore.pendingCount > 0` after commit, before push completes |
| 5 | Assert push completes | `gitHttp.request` received a `POST` pack upload to the remote |
| 6 | Assert FAB count clears | `unpushedCommitsStore.pendingCount === 0` after push |
| 7 | Remote verification | `gh api` returns the updated SHA for the note path |

```
ClonePushTrigger fired: online-transition
FAB lifecycle: appears (pendingCount > 0) → disappears (pendingCount === 0)
Push budget: ≤ 8 000 ms
```

### Scenario 8 — Offline Save

**Objective:** Edit a note while offline, verify it queues in `ClonePendingQueue`, and FAB shows pending count.

| Step | Action | Assertion |
|---|---|---|
| 1 | Mock `NetInfo` as offline | `NetInfo.fetch()` returns `{ isConnected: false }` |
| 2 | Edit note (provide pre-seeded SHA) | `CloneSyncService.save` commits locally |
| 3 | Assert `tryPushNow` short-circuits | Push does NOT start — `NetInfo` reports offline |
| 4 | Assert `ClonePendingQueue.enqueue` called | Queue length is 1, pending item contains correct note SHA |
| 5 | Assert FAB shows pending count | `unpushedCommitsStore.pendingCount === 1` |
| 6 | Mock `NetInfo` back online | Trigger `online-transition` push trigger |
| 7 | Assert push fires from queue | `ClonePendingQueue` drains, `gitHttp.request` receives POST |
| 8 | Assert FAB count clears | `unpushedCommitsStore.pendingCount === 0` |
| 9 | Remote verification | `gh api` returns the updated SHA |

```
ClonePushTrigger fired: online-transition (after reconnect)
FAB lifecycle: appears (pendingCount > 0) → stays while offline → disappears after online push
Queue: ClonePendingQueue.enqueue → ClonePendingQueue.drain
```

### Scenario 9 — Conflict Save

**Objective:** Diverged push scenario — remote has moved ahead, push returns 409. Verify `ConflictResolverScreen` is presented with editor-first UX.

| Step | Action | Assertion |
|---|---|---|
| 1 | Mock `NetInfo` as online | Device reports connected |
| 2 | Push a conflicting change to remote via `gh api` | Remote SHA diverges from local SHA |
| 3 | Edit the same note locally | Local commit created |
| 4 | Save → `tryPushNow` fires | Push begins |
| 5 | Assert push fails with 409 | `gitHttp.request` returns 409 (non-fast-forward) |
| 6 | Assert `ConflictResolverScreen` presented | Navigation stack includes `ConflictResolver` |
| 7 | Assert editor-first UX | Screen shows the editor with the user's changes; no "Keep mine" / "Keep theirs" buttons |
| 8 | Assert Save button visible | Screen shows a Save button (text-conflict path) |
| 9 | User taps Save | Rebase on top of remote HEAD, re-commit, push succeeds |
| 10 | Remote verification | `gh api` returns the rebased SHA; file content matches local edit |

```
ClonePushTrigger fired: online-transition
Conflict path: 409 → ConflictResolverScreen → editor-first UX → Save → rebase → push
No "Keep mine" / "Keep theirs" buttons — text conflicts show Save only
```

### Scenario 10 — Corruption Recovery

**Objective:** Corrupt the local packfile, trigger a push, verify the system detects corruption and performs a re-clone + replay.

| Step | Action | Assertion |
|---|---|---|
| 1 | Mock `NetInfo` as online | Device reports connected |
| 2 | Create a note (local commit) | Note exists in working tree |
| 3 | Corrupt packfile | Overwrite bytes in `.git/objects/pack/pack-*.pack` with garbage |
| 4 | Trigger push via `online-transition` | Push begins |
| 5 | Assert git operation throws `CORRUPT` error | git2 pack read fails |
| 6 | Assert re-clone initiated | `CloneSyncService.clone` called; local `.git` wiped and re-cloned from remote |
| 7 | Assert replay from remote | After clone, note exists via `git show HEAD:<path>` |
| 8 | Assert no data loss | Note content matches pre-corruption state (replay restored it) |
| 9 | FAB clears after recovery | `unpushedCommitsStore.pendingCount === 0` |

```
ClonePushTrigger fired: online-transition
Recovery path: CORRUPT → wipe .git → re-clone → replay pending ops
Data integrity: pre-corruption content preserved through replay
```

### Scenario 11 — 3-Minute Idle Push

**Objective:** Edit a note, let the 3-minute idle timer fire, verify push happens automatically without user interaction.

| Step | Action | Assertion |
|---|---|---|
| 1 | Mock `NetInfo` as online | Device reports connected |
| 2 | Mock `AppState` as background | User is not in foreground |
| 3 | Edit note (provide pre-seeded SHA) | Local commit created |
| 4 | Assert `tryPushNow` does NOT fire | `AppState` is background; push deferred to idle timer |
| 5 | Assert `ClonePendingQueue.enqueue` called | Pending item queued |
| 6 | Assert FAB shows pending count | `unpushedCommitsStore.pendingCount > 0` |
| 7 | Advance jest fake timers by `THREE_MIN_MS` (180 000 ms) | Idle timer fires |
| 8 | Assert `3-min-idle` trigger fires | `ClonePushTriggers` drains the queue |
| 9 | Assert push completes | `gitHttp.request` receives POST pack upload |
| 10 | Assert FAB count clears | `unpushedCommitsStore.pendingCount === 0` |
| 11 | Remote verification | `gh api` returns the updated SHA |

```
ClonePushTrigger fired: 3-min-idle
Timer: THREE_MIN_MS = 180 000 ms
FAB lifecycle: appears (pendingCount > 0) → disappears after idle push
No user interaction required
```

## Push-Trigger Sub-Checks (Clone Mode)

For each clone-mode scenario the runner asserts:

1. **Uncommitted-visibility before push**: after executing ops but before the trigger fires:
   - `UnpushedCommitsService.listUnpushed(repoPath, branch)` returns the expected unpushed commits
   - `unpushedCommitsStore.pendingCount > 0`
   - Floating push button count reflects the unpushed set

2. **No remote change before push**: before the trigger fires, `gh api` returns the pre-scenario state for all affected paths.

3. **Push-trigger fires**: the designated trigger (`online-transition`, `3-min-idle`, `foreground-active`, `os-bg-task`) is called, OR `tryPushNow` fires on save (online path).

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

Push trigger used: [online-transition | 3-min-idle | foreground-active | os-bg-task | tryPushNow-on-save]
Remote verification: [files present/absent/content-sha — PASS/FAIL]
Blocking overlay (API only): [blocked during save / released after — PASS/FAIL]
Overall: PASS / FAIL (reason)
```

## Sync Engine Mode Contract

| Contract element | Clone mode (write-through) |
|---|---|---|
| Save behaviour | local commit → `tryPushNow` (8s budget when online) | write-through to GitHub immediately |
| Offline behaviour | `ClonePendingQueue.enqueue`; push on `online-transition` | not applicable (save fails or queues) |
| Conflict handling | `ConflictResolverScreen` — editor-first UX, Save to rebase | `SyncBlockOverlay` during push cycle |
| Corruption recovery | re-clone + replay from remote | not handled by sync layer |
| Push screen | shows unpushed commits + pending count | shows queue depth |
| Floating button | shows pending count badge; clears after push | shows sync-in-flight spinner |
| Push triggers | `foreground-active`, `online-transition`, `3-min-idle`, `os-bg-task` | not applicable (immediate) |
| `UnpushedCommitsService.listUnpushed` | returns local unpushed commits | returns queue-backed items |
| `SyncBlockOverlay` | never fires | fires during `source:'save'` cycle |
| Pull after push | not on save path | `pullFromSingleRepo` after push |

See [Sync Write Modes](./sync-write-modes.md) for full contract documentation.

## Implementation Notes

- **No source edits**: `gitHttp.ts` and `gitFs.ts` are never modified by this harness. All instrumentation happens at runtime via monkey-patch.
- **WT-B compatible**: because WT-B patches preserve function signatures, `syncTiming` wrappers keep working post-WT-B-merge with no changes needed.
- **Mock strategy**: the harness runs cleanly against mocks in CI (`yarn jest`); the full E2E run with real git/network requires the `test-notes` remote and a valid `GITHUB_TOKEN` in shell env.
- **PAT handling**: the token is read from shell environment only (`process.env.GITHUB_TOKEN`), never stored in code or `.env`.
- **ClonePushTriggers constants**: all trigger names are defined in `src/services/git/ClonePushTriggers.ts`. Import the constants directly — do not hardcode trigger strings in test assertions.
