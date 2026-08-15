import { useCallback, useMemo } from 'react';

import { useGitOperationStore } from '../stores/gitOperationStore';
import type { GitOp } from '../stores/gitOperationStore';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import { clearDeleteFailure } from '../services/git/deleteFailures';
import { useNoteStore } from '../stores/noteStore';

export interface UseEntityLockOptions {
  repo?: string;
  branch?: string;
  path?: string;
}

export interface UseEntityLockResult {
  locked: boolean;
  failed: boolean;
  error?: string;
  retry: () => void;
}

function normalizeBranch(branch: string | undefined): string {
  return branch || 'main';
}

function opMatchesContext(op: GitOp, entityId: string | undefined, ctx?: UseEntityLockOptions): boolean {
  const entityMatch = !!entityId && op.entityIds.includes(entityId);
  const pathMatch =
    !!ctx?.repo &&
    !!ctx.path &&
    op.repo === ctx.repo &&
    normalizeBranch(op.branch) === normalizeBranch(ctx.branch) &&
    (op.path === undefined || op.path === ctx.path);
  return entityMatch || pathMatch;
}

/**
 * Lock state for a single item. Lock lookups key PRIMARILY by
 * (repo, resolvedBranch, path) — a queued delete survives pull
 * re-creation because paths stay stable while note ids do not — with
 * entityIds as a secondary index (cover for calls that only know the id).
 *
 * `retry()` clears the durable failure entry, drops every registry op on
 * this path (volatile row-locks included), re-enqueues the delete and
 * drains once so the failed row goes straight back to locked.
 */
export function useEntityLock(
  entityId?: string,
  ctx?: UseEntityLockOptions,
): UseEntityLockResult {
  const ops = useGitOperationStore((s) => s.ops);

  const { activeOp, failedOp } = useMemo(() => {
    let foundActive: GitOp | undefined;
    let foundFailed: GitOp | undefined;
    for (const op of Object.values(ops)) {
      if (!opMatchesContext(op, entityId, ctx)) continue;
      if (op.status === 'queued' || op.status === 'running') {
        foundActive = foundActive ?? op;
      } else if (op.status === 'failed') {
        foundFailed = foundFailed ?? op;
      }
    }
    return { activeOp: foundActive, failedOp: foundFailed };
  }, [ops, entityId, ctx?.repo, ctx?.branch, ctx?.path]);

  const retry = useCallback(() => {
    const op = failedOp;
    if (!op?.path) return;
    const { repo, branch, path } = op;
    void (async () => {
      // Clear BOTH the volatile begin() row-lock and the durable failure-
      // entry op for this (repo, path), or the row would pin forever.
      const current = useGitOperationStore.getState().ops;
      for (const candidate of Object.values(current)) {
        if (
          candidate.kind === 'delete' &&
          candidate.repo === repo &&
          (candidate.path === undefined || candidate.path === path)
        ) {
          useGitOperationStore.getState().succeed(candidate.id);
        }
      }
      await clearDeleteFailure(repo, branch, path);
      const note = entityId ? useNoteStore.getState().getNoteById(entityId) : undefined;
      await NoteSyncQueueService.enqueueNoteDelete({
        repo,
        branch,
        filePath: path,
        title: note?.title,
        accountId: note?.accountId,
        localNoteId: note?.id ?? entityId,
      });
      void NoteSyncQueueService.drain();
    })();
  }, [failedOp, entityId]);

  return {
    locked: !!activeOp,
    failed: !!failedOp,
    error: failedOp?.error,
    retry,
  };
}
