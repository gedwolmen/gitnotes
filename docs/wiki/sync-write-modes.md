# Sync Write Modes

> The sync contract: clone mode commits + pushes immediately (write-through). Blocking overlay; import-on-add semantics; retry surfaces.

## Clone mode: write-through

In clone mode (`SyncEngineService.getMode` returns `'clone'`, the **[default](./sync-engine-modes.md)**), every user git action (note save / create / delete / color change / todo toggle / canvas edit / thought-dump) **commits locally and pushes immediately when online** — no staging, no push-later step.

### The write-through path

```
user action (save/complete)
  ↓
CloneSyncService.save           ← writes file + git add + git commit
  ↓
tryPushNow (8s budget)         ← attempts immediate push to GitHub
  ↓
┌──────────┬──────────┬──────────┐
│ success  │ offline  │ conflict │
│   ✓      │  queue   │   409    │
└──────────┴──────────┴──────────┘
    ↓           ↓           ↓
complete   ClonePendingQueue  ConflictResolverScreen
           CloneSyncService.   (user resolves, then
           pushPending drains   ClonePushTriggers retries)
           on reconnect
```

1. **CloneSyncService.save** handles the commit:
   - Upsert: writes file to disk → `git.add` → `git.commit`
   - Delete: `git.remove` → `git.commit`
   - Rename: `git.remove(old)` → write(new) → `git.add(new)` → single `git.commit`
2. **tryPushNow** attempts the push with an 8-second budget:
   - If online and fast-forward succeeds → done
   - If offline or timeout → the commit queues in `ClonePendingQueue`
   - If conflict (409/non-fast-forward) → `ConflictResolverScreen` surfaces

### Offline queue

When offline, `CloneSyncService.save` writes the commit locally, then queues the push via `ClonePendingQueue`. When connectivity returns, **`CloneSyncService.pushPending`** drains the queue automatically. No manual push step needed.

### Conflict resolution

A 409 conflict or non-fast-forward error triggers `ConflictResolverScreen` with editor-first UX. The user resolves the conflict locally, then `ClonePushTriggers` retries the push.

## Blocking UI (SyncBlockOverlay)

[`SyncBlockOverlay`](src/components/SyncBlockOverlay.tsx) renders a fullscreen "Syncing…" overlay that blocks user interaction during synchronous sync operations.

### Source filter

The overlay is driven by a selector over the gitOperationStore's cycle registry. It checks whether there exists an active cycle with `source === 'save'` or `source === 'manual'`. Only those two origins render the blocking overlay (with VoiceOver announcement via `AccessibilityInfo`).

All other sources — `idle`, `background`, `startup` — remain non-blocking: they show the lightweight [`GitHubActivityIndicator`](src/components/githubActivity/index.tsx) pill instead.

### Editor repo-scoped guard

The editor's Save button has its own guard (`useEditorSaveLock` or equivalent in `src/screens/EditorScreen.tsx`): it blocks save to **repo X** while **repo X** has a repo-scoped push or pull op in flight. Crucially, the guard filters by `scope !== '*'` — it does NOT block for global (`'*'`) cycles, because that path is covered by the SyncBlockOverlay (which is mounted in `App.tsx` and handles global scope). This avoids Metis F8 over-blocking where a background global pull would prevent local note saving.

## Add-repo import

When a user adds a repository from the Settings picker, contents are awaited before the modal closes.

### Pre-import

`importRepoAtAdd` is called with an `awaited` flag, ensuring the caller does not proceed until import completes. The clone-at-add path uses `resolveBranch(repoPath)` to determine the branch name dynamically — **never hardcoded** to `'main'` regardless of what the remote defaults to.

### Clone mode specifics

- `resolveBranch()` queries the remote to discover the actual default branch (e.g., `main`, `master`, `develop`).
- If an empty GitHub repo is added (no commits yet), the flow detects this via `GitFsService.getCommitOid(...)` returning `null`, then skips `pullFromSingleRepo` entirely and resolves `{ok: true, notes: 0, canvases: 0, todos: 0}` — a quiet success.
- Per-`repoPath` promise deduplication via `GitFsService.cloneExclusive` prevents races between add-time clone and startup-pull lazy clone.

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

> **This section describes the pre-write-through architecture that has been removed.**
> The old staging system has been deleted.
> This description is kept for historical reference only.

In the old architecture (pre-write-through clone), user actions wrote to a local staging area first, then required a manual push step (floating button, dedicated Stage screen, idle timer, or background task).

This was replaced by write-through clone: `CloneSyncService.save` commits and immediately pushes via `tryPushNow` (8s budget), with `ClonePendingQueue` handling offline queue and `ClonePushTriggers` automating subsequent pushes.

## Related issues

| Issue | Description |
|-------|-------------|
| [#925](https://github.com/gedwolmen/gitnotes/issues/925) | Clone staging never surfaces push — resolved by write-through clone |
| [#926](https://github.com/gedwolmen/gitnotes/issues/926) | No blocking sync UI |
| [#938](https://github.com/gedwolmen/gitnotes/issues/938) | Contents not imported on add |
| [#588](https://github.com/gedwolmen/gitnotes/issues/588) | Remote edit overwrite risk (rationale for conflict non-retry) |
