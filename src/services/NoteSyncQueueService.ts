import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  syncNoteToGitHub,
  deleteNoteFromGitHub,
  NoteGitHubSyncResult,
} from './NoteGitHubSyncService';
import { StorageService } from './StorageService';
import { SyncEngineService } from './SyncEngineService';
import { AuthService } from './AuthService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { classifyGitHubSyncError, isRetryableFailure, syncStatusForError } from './git/syncFailure';
import { resolveBranch } from './git/resolveBranch';
import { clearDeleteFailure, readDeleteFailures, recordDeleteFailure } from './git/deleteFailures';
import { GitSyncGate } from './git/GitSyncGate';
import { NoteColor, NoteFormat } from '../models/Note';

const QUEUE_KEY = '@gitnotes:sync_queue_v1';
const TOMBSTONE_KEY = '@gitnotes:delete_tombstones_v1';
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 30_000;

/**
 * Exponential backoff with a 30s cap (issue #565 phase D). Without this a
 * transient network blip costs 8 immediate retries. With it, the same blip
 * burns through ~1m of wall-clock retries instead — which is enough room
 * for a foreground/online auto-pull to clear the underlying problem.
 */
function backoffMsForAttempts(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
}

export interface NoteUpsertParams {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  content: string;
  format?: NoteFormat;
  tags?: string[];
  color?: NoteColor | null;
  knownSha?: string;
}

export interface NoteDeleteParams {
  repo: string;
  branch?: string;
  filePath: string;
  title?: string;
  accountId?: string;
}

interface MutationCommon {
  id: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /**
   * Earliest wall-clock ms the mutation should be retried at. Set on
   * failure via `backoffMsForAttempts`. `undefined` / `<= Date.now()`
   * means "due now" (issue #565 phase D).
   */
  nextRetryAt?: number;
}

export type QueuedMutation =
  | (MutationCommon & {
      type: 'note.upsert';
      localNoteId?: string;
      params: NoteUpsertParams;
    })
  | (MutationCommon & {
      type: 'note.delete';
      params: NoteDeleteParams;
    });

/**
 * Side-channel notification for mutations the queue gave up on. Emitted
 * instead of changing `drain()`'s `{succeeded, failed, remaining}`
 * contract: drops do not count as `failed` in the durable case, and the
 * return shape stays exactly as callers (and tests) codify it.
 */
export interface DroppedMutationEvent {
  mutation: QueuedMutation;
  /** 'durable' = non-retryable error; 'exhausted' = retry budget used up. */
  reason: 'durable' | 'exhausted';
  error?: string;
  status?: number;
}

