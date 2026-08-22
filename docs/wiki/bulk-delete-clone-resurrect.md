# Clone-Mode Bulk Delete — Resurrecting Notes (#1030)

> Deleting notes in bulk (clone mode) removed them from the list but never created a git commit — the file stayed in the working tree, and the next ForegroundSync pull (7-10s later) re-imported it. The user's delete was silently undone.

## Root cause

`NotesListScreen.handleBulkDelete` enqueued every delete into the sync queue with a single `enqueueNoteDeletes(params)` and relied on queue-completion events to remove the rows:

- **API mode**: the queue is drained by the write-through machinery → deletes reach GitHub. Correct.
- **Clone mode**: nothing drains the queue after the enqueue (the drain only runs on push triggers / background sync), so **no local commit was ever created**. The file remained in the working tree, and the next pull's reconcile re-imported it into the store — the resurrection.

The single-note delete path (`noteStore.deleteNote` → `StagingService.stageDelete`) was already correct: clone mode commits locally with `push:false` and surfaces the change via `notifyStagedChanged`.

## Change

`src/screens/NotesListScreen.tsx` — `handleBulkDelete` now branches by the repo's sync mode per note:

- **Clone mode**: routes each note through `deleteNote(id)` (→ `StagingService.stageDelete` clone path) — `LocalGitWriter.deleteAndCommit({ push: false })` commits the deletion **immediately**, `notifyStagedChanged` surfaces it for the idle push, and the row is removed from the store. The next pull cannot resurrect the file because the commit already removed it from the tree.
- **API mode**: unchanged — the batch `enqueueNoteDeletes(params)` (one queue write, one batch API call) is preserved.
- **Local-only notes** (no repo): deleted locally as before.

This matches the single-delete behavior and the AGENTS.md stage-then-push contract (commit now, push on triggers).

| Risk | Reversible | Verified |
|---|---|---|
| Medium — clone-mode delete semantics changed from "enqueue-and-hope" to "commit immediately"; the API batch path is untouched | Yes | `__tests__/sync-locking.integration.test.ts` S5-clone rewritten (10× `deleteAndCommit` push:false, zero queue writes, zero pushes, rows gone) + S5-api unchanged (batch preserved) + `__tests__/notes-delete-lock.test.tsx` (6/6) + full suite (2832 pass) |

## Notes

- The idle push (#1025's deterministic 3-min window) pushes the committed deletes on schedule; no data is lost if the push is delayed — the file is already gone from the local tree, so a pull cannot resurrect it.
- Manual push (floating button / Stage screen) also works for the committed deletes.

## Verification

```bash
yarn jest __tests__/sync-locking.integration.test.ts --no-coverage --forceExit
yarn jest __tests__/notes-delete-lock.test.tsx --no-coverage --forceExit
yarn ts:check
```
