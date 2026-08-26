/**
 * GitHub REST API client — typed wrapper over the GitHub API v3.
 *
 * Handles authentication via OAuth tokens stored in SecureStore,
 * pagination, and error classification. This client is for
 * collaboration features (issues, PRs, comments) — NOT for file
 * transport. File sync uses Git2Client (git2-rs).
 */

import { TypedRestClient } from '../restClient';
import type { ProviderClient, ProviderUser, ProviderIssue, ProviderComment, ProviderPullRequest, ProviderRelease, ProviderWorkflowRun, ItemState, CreateIssueInput, CreateCommentInput, CreatePullRequestInput, ReviewInput, GetWorkflowRunsInput, GitHubUser, GitHubIssue, GitHubPullRequest, GitHubReview, GitHubComment, GitHubRelease, GitHubWorkflowRun } from '../types';

const GITHUB_API = 'https://api.github.com';

export class GitHubClient implements ProviderClient {
  readonly kind = 'github' as const;
  private rest: TypedRestClient | null = null;
  private user: GitHubUser | null = null;
  private token: string | null = null;

  async initialize(token: string): Promise<void> {
    this.token = token;
    this.rest = new TypedRestClient(GITHUB_API, { type: 'bearer', token });
    this.user = null;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.rest = null;
    this.user = null;
  }

  isAuthenticated(): boolean {
    return this.rest !== null && this.token !== null;
  }

  getToken(): string | null {
    return this.token;
  }

  // ── Canonical interface ───────────────────────────────────────────────────

  async getAuthenticatedUser(): Promise<ProviderUser | null> {
    if (this.user) {
      return toCanonicalUser(this.user);
    }
    try {
      const ghUser = await this.rest!.request<GitHubUser>('/user', { method: 'GET' });
      this.user = ghUser;
      return toCanonicalUser(ghUser);
    } catch {
      return null;
    }
  }

  async listIssues(owner: string, repo: string, state: ItemState = 'open'): Promise<ProviderIssue[]> {
    try {
      const items = await this.rest!.request<GitHubIssue[]>(
        `/repos/${owner}/${repo}/issues?state=${state}&per_page=50`,
        { method: 'GET' },
      );
      return items.map(toCanonicalIssue);
    } catch {
      return [];
    }
  }

  async createIssue(input: CreateIssueInput): Promise<ProviderIssue | null> {
    try {
      const item = await this.rest!.request<GitHubIssue>(
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
      return toCanonicalIssue(item);
    } catch {
      return null;
    }
  }

  async listComments(owner: string, repo: string, issueNumber: number): Promise<ProviderComment[]> {
    try {
      const items = await this.rest!.request<GitHubComment[]>(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
        { method: 'GET' },
      );
      return items.map(toCanonicalComment);
    } catch {
      return [];
    }
  }

  async createComment(input: CreateCommentInput): Promise<ProviderComment | null> {
    try {
      const item = await this.rest!.request<GitHubComment>(
        `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`,
        { method: 'POST', body: { body: input.body } },
      );
      return toCanonicalComment(item);
    } catch {
      return null;
    }
  }

  async listPullRequests(owner: string, repo: string, state: ItemState = 'open'): Promise<ProviderPullRequest[]> {
    try {
      const items = await this.rest!.request<GitHubPullRequest[]>(
        `/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`,
        { method: 'GET' },
      );
      return items.map(toCanonicalPR);
    } catch {
      return [];
    }
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest | null> {
    try {
      const item = await this.rest!.request<GitHubPullRequest>(
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
      return toCanonicalPR(item);
    } catch {
      return null;
    }
  }

  async reviewPullRequest(input: ReviewInput): Promise<ProviderComment | null> {
    try {
      const item = await this.rest!.request<GitHubReview>(
        `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/reviews`,
        {
          method: 'POST',
          body: { body: input.body, event: input.event },
        },
      );
      return { id: item.id, body: item.body, author: item.user?.login, createdAt: item.submitted_at, updatedAt: item.submitted_at };
    } catch {
      return null;
    }
  }

  async listReleases(owner: string, repo: string, perPage: number = 30): Promise<ProviderRelease[]> {
    try {
      const items = await this.rest!.request<GitHubRelease[]>(
        `/repos/${owner}/${repo}/releases?per_page=${perPage}`,
        { method: 'GET' },
      );
      return items.map(toCanonicalRelease);
    } catch {
      return [];
    }
  }

  async listWorkflowRuns(input: GetWorkflowRunsInput): Promise<ProviderWorkflowRun[]> {
    try {
      const params = new URLSearchParams({ per_page: String(input.perPage ?? 30) });
      if (input.branch) params.set('branch', input.branch);
      if (input.status) params.set('status', input.status);
      const res = await this.rest!.request<{ workflow_runs: GitHubWorkflowRun[] }>(
        `/repos/${input.owner}/${input.repo}/actions/runs?${params.toString()}`,
        { method: 'GET' },
      );
      return (res.workflow_runs ?? []).map(toCanonicalWorkflowRun);
    } catch {
      return [];
    }
  }
}

// ── Canonical mappers ─────────────────────────────────────────────────────────

function toCanonicalUser(u: GitHubUser): ProviderUser {
  return { id: u.id, login: u.login, name: u.name ?? null, email: u.email ?? null, avatarUrl: u.avatar_url ?? null };
}

function toCanonicalIssue(i: GitHubIssue): ProviderIssue {
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    body: i.body,
    state: i.state,
    webUrl: i.html_url,
    labels: (i.labels ?? []).map((l) => l.name),
    author: undefined,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

function toCanonicalComment(c: GitHubComment): ProviderComment {
  return {
    id: c.id,
    body: c.body,
    author: c.user?.login,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    webUrl: c.html_url,
  };
}

function toCanonicalPR(p: GitHubPullRequest): ProviderPullRequest {
  return {
    id: p.id,
    number: p.number,
    title: p.title,
    state: p.state === 'open' ? 'open' : 'closed',
    webUrl: p.html_url,
    headBranch: p.head?.ref ?? '',
    baseBranch: p.base?.ref ?? '',
    author: p.user?.login,
    draft: p.draft ?? false,
    createdAt: p.created_at,
  };
}

function toCanonicalRelease(r: GitHubRelease): ProviderRelease {
  return {
    id: r.id,
    tagName: r.tag_name,
    name: r.name ?? null,
    body: r.body ?? null,
    webUrl: r.html_url,
    draft: r.draft,
    prerelease: r.prerelease,
    publishedAt: r.published_at ?? null,
    author: undefined,
  };
}

function toCanonicalWorkflowRun(w: GitHubWorkflowRun): ProviderWorkflowRun {
  return {
    id: w.id,
    name: w.name,
    status: w.status,
    conclusion: w.conclusion,
    webUrl: w.html_url,
    headBranch: w.head_branch,
    headSha: w.head_sha,
    event: '',
    runNumber: w.run_number,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    actor: undefined,
  };
}
