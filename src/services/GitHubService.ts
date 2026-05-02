import AsyncStorage from '@react-native-async-storage/async-storage';
import http, { setAuthToken, clearAuthToken } from './http';

const TOKEN_KEY = '@gitnotes:github_token';
const USER_KEY = '@gitnotes:github_user';

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  // Each 4 base64 chars → 3 bytes; padding "=" trims the tail.
  let outLen = (cleaned.length / 4) * 3;
  if (cleaned.endsWith('==')) outLen -= 2;
  else if (cleaned.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let bi = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = cleaned[i + 2] === '=' ? 64 : chars.indexOf(cleaned[i + 2]);
    const c4 = cleaned[i + 3] === '=' ? 64 : chars.indexOf(cleaned[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    bytes[bi++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== 64 && c3 >= 0) bytes[bi++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 !== 64 && c4 >= 0) bytes[bi++] = ((c3 & 3) << 6) | c4;
  }
  return bytes.subarray(0, bi);
}

function decodeBase64(base64: string): string {
  const bytes = base64ToBytes(base64);
  // Prefer TextDecoder when available (Hermes / modern JSC). Falls back to
  // a manual UTF-8 decoder so 4-byte sequences (emoji, supplementary plane)
  // round-trip correctly. The previous implementation went through
  // String.fromCharCode + escape/decodeURIComponent, which is deprecated
  // and corrupts code points outside the BMP.
  const TD: typeof TextDecoder | undefined = (globalThis as unknown as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (TD) {
    try {
      return new TD('utf-8').decode(bytes);
    } catch {
      // fall through to manual decoder
    }
  }
  return utf8DecodeBytes(bytes);
}

function utf8DecodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
      continue;
    }
    if ((b1 & 0xe0) === 0xc0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      continue;
    }
    if ((b1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      continue;
    }
    if ((b1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      // Encode astral code points as a surrogate pair.
      const cpAdj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (cpAdj >> 10), 0xdc00 + (cpAdj & 0x3ff));
      continue;
    }
    // Invalid sequence — emit replacement character and advance one byte.
    out += '�';
  }
  return out;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
  email: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string;
  private: boolean;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  milestone: GitHubMilestone | null;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'closed';
  html_url: string;
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string };
  draft: boolean;
  created_at: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  download_url: string | null;
  content?: string;
  encoding?: string;
  sha?: string;
}

export interface GitHubFileCommit {
  content: { sha: string } | null;
  commit: { sha: string };
}

class GitHubServiceClass {
  private token: string | null = null;
  private user: GitHubUser | null = null;

