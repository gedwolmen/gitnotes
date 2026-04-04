import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '';
const REDIRECT_URI = AuthSession.makeRedirectUri({ native: 'gitnotes://redirect' });

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string;
  private: boolean;
}

interface GitHubIssue {
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

interface GitHubMilestone {
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

const ACCESS_TOKEN_KEY = '@gitnotes:github_token';
const USER_KEY = '@gitnotes:github_user';

class GitHubServiceClass {
  private accessToken: string | null = null;
  private user: GitHubUser | null = null;

  async initialize(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const userJson = await AsyncStorage.getItem(USER_KEY);
      if (token && userJson) {
        this.accessToken = token;
        this.user = JSON.parse(userJson);
      }
    } catch (error) {
      console.error('Error initializing GitHub service:', error);
    }
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null && this.user !== null;
  }

  getUser(): GitHubUser | null {
    return this.user;
  }

  async authenticate(): Promise<boolean> {
    try {
      const discovery = {
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
      };

      const authRequest = new AuthSession.AuthRequest({
        clientId: GITHUB_CLIENT_ID,
        scopes: ['repo', 'read:org'],
        redirectUri: REDIRECT_URI,
        responseType: AuthSession.ResponseType.Code,
      });

      const authResult = await authRequest.promptAsync(discovery);

      if (authResult.type === 'success' && authResult.params.code) {
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: GITHUB_CLIENT_ID,
            code: authResult.params.code,
            redirectUri: REDIRECT_URI,
          },
          discovery
        );

        if (tokenResult.accessToken) {
          this.accessToken = tokenResult.accessToken;
          await AsyncStorage.setItem(ACCESS_TOKEN_KEY, tokenResult.accessToken);

          const user = await this.fetchUser();
          if (user) {
            this.user = user;
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('GitHub authentication error:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    this.accessToken = null;
    this.user = null;
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, USER_KEY]);
  }

  private async fetchUser(): Promise<GitHubUser | null> {
    if (!this.accessToken) return null;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching GitHub user:', error);
    }
    return null;
  }

  private async fetchWithAuth(url: string): Promise<any> {
    if (!this.accessToken) throw new Error('Not authenticated');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    const data = await this.fetchWithAuth(
      'https://api.github.com/user/repos?sort=updated&per_page=100'
    );
    return data;
  }

  async getIssues(owner: string, repo: string, milestone?: number): Promise<GitHubIssue[]> {
    let url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`;
    if (milestone) {
      url += `&milestone=${milestone}`;
    }
    const data = await this.fetchWithAuth(url);
    return data.filter((item: any) => !item.pull_request);
  }

  async getMilestones(owner: string, repo: string): Promise<GitHubMilestone[]> {
    const data = await this.fetchWithAuth(
      `https://api.github.com/repos/${owner}/${repo}/milestones?state=all&per_page=100`
    );
    return data;
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.fetchWithAuth(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`
    );
  }

  async getMilestone(owner: string, repo: string, milestoneNumber: number): Promise<GitHubMilestone> {
    return this.fetchWithAuth(
      `https://api.github.com/repos/${owner}/${repo}/milestones/${milestoneNumber}`
    );
  }
}

export const GitHubService = new GitHubServiceClass();
export type { GitHubUser, GitHubRepository, GitHubIssue, GitHubMilestone };