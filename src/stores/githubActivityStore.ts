import { create } from 'zustand';

/**
 * Minimum time (ms) between visibility state changes. Prevents animation
 * restarts when requests cycle rapidly during batch operations.
 */
const MIN_VISIBILITY_CHANGE_MS = 300;

/**
 * Once visible, the indicator stays visible for at least this long after
 * the last begin() call, even if requests complete sooner.
 */
const MINIMUM_DISPLAY_MS = 300;

interface GitHubActivityState {
  inflight: number;
  label: string | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  visible: boolean;
  pendingVisibilityChange: boolean | null;
  visibilityChangeTimer: ReturnType<typeof setTimeout> | null;
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
  visible: false,
  pendingVisibilityChange: null,
  visibilityChangeTimer: null,

  begin: (label) => {
    const timer = get().hideTimer;
    if (timer !== null) clearTimeout(timer);
    const newInflight = get().inflight + 1;
    const newLabel = label ?? get().label ?? 'Syncing with GitHub…';
    if (!get().visible) {
      const existing = get().visibilityChangeTimer;
      if (existing !== null) clearTimeout(existing);
      const vt = setTimeout(() => {
        set({ visible: true, pendingVisibilityChange: null, visibilityChangeTimer: null });
      }, MIN_VISIBILITY_CHANGE_MS);
      set({ inflight: newInflight, label: newLabel, hideTimer: null, pendingVisibilityChange: true, visibilityChangeTimer: vt });
    } else {
      set({ inflight: newInflight, label: newLabel, hideTimer: null });
    }
  },

  end: () => {
    const next = Math.max(0, get().inflight - 1);
    if (next > 0) {
      set({ inflight: next });
    } else {
      const vt = get().visibilityChangeTimer;
      if (vt !== null) clearTimeout(vt);
      const timer = setTimeout(() => {
        set({ inflight: 0, label: null, hideTimer: null, visible: false, pendingVisibilityChange: false });
      }, MINIMUM_DISPLAY_MS);
      set({ inflight: 0, label: null, hideTimer: timer, visibilityChangeTimer: null });
    }
  },

  reset: () => {
    const timers = [get().hideTimer, get().visibilityChangeTimer];
    timers.forEach((t) => { if (t !== null) clearTimeout(t); });
    set({ inflight: 0, label: null, hideTimer: null, visible: false, pendingVisibilityChange: null, visibilityChangeTimer: null });
  },
}));

export const githubActivity = {
  begin: (label?: string) => useGitHubActivityStore.getState().begin(label),
  end: () => useGitHubActivityStore.getState().end(),
  reset: () => useGitHubActivityStore.getState().reset(),
};
