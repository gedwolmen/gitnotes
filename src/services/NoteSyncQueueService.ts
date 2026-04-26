import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncNoteToGitHub } from './NoteGitHubSyncService';
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
}

export interface QueuedMutation {
  id: string;
  type: 'note.upsert';
  createdAt: number;
  attempts: number;
  lastError?: string;
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

  async enqueueNoteUpsert(params: NoteUpsertParams): Promise<void> {
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
      const items = await this.getAll();
      const remaining: QueuedMutation[] = [];

      for (const item of items) {
        if (item.type !== 'note.upsert') {
          remaining.push(item);
          continue;
        }
        const result = await syncNoteToGitHub(item.params);
        if (result.success) {
          succeeded++;
          continue;
        }
        const attempts = item.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          console.warn('[NoteSyncQueue] dropped after max attempts:', result.error);
          failed++;
        } else {
          remaining.push({ ...item, attempts, lastError: result.error });
          failed++;
        }
      }

      await this.saveAll(remaining);
      return { succeeded, failed, remaining: remaining.length };
    } finally {
      this.isDraining = false;
    }
  }
}

export const NoteSyncQueueService = new NoteSyncQueueServiceClass();
