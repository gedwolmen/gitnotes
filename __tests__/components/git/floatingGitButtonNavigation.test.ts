import { getFloatingGitNavigationTarget } from '@/components/git/floatingGitButtonNavigation';
import type { RepoGitState } from '@/hooks/useAllReposStatus';

function repoState(repoId: string, updates: Partial<RepoGitState> = {}): RepoGitState {
  return {
    repoId,
    repoPath: `/repos/${repoId}`,
    uncommitted: 0,
    staged: 0,
    ahead: 0,
    behind: 0,
    currentBranch: 'main',
    conflicts: false,
    loading: false,
    sampledAt: 1,
    ...updates,
  };
}

describe('getFloatingGitNavigationTarget', () => {
  it('routes yellow staged state before blue ahead state', () => {
    const perRepo = new Map([
      ['ahead', repoState('ahead', { ahead: 1 })],
      ['staged', repoState('staged', { staged: 1 })],
    ]);

    expect(getFloatingGitNavigationTarget({ perRepo })).toEqual({
      repoId: 'staged',
      section: 'staging',
    });
  });

  it('routes green unstaged state before blue ahead state', () => {
    const perRepo = new Map([
      ['ahead', repoState('ahead', { ahead: 1 })],
      ['changed', repoState('changed', { uncommitted: 1 })],
    ]);

    expect(getFloatingGitNavigationTarget({ perRepo })).toEqual({
      repoId: 'changed',
      section: 'changes',
    });
  });

  it('routes blue state to commits when no local changes exist', () => {
    const perRepo = new Map([['ahead', repoState('ahead', { ahead: 1 })]]);

    expect(getFloatingGitNavigationTarget({ perRepo })).toEqual({
      repoId: 'ahead',
      section: 'commits',
    });
  });
});
