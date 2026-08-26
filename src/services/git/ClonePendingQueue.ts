import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnpushedCommitsService } from './UnpushedCommitsService';

const QUEUE_KEY = '@gitnotes:clone_pending_push';
const MIGRATED_KEY = '@gitnotes:clone_pending_push:migrated';
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 30_000;
const MAX_ATTEMPTS = 8;

function backoffMsForAttempts(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
}

export type ClonePendingIntent = 'upsert' | 'delete';

export interface ClonePendingItem {
  /** Stable id for the item */
  id: string;
  /** Path within the repo, e.g. "notes/foo.md" */
  path: string;
  /** Git OID of the file blob */
  oid: string;
  intent: ClonePendingIntent;
  /** When this item was first enqueued */
  createdAt: number;
  /** Number of failed attempts so far */
  attempts: number;
  /** Last error message if any attempt failed */
  lastError?: string;
  /**
   * Earliest wall-clock ms the item should be retried at.
   * `<= Date.now()` means "due now".
   */
  nextRetryAt?: number;
}

interface ClonePendingBranchState {
  items: ClonePendingItem[];
}

interface ClonePendingRepoState {
  [branch: string]: ClonePendingBranchState;
}

interface ClonePendingStore {
  [repoPath: string]: ClonePendingRepoState;
}

export interface DroppedMutationEvent {
  id: string;
  type: 'clone.upsert' | 'clone.delete';
  repoPath: string;
  branch: string;
  filePath: string;
  attempts: number;
  lastError?: string;
}