class NoteSyncQueueServiceClass {
  private isDraining = false;
  private listeners = new Set<() => void>();
  private droppedListeners = new Set<(event: DroppedMutationEvent) => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  onDroppedMutation(fn: (event: DroppedMutationEvent) => void): () => void {
    this.droppedListeners.add(fn);
    return () => {
      this.droppedListeners.delete(fn);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener errors - user callbacks should not break the queue
      }
    });
  }

  private emitDroppedMutation(event: DroppedMutationEvent): void {
    this.droppedListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {
        // ignore listener errors - user callbacks should not break the queue
      }
    });
  }

  async getAll(): Promise<QueuedMutation[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[NoteSyncQueueService] Failed to get all queue items:', error);
      return [];
    }
  }

  async pendingCount(): Promise<number> {
    return (await this.getAll()).length;
  }

  private async saveAll(items: QueuedMutation[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    this.notify();
  }

  private tombstoneKey(repo: string, branch: string, filePath: string): string {
    return `${repo}::${branch || 'main'}::${filePath}`;
  }

  async addTombstone(repo: string, branch: string | undefined, filePath: string): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      map[this.tombstoneKey(repo, branch || 'main', filePath)] = Date.now();
      await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
    } catch { /* best-effort */ }
  }

  async isTombstoned(repo: string, branch: string | undefined, filePath: string): Promise<boolean> {
    const key = this.tombstoneKey(repo, branch || 'main', filePath);
    try {
      // A dropped-delete failure entry pins the tombstone indefinitely:
      // the remote file still exists, so expiry would let the next pull
      // resurrect the note the user deleted.
      const failures = await readDeleteFailures();
      if (failures[key] != null) return true;
    } catch { /* fall through to the TTL check */ }
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (!raw) return false;
      const map: Record<string, number> = JSON.parse(raw);
      const ts = map[key];
      if (ts == null) return false;
      if (Date.now() - ts > TOMBSTONE_TTL_MS) {
        delete map[key];
        await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
        return false;
      }
      return true;
    } catch { return false; }
  }

  async removeTombstone(repo: string, branch: string | undefined, filePath: string): Promise<void> {
    await clearDeleteFailure(repo, branch, filePath);
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (!raw) return;
      const map: Record<string, number> = JSON.parse(raw);
      delete map[this.tombstoneKey(repo, branch || 'main', filePath)];
      await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
    } catch { /* best-effort */ }
  }

  async enqueueNoteUpsert(params: NoteUpsertParams, localNoteId?: string): Promise<void> {
    // Persist the RESOLVED branch so the tombstone key, drain group key,
    // and clone-mode push all agree with the branch pulls resolve.
    const branch = await resolveBranch(params.repo, params.branch);
    const resolvedParams: NoteUpsertParams = { ...params, branch };
    const items = await this.getAll();
    const sameRepoBranchPath = (m: QueuedMutation) =>
      m.params.repo === resolvedParams.repo &&
      (m.params.branch || 'main') === branch &&
      m.params.filePath === resolvedParams.filePath;
    // Drop prior upserts with the same (repo, branch, filePath, title) —
    // latest wins. Also drop any pending delete for the same path: the
    // user re-created the note, so the delete is wasted (#565 phase B.2).
    const filtered = items.filter((m) => {
      if (m.type === 'note.upsert') {
        return !(
          sameRepoBranchPath(m) && m.params.title === resolvedParams.title
        );
      }
      // note.delete: only drop if filePath matches and is set on both
      // sides — undefined filePath on either side means we can't be
      // sure they refer to the same blob.
      return !(resolvedParams.filePath && sameRepoBranchPath(m));
    });
    filtered.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'note.upsert',
      createdAt: Date.now(),
      attempts: 0,
      localNoteId,
      params: resolvedParams,
    });
    await this.saveAll(filtered);
  }

  async enqueueNoteDelete(params: NoteDeleteParams): Promise<void> {
    // Persist the RESOLVED branch so the tombstone key matches what the
    // pull side checks (RepoPullService resolves the same way).
    const branch = await resolveBranch(params.repo, params.branch);
    const resolvedParams: NoteDeleteParams = { ...params, branch };
    const items = await this.getAll();
    const sameRepoBranchPath = (m: QueuedMutation) =>
      m.params.repo === resolvedParams.repo &&
      (m.params.branch || 'main') === branch &&
      m.params.filePath === resolvedParams.filePath;
    // Drop prior upserts for this file — they're wasted writes since the
    // file is being deleted (#565 phase B.2). Drop prior deletes for the
    // same file too — only one delete is needed.
    const filtered = items.filter((m) => !sameRepoBranchPath(m));
    filtered.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'note.delete',
      createdAt: Date.now(),
      attempts: 0,
      params: resolvedParams,
    });
    await this.saveAll(filtered);
    // Retry re-enqueue clears any pinned failure from a previous drop.
    await clearDeleteFailure(resolvedParams.repo, branch, resolvedParams.filePath);
    await this.addTombstone(resolvedParams.repo, branch, resolvedParams.filePath);
  }

  async drain(): Promise<{ succeeded: number; failed: number; remaining: number }> {
    if (this.isDraining) {
      const items = await this.getAll();
      return { succeeded: 0, failed: 0, remaining: items.length };
    }
    this.isDraining = true;

    // Serialize against app-wide drain+pull cycles (foreground/startup/
    // background/manual sync). When this drain runs INSIDE a held cycle
    // the cycle owner already owns the mutex — acquiring again here would
    // self-deadlock, so the short-circuit is mandatory.
    const releaseCycle = GitSyncGate.isCycleHeld() ? null : await GitSyncGate.acquireCycle();

    try {
      const initial = await this.getAll();
      const now = Date.now();

      // Group items by (repo, branch). Within a clone-mode group every
      // mutation runs with `push: false` and a single `LocalGitWriter.push`
      // flushes all of them at once — turning N pushes into 1 push round-
      // trip per repo (issue #565 phase B.1). API-mode groups don't
      // benefit from coalescing (each call is its own HTTP round-trip),
      // but grouping costs nothing and keeps the code path uniform.
      // Items whose `nextRetryAt` hasn't elapsed yet get skipped — they
      // stay in the queue for the next drain (issue #565 phase D).
      const due = initial.filter((m) => m.nextRetryAt == null || m.nextRetryAt <= now);
      const groups = new Map<string, QueuedMutation[]>();
      const groupKey = (m: QueuedMutation) =>
        `${m.params.repo}\n${m.params.branch || 'main'}`;
      for (const item of due) {
        const key = groupKey(item);
        const arr = groups.get(key) ?? [];
        arr.push(item);
        groups.set(key, arr);
      }

      // Process all (repo, branch) groups in parallel — they're
      // independent of each other. Within a single group the processing
      // stays serial so write ordering against the same repo is
      // preserved (issue #565 phase B.3).
      const perGroupOutcomes = await Promise.all(
        Array.from(groups.entries()).map(([key, items]) => this.drainGroup(key, items, now)),
      );

      const updatedById = new Map<string, QueuedMutation>();
      const droppedIds = new Set<string>();
      let succeeded = 0;
      let failed = 0;
      for (const outcome of perGroupOutcomes) {
        succeeded += outcome.succeeded;
        failed += outcome.failed;
        for (const id of outcome.droppedIds) droppedIds.add(id);
        for (const [id, m] of outcome.updatedById) updatedById.set(id, m);
      }

      // Re-read the queue to pick up anything enqueued during drain. Drop
      // ids we successfully processed; merge in the updated entries.
      const live = await this.getAll();
      const next: QueuedMutation[] = [];
      for (const m of live) {
        if (droppedIds.has(m.id)) continue;
        if (updatedById.has(m.id)) {
          next.push(updatedById.get(m.id)!);
          continue;
        }
        next.push(m);
      }

      await this.saveAll(next);
      return { succeeded, failed, remaining: next.length };
    } finally {
      this.isDraining = false;
      if (releaseCycle) releaseCycle();
    }
  }

  private async drainGroup(
    key: string,
    items: QueuedMutation[],
    now: number,
  ): Promise<{
    succeeded: number;
    failed: number;
    droppedIds: Set<string>;
    updatedById: Map<string, QueuedMutation>;
  }> {
    const sep = key.indexOf('\n');
    const repoPath = key.slice(0, sep);
    const branch = key.slice(sep + 1);

    // Push marker spans the whole group flight (per-mutation HTTP calls and
    // the clone-mode coalesced push). A pull reading origin mid-push is the
    // resurrection window, so pull steps must wait for this marker to clear.
    GitSyncGate.markPushActive(repoPath, branch);
    try {
      return await this.processDrainGroup(repoPath, branch, items, now);
    } finally {
      GitSyncGate.clearPushActive(repoPath, branch);
    }
  }

  private async processDrainGroup(
    repoPath: string,
    branch: string,
    items: QueuedMutation[],
    now: number,
  ): Promise<{
    succeeded: number;
    failed: number;
    droppedIds: Set<string>;
    updatedById: Map<string, QueuedMutation>;
  }> {
    const isClone = (await SyncEngineService.getMode(repoPath)) === 'clone';

    const droppedIds = new Set<string>();
    const updatedById = new Map<string, QueuedMutation>();
    let succeeded = 0;
    let failed = 0;

    const recordFailure = async (
      item: QueuedMutation,
      error: string | undefined,
      status?: number,
    ): Promise<void> => {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[NoteSyncQueue] dropped after max attempts:', error);
        failed++;
        droppedIds.add(item.id);
        this.emitDroppedMutation({ mutation: item, reason: 'exhausted', error, status });
        if (item.type === 'note.delete') {
          await recordDeleteFailure(item.params.repo, item.params.branch, item.params.filePath, {
            error: error ?? 'Unknown error',
            kind: 'exhausted',
            at: Date.now(),
          });
        }
      } else {
        updatedById.set(item.id, {
          ...item,
          attempts,
          lastError: error,
          nextRetryAt: now + backoffMsForAttempts(attempts),
        });
        failed++;
      }
    };

    // Items whose local write/delete+commit succeeded but whose push is
    // deferred to the group flush. Recorded so we can apply the post-
    // success StorageService.updateNote (upserts only) and drop them
    // only once the flush succeeds.
    const pendingFlush: { item: QueuedMutation; result: NoteGitHubSyncResult }[] = [];

    for (const item of items) {
      const result =
        item.type === 'note.upsert'
          ? await syncNoteToGitHub({
              ...item.params,
              push: isClone ? false : undefined,
            })
          : await deleteNoteFromGitHub({
              ...item.params,
              push: isClone ? false : undefined,
            });

      if (!result.success) {
        const failure = classifyGitHubSyncError(
          new Error(result.error ?? 'Unknown GitHub sync failure'),
          result.status ?? syncStatusForError(result.error),
        );
        if (!isRetryableFailure(failure)) {
          console.warn('[NoteSyncQueue] dropped durable failure:', failure.kind);
          droppedIds.add(item.id);
          this.emitDroppedMutation({
            mutation: item,
            reason: 'durable',
            error: result.error,
            status: result.status,
          });
          if (item.type === 'note.delete') {
            await recordDeleteFailure(item.params.repo, item.params.branch, item.params.filePath, {
              error: result.error ?? failure.message,
              kind: failure.kind,
              at: Date.now(),
            });
          }
        } else {
          await recordFailure(item, result.error, result.status);
        }
        continue;
      }

      if (isClone) {
        pendingFlush.push({ item, result });
      } else {
        if (item.type === 'note.upsert') {
          await this.applyPostSyncStorageUpdate(item, result);
        } else if (item.type === 'note.delete') {
          await this.removeTombstone(item.params.repo, item.params.branch, item.params.filePath);
        }
        succeeded++;
        droppedIds.add(item.id);
      }
    }

    if (isClone && pendingFlush.length > 0) {
      const token = (await AuthService.getToken()) ?? undefined;
      const flushResult = await LocalGitWriter.push({
        repoPath,
        branch,
        token,
      });
      if (flushResult.success) {
        for (const { item, result } of pendingFlush) {
          if (item.type === 'note.upsert') {
            await this.applyPostSyncStorageUpdate(item, result);
          } else if (item.type === 'note.delete') {
            await this.removeTombstone(item.params.repo, item.params.branch, item.params.filePath);
          }
          succeeded++;
          droppedIds.add(item.id);
        }
      } else {
        console.warn('[NoteSyncQueue] coalesced push failed:', flushResult.error);
        for (const { item } of pendingFlush) await recordFailure(item, flushResult.error);
      }
    }

    return { succeeded, failed, droppedIds, updatedById };
  }

  private async applyPostSyncStorageUpdate(
    item: QueuedMutation & { type: 'note.upsert' },
    result: NoteGitHubSyncResult,
  ): Promise<void> {
    if (!result.filePath || !item.localNoteId) return;
    try {
      await StorageService.updateNote({
        id: item.localNoteId,
        filePath: result.filePath,
        ...(result.finalContent != null && result.finalContent !== item.params.content
          ? { content: result.finalContent }
          : {}),
      });
    } catch (error) {
      console.warn('[NoteSyncQueueService] Failed to enqueue upsert:', error);
      // best-effort; RepoPullService dedup-by-title handles stale state
    }
  }
}

export const NoteSyncQueueService = new NoteSyncQueueServiceClass();
