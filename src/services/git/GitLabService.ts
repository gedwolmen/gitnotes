import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GitHostBranch,
  GitHostContent,
  GitHostIssue,
  GitHostItemState,
  GitHostPullRequest,
  GitHostService,
  GitHostShaResult,
  GitHostTreeEntry,
  GitHostUser,
  GitHostWriteService,
} from './GitHost';

const GITLAB_USER_KEY = '@gitnotes:gitlab_user';
const GITLAB_TOKEN_KEY = '@gitnotes:gitlab_token';
const GITLAB_BASE_KEY = '@gitnotes:gitlab_base_url';
const GITLAB_BASE_DEFAULT = 'https://gitlab.com/api/v4';

interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
  avatar_url?: string | null;
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  name: string;
  default_branch?: string;
  web_url?: string;
}

interface GitLabTreeEntry {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
}

interface GitLabFileResponse {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256?: string;
}

interface GitLabBranch {
  name: string;
  default?: boolean;
  protected?: boolean;
  merged_into?: string;
}

interface GitLabMR {
  iid: number;
  title: string;
  state: 'opened' | 'closed' | 'merged' | 'locked' | string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  draft?: boolean;
  author?: { username?: string };
  created_at: string;
}

interface GitLabIssue {
  iid: number;
  title: string;
  state: 'opened' | 'closed' | string;
  web_url: string;
  labels?: string[];
  author?: { username?: string };
  created_at: string;
  updated_at?: string;
}

/**
 * GitLab REST API adapter that implements `GitHostService`.
 *
 * Token storage is kept separate from GitHub's so a user can have one
 * of each. The base URL is configurable so the same implementation
 * works against self-hosted GitLab instances; the default is
 * `https://gitlab.com/api/v4`.
 */
export class GitLabService implements GitHostService, GitHostWriteService {
  readonly provider = 'gitlab' as const;

  private token: string | null = null;
  private user: GitLabUser | null = null;
  private baseUrl: string = GITLAB_BASE_DEFAULT;

