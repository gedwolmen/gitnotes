/**
 * Gitea / Forgejo REST API client — typed wrapper for collaboration features.
 *
 * Gitea and Forgejo share identical REST APIs (Forgejo is a Gitea fork),
 * so this client works for both. The `kind` field distinguishes them.
 *
 * This client is for collaboration features (issues, PRs, comments) — NOT
 * for file transport. File sync uses Git2Client (git2-rs).
 */

import { TypedRestClient } from '../restClient';
import type { ProviderClient, ProviderUser, ProviderIssue, ProviderComment, ProviderPullRequest, ProviderRelease, ProviderWorkflowRun, ItemState, CreateIssueInput, CreateCommentInput, CreatePullRequestInput, ReviewInput, GetWorkflowRunsInput, GiteaUser, GiteaIssue, GiteaPR, GiteaComment, GiteaRelease, GiteaWorkflowRun, ProviderKind } from '../types';

export class GiteaClient implements ProviderClient {
  readonly kind: ProviderKind;
  private rest: TypedRestClient | null = null;
  private user: GiteaUser | null = null;
  private baseUrl: string;

  constructor(kind: 'gitea' | 'forgejo', baseUrl: string) {
    this.kind = kind;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async initialize(token: string): Promise<void> {
    this.rest = new TypedRestClient(this.baseUrl, { type: 'header', header: 'Authorization', value: `token ${token}` });
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
      const u = await this.rest!.request<GiteaUser>('/user', { method: 'GET' });
      this.user = u;
      return toCanonicalUser(u);
    } catch {
      return null;
    }
  }

  async listIssues(owner: string, repo: string, state: ItemState = 'open'): Promise<ProviderIssue[]> {
    try {
      const items = await this.rest!.request<GiteaIssue[]>(
        `/repos/${owner}/${repo}/issues?state=${state}&type=issues&limit=50`,
        { method: 'GET' },
      );
      return items
        .filter((i) => i.pull_request == null)
        .map(toCanonicalIssue);
    } catch {
      return [];
    }
  }

  async createIssue(input: CreateIssueInput): Promise<ProviderIssue | null> {
    try {
      const item = await this.rest!.request<GiteaIssue>(
        `/repos/${input.owner}/${input.repo}/issues`,
        {
          method: 'POST',
          body: {
            title: input.title,
            body: input.body,
            labels: input.labels?.map((l) => parseInt(l, 10) || 0).filter((n) => n > 0),
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
      const items = await this.rest!.request<GiteaComment[]>(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments?limit=100`,
        { method: 'GET' },
      );
      return items.map(toCanonicalComment);
    } catch {
      return [];
    }
  }

  async createComment(input: CreateCommentInput): Promise<ProviderComment | null> {
    try {
      const item = await this.rest!.request<GiteaComment>(
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
      const items = await this.rest!.request<GiteaPR[]>(
        `/repos/${owner}/${repo}/pulls?state=${state}&limit=50`,
        { method: 'GET' },
      );
      return items.map(toCanonicalPR);
    } catch {
      return [];
    }
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest | null> {
    try {
      const item = await this.rest!.request<GiteaPR>(
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
      const item = await this.rest!.request<GiteaComment>(
        `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}/reviews`,
        { method: 'POST', body: { body: input.body, event: input.event.toLowerCase() } },
      );
      return toCanonicalComment(item);
    } catch {
      return null;
    }
  }

  async listReleases(owner: string, repo: string, perPage: number = 30): Promise<ProviderRelease[]> {
    try {
      const items = await this.rest!.request<GiteaRelease[]>(
        `/repos/${owner}/${repo}/releases?limit=${perPage}`,
        { method: 'GET' },
      );
      return items.map(toCanonicalRelease);
    } catch {
      return [];
    }
  }

  async listWorkflowRuns(input: GetWorkflowRunsInput): Promise<ProviderWorkflowRun[]> {
    try {
      const params = new URLSearchParams({ limit: String(input.perPage ?? 30) });
      if (input.branch) params.set('branch', input.branch);
      const res = await this.rest!.request<{ workflow_runs?: GiteaWorkflowRun[] }>(
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

function toCanonicalUser(u: GiteaUser): ProviderUser {
  return { id: u.id, login: u.login, name: u.full_name ?? u.login, email: u.email ?? null, avatarUrl: u.avatar_url ?? null };
}

function toCanonicalIssue(i: GiteaIssue): ProviderIssue {
  return {
    id: i.number,
    number: i.number,
    title: i.title,
    body: '',
    state: i.state === 'open' ? 'open' : 'closed',
    webUrl: i.html_url,
    labels: (i.labels ?? []).map((l) => l.name),
    author: i.user?.login,
    createdAt: i.created_at,
    updatedAt: i.updated_at ?? i.created_at,
  };
}

function toCanonicalComment(c: GiteaComment): ProviderComment {
  return {
    id: c.id,
    body: c.body,
    author: c.user?.login,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function toCanonicalPR(p: GiteaPR): ProviderPullRequest {
  return {
    id: p.number,
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

function toCanonicalRelease(r: GiteaRelease): ProviderRelease {
  return {
    id: r.id,
    tagName: r.tag_name,
    name: r.name ?? null,
    body: r.body ?? null,
    webUrl: r.html_url,
    draft: false,
    prerelease: false,
    publishedAt: r.published_at ?? null,
    author: undefined,
  };
}

function toCanonicalWorkflowRun(w: GiteaWorkflowRun): ProviderWorkflowRun {
  return {
    id: w.id,
    name: w.name,
    status:
      w.status === 'running'
        ? 'in_progress'
        : w.status === 'success' || w.status === 'failure'
          ? 'completed'
          : 'queued',
    conclusion: w.conclusion,
    webUrl: w.html_url,
    headBranch: w.head_branch,
    headSha: w.head_sha,
    event: '',
    runNumber: w.id,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    actor: undefined,
  };
}
