import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@gitnotes:github_token';
const USER_KEY = '@gitnotes:github_user';

function decodeBase64(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  base64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  while (i < base64.length) {
    const c1 = chars.indexOf(base64[i++]);
    const c2 = chars.indexOf(base64[i++]);
    const c3 = chars.indexOf(base64[i++]);
    const c4 = chars.indexOf(base64[i++]);
    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;
    result += String.fromCharCode(b1);
    if (c3 !== 64 && base64[i - 2] !== '=') result += String.fromCharCode(b2);
    if (c4 !== 64 && base64[i - 1] !== '=') result += String.fromCharCode(b3);
  }
  try {
    return decodeURIComponent(escape(result));
  } catch {
    return result;
  }
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

  async setToken(token: string): Promise<GitHubUser | null> {
    this.token = token;
    const user = await this.fetchUser();
    if (!user) {
      this.token = null;
      return null;
    }
    this.user = user;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.user = null;
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
      return await this.fetchWithAuth('https://api.github.com/user');
    } catch {
      return null;
    }
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    try {
      const data = await this.fetchWithAuth(
        'https://api.github.com/user/repos?sort=updated&per_page=100'
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get repositories:', error);
      return [];
    }
  }

  async getIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    try {
      const data = await this.fetchWithAuth(
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
      const data = await this.fetchWithAuth(
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
      const data = await this.fetchWithAuth(
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
      const data = await this.fetchWithAuth(url);
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
  ): Promise<{ path: string; type: 'blob' | 'tree'; sha: string }[]> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
      const data = await this.fetchWithAuth(url);
      if (!Array.isArray(data?.tree)) return [];
      return data.tree.map((item: any) => ({
        path: item.path,
        type: item.type,
        sha: item.sha,
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
      const data = await this.fetchWithAuth(url);
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
      const data = await this.fetchWithAuth(url);
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
      return await this.fetchWithAuth(url, {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: base64Content,
          branch,
        }),
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
      try {
        const existingSha = await this.getFileSha(owner, repo, path, branch);
        const body: Record<string, string> = {
          message,
          content: base64Content,
          branch,
        };
        if (existingSha) body.sha = existingSha;

        return await this.fetchWithAuth(url, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          continue;
        }
        if (status === 422) {
          return { content: { sha: '' }, commit: { sha: '' } } as GitHubFileCommit;
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
      return await this.fetchWithAuth(url, {
        method: 'DELETE',
        body: JSON.stringify({ message, sha, branch }),
      });
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

        return await this.fetchWithAuth(url, {
          method: 'PUT',
          body: JSON.stringify({ message, content: base64Content, sha, branch }),
        });
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

  private async fetchWithAuth(url: string, options?: RequestInit): Promise<any> {
    if (!this.token) throw new Error('GitHub token is not configured');

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const err = new Error(`GitHub API error: ${response.status}`) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return response.json();
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

export const GitHubService = new GitHubServiceClass();
