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
import { clearDeleteFailure, clearDeleteFailuresForRepo, readDeleteFailures, recordDeleteFailure, DELETE_FAILURES_STORAGE_KEY } from './git/deleteFailures';
import { recordStrandedCommit, getStrandedCommitOid } from './git/strandedCommits';
import { GitSyncGate, type CycleSource } from './git/GitSyncGate';
import { batchDeleteFiles, batchUpsertFiles } from './git/BatchGitOperations';
import type { BatchDeleteFilesResult, BatchUpsertFilesResult } from './git/BatchGitOperations';
import { parseRepoPath } from '../utils/gitPathParser';
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
  accountId?: string;
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
  /** Local note id carried for success events + entity locks; the sync itself ignores it. */
  localNoteId?: string;
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

const LOCAL_IMAGE_URI_RE = /(file:\/\/|asset:\/\/|ph:\/\/|content:\/\/)/i;

type BatchEligibleUpsert = QueuedMutation & {
  type: 'note.upsert';
  params: NoteUpsertParams & { filePath: string };
};

/**
 * An upsert is batchable only when the per-item path would NOT have done
 * something the batch can't replicate:
 *  (a) `knownSha` is unset — the per-item path guards remote conflicts via
 *      knownSha; batching skips that check, so those items stay per-item.
 *  (b) the content references no local image URI — `syncNoteToGitHub`
 *      rewrites file://, asset://, ph:// and content:// URIs to remote URLs
 *      during upload; the batch writes content verbatim, so such items must
 *      stay per-item (their images would 404 remotely).
 * A missing filePath also disqualifies: the title-derived path is resolved
 * on the per-item path, and without a concrete path the batch can't address
 * the file.
 */
function isBatchEligibleUpsert(m: QueuedMutation): m is BatchEligibleUpsert {
  if (m.type !== 'note.upsert') return false;
  if (!m.params.filePath) return false;
  if (m.params.knownSha) return false;
  if (LOCAL_IMAGE_URI_RE.test(m.params.content)) return false;
  return true;
}

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

/**
 * Side-channel notification for mutations that reached the remote
 * successfully. `noteStore` listens for `note.delete` events to complete
 * the local delete (storage + state + registry) — the row stays
 * visible-but-locked until this fires.
 */
export interface MutationSucceededEvent {
  mutation: QueuedMutation;
}

class NoteSyncQueueServiceClass {
  private isDraining = false;
  private listeners = new Set<() => void>();
  private droppedListeners = new Set<(event: DroppedMutationEvent) => void>();
  private succeededListeners = new Set<(event: MutationSucceededEvent) => void>();
  private enqueueChain: Promise<void> = Promise.resolve();

  private async withEnqueueLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.enqueueChain;
    const next = previous.then(fn, fn);
    this.enqueueChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

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

