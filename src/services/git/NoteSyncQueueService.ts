/**
 * NoteSyncQueueService.ts
 *
 * Durable AsyncStorage-backed queue for clone-mode mutation queueing.
 * Explicitly tracks branch identity on every mutation item.
 *
 * Queue items are immutable once created (except status/attempts).
 * On checkout: pauses all non-active-branch items, drains only active-branch items.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GitFsService } from './GitFsService';

const QUEUE_STORAGE_KEY = '@gitnotes:sync_queue_v1';

export type MutationStatus = 'pending' | 'paused' | 'done' | 'failed';

export type EntityType = 'note' | 'canvas' | 'todo' | 'journal';

export interface QueueItem {
  id: string;
  repoId: string;
  repoPath: string;
  branch: string;
  entityType: EntityType;
  entityId: string;
  payload: Record<string, unknown>;
  status: MutationStatus;
  createdAt: number;
  attempts: number;
}

export interface QueuedMutation {
  id: string;
  type: string;
  params: {
    repo: string;
    branch?: string;
    filePath?: string;
    localNoteId?: string;
    [key: string]: unknown;
  };
  createdAt: number;
  lastError?: string;
  attempts?: number;
  localNoteId?: string;
}

export interface MutationSucceededEvent {
  mutation: QueuedMutation;
  result: unknown;
}

export interface DroppedMutationEvent {
  mutation: QueuedMutation;
  error?: string;
  reason?: string;
}

type QueueChangeCallback = () => void;
type MutationSucceededCallback = (event: MutationSucceededEvent) => void;
type DroppedMutationCallback = (event: DroppedMutationEvent) => void;

const subscribers = new Set<QueueChangeCallback>();
const mutationSucceededCallbacks = new Set<MutationSucceededCallback>();
const droppedMutationCallbacks = new Set<DroppedMutationCallback>();

function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function emitChange(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // best-effort
    }
  }
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('[NoteSyncQueueService] Failed to persist queue:', error);
  }
}

/**
 * Check if the current HEAD matches the expected branch.
 * Returns true if branch is current, false if stale.
 */
async function isHeadOnBranch(repoPath: string, expectedBranch: string): Promise<boolean> {
  try {
    const currentBranch = await GitFsService.getCurrentBranch({ repoPath });
    return currentBranch === expectedBranch;
  } catch {
    return false;
  }
}

/**
 * NoteSyncQueueService - Durable AsyncStorage-backed mutation queue
 */
