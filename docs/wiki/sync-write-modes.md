# Sync Write Modes

> The sync contract: clone mode commits on save (commit-on-save); API mode pushes live on save (write-through). Blocking overlay; import-on-add semantics; retry surfaces.

## Clone mode: commit-on-save

In clone mode (`SyncEngineService.getMode` returns `'clone'`, which is also the **[default](./sync-engine-modes.md)** — `DEFAULT_MODE = 'clone'`), every user git action (note save / create / delete / color change / todo toggle / canvas edit / thought-dump) **commits locally immediately on save** — nothing reaches GitHub at save time.

### How commit-on-save works

1. Clone-mode sync entry points (`NoteGitHubSyncService`, `TodoGitHubSyncService`, `CanvasGitHubSyncService`, `TemplateGitHubSyncService`, `noteStore`) call [`CommitService.commit`](src/services/git/CommitService.ts) instead of the staging API.
2. `CommitService.commit` produces a **local git commit with `push:false`** — no network call at save time.
   - Upsert: writes file to disk → `git.add` → `git.commit`
   - Delete: `git.remove` → `git.commit`
   - Rename: `git.remove(old)` → write(new) → `git.add(new)` → single `git.commit`
3. The commit is atomic and self-contained — no separate staging layer.

### Tracking unpushed commits

[`UnpushedCommitsService`](src/services/git/UnpushedCommitsService.ts) tracks commits between local `HEAD` and remote `origin/<branch>`:

1. Resolve local OID (`refs/heads/<branch>`) and remote OID (`refs/remotes/origin/<branch>`) via `GitFsService.getCommitOid`
2. Compute merge base (or use remote OID when merge base unavailable)
3. Walk commits from merge-base to local HEAD via `git.log` (up to 20 commits)
4. Returns per-commit summary: `subject`, `oid`, `author`, `timestamp`, `filesChangedCount`

For changed files per commit, `UnpushedCommitsService.listFiles` diffs the commit tree against its parent tree.

### Push triggers

Nothing pushes automatically on save. Pushing happens **only on explicit trigger**:

| Trigger | Code path | Behavior |
|---------|-----------|----------|
| Long-press floating button | `handleLongPress` in `FloatingPushButton` | Pushes all unpushed commits for the repo |
| Push / Push-all on Push screen | `handlePush` / `handlePushAll` in `PushScreen` | Pushes selected or all unpushed commits |
| OS background task | `BackgroundSyncService.applyPolicy` | Drains ≤ 10 files (policy cap) |

See [Push UX](./push-ux.md) for the full ring, notification, and resume-on-foreground flow.

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
| Push screen (push per-commit / push-all) | Pushes selected or all unpushed commits | [`PushScreen`](src/screens/PushScreen.tsx) handlers calling `UnpushedCommitsService` |
| Cloud-icon manual sync (pull-only) | Runs `manualSync.syncNow` → pulls latest state → refreshes stores. Does NOT drain the sync queue. | [`ManualSync`](src/services/git/manualSync.ts) |
| OS background task | Automatic drain of small sets behind the scenes | [`BackgroundSyncService`](src/services/BackgroundSyncService.ts) |

---

### [DEPRECATED] Clone mode: stage-then-push (archived)

> **This section describes the pre-PushScreen architecture that has been removed.**
> The `StagingService`, `stageStore`, `FloatingStageButton`, `StageScreen`, and `StagePushScheduler` have all been deleted.
> This description is kept for historical reference only.

In the old architecture:

- `StagingService.stageUpsert` or `stageDelete` (clone branch path) delegated to [`LocalGitWriter.writeAndCommit`](src/services/git/localGitWriter.ts) with `push:false`, producing a local git commit without any network call.
- The operation key was appended to the pending stage set in [`stageStore`](src/stores/stageStore.ts): `pendingSet` grew, `pendingCount` incremented.
- The floating push button ([`FloatingStageButton`](src/components/FloatingStageButton.tsx)) picked up the count via `[stageStore.pendingCount]` selector in the app shell, so the badge always reflected current staged items for default-clone repos.
- The **Stage screen** ([`StageScreen`](src/screens/StageScreen.tsx)) read from `stageStore/loadStaged()`, which iterated ALL repo paths (not just override-map keys) so that `@gitnotes:sync_engine_modes` entry-less repos appeared immediately.

Push triggers were: long-press floating button (`StagePushScheduler.drainPushQueue`), push/push-all on Stage screen, 3-minute foreground idle timer, and OS background task (≤ 10 files).

This was replaced by the commit-on-save + `UnpushedCommitsService` + `PushScreen` architecture.

## Related issues

| Issue | Description |
|-------|-------------|
| [#925](https://github.com/gedwolmen/gitnotes/issues/925) | Clone staging never surfaces push |
| [#926](https://github.com/gedwolmen/gitnotes/issues/926) | No blocking sync UI |
| [#927](https://github.com/gedwolmen/gitnotes/issues/927) | API mode is not write-through yet |
| [#938](https://github.com/gedwolmen/gitnotes/issues/938) | Contents not imported on add |
| [#588](https://github.com/gedwolmen/gitnotes/issues/588) | Remote edit overwrite risk (rationale for conflict non-retry) |