  onMutationSucceeded(fn: (event: MutationSucceededEvent) => void): () => void {
    this.succeededListeners.add(fn);
    return () => {
      this.succeededListeners.delete(fn);
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

  private emitMutationSucceeded(event: MutationSucceededEvent): void {
    this.succeededListeners.forEach((fn) => {
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

  async purgeForRepoAndBranch(repoPath: string, branch: string): Promise<void> {
    const queue = await this.getAll();
    const remaining = queue.filter((m) => {
      if (m.params.repo !== repoPath) return true;
      const mBranch = m.params.branch || 'main';
      return mBranch !== branch;
    });
    if (remaining.length < queue.length) {
      await this.saveAll(remaining);
    }
  }

  async purgeForRepo(repoPath: string): Promise<void> {
    const queue = await this.getAll();
    const remaining = queue.filter((m) => m.params.repo !== repoPath);
    if (remaining.length < queue.length) {
      await this.saveAll(remaining);
    }
    try {
      const raw = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (raw) {
        const map: Record<string, number> = JSON.parse(raw);
        const prefix = `${repoPath}::`;
        let changed = false;
        for (const key of Object.keys(map)) {
          if (key.startsWith(prefix)) {
            delete map[key];
            changed = true;
          }
        }
        if (changed) {
          await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
        }
      }
    } catch { /* best-effort */ }
    await clearDeleteFailuresForRepo(repoPath);
  }

  private newMutationId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private branchCacheKey(repo: string, hint: string | undefined): string {
    return `${repo}\n${hint ?? ''}`;
  }

  private async resolveBranchesOnce(
    keys: { repo: string; hint?: string }[],
  ): Promise<Map<string, string>> {
    const unique = new Map<string, { repo: string; hint?: string }>();
    for (const key of keys) {
      unique.set(this.branchCacheKey(key.repo, key.hint), key);
    }
    const resolved = new Map<string, string>();
    await Promise.all(
      Array.from(unique.entries()).map(async ([cacheKey, { repo, hint }]) => {
        resolved.set(cacheKey, await resolveBranch(repo, hint));
      }),
    );
    return resolved;
  }

  /**
   * Batch variant of `enqueueNoteDelete`: branches are resolved once per
   * unique (repo, hint) pair, the queue is rewritten ONCE, and tombstones
   * plus pinned-failure clears happen in ONE read/modify/write pass per
   * storage key. Same-path dedup rules apply across the existing queue AND
   * within the batch (last item for a path wins). Returns the created
   * mutation ids in input order (issue #927 infra — write-through callers
   * need the id to detect their own mutation's drop-vs-pushed outcome).
   */
  async enqueueNoteDeletes(items: NoteDeleteParams[]): Promise<{ ids: string[] }> {
    return this.withEnqueueLock(async () => {
    if (items.length === 0) return { ids: [] };
    const branches = await this.resolveBranchesOnce(
      items.map((params) => ({ repo: params.repo, hint: params.branch })),
    );
    const resolvedItems = items.map((params) => ({
      ...params,
      branch: branches.get(this.branchCacheKey(params.repo, params.branch))!,
    }));

    let queue = await this.getAll();
    const batchMutations: QueuedMutation[] = [];
    const ids: string[] = [];
    for (const params of resolvedItems) {
      const sameRepoBranchPath = (m: QueuedMutation) =>
        m.params.repo === params.repo &&
        (m.params.branch || 'main') === params.branch &&
        m.params.filePath === params.filePath;
      queue = queue.filter((m) => !sameRepoBranchPath(m));
      for (let i = batchMutations.length - 1; i >= 0; i -= 1) {
        if (sameRepoBranchPath(batchMutations[i])) batchMutations.splice(i, 1);
      }
      const id = this.newMutationId();
      ids.push(id);
      batchMutations.push({
        id,
        type: 'note.delete',
        createdAt: Date.now(),
        attempts: 0,
        params,
      });
    }
    await this.saveAll([...queue, ...batchMutations]);

    let tombstoneMap: Record<string, number> = {};
    let failureMap: Record<string, unknown> = {};
    try {
      const rawTombstones = await AsyncStorage.getItem(TOMBSTONE_KEY);
      if (rawTombstones) tombstoneMap = JSON.parse(rawTombstones);
    } catch { /* best-effort */ }
    try {
      const rawFailures = await AsyncStorage.getItem(DELETE_FAILURES_STORAGE_KEY);
      if (rawFailures) failureMap = JSON.parse(rawFailures);
    } catch { /* best-effort */ }
    const now = Date.now();
    let failuresChanged = false;
    for (const params of resolvedItems) {
      const key = this.tombstoneKey(params.repo, params.branch, params.filePath);
      tombstoneMap[key] = now;
      if (key in failureMap) {
        delete failureMap[key];
        failuresChanged = true;
      }
    }
    try {
      await AsyncStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstoneMap));
      if (failuresChanged) {
        await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, JSON.stringify(failureMap));
      }
    } catch { /* best-effort */ }
    return { ids };
    });
  }

  /**
   * Batch variant of `enqueueNoteUpsert`: ONE queue write for the whole
   * batch. Dedup mirrors the single-item rules — a new upsert drops
   * same-path prior upserts regardless of title (latest wins; a rename
   * reuses the path under a new title and must not leave two writes) and
   * any pending same-path delete (the note was re-created, delete wasted).
   * Returns the created mutation ids in input order.
   */
  async enqueueNoteUpserts(
    items: NoteUpsertParams[],
    localNoteIds?: (string | undefined)[],
  ): Promise<{ ids: string[] }> {
    return this.withEnqueueLock(async () => {
    if (items.length === 0) return { ids: [] };
    const branches = await this.resolveBranchesOnce(
      items.map((params) => ({ repo: params.repo, hint: params.branch })),
    );

    let queue = await this.getAll();
    const batchMutations: QueuedMutation[] = [];
    const ids: string[] = [];
    for (const [index, rawParams] of items.entries()) {
      const branch = branches.get(this.branchCacheKey(rawParams.repo, rawParams.branch))!;
      const resolvedParams: NoteUpsertParams = { ...rawParams, branch };
      const sameRepoBranchPath = (m: QueuedMutation) =>
        m.params.repo === resolvedParams.repo &&
        (m.params.branch || 'main') === branch &&
        m.params.filePath === resolvedParams.filePath;
      // Drop any prior entry sharing the resolved (repo, branch, filePath):
      // upserts regardless of title (a rename reuses the path under a new
      // title, and the old title-only match left BOTH queued — two writes
      // for one rename); deletes only when filePath is set on both sides
      // (undefined on either side means the blob match is unproven). The
      // filePath guard also keeps two un-pathed new notes from collapsing.
      const keepExisting = (m: QueuedMutation): boolean =>
        !(resolvedParams.filePath && sameRepoBranchPath(m));
      const droppedPrior = queue.filter((m) => !keepExisting(m));
      queue = queue.filter(keepExisting);
      for (let i = batchMutations.length - 1; i >= 0; i -= 1) {
        if (!keepExisting(batchMutations[i])) batchMutations.splice(i, 1);
      }
      // Clear tombstones for any prior same-path deletes the upsert
      // supersedes — otherwise the 24h tombstone TTL blocks the next
      // pull from re-importing the recreated note on other devices.
      for (const dropped of droppedPrior) {
        if (dropped.type === 'note.delete') {
          await this.removeTombstone(
            dropped.params.repo,
            dropped.params.branch,
            dropped.params.filePath,
          );
        }
      }
      const id = this.newMutationId();
      ids.push(id);
      batchMutations.push({
        id,
        type: 'note.upsert',
        createdAt: Date.now(),
        attempts: 0,
        localNoteId: localNoteIds?.[index],
        params: resolvedParams,
      });
    }
    await this.saveAll([...queue, ...batchMutations]);
    return { ids };
    });
  }

  async enqueueNoteUpsert(params: NoteUpsertParams, localNoteId?: string): Promise<{ id: string }> {
    const { ids } = await this.enqueueNoteUpserts(
      [params],
      localNoteId === undefined ? undefined : [localNoteId],
    );
    return { id: ids[0] };
  }

  async enqueueNoteDelete(params: NoteDeleteParams): Promise<{ id: string }> {
    const { ids } = await this.enqueueNoteDeletes([params]);
    return { id: ids[0] };
  }

  async drain(
    onProgress?: (fraction: number | null) => void,
    source: CycleSource = 'background',
    repoPath?: string,
    branch?: string,
  ): Promise<{ succeeded: number; failed: number; remaining: number }> {
    if (this.isDraining) {
      const items = await this.getAll();
      return { succeeded: 0, failed: 0, remaining: items.length };
    }
    this.isDraining = true;

    // Serialize against app-wide drain+pull cycles (foreground/startup/
    // background/manual sync). When this drain runs INSIDE a held cycle
    // the cycle owner already owns the mutex — acquiring again here would
    // self-deadlock, so the short-circuit is mandatory.
    const releaseCycle = GitSyncGate.isCycleHeld() ? null : await GitSyncGate.acquireCycle(source);

    try {
      let initial = await this.getAll();
      if (repoPath !== undefined) {
        initial = initial.filter((m) => m.params.repo === repoPath);
        if (branch !== undefined) {
          initial = initial.filter((m) => (m.params.branch ?? 'main') === branch);
        }
      }
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
      // preserved (issue #565 phase B.3). Promise.allSettled is used so
      // that all groups complete even if one rejects — no group's backoff
      // state is lost (issue #1205).
      const totalDue = due.length;
      let completed = 0;
      const groupEntries = Array.from(groups.entries());
      const groupResults = await Promise.allSettled(
        groupEntries.map(([key, items]) =>
          this.drainGroup(key, items, now).then((outcome) => {
            completed += items.length;
            if (onProgress) {
              onProgress(totalDue > 0 ? completed / totalDue : null);
            }
            return outcome;
          }),
        ),
      );

      // Process each settled result. For rejected groups, re-process to
      // apply backoff rather than silently losing retry state (issue #1205).
      const perGroupOutcomes = await Promise.all(
        groupResults.map(async (result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          const [key, items] = groupEntries[index];
          console.warn('[NoteSyncQueue] drainGroup rejected, re-processing for backoff:', result.reason);
          const sep = key.indexOf('\n');
          const repoPath = key.slice(0, sep);
          const branch = key.slice(sep + 1);
          GitSyncGate.markPushActive(repoPath, branch);
          try {
            const groupOutcome = await this.processDrainGroup(repoPath, branch, items, now);
            // Merge: count the group's failed items and apply backoff entries
            // for any item not already in updatedById or droppedIds.
            const merged: typeof groupOutcome = {
              ...groupOutcome,
              updatedById: new Map(groupOutcome.updatedById),
            };
            for (const item of items) {
              if (!merged.updatedById.has(item.id) && !merged.droppedIds.has(item.id)) {
                merged.updatedById.set(item.id, {
                  ...item,
                  attempts: item.attempts + 1,
                  lastError: result.reason?.message ?? String(result.reason),
                  nextRetryAt: now + backoffMsForAttempts(item.attempts + 1),
                });
                merged.failed++;
              }
            }
            return merged;
          } finally {
            GitSyncGate.clearPushActive(repoPath, branch);
          }
        }),
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
      if (onProgress) onProgress(totalDue > 0 ? 1 : null);
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
            error: error || 'Unknown error',
            kind: 'exhausted',
            at: Date.now(),
          });
        }
        if (isClone) {
          const stranded = await getStrandedCommitOid(repoPath, branch);
          if (stranded) {
            await recordStrandedCommit(repoPath, branch, stranded.oid, stranded.message, error || 'push failed after max retries');
          }
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

    // API-mode single-commit bulk: >=2 due deletes in one (repo, branch)
    // group ship as ONE Git-Data commit instead of N Contents-API deletes.
    // Subgroups keyed by accountId never share a batch (token ownership);
    // a group that throws is left for the per-item loop below so its items
    // get the full deleteNoteFromGitHub classification instead.
    const handledByBatch = new Set<string>();
    if (!isClone) {
      const dueDeletes = items.filter(
        (m): m is QueuedMutation & { type: 'note.delete' } => m.type === 'note.delete',
      );
      if (dueDeletes.length >= 2) {
        const repoInfo = parseRepoPath(repoPath);
        if (repoInfo) {
          const subgroups = new Map<string, (QueuedMutation & { type: 'note.delete' })[]>();
          for (const item of dueDeletes) {
            const key = item.params.accountId !== undefined ? item.params.accountId : '__default__';
            const arr = subgroups.get(key) ?? [];
            arr.push(item);
            subgroups.set(key, arr);
          }
          for (const [accountId, group] of subgroups) {
            if (group.length < 2) continue;
            let tokenOverride: string | undefined;
            if (accountId) {
              tokenOverride = (await AuthService.getTokenById(accountId)) ?? undefined;
            }
            let batchResult: BatchDeleteFilesResult | null = null;
            try {
              batchResult = await batchDeleteFiles({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                branch,
                paths: group.map((item) => item.params.filePath),
                message: `Delete ${group.length} notes`,
                ...(tokenOverride ? { opts: { tokenOverride } } : {}),
              });
            } catch (batchError) {
              console.warn('[NoteSyncQueue] batch delete threw; group reverts to per-item processing:', batchError);
            }
            if (batchResult) {
              const byPath = new Map(group.map((item) => [item.params.filePath, item]));
              const deletedPaths = new Set(batchResult.deleted);
              for (const item of group) {
                if (deletedPaths.has(item.params.filePath)) {
                  await this.removeTombstone(item.params.repo, item.params.branch, item.params.filePath);
                  succeeded += 1;
                  droppedIds.add(item.id);
                  this.emitMutationSucceeded({ mutation: item });
                  handledByBatch.add(item.id);
                }
              }
              for (const failure of batchResult.failed) {
                const item = byPath.get(failure.path);
                if (!item) continue;
                handledByBatch.add(item.id);
                await this.classifyBatchDeleteFailure(item, failure.error, droppedIds, recordFailure);
              }
              for (const item of group) {
                if (!handledByBatch.has(item.id)) {
                  handledByBatch.add(item.id);
                  await recordFailure(item, 'Batch delete returned no outcome for path');
                }
              }
            }
          }
        }
      }
    }

    // API-mode single-commit bulk upserts: >=2 eligible upserts in one
    // (repo, branch) group ship as ONE Git-Data commit (createBlob xN in
    // parallel -> createTree with base_tree -> createCommit -> updateRef)
    // instead of N serial GET(sha)+PUT(contents) round-trips. Only eligible
    // items batch (see isBatchEligibleUpsert); ineligible upserts and any
    // deletes flow through the per-item loop. A batch that throws reverts
    // its group to per-item syncNoteToGitHub so items keep their full
    // classification.
    if (!isClone) {
      const dueUpserts = items.filter(isBatchEligibleUpsert);
      if (dueUpserts.length >= 2) {
        const repoInfo = parseRepoPath(repoPath);
        if (repoInfo) {
          const subgroups = new Map<string, BatchEligibleUpsert[]>();
          for (const item of dueUpserts) {
            const key = item.params.accountId !== undefined ? item.params.accountId : '__default__';
            const arr = subgroups.get(key) ?? [];
            arr.push(item);
            subgroups.set(key, arr);
          }
          for (const [accountId, group] of subgroups) {
            if (group.length < 2) continue;
            let tokenOverride: string | undefined;
            if (accountId) {
              tokenOverride = (await AuthService.getTokenById(accountId)) ?? undefined;
            }
            let batchResult: BatchUpsertFilesResult | null = null;
            try {
              batchResult = await batchUpsertFiles({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                branch,
                files: group.map((item) => ({
                  path: item.params.filePath,
                  content: item.params.content,
                })),
                message: `Update ${group.length} notes`,
                ...(tokenOverride ? { opts: { tokenOverride } } : {}),
              });
            } catch (batchError) {
              console.warn('[NoteSyncQueue] batch upsert threw; group reverts to per-item processing:', batchError);
            }
            if (batchResult) {
              const byPath = new Map(group.map((item) => [item.params.filePath, item]));
              const upsertedPaths = new Set(batchResult.upserted);
              for (const item of group) {
                if (upsertedPaths.has(item.params.filePath)) {
                  await this.applyPostSyncStorageUpdate(item, {
                    success: true,
                    filePath: item.params.filePath,
                    finalContent: item.params.content,
                  });
                  succeeded += 1;
                  droppedIds.add(item.id);
                  this.emitMutationSucceeded({ mutation: item });
                  handledByBatch.add(item.id);
                }
              }
              for (const failure of batchResult.failed) {
                const item = byPath.get(failure.path);
                if (!item) continue;
                handledByBatch.add(item.id);
                await this.handleBatchUpsertFailure(item, failure.error, droppedIds, recordFailure);
              }
              for (const item of group) {
                if (!handledByBatch.has(item.id)) {
                  handledByBatch.add(item.id);
                  await recordFailure(item, 'Batch upsert returned no outcome for path');
                }
              }
            }
          }
        }
      }
    }

    // Items whose local write/delete+commit succeeded but whose push is
    // deferred to the group flush. Recorded so we can apply the post-
    // success StorageService.updateNote (upserts only) and drop them
    // only once the flush succeeds.
    const pendingFlush: { item: QueuedMutation; result: NoteGitHubSyncResult }[] = [];

    for (const item of items) {
      if (handledByBatch.has(item.id)) continue;
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
              error: result.error || failure.message,
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
        this.emitMutationSucceeded({ mutation: item });
      }
    }

    if (isClone && pendingFlush.length > 0) {
      const byAccount = new Map<string, typeof pendingFlush>();
      for (const entry of pendingFlush) {
        const key = entry.item.params.accountId !== undefined ? entry.item.params.accountId : '__default__';
        const arr = byAccount.get(key) ?? [];
        arr.push(entry);
        byAccount.set(key, arr);
      }
      for (const [accountKey, entries] of byAccount) {
        const token = accountKey === '__default__'
          ? (await AuthService.getToken()) ?? undefined
          : (await AuthService.getTokenById(accountKey)) ?? undefined;
        const flushResult = await LocalGitWriter.push({
          repoPath,
          branch,
          token,
        });
        if (flushResult.success) {
          for (const { item, result } of entries) {
            if (item.type === 'note.upsert') {
              await this.applyPostSyncStorageUpdate(item, result);
            } else if (item.type === 'note.delete') {
              await this.removeTombstone(item.params.repo, item.params.branch, item.params.filePath);
            }
            succeeded++;
            droppedIds.add(item.id);
            this.emitMutationSucceeded({ mutation: item });
          }
        } else {
          console.warn('[NoteSyncQueue] coalesced push failed:', flushResult.error);
          for (const { item } of entries) await recordFailure(item, flushResult.error);
        }
      }
    }

    return { succeeded, failed, droppedIds, updatedById };
  }

  private async classifyBatchDeleteFailure(
    item: QueuedMutation & { type: 'note.delete' },
    error: string,
    droppedIds: Set<string>,
    recordFailure: (item: QueuedMutation, error: string | undefined, status?: number) => Promise<void>,
  ): Promise<void> {
    const status = syncStatusForError(error);
    const failure = classifyGitHubSyncError(new Error(error), status);
    if (isRetryableFailure(failure)) {
      await recordFailure(item, error, status);
      return;
    }
    console.warn('[NoteSyncQueue] dropped durable batch-delete failure:', failure.kind);
    droppedIds.add(item.id);
    this.emitDroppedMutation({ mutation: item, reason: 'durable', error, status });
    await recordDeleteFailure(item.params.repo, item.params.branch, item.params.filePath, {
      error: error || failure.message,
      kind: failure.kind,
      at: Date.now(),
    });
  }

  private async handleBatchUpsertFailure(
    item: QueuedMutation & { type: 'note.upsert' },
    error: string,
    droppedIds: Set<string>,
    recordFailure: (item: QueuedMutation, error: string | undefined, status?: number) => Promise<void>,
  ): Promise<void> {
    const status = syncStatusForError(error);
    const failure = classifyGitHubSyncError(new Error(error), status);
    if (isRetryableFailure(failure)) {
      await recordFailure(item, error, status);
      return;
    }
    console.warn('[NoteSyncQueue] dropped durable batch-upsert failure:', failure.kind);
    droppedIds.add(item.id);
    this.emitDroppedMutation({ mutation: item, reason: 'durable', error, status });
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
