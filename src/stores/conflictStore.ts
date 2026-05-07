import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConflictSet } from '../services/conflict/types';

const STORAGE_KEY = 'gitnotes_conflicts';

interface ConflictState {
  conflicts: ConflictSet[];
  isLoading: boolean;
}

interface ConflictActions {
  loadConflicts: () => Promise<void>;
  addConflict: (conflict: ConflictSet) => Promise<void>;
  updateConflict: (repoPath: string, branch: string, updater: (c: ConflictSet) => ConflictSet) => Promise<void>;
  removeConflict: (repoPath: string, branch: string) => Promise<void>;
  getConflict: (repoPath: string, branch: string) => ConflictSet | undefined;
  totalUnresolvedFiles: () => number;
}

async function persist(conflicts: ConflictSet[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(conflicts));
  } catch {
    // storage full or unavailable
  }
}

export const useConflictStore = create<ConflictState & ConflictActions>()((set, get) => ({
  conflicts: [],
  isLoading: true,

  loadConflicts: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const conflicts: ConflictSet[] = raw ? JSON.parse(raw) : [];
      set({ conflicts, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addConflict: async (conflict) => {
    const filtered = get().conflicts.filter(
      (c) => !(c.repoPath === conflict.repoPath && c.branch === conflict.branch),
    );
    const next = [...filtered, conflict];
    set({ conflicts: next });
    await persist(next);
  },

  updateConflict: async (repoPath, branch, updater) => {
    const next = get().conflicts.map((c) =>
      c.repoPath === repoPath && c.branch === branch ? updater(c) : c,
    );
    set({ conflicts: next });
    await persist(next);
  },

  removeConflict: async (repoPath, branch) => {
    const next = get().conflicts.filter(
      (c) => !(c.repoPath === repoPath && c.branch === branch),
    );
    set({ conflicts: next });
    await persist(next);
  },

  getConflict: (repoPath, branch) =>
    get().conflicts.find((c) => c.repoPath === repoPath && c.branch === branch),

  totalUnresolvedFiles: () =>
    get().conflicts.reduce(
      (sum, c) => sum + c.files.filter((f) => !f.autoResolved).length,
      0,
    ),
}));
