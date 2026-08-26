/**
 * CloneSyncService.ts — clone-mode sync orchestration.
 *
 * Coordinates the commit-on-save + explicit-push cycle for clone mode:
 * - save()       — commit locally then attempt push; pre-pull before delete intent
 * - tryPushNow() — single-shot push with budget timeout, conflict detection, offline queue
 * - pushPending() — drain the pending queue serially
 * - subscribe()  — revision-bump event subscription
 *
 * Key ordering constraints enforced here:
 * 1. intent:'delete' pre-pull BEFORE commit (preserves LocalGitWriter.deleteAndCommit behaviour)
 * 2. tryPushNow does NOT navigate — callers handle 'conflict-detected' via screen navigation
 * 3. save() holds the gate for the full commit+push serial sequence
 * 4. save() enqueues to ClonePendingQueue with correct path/oid before returning 'queued'
 */

import NetInfo from '@react-native-community/netinfo';
import { GitSyncGate } from './git/GitSyncGate';
import { CommitService } from './git/CommitService';
import { GitFsService } from './git/GitFsService';
import { ClonePendingQueue } from './git/ClonePendingQueue';
import { pushWithRecovery, surfaceConflictsOnDiverged } from './git/recovery';
import { pullFromSingleRepo } from './RepoPullService';
import { useGitActivityStore } from '../stores/gitActivityStore';
import { AuthService } from './AuthService';

// ─── types ────────────────────────────────────────────────────────────────────

export type SaveIntent = 'upsert' | 'delete' | 'rename';

export interface SaveParams {
  repoPath: string;
  branch: string;
  filePath: string;
  content: string;
  message: string;
  intent: SaveIntent;
  prevFilePath?: string;
}

export interface SaveResult {
  success: boolean;
  error?: 'queued' | 'conflict-detected' | string;
}

export interface TryPushResult {
  success: boolean;
  error?: 'queued' | 'conflict-detected' | string;
}

export interface PushPendingResult {
  succeeded: number;
  failed: number;
  conflicted: boolean;
  queuedItems: number;
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
   * Save flow: acquire gate → (pre-pull if delete) → commit → tryPushNow → enqueue → release gate.
   *
   * The editor's save button stays blocked for the full duration.
   * When tryPushNow returns 'queued', save() enqueues with correct path/oid.
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

      // 4. Attempt push under the same gate hold
      const pushResult = await tryPushNowImpl(repoPath, branch, 8000);

      // 5. Enqueue with correct path/oid if push returned 'queued'
      if (!pushResult.success && pushResult.error === 'queued') {
        const pendingIntent = intent === 'rename' ? 'upsert' : intent;
        await ClonePendingQueue.enqueuePush(repoPath, branch, [
          { path: filePath, oid: commitResult.oid ?? '', intent: pendingIntent },
        ]);
      }

      return pushResult;
    } finally {
      releaseCycle();
    }
  }

  /**
   * Single-shot push with budget timeout.
   *
   * Returns 'queued' when offline, unreachable, or timeout — save() handles enqueueing
   * with correct path/oid. Returns 'conflict-detected' for 409/non-FF — callers
   * handle navigation.
   */
  async tryPushNow(repoPath: string, branch: string, budgetMs = 8000): Promise<TryPushResult> {
    return tryPushNowImpl(repoPath, branch, budgetMs);
  }

  /**
   * Drain pending queue items for a repo/branch.
   *
   * Uses 'manual' cycle source so concurrent pushes don't deadlock with saves.
   * Stops early on 'conflict-detected' (block-and-resolve) or 'queued'.
   */
  async pushPending(repoPath: string, branch: string): Promise<PushPendingResult> {
    const releaseCycle = await GitSyncGate.acquireCycle('manual');

    try {
      const pending = await ClonePendingQueue.listPending(repoPath, branch);
      let succeeded = 0;
      let failed = 0;
      let conflicted = false;
      const queuedItems = pending.length;

      for (const item of pending) {
        const result = await tryPushNowImpl(repoPath, branch, 8000);

        if (result.success) {
          succeeded++;
          await ClonePendingQueue.markSuccess(repoPath, branch, item.path);
        } else if (result.error === 'conflict-detected') {
          conflicted = true;
          break;
        } else if (result.error === 'queued') {
          // network / timeout / auth — try next item
          failed++;
        } else {
          failed++;
        }
      }

      return { succeeded, failed, conflicted, queuedItems };
    } finally {
      releaseCycle();
    }
  }
}

// ─── Internal push implementation ──────────────────────────────────────────────

async function tryPushNowImpl(repoPath: string, branch: string, budgetMs: number): Promise<TryPushResult> {
  const token = (await AuthService.getToken()) ?? undefined;

  // Check network reachability
  const netState = await NetInfo.fetch();
  const isConnected = netState.isConnected === true;
  const isInternetReachable = netState.isInternetReachable !== false;

  if (!isConnected || !isInternetReachable) {
    return { success: false, error: 'queued' };
  }

  // Race push against budget timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('push-timeout')), budgetMs);
  });

  let pushResult: { success: boolean; error?: string };

  try {
    pushResult = await Promise.race([
      pushWithRecovery({ repoPath, branch, token }),
      timeoutPromise,
    ]);
  } catch {
    return { success: false, error: 'queued' };
  }

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

  // Push failed
  const errorStr = pushResult.error ?? '';

  if (errorStr === 'conflict-detected') {
    // Surface conflicts — NO navigation here; the calling screen handles navigation
    await surfaceConflictsOnDiverged({ repoPath, branch });
    return { success: false, error: 'conflict-detected' };
  }

  return { success: false, error: 'queued' };
}

export const CloneSyncService = new CloneSyncServiceClass();
