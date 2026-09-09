/**
 * activeBranchStore.ts
 *
 * Repository-scoped active-branch state contract for Git-tab checkout.
 * Makes Git-tab checkout authoritative app-wide.
 *
 * Key concepts:
 * - `GitRepository.branch` = remote default (NOT local HEAD) — do not conflate
 * - Local HEAD is queried via `GitFsService.getCurrentBranch({ repoPath })`
 * - When HEAD differs from persisted value, state is marked `stale`
 * - Write operations (`__setActiveBranch`) are internal-only, callable only by GitBranchCoordinator
 *
 * State shape:
 * ```typescript
 * interface ActiveBranchState {
 *   repoId: string;
 *   repoPath: string;
 *   activeBranch: string | null;
 *   source: 'head' | 'persisted' | 'default';
 *   status: 'idle' | 'loading' | 'stale' | 'error';
 * }
 * ```
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GitFsService } from './GitFsService';
import { StorageService } from '../StorageService';
import type { GitRepository } from '../GitService';

const STORAGE_NAMESPACE = '@GitNotes:activeBranches';

/** Source of the active branch value — for debugging and UI purposes */
export type ActiveBranchSource = 'head' | 'persisted' | 'default';

/** Status of the active branch state */
export type ActiveBranchStatus = 'idle' | 'loading' | 'stale' | 'error';

/**
 * The active branch state for a single repository.
 * `repoId` is the stable key; `repoPath` is stored for convenience.
 */
export interface ActiveBranchState {
  repoId: string;
  repoPath: string;
  activeBranch: string | null;
  /** How the active branch was determined */
  source: ActiveBranchSource;
  /** Current state of the branch tracking */
  status: ActiveBranchStatus;
}

/** Callback type for subscriptions */
export type ActiveBranchSubscriber = (state: ActiveBranchState | null) => void;

/** Map of repoId -> subscription callbacks */
const subscriptions = new Map<string, Set<ActiveBranchSubscriber>>();

/** In-memory cache for fast reads — keyed by repoId */
const memoryCache = new Map<string, ActiveBranchState>();

/** Storage key for a given repoId */
function storageKey(repoId: string): string {
  return `${STORAGE_NAMESPACE}:${repoId}`;
}

/**
 * Retrieve persisted state for a repo from AsyncStorage.
 * Returns null if no state is stored.
 */
async function loadFromStorage(repoId: string): Promise<ActiveBranchState | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(repoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBranchState;
    // Validate required fields
    if (
      typeof parsed.repoId !== 'string' ||
      typeof parsed.repoPath !== 'string' ||
      !['head', 'persisted', 'default'].includes(parsed.source) ||
      !['idle', 'loading', 'stale', 'error'].includes(parsed.status)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist state for a repo to AsyncStorage.
 */
async function saveToStorage(state: ActiveBranchState): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(state.repoId), JSON.stringify(state));
  } catch (error) {
    console.warn('[activeBranchStore] Failed to persist state:', error);
  }
}

/**
 * Notify all subscribers of a repo's state change.
 */
function notifySubscribers(repoId: string, state: ActiveBranchState | null): void {
  const subs = subscriptions.get(repoId);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb(state);
    } catch {
      // best-effort
    }
  }
}

/**
 * Reconcile persisted state against actual local HEAD.
 * Returns the reconciled state.
 */
async function reconcileAgainstHead(state: ActiveBranchState): Promise<ActiveBranchState> {
  try {
    const headBranch = await GitFsService.getCurrentBranch({ repoPath: state.repoPath });

    if (headBranch === null) {
      // Repo not cloned or HEAD detached — treat as stale
      return { ...state, status: 'stale', source: 'persisted' };
    }

    if (headBranch !== state.activeBranch) {
      // HEAD differs from persisted value — mark stale
      return { ...state, activeBranch: headBranch, status: 'stale', source: 'head' };
    }

    // HEAD matches persisted — all good
    return { ...state, status: 'idle', source: 'head' };
  } catch (error) {
    return { ...state, status: 'error', source: 'persisted' };
  }
}

/**
 * Get the active branch state for a repository.
 *
 * Resolution order:
 * 1. Return cached state if in memory
 * 2. Hydrate from AsyncStorage
 * 3. Reconcile against local HEAD (GitFsService.getCurrentBranch)
 * 4. If HEAD differs, mark stale
 *
 * Returns null if no state exists for this repoId.
 */
