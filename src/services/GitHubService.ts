import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@gitnotes:github_token';
const USER_KEY = '@gitnotes:github_user';

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
      console.error('[GitHubService] Failed to initialize:', error);
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
      console.error('[GitHubService] Failed to get repositories:', error);
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
      console.error('[GitHubService] Failed to get issues:', error);
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
      console.error('[GitHubService] Failed to get milestones:', error);
      return [];
    }
  }

  private async fetchWithAuth(url: string): Promise<any> {
    if (!this.token) throw new Error('GitHub token is not configured');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }
}

export const GitHubService = new GitHubServiceClass();
