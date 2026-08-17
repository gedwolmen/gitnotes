import { NoteSyncQueueService } from '../NoteSyncQueueService';
import type { NoteDeleteParams, NoteUpsertParams } from '../NoteSyncQueueService';
import { SyncEngineService } from '../SyncEngineService';
import { AuthService } from '../AuthService';
import { StorageService } from '../StorageService';
import { LocalGitWriter } from './LocalGitWriter';
import { GitFsService } from './GitFsService';
import { getGitHostService } from './gitHostFactory';
import type { GitHostUser } from './GitHost';

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
}

const UNPUSHED_COMMITS_PLACEHOLDER = '(unpushed commits)';

async function resolveStageAuthor(): Promise<{ name: string; email: string }> {
  const user: GitHostUser | null = await getGitHostService('github').getAuthenticatedUser();
  return {
    name: user?.name ?? user?.login ?? 'gitnotes',
    email: user?.email ?? `${user?.login ?? 'gitnotes'}@users.noreply.gitnotes`,
  };
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
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      await NoteSyncQueueService.enqueueNoteUpsert(params);
      return { success: true };
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
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      await NoteSyncQueueService.enqueueNoteDelete(params);
      return { success: true };
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

    const overrides = await SyncEngineService.listOverrides();
    const savedRepos = await StorageService.getSavedRepositories();
    for (const repo of Object.keys(overrides)) {
      if (overrides[repo] !== 'clone') continue;
      const saved = savedRepos.find((r) => r.path === repo);
      const repoBranch = saved?.branch ?? 'main';
      if (repoPath && repo !== repoPath) continue;
      if (branch && repoBranch !== branch) continue;

      const localOid = await GitFsService.getCommitOid({
        repoPath: repo,
        ref: `refs/heads/${repoBranch}`,
      });
      const remoteOid = await GitFsService.getCommitOid({
        repoPath: repo,
        ref: `refs/remotes/origin/${repoBranch}`,
      });
      const hasLocal = localOid !== null;
      const hasRemote = remoteOid !== null;
      const mergeBase = hasRemote
        ? await GitFsService.findMergeBase({
            repoPath: repo,
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
        repoPath: repo,
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
  static async pushStaged(repoPath?: string, branch?: string): Promise<StagingResult> {
    try {
      const staged = await this.listStaged(repoPath, branch);
      if (staged.length === 0) return { success: true };

      const cloneKeys = new Map<string, { repoPath: string; branch: string }>();
      let hasApi = false;
      for (const item of staged) {
        if (item.mode === 'clone') {
          cloneKeys.set(`${item.repoPath}\n${item.branch}`, {
            repoPath: item.repoPath,
            branch: item.branch,
          });
        } else {
          hasApi = true;
        }
      }

      if (hasApi) {
        await NoteSyncQueueService.drain();
      }

      if (cloneKeys.size > 0) {
        const token = await AuthService.getToken();
        const failures: string[] = [];
        for (const { repoPath: repo, branch: repoBranch } of cloneKeys.values()) {
          const result = await LocalGitWriter.push({
            repoPath: repo,
            branch: repoBranch,
            token: token ?? undefined,
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
