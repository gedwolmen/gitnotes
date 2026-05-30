import { create } from 'zustand';

/**
 * Minimum duration (ms) the indicator must remain visible after the last
 * sync operation completes. Prevents flicker when multiple requests overlap
 * or when several short requests fire in quick succession.
 */
const HIDE_DELAY_MS = 150;

interface GitHubActivityState {
  inflight: number;
  label: string | null;
  /** Delayed hide timer handle */
  hideTimer: ReturnType<typeof setTimeout> | null;
}

interface GitHubActivityActions {
  begin: (label?: string) => void;
  end: () => void;
  reset: () => void;
}

export const useGitHubActivityStore = create<GitHubActivityState & GitHubActivityActions>()((set, get) => ({
  inflight: 0,
  label: null,
  hideTimer: null,

  begin: (label) => {
    // Cancel any pending hide timer — a new request just started.
    const timer = get().hideTimer;
    if (timer !== null) {
      clearTimeout(timer);
    }
    const next = get().inflight + 1;
    set({ inflight: next, label: label ?? get().label ?? 'Syncing with GitHub…', hideTimer: null });
  },

  end: () => {
    const next = Math.max(0, get().inflight - 1);
    if (next > 0) {
      // Still have in-flight requests; just decrement.
      set({ inflight: next });
 } else {
      // All requests done — schedule delayed hide so brief gaps between
      // requests don't cause flicker.
      const timer = setTimeout(() => {
        set({ inflight: 0, label: null, hideTimer: null });
      }, HIDE_DELAY_MS);
      set({ inflight: 0, label: null, hideTimer: timer });
    }
  },

  reset: () => {
    const timer = get().hideTimer;
    if (timer !== null) clearTimeout(timer);
    set({ inflight: 0, label: null, hideTimer: null });
  },
}));

export const githubActivity = {
  begin: (label?: string) => useGitHubActivityStore.getState().begin(label),
  end: () => useGitHubActivityStore.getState().end(),
  reset: () => useGitHubActivityStore.getState().reset(),
};
