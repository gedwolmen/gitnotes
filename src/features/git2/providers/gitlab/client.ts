import {
  TypedRestClient,
  RestError,
  type AuthStrategy,
} from '../restClient';
import type {
  GitLabUser,
  GitLabProject,
  GitLabIssue,
  GitLabMR,
  GitLabRelease,
  GitLabPipeline,
  ItemState,
} from '../types';

const GITLAB_API_DEFAULT = 'https://gitlab.com/api/v4';

export class GitLabProviderClient {
  private client: TypedRestClient;
  private baseUrl: string;

  constructor(auth: AuthStrategy, baseUrl: string = GITLAB_API_DEFAULT) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.client = new TypedRestClient(this.baseUrl, auth);
  }

  private encodedProjectId(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  async getUser(): Promise<GitLabUser> {
    return this.client.request<GitLabUser>('/user', { method: 'GET' });
  }

  async listProjects(): Promise<GitLabProject[]> {
    return this.client.requestPaginated<GitLabProject>(
      '/projects?membership=true&per_page=100&order_by=last_activity_at',
    );
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string | null> {
    try {
      const meta = await this.client.request<{ default_branch?: string }>(
        `/projects/${this.encodedProjectId(owner, repo)}`,
        { method: 'GET' },
      );
      return meta?.default_branch ?? null;
    } catch {
      return null;
    }
  }

  async listIssues(
    owner: string,
    repo: string,
    state: ItemState = 'open',
  ): Promise<GitLabIssue[]> {
    const gitlabState = state === 'open' ? 'opened' : state === 'closed' ? 'closed' : '';
    const stateParam = gitlabState ? `&state=${gitlabState}` : '';
    return this.client.requestPaginated<GitLabIssue>(
      `/projects/${this.encodedProjectId(owner, repo)}/issues?per_page=50${stateParam}`,
    );
  }

  async createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    description?: string;
    labels?: string[];
  }): Promise<GitLabIssue> {
    return this.client.request<GitLabIssue>(
      `/projects/${this.encodedProjectId(input.owner, input.repo)}/issues`,
      {
        method: 'POST',
        body: {
          title: input.title,
          description: input.description,
          labels: input.labels?.join(','),
        },
      },
    );
  }

  async listMergeRequests(
    owner: string,
    repo: string,
    state: ItemState = 'open',
  ): Promise<GitLabMR[]> {
    const gitlabState = state === 'open' ? 'opened' : state === 'closed' ? 'closed' : '';
    const stateParam = gitlabState ? `&state=${gitlabState}` : '';
    return this.client.requestPaginated<GitLabMR>(
      `/projects/${this.encodedProjectId(owner, repo)}/merge_requests?per_page=50${stateParam}`,
    );
  }

  async createMergeRequest(input: {
    owner: string;
    repo: string;
    title: string;
    description?: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<GitLabMR> {
    return this.client.request<GitLabMR>(
      `/projects/${this.encodedProjectId(input.owner, input.repo)}/merge_requests`,
      {
        method: 'POST',
        body: {
          title: input.title,
          description: input.description,
          source_branch: input.sourceBranch,
          target_branch: input.targetBranch,
        },
      },
    );
  }

  async listReleases(
    owner: string,
    repo: string,
    perPage: number = 20,
  ): Promise<GitLabRelease[]> {
    return this.client.requestPaginated<GitLabRelease>(
      `/projects/${this.encodedProjectId(owner, repo)}/releases?per_page=${perPage}`,
    );
  }

  async getRelease(
    owner: string,
    repo: string,
    tagName: string,
  ): Promise<GitLabRelease> {
    return this.client.request<GitLabRelease>(
      `/projects/${this.encodedProjectId(owner, repo)}/releases/${encodeURIComponent(tagName)}`,
      { method: 'GET' },
    );
  }

  async listPipelines(
    owner: string,
    repo: string,
    perPage: number = 20,
  ): Promise<GitLabPipeline[]> {
    return this.client.requestPaginated<GitLabPipeline>(
      `/projects/${this.encodedProjectId(owner, repo)}/pipelines?per_page=${perPage}`,
    );
  }

  async triggerPipeline(
    owner: string,
    repo: string,
    ref: string,
    variables?: Record<string, string>,
  ): Promise<{ id: number; web_url: string }> {
    return this.client.request<{ id: number; web_url: string }>(
      `/projects/${this.encodedProjectId(owner, repo)}/pipeline`,
      {
        method: 'POST',
        body: { ref, variables: variables ? Object.entries(variables).map(([key, value]) => ({ key, value })) : [] },
      },
    );
  }

  async commentOnIssue(
    owner: string,
    repo: string,
    issueIid: number,
    body: string,
  ): Promise<{ id: number; noteable_id: number }> {
    return this.client.request<{ id: number; noteable_id: number }>(
      `/projects/${this.encodedProjectId(owner, repo)}/issues/${issueIid}/notes`,
      {
        method: 'POST',
        body: { body },
      },
    );
  }

  async commentOnMR(
    owner: string,
    repo: string,
    mrIid: number,
    body: string,
  ): Promise<{ id: number; noteable_id: number }> {
    return this.client.request<{ id: number; noteable_id: number }>(
      `/projects/${this.encodedProjectId(owner, repo)}/merge_requests/${mrIid}/notes`,
      {
        method: 'POST',
        body: { body },
      },
    );
  }

  async closeIssue(
    owner: string,
    repo: string,
    issueIid: number,
  ): Promise<GitLabIssue> {
    return this.client.request<GitLabIssue>(
      `/projects/${this.encodedProjectId(owner, repo)}/issues/${issueIid}`,
      {
        method: 'PUT',
        body: { state_event: 'close' },
      },
    );
  }

  async closeMR(
    owner: string,
    repo: string,
    mrIid: number,
  ): Promise<GitLabMR> {
    return this.client.request<GitLabMR>(
      `/projects/${this.encodedProjectId(owner, repo)}/merge_requests/${mrIid}`,
      {
        method: 'PUT',
        body: { state_event: 'close' },
      },
    );
  }
}

export { RestError };
