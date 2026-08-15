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

export interface SyncProgress {
  phase: string;
  loaded: number;
  total: number | null;
}

interface GitHubActivityState {
  inflight: number;
  label: string | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  visible: boolean;
  pendingVisibilityChange: boolean | null;
  visibilityChangeTimer: ReturnType<typeof setTimeout> | null;
  progress: SyncProgress | null;
}

interface GitHubActivityActions {
  begin: (label?: string) => void;
  end: () => void;
  reset: () => void;
  setProgress: (progress: SyncProgress | null) => void;
}

export const useGitHubActivityStore = create<GitHubActivityState & GitHubActivityActions>()((set, get) => ({
  inflight: 0,
  label: null,
  hideTimer: null,
  visible: false,
  pendingVisibilityChange: null,
  visibilityChangeTimer: null,
  progress: null,

  begin: (label) => {
    const timer = get().hideTimer;
    if (timer !== null) clearTimeout(timer);
    const newInflight = get().inflight + 1;
    const newLabel = label ?? get().label ?? 'Syncing with GitHub';
    if (!get().visible) {
      const existing = get().visibilityChangeTimer;
      if (existing !== null) clearTimeout(existing);
      const vt = setTimeout(() => {
        set({ visible: true, pendingVisibilityChange: null, visibilityChangeTimer: null });
      }, MIN_VISIBILITY_CHANGE_MS);
      set({ inflight: newInflight, label: newLabel, hideTimer: null, pendingVisibilityChange: true, visibilityChangeTimer: vt, progress: null });
    } else {
      set({ inflight: newInflight, label: newLabel, hideTimer: null, progress: null });
    }
  },

  end: () => {
    const next = Math.max(0, get().inflight - 1);
    if (next > 0) {
      set({ inflight: next, progress: null });
    } else {
      const vt = get().visibilityChangeTimer;
      if (vt !== null) clearTimeout(vt);
      const timer = setTimeout(() => {
        set({ inflight: 0, label: null, hideTimer: null, visible: false, pendingVisibilityChange: false, progress: null });
      }, MINIMUM_DISPLAY_MS);
      set({ inflight: 0, label: null, hideTimer: timer, visibilityChangeTimer: null, progress: null });
    }
  },

  reset: () => {
    const timers = [get().hideTimer, get().visibilityChangeTimer];
    timers.forEach((t) => { if (t !== null) clearTimeout(t); });
    set({ inflight: 0, label: null, hideTimer: null, visible: false, pendingVisibilityChange: null, visibilityChangeTimer: null, progress: null });
  },

  setProgress: (progress) => {
    set({ progress });
  },
}));

export const githubActivity = {
  begin: (label?: string) => useGitHubActivityStore.getState().begin(label),
  end: () => useGitHubActivityStore.getState().end(),
  reset: () => useGitHubActivityStore.getState().reset(),
  setProgress: (progress: SyncProgress | null) => useGitHubActivityStore.getState().setProgress(progress),
};
