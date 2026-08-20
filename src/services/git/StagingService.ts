import { NoteSyncQueueService } from '../NoteSyncQueueService';
import type { NoteDeleteParams, NoteUpsertParams } from '../NoteSyncQueueService';
import { SyncEngineService } from '../SyncEngineService';
import { AuthService } from '../AuthService';
import { StorageService } from '../StorageService';
import { LocalGitWriter } from './LocalGitWriter';
import { GitFsService } from './GitFsService';
import { getGitHostService } from './gitHostFactory';
import type { GitHostUser } from './GitHost';
import { githubActivity } from '../../stores/githubActivityStore';
import { GitSyncGate } from './GitSyncGate';
import { pullFromSingleRepo } from '../RepoPullService';
import { useNoteStore } from '../../stores/noteStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { useTodoStore } from '../../stores/todoStore';

/**
 * Stage-change emitter. Clone-mode staging commits are purely local — no
 * other subsystem observes them — so StagingService broadcasts successful
 * clone staging here. stageStore subscribes to reload pending counts, which
 * also arms the idle auto-push via the scheduler's store subscription.
 * API-mode enqueue does NOT fire this: the sync-queue subscription already
 * covers that path, and notifying both would double-load the stage store.
 */
const STAGED_CHANGED_LISTENERS = new Set<() => void>();

export function subscribeStagedChanged(fn: () => void): () => void {
  STAGED_CHANGED_LISTENERS.add(fn);
  return () => {
    STAGED_CHANGED_LISTENERS.delete(fn);
  };
}

export function notifyStagedChanged(): void {
  for (const fn of [...STAGED_CHANGED_LISTENERS]) {
    try {
      fn();
    } catch {
      // Listener failures must not break staging.
    }
  }
}

/**
 * One staged change as surfaced to the Stage page. Queue-backed items
 * (both sync engines) carry their real file path; clone-mode commits that
 * never reached origin surface as a synthetic `(unpushed commits)` row
 * pointing at the whole (repo, branch) state.
 */
export interface StagedItem {
  repoPath: string;
  branch: string;
  filePath: string;
  kind: 'upsert' | 'delete';
  mode: 'api' | 'clone';
  localCommitOid?: string;
}

export interface StagingResult {
  success: boolean;
  error?: string;
  /**
   * API-mode write-through (#927): the change is safely saved locally, but
   * the push did not complete within the bounded save wait (e.g. slow or
   * missing network). The mutation stays in the durable queue and syncs
   * later. Set by the write-through path; callers may show a
   * "saved locally, will sync" notice.
   */
  pendingSync?: boolean;
  /**
   * API-mode write-through (#927): the queued mutation was durably dropped
   * (non-retryable failure such as a 409 conflict or auth error). The
   * change is preserved locally; callers should surface the failure to the
   * user instead of re-enqueueing.
   */
  droppedConflict?: boolean;
}

const UNPUSHED_COMMITS_PLACEHOLDER = '(unpushed commits)';

/**
 * Bounded write-through wait for API-mode saves (issue #927). The editor
 * gets a response within this window; if the chain takes longer the result
 * carries `pendingSync: true` and the chain continues detached — its
 * `finally` block releases the cycle so the mutex is never leaked.
 */
const SYNC_SAVE_WAIT_MS = 45_000;

async function resolveStageAuthor(): Promise<{ name: string; email: string }> {
  const user: GitHostUser | null = await getGitHostService('github').getAuthenticatedUser();
  return {
    name: user?.name ?? user?.login ?? 'gitnotes',
    email: user?.email ?? `${user?.login ?? 'gitnotes'}@users.noreply.gitnotes`,
  };
}

async function refreshStoresAfterPull(): Promise<void> {
  await Promise.all([
    useNoteStore.getState().refreshNotes(),
    useCanvasStore.getState().refreshCanvases(),
    useTodoStore.getState().refreshTodos(),
  ]);
}

