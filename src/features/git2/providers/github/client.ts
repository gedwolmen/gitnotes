import {
  TypedRestClient,
  RestError,
  type AuthStrategy,
} from '../restClient';
import type {
  GitHubUser,
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestDiff,
  GitHubReviewInput,
  GitHubReview,
  GitHubRelease,
  GitHubWorkflowRun,
  ItemState,
} from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubProviderClient {
  private client: TypedRestClient;

  constructor(auth: AuthStrategy) {
    this.client = new TypedRestClient(GITHUB_API_BASE, auth);
  }

  async getUser(): Promise<GitHubUser> {
    return this.client.request<GitHubUser>('/user', { method: 'GET' });
  }

  async listRepositories(): Promise<GitHubRepository[]> {
    return this.client.requestPaginated<GitHubRepository>(
      '/user/repos?sort=updated&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member',
    );
  }

  async listIssues(
    owner: string,
    repo: string,
    state: ItemState = 'open',
  ): Promise<GitHubIssue[]> {
    return this.client.requestPaginated<GitHubIssue>(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=50`,
    );
  }

  async createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    return this.client.request<GitHubIssue>(
      `/repos/${input.owner}/${input.repo}/issues`,
      {
        method: 'POST',
        body: {
          title: input.title,
          body: input.body,
          labels: input.labels,
          assignees: input.assignees,
        },
      },
    );
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: ItemState = 'open',
  ): Promise<GitHubPullRequest[]> {
    return this.client.requestPaginated<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`,
    );
  }

  async createPullRequest(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
  }): Promise<GitHubPullRequest> {
    return this.client.request<GitHubPullRequest>(
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

  async getPullRequestDiff(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GitHubPullRequestDiff> {
    const files = await this.client.request<
      Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }>
    >(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, { method: 'GET' });

    return {
      files: Array.isArray(files)
        ? files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch,
          }))
        : [],
    };
  }

  async reviewPullRequest(input: GitHubReviewInput): Promise<GitHubReview> {
    return this.client.request<GitHubReview>(
      `/repos/${input.owner}/${input.repo}/pulls/${input.pull_number}/reviews`,
      {
        method: 'POST',
        body: {
          body: input.body,
          event: input.event,
        },
      },
    );
  }

  async listReleases(
    owner: string,
    repo: string,
    perPage: number = 30,
  ): Promise<GitHubRelease[]> {
    return this.client.requestPaginated<GitHubRelease>(
      `/repos/${owner}/${repo}/releases?per_page=${perPage}`,
    );
  }

  async getRelease(
    owner: string,
    repo: string,
    releaseId: number,
  ): Promise<GitHubRelease> {
    return this.client.request<GitHubRelease>(
      `/repos/${owner}/${repo}/releases/${releaseId}`,
      { method: 'GET' },
    );
  }

  async listWorkflowRuns(
    owner: string,
    repo: string,
    perPage: number = 30,
  ): Promise<GitHubWorkflowRun[]> {
    const result = await this.client.request<{
      workflow_runs: GitHubWorkflowRun[];
    }>(
      `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`,
      { method: 'GET' },
    );
    return result.workflow_runs ?? [];
  }

  async triggerWorkflow(
    owner: string,
    repo: string,
    workflowId: number,
    ref: string,
    inputs?: Record<string, string>,
  ): Promise<void> {
    await this.client.request(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        body: { ref, inputs },
      },
    );
  }

  async commentOnIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<{ id: number; html_url: string }> {
    return this.client.request<{ id: number; html_url: string }>(
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
  ): Promise<{ id: number; html_url: string }> {
    return this.client.request<{ id: number; html_url: string }>(
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
  ): Promise<GitHubIssue> {
    return this.client.request<GitHubIssue>(
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
  ): Promise<GitHubPullRequest> {
    return this.client.request<GitHubPullRequest>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        method: 'PATCH',
        body: { state: 'closed' },
      },
    );
  }
}

export { RestError };
