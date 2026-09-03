import { create } from 'zustand';
import type { ExploreSection } from '@/components/explore/exploreShared';

/**
 * Pending action the floating git button (app-level) wants Explore to apply
 * on its next focus: jump to a specific repo and section, or just open the
 * latest-changed repo's tab.
 */
export interface GitButtonPendingAction {
  repoId: string;
  section: ExploreSection;
}

interface GitButtonActionState {
  pending: GitButtonPendingAction | null;
  setPending: (next: GitButtonPendingAction | null) => void;
  clear: () => void;
}

export const useGitButtonActionStore = create<GitButtonActionState>()((set) => ({
  pending: null,
  setPending: (next) => set({ pending: next }),
  clear: () => set({ pending: null }),
}));