/**
 * Write-through push for API-mode saves (#927). After enqueuing the
 * mutation, we acquire a 'save' cycle, drain the queue, check whether
 * our mutation survived or was dropped, then pull and refresh stores.
 * The whole chain is raced against SYNC_SAVE_WAIT_MS; a timeout
 * returns `pendingSync: true` but lets the chain continue detached —
 * its `finally` block releases the cycle so the mutex is never leaked.
 */
async function writeThroughPush(
  repoPath: string,
  mutationId: string,
): Promise<StagingResult> {
  let dropped = false;
  const unsubDrop = NoteSyncQueueService.onDroppedMutation((event) => {
    if (event.mutation.id === mutationId) dropped = true;
  });

  const chain = (async (): Promise<StagingResult> => {
    const releaseCycle = await GitSyncGate.acquireCycle('save');
    try {
      githubActivity.begin('Syncing');
      try {
        await NoteSyncQueueService.drain(undefined, 'save');

        const stillQueued = await NoteSyncQueueService.getAll().then(
          (items) => items.some((m) => m.id === mutationId),
        );
        if (stillQueued) {
          return { success: true, pendingSync: true };
        }
        if (dropped) {
          return {
            success: false,
            error: 'conflict',
            droppedConflict: true,
          };
        }

        await pullFromSingleRepo(repoPath);
        await refreshStoresAfterPull();
        return { success: true };
      } finally {
        githubActivity.end();
      }
    } finally {
      releaseCycle();
    }
  })();

  try {
    return await Promise.race([
      chain,
      new Promise<StagingResult>((resolve) =>
        setTimeout(
          () => resolve({ success: true, pendingSync: true }),
          SYNC_SAVE_WAIT_MS,
        ),
      ),
    ]);
  } finally {
    unsubDrop();
  }
}

/**
 * Staging primitives for the stage-then-push rework. Staging means "save
 * locally now, push later" for both sync engines: api-mode changes land in
 * the durable sync queue (the push engine drains it), clone-mode changes
 * commit locally with `push: false` and are flushed by `LocalGitWriter.push`.
 */
