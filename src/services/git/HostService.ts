export type PullRequestState = 'open' | 'closed' | 'merged';
export type IssueState = 'open' | 'closed';

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: PullRequestState;
  author: string;
  createdAt: string;
  updatedAt: string;
  webUrl: string;
  draft?: boolean;
}

export interface GitHostIssue {
  id: string;
  number: number;
  title: string;
  state: IssueState;
  author: string;
  createdAt: string;
  updatedAt: string;
  webUrl: string;
  labels: string[];
}

type HostServiceResult<T> = { data: T } | { kind: 'permission' | 'error'; message: string };

export const HostService = {
  list: async () => [],
  getPullRequests: async (): Promise<PullRequest[]> => [],
  getIssues: async (): Promise<GitHostIssue[]> => [],
  listPullRequests: async (
    _repo: { accountId?: string },
    _accountId?: string,
    _stateFilter?: PullRequestState
  ): Promise<{ data: PullRequest[] }> => ({ data: [] }),
  listIssues: async (
    _repo: { accountId?: string },
    _accountId?: string,
    _stateFilter?: IssueState
  ): Promise<{ data: GitHostIssue[] }> => ({ data: [] }),
  openUrl: (_url: string) => {},
};
