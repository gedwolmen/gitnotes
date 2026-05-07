import { create } from 'zustand';

interface GitHubActivityState {
  inflight: number;
  label: string | null;
}

interface GitHubActivityActions {
  begin: (label?: string) => void;
  end: () => void;
  reset: () => void;
}

export const useGitHubActivityStore = create<GitHubActivityState & GitHubActivityActions>()((set, get) => ({
  inflight: 0,
  label: null,

  begin: (label) => {
    const next = get().inflight + 1;
    set({ inflight: next, label: label ?? get().label ?? 'Syncing with GitHub…' });
  },

  end: () => {
    const next = Math.max(0, get().inflight - 1);
    set({ inflight: next, label: next === 0 ? null : get().label });
  },

  reset: () => set({ inflight: 0, label: null }),
}));

export const githubActivity = {
  begin: (label?: string) => useGitHubActivityStore.getState().begin(label),
  end: () => useGitHubActivityStore.getState().end(),
  reset: () => useGitHubActivityStore.getState().reset(),
};