  async initialize(): Promise<void> {
    try {
      this.token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!this.token) return;
      setAuthToken(this.token);
      const userJson = await AsyncStorage.getItem(USER_KEY);
      if (userJson) {
        this.user = JSON.parse(userJson);
      } else {
        this.user = await this.fetchUser();
        if (this.user) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(this.user));
        }
      }
    } catch (error) {
      console.warn('[GitHubService] Failed to initialize:', error);
    }
  }

  async setToken(token: string, user?: GitHubUser | null): Promise<GitHubUser | null> {
    this.token = token;
    setAuthToken(token);
    const resolvedUser = user === undefined ? await this.fetchUser() : user;
    if (!resolvedUser) {
      this.token = null;
      clearAuthToken();
      return null;
    }
    this.user = resolvedUser;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(resolvedUser));
    return resolvedUser;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.user = null;
    clearAuthToken();
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getUser(): GitHubUser | null {
    return this.user;
  }

  private async fetchUser(): Promise<GitHubUser | null> {
    try {
      return await this.request<GitHubUser>('https://api.github.com/user');
    } catch {
      return null;
    }
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    const all: GitHubRepository[] = [];
    const params = new URLSearchParams({
      sort: 'updated',
      per_page: '100',
      visibility: 'all',
      affiliation: 'owner,collaborator,organization_member',
    });
    let url: string | null = `https://api.github.com/user/repos?${params.toString()}`;
    try {
      while (url) {
        const { data, nextUrl } = await this.requestPaginated(url);
        if (Array.isArray(data)) all.push(...data);
        url = nextUrl;
      }
      return all;
    } catch (error) {
      console.warn('[GitHubService] Failed to get repositories:', error);
      return all;
    }
  }

  async getIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get issues:', error);
      return [];
    }
  }

  async getPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get pull requests:', error);
      return [];
    }
  }

  async getMilestones(owner: string, repo: string): Promise<GitHubMilestone[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/milestones?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get milestones:', error);
      return [];
    }
  }

  async getRepoContents(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubContent[]> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url);
      if (Array.isArray(data)) {
        return data;
      }
      return [data];
    } catch (error) {
      if (!isNotFound(error)) {
        console.warn('[GitHubService] Failed to get repo contents:', error);
      }
      return [];
    }
  }

  async getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }[]> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
      const data = await this.request(url);
      if (!Array.isArray(data?.tree)) return [];
      return data.tree.map((item: any) => ({
        path: item.path,
        type: item.type,
        sha: item.sha,
        size: typeof item.size === 'number' ? item.size : undefined,
      }));
    } catch (error) {
      if (!isNotFound(error)) {
        console.warn('[GitHubService] Failed to get tree:', error);
      }
      return [];
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url);
      if (data.type === 'file' && data.content) {
        const base64 = data.content.replace(/\n/g, '');
        return decodeBase64(base64);
      }
      return null;
    } catch (error) {
      console.warn('[GitHubService] Failed to get file content:', error);
      return null;
    }
  }

  async getFileSha(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url);
      return data.sha || null;
    } catch {
      return null;
    }
  }

  async createFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const base64Content = btoa(binary);
      return await this.request(url, 'PUT', {
        message,
        content: base64Content,
        branch,
      });
    } catch (error) {
      console.warn('[GitHubService] Failed to create file:', error);
      return null;
    }
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const existingSha = await this.getFileSha(owner, repo, path, branch);
      try {
        const body: Record<string, string> = {
          message,
          content: base64Content,
          branch,
        };
        if (existingSha) body.sha = existingSha;

        return await this.request(url, 'PUT', body);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          continue;
        }
        if (status === 422 && existingSha) {
          return { content: { sha: existingSha }, commit: { sha: '' } } as GitHubFileCommit;
        }
        if (attempt === 2) {
          console.warn('[GitHubService] Failed to upload binary file:', error);
          return null;
        }
      }
    }
    return null;
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      return await this.request(url, 'DELETE', { message, sha, branch });
    } catch (error) {
      console.warn('[GitHubService] Failed to delete file:', error);
      return null;
    }
  }

  async createFolder(
    owner: string,
    repo: string,
    folderPath: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    const keepPath = folderPath ? `${folderPath}/.gitkeep` : '.gitkeep';
    return this.createFile(owner, repo, keepPath, '', `Create folder ${folderPath || '/'}`, branch);
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const base64Content = btoa(binary);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sha = await this.getFileSha(owner, repo, path, branch);
        if (!sha) {
          return this.createFile(owner, repo, path, content, message, branch);
        }

        return await this.request(url, 'PUT', { message, content: base64Content, sha, branch });
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          continue;
        }
        if (status === 422) {
          return { content: { sha: '' }, commit: { sha: '' } } as GitHubFileCommit;
        }
        if (attempt === 2) {
          console.warn('[GitHubService] Failed to update file:', error);
          return null;
        }
      }
    }
    return null;
  }

  async moveFile(
    owner: string,
    repo: string,
    oldPath: string,
    newPath: string,
    content: string,
    message: string,
    oldSha: string,
    branch: string = 'main',
  ): Promise<boolean> {
    const createResult = await this.createFile(owner, repo, newPath, content, message, branch);
    if (!createResult) return false;
    await this.deleteFile(owner, repo, oldPath, message, oldSha, branch);
    return true;
  }

  private async request<T = any>(url: string, method: 'GET' | 'PUT' | 'DELETE' = 'GET', data?: any): Promise<T> {
    if (!this.token) throw new Error('GitHub token is not configured');
    const isFullUrl = url.startsWith('http');
    const requestUrl = isFullUrl ? url : url;
    const response = await http.request<T>({ url: requestUrl, method, data });
    return response.data;
  }

  private async requestPaginated(url: string): Promise<{ data: any; nextUrl: string | null }> {
    if (!this.token) throw new Error('GitHub token is not configured');
    const response = await http.get(url);
    const linkHeader = response.headers['link'] as string | null;
    const nextUrl = parseNextLink(linkHeader);
    return { data: response.data, nextUrl };
  }
}

function parseNextLink(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

export const GitHubService = new GitHubServiceClass();
