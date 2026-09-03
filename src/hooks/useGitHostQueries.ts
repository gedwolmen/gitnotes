import { useQuery } from '@tanstack/react-query';

import { getGitHostService } from '../services/git/gitHostFactory';
import type { GitHostProvider } from '../services/git/GitHost';

type GitHostIssue = any;
type GitHostItemState = any;
type GitHostPullRequest = any;

const STALE_TIMES = {
  prs: 60 * 1000,
  issues: 60 * 1000,
} as const;

export function useGitHostPullRequests(
  provider: GitHostProvider,
  owner: string,
  repo: string,
  state: GitHostItemState = 'open',
) {
  return useQuery({
    queryKey: ['githost', provider, 'prs', owner, repo, state],
    queryFn: () => (getGitHostService(provider) as any).listPullRequests(owner, repo, state),
    staleTime: STALE_TIMES.prs,
    enabled: !!owner && !!repo,
  });
}

export function useGitHostIssues(
  provider: GitHostProvider,
  owner: string,
  repo: string,
  state: GitHostItemState = 'open',
) {
  return useQuery({
    queryKey: ['githost', provider, 'issues', owner, repo, state],
    queryFn: () => (getGitHostService(provider) as any).listIssues(owner, repo, state),
    staleTime: STALE_TIMES.issues,
    enabled: !!owner && !!repo,
  });
}

export type { GitHostIssue, GitHostPullRequest, GitHostItemState, GitHostProvider };
