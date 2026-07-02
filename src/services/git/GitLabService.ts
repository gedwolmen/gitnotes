import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GitHostBranch,
  GitHostContent,
  GitHostService,
  GitHostTreeEntry,
  GitHostUser,
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

/**
 * GitLab REST API adapter that implements `GitHostService`.
 *
 * Token storage is kept separate from GitHub's so a user can have one
 * of each. The base URL is configurable so the same implementation
 * works against self-hosted GitLab instances; the default is
 * `https://gitlab.com/api/v4`.
 */
export class GitLabService implements GitHostService {
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
}

export const gitLabService = new GitLabService();
