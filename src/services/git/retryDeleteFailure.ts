import { useGitOperationStore } from '../../stores/gitOperationStore';
import { useNoteStore } from '../../stores/noteStore';
import { NoteSyncQueueService } from '../cloneSyncServiceImpl';
import { clearDeleteFailure } from './deleteFailures';

/**
 * Retry a dropped note-delete: clear the durable failure entry, drop
 * every volatile registry op on the same path, and re-enqueue the
 * delete through the sync queue.
 *
 * Does NOT trigger a push — the caller decides when to drain.
 */
export async function retryDeleteFailure(
  repo: string,
  branch: string | undefined,
  path: string,
): Promise<void> {
  const resolvedBranch = branch || 'main';

  // 1. Drop every delete registry op on this path (volatile row-lock).
  const current = useGitOperationStore.getState().ops;
  for (const candidate of Object.values(current)) {
    if (
      candidate.kind === 'delete'
      && candidate.repo === repo
      && (candidate.path === undefined || candidate.path === path)
    ) {
      useGitOperationStore.getState().succeed(candidate.id);
    }
  }

  // 2. Clear the durable failure entry.
  await clearDeleteFailure(repo, resolvedBranch, path);

  // 3. Try to find the local note by filePath to enrich the enqueue
  //    with title/accountId (mirrors useGitOpLock's getNoteById logic
  //    but keyed by path since callers don't have the local note id).
  const notes = useNoteStore.getState().notes;
  const note = notes.find(
    (n) => n.repo === repo && n.filePath === path,
  );

  // 4. Re-enqueue the delete.
  await NoteSyncQueueService.enqueueNoteDelete({
    repo,
    branch: resolvedBranch,
    filePath: path,
    title: note?.title,
    accountId: note?.accountId,
    localNoteId: note?.id,
  });
}
