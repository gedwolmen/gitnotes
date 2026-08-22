import { create } from 'zustand';
import { StagingService, subscribeStagedChanged } from '../services/git/StagingService';
import type { StagedItem } from '../services/git/StagingService';
import { StorageService } from '../services/StorageService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';

/**
 * Push state is in-memory by design; on app restart it resets and clone
 * re-push is idempotent.
 */

export interface StageGroup {
  repoPath: string;
  branch: string;
  key: string;
  items: StagedItem[];
}

export interface StageState {
  staged: StagedItem[];
  isPushing: Record<string, boolean>;
  globalPushing: boolean;
  pushQueue: string[];
  pendingCount: number;
  pushProgress: number | null;
}

interface StageActions {
  loadStaged: () => Promise<void>;
  keyFor: (repoPath: string, branch: string) => string;
  requestPush: (repoPath?: string, branch?: string) => string | null;
  setPushing: (key: string, bool: boolean) => void;
  setGlobalPushing: (bool: boolean) => void;
  setPushProgress: (fraction: number | null) => void;
  pushAll: () => void;
  dequeueNext: () => string | null;
  shiftQueue: () => void;
  registerQueueSubscription: () => void;
  unregisterQueueSubscription: () => void;
  forceUnlockPushState: () => void;
}

let queueUnsubscribe: (() => void) | null = null;
let emitterUnsubscribe: (() => void) | null = null;

/** Group staged items into one bucket per (repoPath, branch), preserving order. */
export function groupStaged(items: StagedItem[]): StageGroup[] {
  const groups = new Map<string, StageGroup>();
  for (const item of items) {
    const key = `${item.repoPath}::${item.branch}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        repoPath: item.repoPath,
        branch: item.branch,
        key,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

function uniqueStageKeys(
  items: StagedItem[],
  keyFor: (repoPath: string, branch: string) => string,
): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    seen.add(keyFor(item.repoPath, item.branch));
  }
  return [...seen];
}

export const useStageStore = create<StageState & StageActions>()((set, get) => ({
  staged: [],
  isPushing: {},
  globalPushing: false,
  pushQueue: [],
  pendingCount: 0,
  pushProgress: null,

  loadStaged: async () => {
    try {
      const all = await StagingService.listStaged();
      const savedRepos = await StorageService.getSavedRepositories();
      const savedPaths = new Set(savedRepos.map((repo) => repo.path));
      const filtered = all.filter((item) => {
        if (savedPaths.has(item.repoPath)) return true;
        console.warn(`[stageStore] Dropping staged item for removed repo: ${item.repoPath}`);
        return false;
      });
      set({ staged: filtered, pendingCount: filtered.length });
    } catch (error) {
      console.warn('[stageStore] loadStaged failed:', error);
    }
  },

  keyFor: (repoPath, branch) => `${repoPath}::${branch}`,

  requestPush: (repoPath, branch) => {
    if (repoPath !== undefined && branch !== undefined) {
      const key = get().keyFor(repoPath, branch);
      if (get().isPushing[key] || get().pushQueue.includes(key)) {
        return null;
      }
      set({ pushQueue: [...get().pushQueue, key] });
      return key;
    }

    // Push all: mark global and enqueue every staged (repo, branch) once.
    set({ globalPushing: true });
    const pushQueue = [...get().pushQueue];
    for (const key of uniqueStageKeys(get().staged, get().keyFor)) {
      if (!get().isPushing[key] && !pushQueue.includes(key)) {
        pushQueue.push(key);
      }
    }
    set({ pushQueue });
    return null;
  },

  setPushing: (key, bool) =>
    set((state) => ({ isPushing: { ...state.isPushing, [key]: bool } })),

  setGlobalPushing: (bool) => set({ globalPushing: bool }),

  setPushProgress: (fraction) => set({ pushProgress: fraction }),

  pushAll: () => {
    set({ globalPushing: true });
    const pushQueue = [...get().pushQueue];
    for (const key of uniqueStageKeys(get().staged, get().keyFor)) {
      if (!get().isPushing[key] && !pushQueue.includes(key)) {
        pushQueue.push(key);
      }
    }
    set({ pushQueue });
  },

  dequeueNext: () => get().pushQueue[0] ?? null,

  shiftQueue: () => set((state) => ({ pushQueue: state.pushQueue.slice(1) })),

  registerQueueSubscription: () => {
    if (queueUnsubscribe || emitterUnsubscribe) return;
    queueUnsubscribe = NoteSyncQueueService.subscribe(() => {
      void get().loadStaged();
    });
    emitterUnsubscribe = subscribeStagedChanged(() => {
      void get().loadStaged();
    });
  },

  unregisterQueueSubscription: () => {
    queueUnsubscribe?.();
    emitterUnsubscribe?.();
    queueUnsubscribe = null;
    emitterUnsubscribe = null;
  },

  forceUnlockPushState: () => {
    const current = useStageStore.getState();
    const nextIsPushing = { ...current.isPushing };
    let changed = false;
    for (const key of Object.keys(nextIsPushing)) {
      if (nextIsPushing[key]) {
        nextIsPushing[key] = false;
        changed = true;
      }
    }
    set({
      globalPushing: false,
      pushProgress: null,
      ...(changed ? { isPushing: nextIsPushing } : null),
    });
  },
}));
