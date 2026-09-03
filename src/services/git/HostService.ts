import { getGitHostService } from './gitHostFactory';

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

export type HostServiceResult<T> = { data: T } | { kind: 'permission' | 'error'; message: string };

interface RepositoryRef {
  provider?: string;
  full_name?: string;
  remoteUrl?: string;
}

function repositoryPath(repo: RepositoryRef): { owner: string; name: string } | null {
  const fullName = repo.full_name?.trim();
  if (fullName) {
    const [owner, name] = fullName.split('/');
    if (owner && name && !name.includes('/')) return { owner, name };
  }

  const remoteUrl = repo.remoteUrl?.trim().replace(/\.git$/, '');
  if (!remoteUrl) return null;
  const match = remoteUrl.match(/(?:https?:\/\/[^/]+|git@[^:]+:)([^/]+)\/([^/]+)$/);
  return match ? { owner: match[1], name: match[2] } : null;
}

function errorResult(error: unknown): { kind: 'permission' | 'error'; message: string } {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error.status as number | undefined)
    : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: status === 401 || status === 403 ? 'permission' : 'error',
    message,
  };
}

export const HostService = {
  list: async () => [],
  getPullRequests: async (): Promise<PullRequest[]> => [],
  getIssues: async (): Promise<GitHostIssue[]> => [],
  listPullRequests: async (
    repo: RepositoryRef,
    _accountId?: string,
    stateFilter: PullRequestState = 'open',
  ): Promise<HostServiceResult<PullRequest[]>> => {
    const path = repositoryPath(repo);
    if (!path) return { kind: 'error', message: 'Repository owner and name are unavailable.' };

    try {
      const data = await getGitHostService(repo.provider).listPullRequests(
        path.owner,
        path.name,
        stateFilter === 'open' ? 'open' : 'closed',
      );
      return { data: data as unknown as PullRequest[] };
    } catch (error) {
      return errorResult(error);
    }
  },
  listIssues: async (
    repo: RepositoryRef,
    _accountId?: string,
    stateFilter: IssueState = 'open',
  ): Promise<HostServiceResult<GitHostIssue[]>> => {
    const path = repositoryPath(repo);
    if (!path) return { kind: 'error', message: 'Repository owner and name are unavailable.' };

    try {
      const data = await getGitHostService(repo.provider).listIssues(path.owner, path.name, stateFilter);
      return { data: data as unknown as GitHostIssue[] };
    } catch (error) {
      return errorResult(error);
    }
  },
  openUrl: (_url: string) => {},
};
