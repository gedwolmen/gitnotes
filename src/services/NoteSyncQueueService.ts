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

class NoteSyncQueueServiceClass {
  private isDraining = false;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (error) { void error;
        // ignore listener errors
      }
    });
  }

  async getAll(): Promise<QueuedMutation[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { void error;
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
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (!raw) return false;
      const map: Record<string, number> = JSON.parse(raw);
      const key = this.tombstoneKey(repo, branch || 'main', filePath);
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
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (!raw) return;
      const map: Record<string, number> = JSON.parse(raw);
      delete map[this.tombstoneKey(repo, branch || 'main', filePath)];
      await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
    } catch { /* best-effort */ }
  }

  async enqueueNoteUpsert(params: NoteUpsertParams, localNoteId?: string): Promise<void> {
    const items = await this.getAll();
    const sameRepoBranchPath = (m: QueuedMutation) =>
      m.params.repo === params.repo &&
      (m.params.branch || 'main') === (params.branch || 'main') &&
      m.params.filePath === params.filePath;
    // Drop prior upserts with the same (repo, branch, filePath, title) —
    // latest wins. Also drop any pending delete for the same path: the
    // user re-created the note, so the delete is wasted (#565 phase B.2).
    const filtered = items.filter((m) => {
      if (m.type === 'note.upsert') {
        return !(
          sameRepoBranchPath(m) && m.params.title === params.title
        );
      }
      // note.delete: only drop if filePath matches and is set on both
      // sides — undefined filePath on either side means we can't be
      // sure they refer to the same blob.
      return !(params.filePath && sameRepoBranchPath(m));
    });
    filtered.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'note.upsert',
      createdAt: Date.now(),
      attempts: 0,
      localNoteId,
      params,
    });
    await this.saveAll(filtered);
  }

  async enqueueNoteDelete(params: NoteDeleteParams): Promise<void> {
    const items = await this.getAll();
    const sameRepoBranchPath = (m: QueuedMutation) =>
      m.params.repo === params.repo &&
      (m.params.branch || 'main') === (params.branch || 'main') &&
      m.params.filePath === params.filePath;
    // Drop prior upserts for this file — they're wasted writes since the
    // file is being deleted (#565 phase B.2). Drop prior deletes for the
    // same file too — only one delete is needed.
    const filtered = items.filter((m) => !sameRepoBranchPath(m));
    filtered.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'note.delete',
      createdAt: Date.now(),
      attempts: 0,
      params,
    });
    await this.saveAll(filtered);
    await this.addTombstone(params.repo, params.branch, params.filePath);
  }

  async drain(): Promise<{ succeeded: number; failed: number; remaining: number }> {
    if (this.isDraining) {
      const items = await this.getAll();
      return { succeeded: 0, failed: 0, remaining: items.length };
    }
    this.isDraining = true;

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
    const isClone = (await SyncEngineService.getMode(repoPath)) === 'clone';

    const droppedIds = new Set<string>();
    const updatedById = new Map<string, QueuedMutation>();
    let succeeded = 0;
    let failed = 0;

    const recordFailure = (item: QueuedMutation, error: string | undefined): void => {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[NoteSyncQueue] dropped after max attempts:', error);
        failed++;
        droppedIds.add(item.id);
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
        recordFailure(item, result.error);
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
        for (const { item } of pendingFlush) recordFailure(item, flushResult.error);
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
      void error;
      // best-effort; RepoPullService dedup-by-title handles stale state
    }
  }
}

export const NoteSyncQueueService = new NoteSyncQueueServiceClass();