  setBaseUrl(url: string): void {
    this.baseUrl = (url || GITLAB_BASE_DEFAULT).replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  isAuthenticated(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  getUser(): GitLabUser | null {
    return this.user;
  }

  async initialize(): Promise<void> {
    try {
      this.token = await AsyncStorage.getItem(GITLAB_TOKEN_KEY);
      if (!this.token) return;
      const storedBase = await AsyncStorage.getItem(GITLAB_BASE_KEY);
      if (storedBase) this.setBaseUrl(storedBase);
      const userJson = await AsyncStorage.getItem(GITLAB_USER_KEY);
      if (userJson) {
        this.user = JSON.parse(userJson);
      } else {
        this.user = await this.fetchUser();
        if (this.user) {
          await AsyncStorage.setItem(GITLAB_USER_KEY, JSON.stringify(this.user));
        }
      }
    } catch (error) {
      console.warn('[GitLabService] initialize failed:', error);
    }
  }

  async setToken(token: string, baseUrl?: string): Promise<GitLabUser | null> {
    this.token = token;
    await AsyncStorage.setItem(GITLAB_TOKEN_KEY, token);
    if (baseUrl) {
      this.setBaseUrl(baseUrl);
      await AsyncStorage.setItem(GITLAB_BASE_KEY, this.baseUrl);
    }
    const user = await this.fetchUser();
    this.user = user;
    if (user) {
      await AsyncStorage.setItem(GITLAB_USER_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(GITLAB_USER_KEY);
    }
    return user;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.user = null;
    await AsyncStorage.removeItem(GITLAB_USER_KEY);
    await AsyncStorage.removeItem(GITLAB_TOKEN_KEY);
    await AsyncStorage.removeItem(GITLAB_BASE_KEY);
  }

  /** Encodes a project path ("namespace/project") for URL use. */
  private encodedProjectId(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  private async authedFetch<T>(url: string, init: RequestInit = {}): Promise<T | null> {
    if (!this.token) return null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      'PRIVATE-TOKEN': this.token,
    };
    try {
      const res = await fetch(url, { ...init, headers });
      if (!res.ok) {
        if (res.status !== 404) {
          console.warn(`[GitLabService] ${res.status} ${url}`);
        }
        return null;
      }
      return (await res.json()) as T;
    } catch (error) {
      console.warn('[GitLabService] fetch failed:', error);
      return null;
    }
  }

  private async authedFetchRaw(
    url: string,
    init: RequestInit = {},
  ): Promise<{ status: number; body: any } | null> {
    if (!this.token) return null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init.headers as Record<string, string> | undefined) ?? {}),
      'PRIVATE-TOKEN': this.token,
    };
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 204) return { status: 204, body: null };
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    } catch (error) {
      console.warn('[GitLabService] authedFetchRaw failed:', error);
      return null;
    }
  }

  async fetchUser(): Promise<GitLabUser | null> {
    if (!this.token) return null;
    return this.authedFetch<GitLabUser>(`${this.baseUrl}/user`);
  }

  async getAuthenticatedUser(): Promise<GitHostUser | null> {
    const user = this.user ?? (await this.fetchUser());
    if (!user) return null;
    return {
      id: user.id,
      login: user.username,
      name: user.name,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
    };
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string | null> {
    const meta = await this.authedFetch<GitLabProject>(
      `${this.baseUrl}/projects/${this.encodedProjectId(owner, repo)}`,
    );
    return meta?.default_branch ?? null;
  }

  async listOwnedProjects(): Promise<GitLabProject[]> {
    // Pagination handled in chunks. Up to 100 per page.
    const all: GitLabProject[] = [];
    let page = 1;
    while (page < 10) {
      const data = await this.authedFetch<GitLabProject[]>(
        `${this.baseUrl}/projects?membership=true&per_page=100&page=${page}&order_by=last_activity_at`,
      );
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 100) break;
      page += 1;
    }
    return all;
  }

  async listBranches(owner: string, repo: string): Promise<GitHostBranch[]> {
    const data = await this.authedFetch<GitLabBranch[]>(
      `${this.baseUrl}/projects/${this.encodedProjectId(
        owner,
        repo,
      )}/repository/branches?per_page=100`,
    );
    if (!data) return [];
    return data.map((b) => ({ name: b.name, isDefault: b.default ?? false }));
  }

  async getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHostTreeEntry[]> {
    const data = await this.authedFetch<GitLabTreeEntry[]>(
      `${this.baseUrl}/projects/${this.encodedProjectId(
        owner,
        repo,
      )}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(ref)}`,
    );
    if (!data) return [];
    return data
      .filter((e) => (e.type === 'tree' || e.type === 'blob') && Boolean(e.path))
      .map((e) => ({ path: e.path, type: e.type, sha: e.id }));
  }

  async listContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostContent[]> {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (ref) params.set('ref', ref);
    params.set('per_page', '100');
    const data = await this.authedFetch<GitLabTreeEntry[]>(
      `${this.baseUrl}/projects/${this.encodedProjectId(
        owner,
        repo,
      )}/repository/tree?${params.toString()}`,
    );
    if (!data) return [];
    return data.map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type === 'tree' ? 'dir' : 'file',
      sha: e.id,
    }));
  }

  async getFileText(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await this.authedFetch<GitLabFileResponse>(
      `${this.baseUrl}/projects/${this.encodedProjectId(
        owner,
        repo,
      )}/repository/files/${encodeURIComponent(path)}${params}`,
    );
    if (!data?.content) return null;
    try {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: GitHostItemState = 'open',
  ): Promise<GitHostPullRequest[]> {
    const gitlabState = state === 'open' ? 'opened' : 'closed';
    const data = await this.authedFetch<GitLabMR[]>(
      `${this.baseUrl}/projects/${this.encodedProjectId(owner, repo)}/merge_requests?state=${gitlabState}&per_page=50`,
    );
    if (!data) return [];
    return data.map((m) => ({
      id: m.iid,
      number: m.iid,
      title: m.title,
      state: m.state === 'opened' ? 'open' : 'closed',
      webUrl: m.web_url,
      headBranch: m.source_branch,
      baseBranch: m.target_branch,
      author: m.author?.username,
      draft: m.draft ?? false,
      createdAt: m.created_at,
    }));
  }

  async listIssues(
    owner: string,
    repo: string,
    state: GitHostItemState = 'open',
  ): Promise<GitHostIssue[]> {
    const gitlabState = state === 'open' ? 'opened' : 'closed';
    const data = await this.authedFetch<GitLabIssue[]>(
      `${this.baseUrl}/projects/${this.encodedProjectId(owner, repo)}/issues?state=${gitlabState}&per_page=50`,
    );
    if (!data) return [];
    return data.map((i) => ({
      id: i.iid,
      number: i.iid,
      title: i.title,
      state: i.state === 'opened' ? 'open' : 'closed',
      webUrl: i.web_url,
      labels: i.labels ?? [],
      author: i.author?.username,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    }));
  }

  // ── Write operations (GitHostWriteService) ──────────────────────

  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostShaResult> {
    const projId = this.encodedProjectId(owner, repo);
    const branch = ref || (await this.getDefaultBranch(owner, repo)) || 'main';
    const encodedPath = encodeURIComponent(path);
    const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const result = await this.authedFetchRaw(url);
    if (!result) return { kind: 'error', message: 'Network error' };
    if (result.status === 404) return { kind: 'not-found' };
    if (result.status >= 200 && result.status < 300 && result.body?.blob_id) {
      return { kind: 'found', sha: result.body.blob_id };
    }
    return { kind: 'error', message: `Unexpected status: ${result.status}` };
  }

  async getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    const result = await this.getFileSha(owner, repo, path, ref);
    return result.kind === 'found' ? (result.sha ?? null) : null;
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    commitMessage: string,
    branch: string,
    knownSha?: string,
  ): Promise<string> {
    const projId = this.encodedProjectId(owner, repo);
    const encodedPath = encodeURIComponent(path);
    const base64Content = Buffer.from(content, 'utf-8').toString('base64');
    const body: Record<string, string> = {
      branch,
      content: base64Content,
      encoding: 'base64',
      commit_message: commitMessage,
    };
    let currentSha: string | null = knownSha ?? null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const method = currentSha ? 'PUT' : 'POST';
      const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
      const payload = { ...body };
      if (currentSha) payload.sha = currentSha;

      const result = await this.authedFetchRaw(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (result && result.status >= 200 && result.status < 300) {
        const shaResult = await this.getFileSha(owner, repo, path, branch);
        if (shaResult.kind === 'found' && shaResult.sha) return shaResult.sha;
        throw new Error('GitLab updateFile succeeded but could not resolve SHA');
      }

      if (result?.status === 409 && attempt < 2) {
        const shaResult = await this.getFileSha(owner, repo, path, branch);
        currentSha = shaResult.kind === 'found' ? (shaResult.sha ?? null) : null;
        continue;
      }

      throw new Error(`GitLab updateFile failed: ${result?.status ?? 'unknown'}`);
    }

    throw new Error('GitLab updateFile exhausted retries');
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    commitMessage: string,
    _sha: string,
    branch: string,
  ): Promise<void> {
    const projId = this.encodedProjectId(owner, repo);
    const encodedPath = encodeURIComponent(path);
    const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
    const result = await this.authedFetchRaw(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, commit_message: commitMessage }),
    });
    if (!result || result.status >= 400) {
      throw new Error(`GitLab deleteFile failed: ${result?.status ?? 'unknown'}`);
    }
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    commitMessage: string,
    branch: string,
  ): Promise<string> {
    const projId = this.encodedProjectId(owner, repo);
    const encodedPath = encodeURIComponent(path);
    const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
    const body: Record<string, string> = {
      branch,
      content: base64Content,
      encoding: 'base64',
      commit_message: commitMessage,
    };
    const shaResult = await this.getFileSha(owner, repo, path, branch);
    if (shaResult.kind === 'found' && shaResult.sha) body.sha = shaResult.sha;
    const method = body.sha ? 'PUT' : 'POST';

    const result = await this.authedFetchRaw(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!result || result.status >= 400) {
      throw new Error(`GitLab uploadBinaryFile failed: ${result?.status ?? 'unknown'}`);
    }
    const baseUrl = this.baseUrl.replace(/\/api\/v4$/, '');
    return `${baseUrl}/${owner}/${repo}/-/raw/${branch}/${path}`;
  }

  async getRepoPrivacy(
    owner: string,
    repo: string,
  ): Promise<boolean | null> {
    const projId = this.encodedProjectId(owner, repo);
    const result = await this.authedFetch<{ visibility?: string }>(
      `${this.baseUrl}/projects/${projId}`,
    );
    if (!result) return null;
    return result.visibility === 'private';
  }
}

export const gitLabService = new GitLabService();