function newItemId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class ClonePendingQueueClass {
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
        // ignore listener errors — user callbacks should not break the queue
      }
    });
  }

  private emitDroppedMutation(event: DroppedMutationEvent): void {
    this.droppedListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {
        // ignore listener errors — user callbacks should not break the queue
      }
    });
  }

  private async readStore(): Promise<ClonePendingStore> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeStore(store: ClonePendingStore): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(store));
    this.notify();
  }

  /**
   * Add push items for a repo/branch. Deduplicates by (repoPath, branch, path) —
   * a newer item replaces any prior item with the same path.
   */
  async enqueuePush(
    repoPath: string,
    branch: string,
    items: Array<{ path: string; oid: string; intent: ClonePendingIntent }>,
  ): Promise<void> {
    const store = await this.readStore();
    if (!store[repoPath]) store[repoPath] = {};
    if (!store[repoPath][branch]) store[repoPath][branch] = { items: [] };

    const branchState = store[repoPath][branch];
    const now = Date.now();

    for (const incoming of items) {
      branchState.items = branchState.items.filter((i) => i.path !== incoming.path);

      branchState.items.push({
        id: newItemId(),
        path: incoming.path,
        oid: incoming.oid,
        intent: incoming.intent,
        createdAt: now,
        attempts: 0,
        nextRetryAt: now,
      });
    }

    await this.writeStore(store);
  }

  async listPending(repoPath: string, branch: string): Promise<ClonePendingItem[]> {
    const store = await this.readStore();
    const branchState = store[repoPath]?.[branch];
    if (!branchState) return [];

    const now = Date.now();
    const due = branchState.items.filter((i) => i.nextRetryAt == null || i.nextRetryAt <= now);
    const later = branchState.items.filter((i) => i.nextRetryAt != null && i.nextRetryAt > now);

    const sortByNextRetry = (a: ClonePendingItem, b: ClonePendingItem) =>
      (a.nextRetryAt ?? 0) - (b.nextRetryAt ?? 0);
    return [...due.sort(sortByNextRetry), ...later.sort(sortByNextRetry)];
  }

  async listAllPending(): Promise<Array<{ repoPath: string; branch: string; items: ClonePendingItem[] }>> {
    const store = await this.readStore();
    const result: Array<{ repoPath: string; branch: string; items: ClonePendingItem[] }> = [];

    for (const [repoPath, branches] of Object.entries(store)) {
      for (const [branch, state] of Object.entries(branches)) {
        if (state.items.length > 0) {
          result.push({ repoPath, branch, items: [...state.items] });
        }
      }
    }

    return result;
  }

  /**
   * Record a failed attempt for an item. Increments attempts and computes
   * nextRetryAt via exponential backoff. Does NOT remove the item.
   */
  async markAttempt(
    repoPath: string,
    branch: string,
    itemPath: string,
    error?: string,
  ): Promise<void> {
    const store = await this.readStore();
    const branchState = store[repoPath]?.[branch];
    if (!branchState) return;

    const item = branchState.items.find((i) => i.path === itemPath);
    if (!item) return;

    item.attempts += 1;
    item.lastError = error;
    item.nextRetryAt = Date.now() + backoffMsForAttempts(item.attempts);

    await this.writeStore(store);
  }

  /**
   * Remove an item after a successful push.
   */
  async markSuccess(repoPath: string, branch: string, itemPath: string): Promise<void> {
    const store = await this.readStore();
    const branchState = store[repoPath]?.[branch];
    if (!branchState) return;

    branchState.items = branchState.items.filter((i) => i.path !== itemPath);
    await this.writeStore(store);
  }

  /**
   * Remove an item that has exceeded MAX_ATTEMPTS. Emits onDroppedMutation
   * before removing so listeners can react.
   */
  async dropAfterMaxAttempts(
    repoPath: string,
    branch: string,
    itemPath: string,
  ): Promise<void> {
    const store = await this.readStore();
    const branchState = store[repoPath]?.[branch];
    if (!branchState) return;

    const itemIndex = branchState.items.findIndex((i) => i.path === itemPath);
    if (itemIndex < 0) return;

    const item = branchState.items[itemIndex];
    if (item.attempts < MAX_ATTEMPTS) return; // Caller should keep retrying

    branchState.items.splice(itemIndex, 1);

    this.emitDroppedMutation({
      id: item.id,
      type: item.intent === 'upsert' ? 'clone.upsert' : 'clone.delete',
      repoPath,
      branch,
      filePath: item.path,
      attempts: item.attempts,
      lastError: item.lastError,
    });

    await this.writeStore(store);
  }

  /**
   * One-shot migration from UnpushedCommitsService.list.
   *
   * For every repo/branch, calls UnpushedCommitsService.list to get unpushed
   * commits, then for each commit calls listFiles to enumerate changed files.
   * Each changed file is enqueued as an upsert item with the commit's oid.
   *
   * Sets the `@gitnotes:clone_pending_push:migrated` flag so this only runs once.
   */
  async bootstrap(): Promise<void> {
    try {
      const migrated = await AsyncStorage.getItem(MIGRATED_KEY);
      if (migrated === 'true') return;
    } catch {
      // If we can't read the flag, proceed anyway to ensure migration runs
    }

    // Collect all known repos from the store
    const store = await this.readStore();
    const repoPaths = Object.keys(store);
    if (repoPaths.length === 0) {
      await AsyncStorage.setItem(MIGRATED_KEY, 'true');
      return;
    }

    for (const repoPath of repoPaths) {
      const branches = Object.keys(store[repoPath] ?? {});
      for (const branch of branches) {
        try {
          const commits = await UnpushedCommitsService.list({ repo: repoPath, branch });
          for (const commit of commits) {
            try {
              const changedFiles = await UnpushedCommitsService.listFiles({
                repo: repoPath,
                branch,
                oid: commit.oid,
              });
              const upsertItems = changedFiles
                .filter((f) => f.status !== 'deleted')
                .map((f) => ({ path: f.path, oid: commit.oid, intent: 'upsert' as ClonePendingIntent }));

              const deleteItems = changedFiles
                .filter((f) => f.status === 'deleted')
                .map((f) => ({ path: f.path, oid: '', intent: 'delete' as ClonePendingIntent }));

              if (upsertItems.length > 0 || deleteItems.length > 0) {
                await this.enqueuePush(repoPath, branch, [...upsertItems, ...deleteItems]);
              }
            } catch {
              // Per-commit file enumeration is best-effort; skip on error
            }
          }
        } catch {
          // Per-branch migration is best-effort; skip on error
        }
      }
    }

    await AsyncStorage.setItem(MIGRATED_KEY, 'true');
  }
}

export const ClonePendingQueue = new ClonePendingQueueClass();
