import {
  TypedRestClient,
  RestError,
  type AuthStrategy,
} from '../restClient';
import type {
  GiteaUser,
  GiteaRepo,
  GiteaIssue,
  GiteaPR,
  GiteaRelease,
  GiteaWorkflowRun,
  ItemState,
} from '../types';

export class GiteaProviderClient {
  private client: TypedRestClient;
  private baseUrl: string;

  constructor(auth: AuthStrategy, baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.client = new TypedRestClient(this.baseUrl, auth);
  }

  async getUser(): Promise<GiteaUser> {
    return this.client.request<GiteaUser>('/user', { method: 'GET' });
  }

  async listRepositories(): Promise<GiteaRepo[]> {
    return this.client.requestPaginated<GiteaRepo>(
      '/repos/search?sort=updated&limit=50',
    );
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string | null> {
    try {
      const meta = await this.client.request<{ default_branch?: string }>(
        `/repos/${owner}/${repo}`,
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
  ): Promise<GiteaIssue[]> {
    const giteaState = state === 'all' ? '' : `&state=${state}`;
    const issues = await this.client.requestPaginated<GiteaIssue>(
      `/repos/${owner}/${repo}/issues?type=issues&limit=50${giteaState}`,
    );
    return issues.filter((i) => i.pull_request == null);
  }

  async createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: number[];
  }): Promise<GiteaIssue> {
    return this.client.request<GiteaIssue>(
      `/repos/${input.owner}/${input.repo}/issues`,
      {
        method: 'POST',
        body: {
          title: input.title,
          body: input.body,
          labels: input.labels,
        },
      },
    );
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: ItemState = 'open',
  ): Promise<GiteaPR[]> {
    const giteaState = state === 'all' ? '' : `&state=${state}`;
    return this.client.requestPaginated<GiteaPR>(
      `/repos/${owner}/${repo}/pulls?limit=50${giteaState}`,
    );
  }

  async createPullRequest(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
  }): Promise<GiteaPR> {
    return this.client.request<GiteaPR>(
      `/repos/${input.owner}/${input.repo}/pulls`,
      {
        method: 'POST',
        body: {
          title: input.title,
          body: input.body,
          head: input.head,
          base: input.base,
        },
      },
    );
  }

  async listReleases(
    owner: string,
    repo: string,
    perPage: number = 30,
  ): Promise<GiteaRelease[]> {
    return this.client.requestPaginated<GiteaRelease>(
      `/repos/${owner}/${repo}/releases?limit=${perPage}`,
    );
  }

  async getRelease(
    owner: string,
    repo: string,
    releaseId: number,
  ): Promise<GiteaRelease> {
    return this.client.request<GiteaRelease>(
      `/repos/${owner}/${repo}/releases/${releaseId}`,
      { method: 'GET' },
    );
  }

  async listWorkflowRuns(
    owner: string,
    repo: string,
    perPage: number = 30,
  ): Promise<GiteaWorkflowRun[]> {
    const result = await this.client.request<{ workflow_runs: GiteaWorkflowRun[] }>(
      `/repos/${owner}/${repo}/actions/runs?limit=${perPage}`,
      { method: 'GET' },
    );
    return result.workflow_runs ?? [];
  }

  async triggerWorkflow(
    owner: string,
    repo: string,
    workflowRef: string,
    ref: string,
  ): Promise<void> {
    await this.client.request(
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`,
      {
        method: 'POST',
        body: { ref },
      },
    );
  }

  async commentOnIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number }> {
    return this.client.request<{ id: number }>(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: { body },
      },
    );
  }

  async commentOnPR(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
  ): Promise<{ id: number }> {
    return this.client.request<{ id: number }>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
      {
        method: 'POST',
        body: { body },
      },
    );
  }

  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GiteaIssue> {
    return this.client.request<GiteaIssue>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        body: { state: 'closed' },
      },
    );
  }

  async closePR(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GiteaPR> {
    return this.client.request<GiteaPR>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        method: 'PATCH',
        body: { state: 'closed' },
      },
    );
  }
}

export { RestError };
