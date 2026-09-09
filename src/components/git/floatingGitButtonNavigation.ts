import type { ExploreSection } from '@/components/explore/exploreShared';
import type { AggregatedGitState } from '@/hooks/useAllReposStatus';

export interface FloatingGitNavigationTarget {
  repoId: string;
  section: Extract<ExploreSection, 'changes' | 'staging' | 'commits'>;
}

export function getFloatingGitNavigationTarget(
  state: Pick<AggregatedGitState, 'perRepo'>,
): FloatingGitNavigationTarget | null {
  const stagedRepoId = Array.from(state.perRepo.values()).find((entry) => entry.staged > 0)?.repoId;
  if (stagedRepoId) return { repoId: stagedRepoId, section: 'staging' };

  const changedRepoId = Array.from(state.perRepo.values()).find((entry) => entry.uncommitted > 0)?.repoId;
  if (changedRepoId) return { repoId: changedRepoId, section: 'changes' };

  const aheadRepoId = Array.from(state.perRepo.values()).find((entry) => entry.ahead > 0)?.repoId;
  if (aheadRepoId) return { repoId: aheadRepoId, section: 'commits' };

  return null;
}
