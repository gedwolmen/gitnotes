/**
 * CloneSyncService.ts — clone-mode sync orchestration.
 *
 * Coordinates the commit-on-save + force-push cycle for clone mode:
 * - save() — commit locally then force-push immediately; local always wins
 * - subscribe() — revision-bump event subscription
 *
 * Key ordering constraints enforced here:
 * 1. intent:'delete' pre-pull BEFORE commit (preserves LocalGitWriter.deleteAndCommit behaviour)
 * 2. save() holds the gate for the full commit+push serial sequence
 * 3. Push uses force:true so local always wins — no conflict UI, no queue, no retry
 */

import { GitSyncGate } from './git/GitSyncGate';
import { CommitService } from './git/CommitService';
import { GitFsService } from './git/GitFsService';
import { pushWithForce } from './git/recovery';
import { pullFromSingleRepo } from './RepoPullService';
import { useGitActivityStore } from '../stores/gitActivityStore';
import { AuthService } from './AuthService';

// ─── types ────────────────────────────────────────────────────────────────────

export type SaveIntent = 'upsert' | 'delete' | 'rename';

export interface SaveParams {
  repoPath: string;
  branch: string;
  filePath: string;
  content?: string;
  message: string;
  intent: SaveIntent;
  prevFilePath?: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

// ─── CloneSyncService ─────────────────────────────────────────────────────────

class CloneSyncServiceClass {
  private revisionListeners = new Set<() => void>();

  /**
   * Subscribe to revision bumps. Returns an unsubscribe function.
   * Fires after every successful local commit AND after every successful push.
   */
  subscribe(listener: () => void): () => void {
    this.revisionListeners.add(listener);
    return () => {
      this.revisionListeners.delete(listener);
    };
  }

  private notify(): void {
    this.revisionListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // user callbacks must not break the service
      }
    });
  }

  /**
   * Save flow: acquire gate → (pre-pull if delete) → commit → force-push → release gate.
   *
   * The editor's save button stays blocked for the full duration.
   * Local always wins — push uses force:true and errors are logged, not surfaced.
   */
  async save(params: SaveParams): Promise<SaveResult> {
    const { repoPath, branch, filePath, content, message, intent, prevFilePath } = params;
    const releaseCycle = await GitSyncGate.acquireCycle('save');

    try {
      // 1. Pre-pull for delete intent — mirrors LocalGitWriter.deleteAndCommit behaviour
      if (intent === 'delete') {
        const token = (await AuthService.getToken()) ?? undefined;
        await GitFsService.pullWithFastForward({ repoPath, branch, token });
      }

      // 2. Commit locally
      const commitResult = await CommitService.commit({
        repo: repoPath,
        branch,
        filePath,
        content: intent === 'delete' ? undefined : content,
        message,
        delete: intent === 'delete',
        prevFilePath,
      });

      if (!commitResult.success) {
        return { success: false, error: commitResult.error };
      }

      // 3. Increment revision for the local commit
      useGitActivityStore.getState().incrementRevision();
      this.notify();

      // 4. Force-push immediately — local always wins
      const token = (await AuthService.getToken()) ?? undefined;
      const pushResult = await pushWithForce({ repoPath, branch, token });

      if (pushResult.success) {
        // Pull latest remote state to keep local in sync
        try {
          await pullFromSingleRepo(repoPath);
        } catch {
          // pull failure is non-fatal — the push itself succeeded
        }
        useGitActivityStore.getState().incrementRevision();
        return { success: true };
      }

      // Push failed — just log, don't queue, don't surface conflicts
      console.warn('[CloneSyncService] force-push failed:', pushResult.error);
      return { success: false, error: pushResult.error };
    } finally {
      releaseCycle();
    }
  }
}

export const CloneSyncService = new CloneSyncServiceClass();
