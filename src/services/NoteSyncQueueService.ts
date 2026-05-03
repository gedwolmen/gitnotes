import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncNoteToGitHub } from './NoteGitHubSyncService';
import { StorageService } from './StorageService';
import { NoteFormat } from '../models/Note';

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
      } catch {
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
    } catch {
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
      // Snapshot the ids we're about to process. After draining we re-read
      // the live queue and only remove these ids, preserving any new
      // mutations that arrived during the drain.
      const processedIds = new Set<string>();
      const updatedById = new Map<string, QueuedMutation>();
      const droppedIds = new Set<string>();

      for (const item of initial) {
        if (item.type !== 'note.upsert') continue;
        processedIds.add(item.id);
        const result = await syncNoteToGitHub(item.params);
        if (result.success) {
          if (result.filePath && item.localNoteId) {
            try {
              await StorageService.updateNote({
                id: item.localNoteId,
                filePath: result.filePath,
                ...(result.finalContent != null && result.finalContent !== item.params.content
                  ? { content: result.finalContent }
                  : {}),
              });
            } catch {
              // best-effort; RepoPullService dedup-by-title handles stale state
            }
          }
          succeeded++;
          droppedIds.add(item.id);
          continue;
        }
        const attempts = item.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          console.warn('[NoteSyncQueue] dropped after max attempts:', result.error);
          failed++;
          droppedIds.add(item.id);
        } else {
          updatedById.set(item.id, { ...item, attempts, lastError: result.error });
          failed++;
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
}

export const NoteSyncQueueService = new NoteSyncQueueServiceClass();
