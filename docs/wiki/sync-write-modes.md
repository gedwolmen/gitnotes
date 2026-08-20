# Sync Write Modes

> The sync contract: clone mode stages locally (stage-then-push); API mode pushes live on save (write-through). Blocking overlay; import-on-add semantics; retry surfaces.

## Clone mode: stage-then-push

In clone mode (`SyncEngineService.getMode` returns `'clone'`, which is also the **[default](./sync-engine-modes.md)** — `DEFAULT_MODE = 'clone'`), every user git action (note save / create / delete / color change / todo toggle / canvas edit / thought-dump) **stages locally only** — nothing reaches GitHub at save time.

### How staging works

1. `StagingService.stageUpsert` or `stageDelete` (clone branch path) delegates to [`LocalGitWriter.writeAndCommit`](src/services/git/localGitWriter.ts) with `push:false`, producing a local git commit without any network call.
2. The operation key is appended to the pending stage set in [`stageStore`](src/stores/stageStore.ts): `pendingSet` grows, `pendingCount` increments.
3. The floating push button ([`FloatingStageButton`](src/components/FloatingStageButton.tsx)) picks up the count via `[stageStore.pendingCount]` selector in the app shell, so the badge always reflects current staged items for default-clone repos.
4. The **Stage screen** ([`StageScreen`](src/screens/StageScreen.tsx)) reads from `stageStore/loadStaged()`, which now iterates ALL repo paths (not just override-map keys) so that `@gitnotes:sync_engine_modes` entry-less repos appear immediately.

### Push triggers

Nothing pushes automatically on save. Pushing happens exactly when one of these fires:

| Trigger | Code path | Behavior |
|---------|-----------|----------|
| Long-press floating button | `handleLongPress` in `FloatingStageButton` | Enqueues + immediate `drainPushQueue()` via `StagePushScheduler` |
| Push / Push-all on Stage screen | `handlePushGroup` / `handlePushAll` in `StageScreen` | Same drain-after-enqueue pattern |
| 3-minute foreground idle timer | `StagePushScheduler.flushStaged` | `drainPushQueue()` after idle window with no staged changes |
| OS background task | `BackgroundSyncService.applyPolicy` | Drains ≤ 10 files (policy cap) |

See [Stage → Push UX](./stage-push-ux.md) for the full ring, notification, and resume-on-foreground flow.

## API mode: live write-through

In API mode, saving is **immediately pushed to GitHub**. There is no stage-and-wait pattern.

### The synchronous save path

```
save/complete trigger
  ↓
StagingService.stageUpsert (api branch)
  ↓
enqueueNoteUpsert → NoteSyncQueueService.drain(source:'save')
  ↓ acquireCycle(source:'save')          ← acquires GitSyncGate
  ↓
drain queue mutations → push to GitHub
  ↓
pullFromSingleRepo                     ← refreshes remote state
  ↓
refresh zustand stores                 ← noteTodoCanvasTemplate stores update
  ↓
release cycle
```

The save handler awaits this sequence with a bounded timeout defined by `SYNC_SAVE_WAIT_MS` (**45 seconds**, hard-coded in `src/services/SyncEngineService.ts`). The app never hangs past 45s waiting for sync: if the gate does not release within the budget, the await resolves and saves continue.

### Retryable failures

For transient errors (network blip, 5xx), `NoteSyncQueueService.drain` uses exponential backoff:

- `BACKOFF_BASE_MS = 500`, `BACKOFF_CAP_MS = 30_000`, `MAX_ATTEMPTS = 8`
- Formula: `Math.min(500 * 2^(attempts-1), 30000)`
- After 8 exhausted attempts, the mutation is **dropped** into the durable failure store.

On retryable failure from the gate cycle itself (before draining the queue), the system falls back to the durable queue and retries later.

### Durable failures are surfaced, NOT auto-retried

Critical errors — **409 conflict**, auth revoked (403/401), or repository deleted (404) — are treated as durable drops and **are not retried automatically**. They are surfaced to the user through [`SyncDropNotifier`](src/services/SyncDropNotifier.ts), which calls `Alert.alert` with localized text across all 6 supported locales.

