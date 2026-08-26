import { create } from 'zustand';

type Listener = () => void;

interface GitActivityState {
  commitRevision: number;
  incrementRevision: () => void;
  subscribe: (listener: Listener) => () => void;
}

// Module-level listeners set (not in zustand state — listeners are not serializable state)
const listeners = new Set<Listener>();

export const useGitActivityStore = create<GitActivityState>((set) => ({
  commitRevision: 0,
  incrementRevision: () => {
    set((s) => ({ commitRevision: s.commitRevision + 1 }));
    listeners.forEach((l) => l());
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
}));
