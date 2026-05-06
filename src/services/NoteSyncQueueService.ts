import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncNoteToGitHub, NoteGitHubSyncResult } from './NoteGitHubSyncService';
import { StorageService } from './StorageService';
import { SyncEngineService } from './SyncEngineService';
import { AuthService } from './AuthService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { NoteColor, NoteFormat } from '../models/Note';

const QUEUE_KEY = '@gitnotes:sync_queue_v1';
const MAX_ATTEMPTS = 8;

export interface NoteUpsertParams {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  content: string;
  format?: NoteFormat;
  tags?: string[];
  color?: NoteColor | null;
}

export interface QueuedMutation {
  id: string;
  type: 'note.upsert';
  createdAt: number;
  attempts: number;
  lastError?: string;
  localNoteId?: string;
  params: NoteUpsertParams;
}

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

  async enqueueNoteUpsert(params: NoteUpsertParams, localNoteId?: string): Promise<void> {
    const items = await this.getAll();
    const dedupeKey = (m: QueuedMutation) =>
      m.type === 'note.upsert' &&
      m.params.repo === params.repo &&
      (m.params.branch || 'main') === (params.branch || 'main') &&
      m.params.filePath === params.filePath &&
      m.params.title === params.title;

    const filtered = items.filter((m) => !dedupeKey(m));
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

  async drain(): Promise<{ succeeded: number; failed: number; remaining: number }> {
    if (this.isDraining) {
      const items = await this.getAll();
      return { succeeded: 0, failed: 0, remaining: items.length };
    }
    this.isDraining = true;
    let succeeded = 0;
    let failed = 0;

    try {
      const initial = await this.getAll();
      const updatedById = new Map<string, QueuedMutation>();
      const droppedIds = new Set<string>();

      // Group items by (repo, branch). Within a clone-mode group every
      // write runs with `push: false` and a single `LocalGitWriter.push`
      // flushes all of them at once — turning N pushes into 1 push round-
      // trip per repo (issue #565 phase B.1). API-mode groups don't
      // benefit from coalescing (each call is its own HTTP round-trip),
      // but grouping costs nothing and keeps the code path uniform.
      const upserts = initial.filter((m) => m.type === 'note.upsert');
      const groups = new Map<string, QueuedMutation[]>();
      const groupKey = (m: QueuedMutation) =>
        `${m.params.repo}\n${m.params.branch || 'main'}`;
      for (const item of upserts) {
        const key = groupKey(item);
        const arr = groups.get(key) ?? [];
        arr.push(item);
        groups.set(key, arr);
      }

      for (const [key, items] of groups) {
        const sep = key.indexOf('\n');
        const repoPath = key.slice(0, sep);
        const branch = key.slice(sep + 1);
        const isClone = (await SyncEngineService.getMode(repoPath)) === 'clone';

        // Items whose local write+commit succeeded but whose push is
        // deferred to the group flush. Recorded so we can apply the
        // post-success StorageService.updateNote and drop them only once
        // the flush succeeds.
        const pendingFlush: {
          item: QueuedMutation;
          result: NoteGitHubSyncResult;
        }[] = [];

        for (const item of items) {
          const result = await syncNoteToGitHub({
            ...item.params,
            push: isClone ? false : undefined,
          });

          if (!result.success) {
            const attempts = item.attempts + 1;
            if (attempts >= MAX_ATTEMPTS) {
              console.warn('[NoteSyncQueue] dropped after max attempts:', result.error);
              failed++;
              droppedIds.add(item.id);
            } else {
              updatedById.set(item.id, { ...item, attempts, lastError: result.error });
              failed++;
            }
            continue;
          }

          if (isClone) {
            // Defer the drop / StorageService update until the group push
            // succeeds. If flush fails the items stay queued and the next
            // drain re-runs them — `LocalGitWriter.writeAndCommit` is
            // idempotent (skips empty commits) so retries don't pollute
            // the history.
            pendingFlush.push({ item, result });
          } else {
            await this.applyPostSyncStorageUpdate(item, result);
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
              await this.applyPostSyncStorageUpdate(item, result);
              succeeded++;
              droppedIds.add(item.id);
            }
          } else {
            console.warn('[NoteSyncQueue] coalesced push failed:', flushResult.error);
            for (const { item } of pendingFlush) {
              const attempts = item.attempts + 1;
              if (attempts >= MAX_ATTEMPTS) {
                console.warn('[NoteSyncQueue] dropped after max attempts:', flushResult.error);
                failed++;
                droppedIds.add(item.id);
              } else {
                updatedById.set(item.id, { ...item, attempts, lastError: flushResult.error });
                failed++;
              }
            }
          }
        }
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

  private async applyPostSyncStorageUpdate(
    item: QueuedMutation,
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