When a durable drop fires, the local change is preserved (it remains in the queue's durable entries or in the local file system), but blind retry is skipped. **Rationale**: a 409 conflict almost certainly means the remote has edits the local user doesn't know about. Blindly retrying the conflicting push would re-fail the same 409 and risks #588-style overwrite of remote edits. Instead, the user is alerted with a clear message pointing them to the appropriate resolution path. See also [PR body deviation note](https://github.com/gedwolmen/gitnotes/pull/N).

Code pointers: [`SyncEngineService.ts`](src/services/SyncEngineService.ts) (API-mode gate cycle + `SYNC_SAVE_WAIT_MS`), [`StagingService.ts`](src/services/StagingService.ts) (`stageUpsert` dispatch), [`NoteSyncQueueService.ts`](src/services/NoteSyncQueueService.ts) (backoff constants, durable failure recording), [`GitSyncGate.ts`](src/services/git/GitSyncGate.ts) (gate acquisition + drain).

## Blocking UI (SyncBlockOverlay)

[`SyncBlockOverlay`](src/components/SyncBlockOverlay.tsx) renders a fullscreen "Syncing…" overlay that blocks user interaction during synchronous sync operations.

### Source filter

The overlay is driven by a selector over the gitOperationStore's cycle registry. It checks whether there exists an active cycle with `source === 'save'` or `source === 'manual'`. Only those two origins render the blocking overlay (with VoiceOver announcement via `AccessibilityInfo`).

All other sources — `idle`, `background`, `startup` — remain non-blocking: they show the lightweight [`GitHubActivityIndicator`](src/components/githubActivity/index.tsx) pill instead.

### Editor repo-scoped guard

The editor's Save button has its own guard (`useEditorSaveLock` or equivalent in `src/screens/EditorScreen.tsx`): it blocks save to **repo X** while **repo X** has a repo-scoped push or pull op in flight. Crucially, the guard filters by `scope !== '*'` — it does NOT block for global (`'*'`) cycles, because that path is covered by the SyncBlockOverlay (which is mounted in `App.tsx` and handles global scope). This avoids Metis F8 over-blocking where a background global pull would prevent local note saving.

## Add-repo import

When a user adds a repository from the Settings picker, contents are awaited before the modal closes. Both modes are covered.

### Pre-import

`importRepoAtAdd` is called with an `awaited` flag, ensuring the caller does not proceed until import completes. The clone-at-add path uses `resolveBranch(repoPath)` to determine the branch name dynamically — **never hardcoded** to `'main'` regardless of what the remote defaults to.

### Clone mode specifics

- `resolveBranch()` queries the remote to discover the actual default branch (e.g., `main`, `master`, `develop`).
- If an empty GitHub repo is added (no commits yet), the flow detects this via `GitFsService.getCommitOid(...)` returning `null`, then skips `pullFromSingleRepo` entirely and resolves `{ok: true, notes: 0, canvases: 0, todos: 0}` — a quiet success.
- Per-`repoPath` promise deduplication via `GitFsService.cloneExclusive` prevents races between add-time clone and startup-pull lazy clone (a race condition flagged in the gap analysis).

### Progress & cancel

A [`CloneProgressModal`](src/components/clone/CloneProgressModal.tsx) renders a progress bar fed by the clone progress callback. If the user cancels:
- The repo **remains added** (idempotent behavior).
- A message displays: *"Contents will sync on next pull — you can also sync manually using cloud icon"*
- No error alert; cancellation is a soft fail.

If the clone fails (network down, bad URL, auth denied):
- An alert with a **Retry** button appears.
- Retrying again runs the same full clone/import flow.

## Retry surface for pending items

After a durable failure or a dropped queue mutation, the following surfaces exist for manual retry:

| Surface | What it does | Code reference |
|---------|-------------|----------------|
| Stage screen (push per-group / push-all) | Clears group stale failures + drains queue | [`StageScreen`](src/screens/StageScreen.tsx) handlers calling `StagingService.pushStaged` |
| Cloud-icon manual sync (pull-only) | Runs `manualSync.syncNow` → pulls latest state → refreshes stores. Does NOT drain the sync queue. | [`ManualSync`](src/services/git/manualSync.ts) |
| OS background task | Automatic drain of small sets behind the scenes | [`BackgroundSyncService`](src/services/BackgroundSyncService.ts) |

## Related issues

| Issue | Description |
|-------|-------------|
| [#925](https://github.com/gedwolmen/gitnotes/issues/925) | Clone staging never surfaces push |
| [#926](https://github.com/gedwolmen/gitnotes/issues/926) | No blocking sync UI |
| [#927](https://github.com/gedwolmen/gitnotes/issues/927) | API mode is not write-through yet |
| [#938](https://github.com/gedwolmen/gitnotes/issues/938) | Contents not imported on add |
| [#588](https://github.com/gedwolmen/gitnotes/issues/588) | Remote edit overwrite risk (rationale for conflict non-retry) |