export async function getActiveBranch(repoId: string): Promise<ActiveBranchState | null> {
  // Check memory cache first
  const cached = memoryCache.get(repoId);
  if (cached) {
    // Always reconcile against HEAD on read to detect staleness
    const reconciled = await reconcileAgainstHead(cached);
    if (reconciled.status !== cached.status || reconciled.activeBranch !== cached.activeBranch) {
      memoryCache.set(repoId, reconciled);
      notifySubscribers(repoId, reconciled);
    }
    return reconciled;
  }

  // Load from AsyncStorage
  const persisted = await loadFromStorage(repoId);
  if (!persisted) return null;

  // Reconcile against HEAD
  const reconciled = await reconcileAgainstHead(persisted);

  // Update memory cache
  memoryCache.set(repoId, reconciled);

  // If reconciled differs from persisted, persist the reconciled state
  if (reconciled.status !== persisted.status || reconciled.activeBranch !== persisted.activeBranch) {
    await saveToStorage(reconciled);
  }

  notifySubscribers(repoId, reconciled);
  return reconciled;
}

/**
 * Subscribe to active branch state changes for a repository.
 *
 * @param repoId - The repository ID to subscribe to
 * @param callback - Called whenever the state changes
 * @returns Unsubscribe function
 */
export function subscribe(repoId: string, callback: ActiveBranchSubscriber): () => void {
  let subs = subscriptions.get(repoId);
  if (!subs) {
    subs = new Set();
    subscriptions.set(repoId, subs);
  }
  subs.add(callback);

  // Return unsubscribe function
  return () => {
    const s = subscriptions.get(repoId);
    if (s) {
      s.delete(callback);
      if (s.size === 0) {
        subscriptions.delete(repoId);
      }
    }
  };
}

/**
 * Internal-only write operation.
 *
 * This function is callable ONLY by GitBranchCoordinator.
 * Do NOT export this publicly — use __setActiveBranch for internal
 * coordination only.
 *
 * @internal
 */
async function __setActiveBranch(
  repoId: string,
  repoPath: string,
  branch: string | null,
  source: ActiveBranchSource,
): Promise<ActiveBranchState> {
  const state: ActiveBranchState = {
    repoId,
    repoPath,
    activeBranch: branch,
    source,
    status: 'idle',
  };

  // Update memory cache
  memoryCache.set(repoId, state);

  // Persist to AsyncStorage
  await saveToStorage(state);

  // Notify subscribers
  notifySubscribers(repoId, state);

  return state;
}

/**
 * Initialize branch state for a newly added repository.
 * Called when a repo is added via repoStore.
 *
 * Resolution:
 * 1. Get local HEAD via GitFsService.getCurrentBranch
 * 2. If no local clone, use remote default from GitRepository.branch
 * 3. Persist and return the initial state
 */
export async function initializeForRepo(repo: GitRepository): Promise<ActiveBranchState> {
  const { id: repoId, path: repoPath, branch: remoteDefault } = repo;

  // Try local HEAD first
  const localHead = await GitFsService.getCurrentBranch({ repoPath });

  let activeBranch: string | null;
  let source: ActiveBranchSource;

  if (localHead !== null) {
    activeBranch = localHead;
    source = 'head';
  } else if (remoteDefault) {
    activeBranch = remoteDefault;
    source = 'default';
  } else {
    activeBranch = null;
    source = 'default';
  }

  return __setActiveBranch(repoId, repoPath, activeBranch, source);
}

/**
 * Reconcile all known repos against their local HEAD.
 * Called on app startup/hydration.
 *
 * @param repos - All known repositories from repoStore
 */
export async function reconcileAllRepos(repos: GitRepository[]): Promise<void> {
  await Promise.all(
    repos.map(async (repo) => {
      try {
        const existing = await getActiveBranch(repo.id);
        if (!existing) {
          // No state yet — initialize
          await initializeForRepo(repo);
        }
        // If exists, getActiveBranch already reconciles
      } catch {
        // best-effort per repo
      }
    }),
  );
}

/**
 * Clear branch state for a removed repository.
 */
export async function removeForRepo(repoId: string): Promise<void> {
  memoryCache.delete(repoId);
  subscriptions.delete(repoId);
  try {
    await AsyncStorage.removeItem(storageKey(repoId));
  } catch {
    // best-effort
  }
}

/**
 * Check if the current state is stale for a given repo.
 * A stale state indicates the local HEAD differs from persisted value.
 */
export async function isStale(repoId: string): Promise<boolean> {
  const state = await getActiveBranch(repoId);
  return state?.status === 'stale';
}

/**
 * Get all known active branch states.
 * Used for debugging and testing.
 */
export async function getAllActiveBranches(): Promise<ActiveBranchState[]> {
  return Array.from(memoryCache.values());
}

/** Test seam — clear all in-memory state */
export function __resetForTests(): void {
  memoryCache.clear();
  subscriptions.clear();
}

// NOTE: __setActiveBranch is intentionally NOT exported publicly.
// Write operations should only go through GitBranchCoordinator.
// If you need to set branch state internally, use initializeForRepo
// or create a coordinator-level function that calls __setActiveBranch.