export class StagingService {
  static async stageUpsert(params: NoteUpsertParams): Promise<StagingResult> {
    try {
      const mode = await SyncEngineService.getMode(params.repo);
      if (mode === 'clone') {
        const author = await resolveStageAuthor();
        const result = await LocalGitWriter.writeAndCommit({
          repoPath: params.repo,
          branch: params.branch ?? 'main',
          filePath: params.filePath ?? '',
          content: params.content,
          message: `Update note: ${params.title}`,
          author,
          push: false,
        });
        if (!result.success) return { success: false, error: result.error };
        notifyStagedChanged();
        return { success: true };
      }
      const { id } = await NoteSyncQueueService.enqueueNoteUpsert(params);
      return writeThroughPush(params.repo, id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  static async stageDelete(params: NoteDeleteParams): Promise<StagingResult> {
    try {
      const mode = await SyncEngineService.getMode(params.repo);
      if (mode === 'clone') {
        const author = await resolveStageAuthor();
        const result = await LocalGitWriter.deleteAndCommit({
          repoPath: params.repo,
          branch: params.branch ?? 'main',
          filePath: params.filePath,
          message: `Delete note: ${params.title ?? params.filePath}`,
          author,
          push: false,
        });
        if (!result.success) return { success: false, error: result.error };
        notifyStagedChanged();
        return { success: true };
      }
      const { id } = await NoteSyncQueueService.enqueueNoteDelete(params);
      return writeThroughPush(params.repo, id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * All staged changes: queued mutations (both engines) plus clone-mode
   * commits that never reached origin. When the remote ref is missing the
   * whole local branch counts as unpushed.
   */
  static async listStaged(repoPath?: string, branch?: string): Promise<StagedItem[]> {
    const items: StagedItem[] = [];

    const queue = await NoteSyncQueueService.getAll();
    for (const mutation of queue) {
      const itemRepo = mutation.params.repo;
      const itemBranch = mutation.params.branch || 'main';
      if (repoPath && itemRepo !== repoPath) continue;
      if (branch && itemBranch !== branch) continue;
      const mode = await SyncEngineService.getMode(itemRepo);
      items.push({
        repoPath: itemRepo,
        branch: itemBranch,
        filePath: mutation.params.filePath ?? '',
        kind: mutation.type === 'note.upsert' ? 'upsert' : 'delete',
        mode,
      });
    }

    const savedRepos = await StorageService.getSavedRepositories();
    for (const repo of savedRepos) {
      const mode = await SyncEngineService.getMode(repo.path);
      if (mode !== 'clone') continue;
      const repoBranch = repo.branch ?? 'main';
      if (repoPath && repo.path !== repoPath) continue;
      if (branch && repoBranch !== branch) continue;

      const localOid = await GitFsService.getCommitOid({
        repoPath: repo.path,
        ref: `refs/heads/${repoBranch}`,
      });
      const remoteOid = await GitFsService.getCommitOid({
        repoPath: repo.path,
        ref: `refs/remotes/origin/${repoBranch}`,
      });
      const hasLocal = localOid !== null;
      const hasRemote = remoteOid !== null;
      const mergeBase = hasRemote
        ? await GitFsService.findMergeBase({
            repoPath: repo.path,
            ref1: `refs/heads/${repoBranch}`,
            ref2: `refs/remotes/origin/${repoBranch}`,
          })
        : null;
      if (
        !hasLocal ||
        (hasRemote && (localOid === remoteOid || (mergeBase !== null && localOid === mergeBase)))
      ) {
        continue;
      }

      items.push({
        repoPath: repo.path,
        branch: repoBranch,
        filePath: UNPUSHED_COMMITS_PLACEHOLDER,
        kind: 'upsert',
        mode: 'clone',
        localCommitOid: localOid ?? undefined,
      });
    }

    return items;
  }

  /**
   * Push every staged change. API-mode keys are flushed by draining the
   * sync queue (drain has no per-repo filter, so scoped api pushes still
   * drain the whole queue); clone-mode keys are pushed with
   * `LocalGitWriter.push`. The scheduler owns any post-push refresh.
   */
  static async pushStaged(
    repoPath?: string,
    branch?: string,
    onProgress?: (fraction: number | null) => void,
  ): Promise<StagingResult> {
    try {
      const staged = await this.listStaged(repoPath, branch);
      if (staged.length === 0) return { success: true };

      const cloneKeys = new Map<string, { repoPath: string; branch: string }>();
      for (const item of staged) {
        if (item.mode === 'clone') {
          cloneKeys.set(`${item.repoPath}\n${item.branch}`, {
            repoPath: item.repoPath,
            branch: item.branch,
          });
        }
      }

      // Always drain: listStaged tags leftover API-mode mutations with the
      // repo's current mode, so a hasApi gate would strand queue items in
      // clone-mode repos forever. drain() handles clone groups internally.
      await NoteSyncQueueService.drain(onProgress);

      if (cloneKeys.size > 0) {
        const token = await AuthService.getToken();
        const failures: string[] = [];
        for (const { repoPath: repo, branch: repoBranch } of cloneKeys.values()) {
          const result = await LocalGitWriter.push({
            repoPath: repo,
            branch: repoBranch,
            token: token ?? undefined,
            onProgress: (p) => {
              const fraction = p.total > 0 ? p.loaded / p.total : null;
              githubActivity.setProgress({
                phase: 'Pushing changes',
                loaded: p.loaded,
                total: p.total,
              });
              if (onProgress) onProgress(fraction);
            },
          });
          if (!result.success) failures.push(result.error ?? `${repo}@${repoBranch}`);
        }
        if (failures.length > 0) {
          return { success: false, error: failures.join('; ') };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
