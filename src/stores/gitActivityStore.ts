import { create } from 'zustand';

interface GitActivityState {
  commitRevision: number;
  incrementRevision: () => void;
}

export const useGitActivityStore = create<GitActivityState>((set) => ({
  commitRevision: 0,
  incrementRevision: () => set((s) => ({ commitRevision: s.commitRevision + 1 })),
}));