export const NoteSyncQueueService = {
  /**
   * Enqueue a new mutation item.
   * Persists to AsyncStorage and emits update to subscribers.
   */
  async enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts' | 'status'>): Promise<string> {
    const queueItem: QueueItem = {
      ...item,
      id: generateId(),
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0,
    };

    const queue = await loadQueue();
    queue.push(queueItem);
    await saveQueue(queue);
    emitChange();
    return queueItem.id;
  },

  /**
   * Dequeue items matching repoId + branch.
   * Marks items as in-flight (status unchanged until processing completes).
   * Returns items whose HEAD still matches the expected branch.
   */
  async dequeue(repoId: string, branch: string): Promise<QueueItem[]> {
    const queue = await loadQueue();
    const matching: QueueItem[] = [];

    for (const item of queue) {
      if (item.repoId === repoId && item.branch === branch && item.status === 'pending') {
        // Recheck HEAD to ensure branch hasn't switched
        const headValid = await isHeadOnBranch(item.repoPath, branch);
        if (headValid) {
          matching.push(item);
        } else {
          // Branch has switched - mark item as paused (stale branch state)
          item.status = 'paused';
        }
      }
    }

    await saveQueue(queue);
    return matching;
  },

  /**
   * Get all queue items.
   */
  async getAll(): Promise<QueuedMutation[]> {
    const queue = await loadQueue();
    return queue.map(itemToQueuedMutation);
  },

  /**
   * Get all items for a specific repo.
   */
  async getAllForRepo(repoId: string): Promise<QueueItem[]> {
    const queue = await loadQueue();
    return queue.filter((item) => item.repoId === repoId);
  },

  /**
   * Update item status after processing attempt.
   */
  async updateStatus(itemId: string, status: MutationStatus, error?: string): Promise<void> {
    const queue = await loadQueue();
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;

    item.status = status;
    if (status === 'failed') {
      item.attempts += 1;
    }

    await saveQueue(queue);
    emitChange();
  },

  /**
   * Pause all items for a given branch.
   * Used when switching away from a branch.
   */
  async pauseForBranchSwitch(branch: string): Promise<void> {
    const queue = await loadQueue();
    let changed = false;

    for (const item of queue) {
      if (item.branch === branch && item.status === 'pending') {
        item.status = 'paused';
        changed = true;
      }
    }

    if (changed) {
      await saveQueue(queue);
      emitChange();
    }
  },

  /**
   * Resume paused items for a given branch.
   * Used when switching TO a branch - marks paused items as pending for drain.
   */
  async resumeForBranch(branch: string): Promise<void> {
    const queue = await loadQueue();
    let changed = false;

    for (const item of queue) {
      if (item.branch === branch && item.status === 'paused') {
        // Only resume if HEAD is still on this branch
        const headValid = await isHeadOnBranch(item.repoPath, branch);
        if (headValid) {
          item.status = 'pending';
          changed = true;
        }
      }
    }

    if (changed) {
      await saveQueue(queue);
      emitChange();
    }
  },

  /**
   * Pause all non-active-branch items.
   * Call after successful checkout to isolate queue to active branch.
   */
  async pauseAllExcept(activeRepoId: string, activeBranch: string): Promise<void> {
    const queue = await loadQueue();
    let changed = false;

    for (const item of queue) {
      if (item.status === 'pending' && (item.repoId !== activeRepoId || item.branch !== activeBranch)) {
        item.status = 'paused';
        changed = true;
      }
    }

    if (changed) {
      await saveQueue(queue);
      emitChange();
    }
  },

  /**
   * Remove a processed item from the queue.
   */
  async remove(itemId: string): Promise<void> {
    const queue = await loadQueue();
    const filtered = queue.filter((i) => i.id !== itemId);
    if (filtered.length !== queue.length) {
      await saveQueue(filtered);
      emitChange();
    }
  },

  /**
   * Get pending count for a repo+branch.
   */
  async pendingCount(repoId?: string, branch?: string): Promise<number> {
    const queue = await loadQueue();
    return queue.filter(
      (item) =>
        item.status === 'pending' &&
        (!repoId || item.repoId === repoId) &&
        (!branch || item.branch === branch),
    ).length;
  },

  /**
   * Subscribe to queue changes.
   */
  subscribe(callback: QueueChangeCallback): () => void {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  },

  /**
   * Subscribe to mutation success events.
   */
  onMutationSucceeded(callback: MutationSucceededCallback): () => void {
    mutationSucceededCallbacks.add(callback);
    return () => {
      mutationSucceededCallbacks.delete(callback);
    };
  },

  /**
   * Subscribe to dropped mutation events.
   */
  onDroppedMutation(callback: DroppedMutationCallback): () => void {
    droppedMutationCallbacks.add(callback);
    return () => {
      droppedMutationCallbacks.delete(callback);
    };
  },

  /**
   * Emit a mutation succeeded event.
   */
  emitMutationSucceeded(mutation: QueuedMutation, result: unknown): void {
    const event: MutationSucceededEvent = { mutation, result };
    for (const cb of mutationSucceededCallbacks) {
      try {
        cb(event);
      } catch {
        // best-effort
      }
    }
  },

  /**
   * Emit a dropped mutation event.
   */
  emitDroppedMutation(mutation: QueuedMutation, reason?: string, error?: string): void {
    const event: DroppedMutationEvent = { mutation, reason, error };
    for (const cb of droppedMutationCallbacks) {
      try {
        cb(event);
      } catch {
        // best-effort
      }
    }
  },

  /**
   * Purge all queue items for a repo.
   */
  async purgeForRepo(repoId: string): Promise<void> {
    const queue = await loadQueue();
    const filtered = queue.filter((i) => i.repoId !== repoId);
    if (filtered.length !== queue.length) {
      await saveQueue(filtered);
      emitChange();
    }
  },

  /**
   * Drain all pending items for a repo+branch.
   * Returns items that were drained (and should be processed).
   */
  async drain(repoId: string, branch: string): Promise<QueueItem[]> {
    const items = await this.dequeue(repoId, branch);
    return items;
  },
};

/**
 * Convert internal QueueItem to external QueuedMutation format.
 */
function itemToQueuedMutation(item: QueueItem): QueuedMutation {
  return {
    id: item.id,
    type: `${item.entityType}.${item.payload.intent ?? 'upsert'}`,
    params: {
      repo: item.repoPath,
      branch: item.branch,
      filePath: item.payload.filePath as string | undefined,
      localNoteId: item.entityId,
      ...item.payload,
    },
    createdAt: item.createdAt,
    lastError: item.payload.lastError as string | undefined,
    attempts: item.attempts,
    localNoteId: item.entityId,
  };
}
