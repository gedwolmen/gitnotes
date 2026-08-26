import { create } from 'zustand';

interface ConflictState {
  conflicts: unknown[];
  isLoading: boolean;
  loadError: boolean;
}

interface ConflictActions {
  loadConflicts: () => Promise<void>;
  addConflict: (conflict: unknown) => void;
  updateConflict: (repoPath: string, branch: string, updater: (c: unknown) => unknown) => Promise<void>;
  removeConflict: (repoPath: string, branch: string) => Promise<void>;
  getConflict: (repoPath: string, branch: string) => unknown | undefined;
  totalUnresolvedFiles: () => number;
}

export const useConflictStore = create<ConflictState & ConflictActions>()(() => ({
  conflicts: [],
  isLoading: false,
  loadError: false,

  loadConflicts: async () => {},
  addConflict: () => {},
  updateConflict: async () => {},
  removeConflict: async () => {},
  getConflict: () => undefined,
  totalUnresolvedFiles: () => 0,
}));
