/**
 * GitLab REST API client — typed wrapper for collaboration features.
 *
 * Supports both gitlab.com and self-hosted instances via configurable baseUrl.
 * This client is for collaboration features (issues, MRs, comments) — NOT
 * for file transport. File sync uses Git2Client (git2-rs).
 */

import { TypedRestClient } from '../restClient';
import type { ProviderClient, ProviderUser, ProviderIssue, ProviderComment, ProviderPullRequest, ProviderRelease, ProviderWorkflowRun, ItemState, CreateIssueInput, CreateCommentInput, CreatePullRequestInput, ReviewInput, GetWorkflowRunsInput, GitLabUser, GitLabIssue, GitLabMR, GitLabNote, GitLabRelease, GitLabPipeline } from '../types';

const GITLAB_DEFAULT = 'https://gitlab.com/api/v4';

function encodeProject(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

export class GitLabClient implements ProviderClient {
  readonly kind = 'gitlab' as const;
  private rest: TypedRestClient | null = null;
  private user: GitLabUser | null = null;
  private baseUrl: string = GITLAB_DEFAULT;

  async initialize(token: string, baseUrl?: string): Promise<void> {
    this.baseUrl = (baseUrl ?? GITLAB_DEFAULT).replace(/\/+$/, '');
    this.rest = new TypedRestClient(this.baseUrl, { type: 'header', header: 'PRIVATE-TOKEN', value: token });
    this.user = null;
  }

  async clearToken(): Promise<void> {
    this.rest = null;
    this.user = null;
  }

  isAuthenticated(): boolean {
    return this.rest !== null;
  }

  // ── Canonical interface ───────────────────────────────────────────────────

  async getAuthenticatedUser(): Promise<ProviderUser | null> {
    if (this.user) return toCanonicalUser(this.user);
    try {
      const u = await this.rest!.request<GitLabUser>('/user', { method: 'GET' });
      this.user = u;
      return toCanonicalUser(u);
    } catch {
      return null;
    }
  }

  async listIssues(owner: string, repo: string, state: ItemState = 'open'): Promise<ProviderIssue[]> {
    const gitlabState = state === 'open' ? 'opened' : 'closed';
    try {
      const proj = encodeProject(owner, repo);
      const items = await this.rest!.request<GitLabIssue[]>(
        `/projects/${proj}/issues?state=${gitlabState}&per_page=50`,
        { method: 'GET' },
      );
      return items.map(toCanonicalIssue);
    } catch {
      return [];
    }
  }

  async createIssue(input: CreateIssueInput): Promise<ProviderIssue | null> {
    try {
      const proj = encodeProject(input.owner, input.repo);
      const item = await this.rest!.request<GitLabIssue>(
        `/projects/${proj}/issues`,
        {
          method: 'POST',
          body: {
            title: input.title,
            description: input.body,
            labels: input.labels?.join(','),
            assignee_ids: undefined,
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
      const proj = encodeProject(owner, repo);
      const items = await this.rest!.request<GitLabNote[]>(
        `/projects/${proj}/issues/${issueNumber}/notes?per_page=100`,
        { method: 'GET' },
      );
      return items.map(toCanonicalComment);
    } catch {
      return [];
    }
  }

  async createComment(input: CreateCommentInput): Promise<ProviderComment | null> {
    try {
      const proj = encodeProject(input.owner, input.repo);
      const item = await this.rest!.request<GitLabNote>(
        `/projects/${proj}/issues/${input.issueNumber}/notes`,
        { method: 'POST', body: { body: input.body } },
      );
      return toCanonicalComment(item);
    } catch {
      return null;
    }
  }

  async listPullRequests(owner: string, repo: string, state: ItemState = 'open'): Promise<ProviderPullRequest[]> {
    const gitlabState = state === 'open' ? 'opened' : 'closed';
    try {
      const proj = encodeProject(owner, repo);
      const items = await this.rest!.request<GitLabMR[]>(
        `/projects/${proj}/merge_requests?state=${gitlabState}&per_page=50`,
        { method: 'GET' },
      );
      return items.map(toCanonicalMR);
    } catch {
      return [];
    }
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest | null> {
    try {
      const proj = encodeProject(input.owner, input.repo);
      const item = await this.rest!.request<GitLabMR>(
        `/projects/${proj}/merge_requests`,
        {
          method: 'POST',
          body: {
            title: input.title,
            description: input.body,
            source_branch: input.head,
            target_branch: input.base,
          },
        },
      );
      return toCanonicalMR(item);
    } catch {
      return null;
    }
  }

  async reviewPullRequest(input: ReviewInput): Promise<ProviderComment | null> {
    try {
      const proj = encodeProject(input.owner, input.repo);
      const eventMap: Record<string, string> = {
        APPROVE: 'approve',
        REQUEST_CHANGES: 'request_changes',
        COMMENT: 'comment',
      };
      const item = await this.rest!.request<GitLabNote>(
        `/projects/${proj}/merge_requests/${input.pullNumber}/notes`,
        { method: 'POST', body: { body: input.body } },
      );
      return toCanonicalComment(item);
    } catch {
      return null;
    }
  }

  async listReleases(owner: string, repo: string, perPage: number = 30): Promise<ProviderRelease[]> {
    try {
      const proj = encodeProject(owner, repo);
      const items = await this.rest!.request<GitLabRelease[]>(
        `/projects/${proj}/releases?per_page=${perPage}`,
        { method: 'GET' },
      );
      return items.map(toCanonicalRelease);
    } catch {
      return [];
    }
  }

  async listWorkflowRuns(input: GetWorkflowRunsInput): Promise<ProviderWorkflowRun[]> {
    try {
      const proj = encodeProject(input.owner, input.repo);
      const params = new URLSearchParams({ per_page: String(input.perPage ?? 30) });
      if (input.branch) params.set('ref', input.branch);
      if (input.status) params.set('status', input.status);
      const items = await this.rest!.request<GitLabPipeline[]>(
        `/projects/${proj}/pipelines?${params.toString()}`,
        { method: 'GET' },
      );
      return items.map(toCanonicalPipeline);
    } catch {
      return [];
    }
  }
}

// ── Canonical mappers ─────────────────────────────────────────────────────────

function toCanonicalUser(u: GitLabUser): ProviderUser {
  return { id: u.id, login: u.username, name: u.name, email: u.email ?? null, avatarUrl: u.avatar_url ?? null };
}

function toCanonicalIssue(i: GitLabIssue): ProviderIssue {
  return {
    id: i.iid,
    number: i.iid,
    title: i.title,
    body: i.description ?? '',
    state: i.state === 'opened' ? 'open' : 'closed',
    webUrl: i.web_url,
    labels: i.labels ?? [],
    author: i.author?.username,
    createdAt: i.created_at,
    updatedAt: i.updated_at ?? i.created_at,
  };
}

function toCanonicalComment(c: GitLabNote): ProviderComment {
  return {
    id: c.id,
    body: c.body,
    author: c.author?.username,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function toCanonicalMR(m: GitLabMR): ProviderPullRequest {
  return {
    id: m.iid,
    number: m.iid,
    title: m.title,
    state: m.state === 'opened' ? 'open' : m.state === 'merged' ? 'merged' : 'closed',
    webUrl: m.web_url,
    headBranch: m.source_branch,
    baseBranch: m.target_branch,
    author: m.author?.username,
    draft: m.draft ?? false,
    createdAt: m.created_at,
  };
}

function toCanonicalRelease(r: GitLabRelease): ProviderRelease {
  return {
    id: 0,
    tagName: r.tag_name,
    name: r.name ?? null,
    body: r.description ?? null,
    webUrl: r.html_url,
    draft: false,
    prerelease: false,
    publishedAt: r.released_at ?? null,
    author: undefined,
  };
}

function toCanonicalPipeline(p: GitLabPipeline): ProviderWorkflowRun {
  return {
    id: p.id,
    name: `Pipeline #${p.id}`,
    status: p.status === 'success' || p.status === 'failed' ? 'completed' : p.status === 'running' ? 'in_progress' : 'queued',
    conclusion: p.status,
    webUrl: p.web_url,
    headBranch: p.ref,
    headSha: p.sha,
    event: '',
    runNumber: p.id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    actor: undefined,
  };
}
