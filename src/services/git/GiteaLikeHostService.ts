import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GitHostBranch,
  GitHostContent,
  GitHostService,
  GitHostTreeEntry,
  GitHostUser,
} from './GitHost';

export interface GiteaLikeUser {
  id: number;
  login: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface GiteaLikeRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch?: string;
  owner?: { login?: string };
}

export interface GiteaLikeBranch {
  name: string;
}

export interface GiteaLikeContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  sha?: string;
  download_url?: string | null;
  encoding?: string;
  content?: string;
}

export interface GiteaLikeTreeEntry {
  path: string;
  type: 'tree' | 'blob';
  sha: string;
}

/**
 * Shared Gitea / Forgejo implementation. Their REST APIs are 1:1 — the
 * Forgejo project is a Gitea fork and keeps the same endpoints — so we
 * share one class and only differentiate by `provider` label and base
 * URL.
 */
export class GiteaLikeHostService implements GitHostService {
  readonly provider: 'gitea' | 'forgejo';

  private token: string | null = null;
  private user: GiteaLikeUser | null = null;
  private baseUrl: string;

  constructor(provider: 'gitea' | 'forgejo', baseUrl: string) {
    this.provider = provider;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setBaseUrl(url: string): void {
    this.baseUrl = (url || this.baseUrl).replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  isAuthenticated(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  getUser(): GiteaLikeUser | null {
    return this.user;
  }

  private userKey(): string {
    return `@gitnotes:${this.provider}_user`;
  }
  private tokenKey(): string {
    return `@gitnotes:${this.provider}_token`;
  }
  private baseKey(): string {
    return `@gitnotes:${this.provider}_base_url`;
  }

  async initialize(): Promise<void> {
    try {
      this.token = await AsyncStorage.getItem(this.tokenKey());
      if (!this.token) return;
      const storedBase = await AsyncStorage.getItem(this.baseKey());
      if (storedBase) this.setBaseUrl(storedBase);
      const userJson = await AsyncStorage.getItem(this.userKey());
      if (userJson) {
        this.user = JSON.parse(userJson);
      } else {
        this.user = await this.fetchUser();
        if (this.user) {
          await AsyncStorage.setItem(this.userKey(), JSON.stringify(this.user));
        }
      }
    } catch (error) {
      console.warn(`[${this.provider}] initialize failed:`, error);
    }
  }

  async setToken(token: string, baseUrl?: string): Promise<GiteaLikeUser | null> {
    this.token = token;
    await AsyncStorage.setItem(this.tokenKey(), token);
    if (baseUrl) {
      this.setBaseUrl(baseUrl);
      await AsyncStorage.setItem(this.baseKey(), this.baseUrl);
    }
    const user = await this.fetchUser();
    this.user = user;
    if (user) {
      await AsyncStorage.setItem(this.userKey(), JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(this.userKey());
    }
    return user;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.user = null;
    await AsyncStorage.removeItem(this.userKey());
    await AsyncStorage.removeItem(this.tokenKey());
    await AsyncStorage.removeItem(this.baseKey());
  }

  private async authedFetch<T>(url: string): Promise<T | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `token ${this.token}`,
        },
      });
      if (!res.ok) {
        if (res.status !== 404) {
          console.warn(`[${this.provider}] ${res.status} ${url}`);
        }
        return null;
      }
      return (await res.json()) as T;
    } catch (error) {
      console.warn(`[${this.provider}] fetch failed:`, error);
      return null;
    }
  }

  async fetchUser(): Promise<GiteaLikeUser | null> {
    if (!this.token) return null;
    return this.authedFetch<GiteaLikeUser>(`${this.baseUrl}/user`);
  }

  async getAuthenticatedUser(): Promise<GitHostUser | null> {
    const user = this.user ?? (await this.fetchUser());
    if (!user) return null;
    return {
      id: user.id,
      login: user.login,
      name: user.full_name ?? user.login,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
    };
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string | null> {
    const meta = await this.authedFetch<GiteaLikeRepo>(
      `${this.baseUrl}/repos/${owner}/${repo}`,
    );
    return meta?.default_branch ?? null;
  }

  async listBranches(owner: string, repo: string): Promise<GitHostBranch[]> {
    const data = await this.authedFetch<GiteaLikeBranch[]>(
      `${this.baseUrl}/repos/${owner}/${repo}/branches?limit=50`,
    );
    if (!data) return [];
    return data.map((b) => ({ name: b.name }));
  }

  async getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHostTreeEntry[]> {
    // The Gitea tree API isn't recursive in one call; walk folder-by-folder
    // and flatten. Cap at 5 levels to avoid pathological repos.
    const collected: GitHostTreeEntry[] = [];
    const visit = async (path: string, depth: number) => {
      if (depth > 5) return;
      const data = await this.authedFetch<GiteaLikeContent[]>(
        `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      );
      if (!data) return;
      for (const item of data) {
        if (item.type === 'dir') {
          collected.push({ path: item.path, type: 'tree', sha: item.sha ?? '' });
          await visit(item.path, depth + 1);
        } else if (item.type === 'file') {
          collected.push({ path: item.path, type: 'blob', sha: item.sha ?? '' });
        }
      }
    };
    await visit('', 0);
    return collected;
  }

  async listContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostContent[]> {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    const query = params.toString();
    const url =
      `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}` +
      (query ? `?${query}` : '');
    const data = await this.authedFetch<GiteaLikeContent[]>(url);
    if (!data) return [];
    return data.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size,
      sha: item.sha,
      downloadUrl: item.download_url ?? null,
    }));
  }

  async getFileText(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    const query = params.toString();
    const url =
      `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}` +
      (query ? `?${query}` : '');
    const data = await this.authedFetch<GiteaLikeContent>(url);
    if (!data?.content) return null;
    try {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
}
