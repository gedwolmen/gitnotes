import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.EXPO_PUBLIC_GITHUB_CLIENT_SECRET || '';

const TOKEN_KEY = '@gitnotes:github_token';

const REDIRECT_URI = 'gitnotes://oauth/github';

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;
}

export class AuthService {
  static async loginWithGitHub(): Promise<AuthState> {
    if (!GITHUB_CLIENT_ID) {
      throw new Error('GitHub Client ID is not configured. Add EXPO_PUBLIC_GITHUB_CLIENT_ID to your .env file.');
    }

    try {
      const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'repo read:user',
      });
      const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

      if (result.type !== 'success' || !result.url) {
        return { isAuthenticated: false, user: null, token: null };
      }

      const code = new URL(result.url).searchParams.get('code');
      if (!code) {
        return { isAuthenticated: false, user: null, token: null };
      }

      const token = await this.exchangeCodeForToken(code);
      if (!token) {
        return { isAuthenticated: false, user: null, token: null };
      }

      await this.storeToken(token);
      const user = await this.getUser(token);
      return { isAuthenticated: !!user, user, token };
    } catch (error) {
      console.error('[AuthService] GitHub login failed:', error);
      await WebBrowser.dismissBrowser().catch(() => {});
      return { isAuthenticated: false, user: null, token: null };
    }
  }

  static async exchangeCodeForToken(code: string): Promise<string | null> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const data = await response.json();
      return data.access_token || null;
    } catch (error) {
      console.error('[AuthService] Token exchange failed:', error);
      return null;
    }
  }

  static async loginWithToken(token: string): Promise<AuthState> {
    try {
      await this.storeToken(token);
      const user = await this.getUser(token);
      return { isAuthenticated: !!user, user, token };
    } catch (error) {
      console.error('[AuthService] Login with token failed:', error);
      return { isAuthenticated: false, user: null, token: null };
    }
  }

  static async storeToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('[AuthService] Failed to store token:', error);
    }
  }

  static async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('[AuthService] Failed to get token:', error);
      return null;
    }
  }

  static async logout(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('[AuthService] Logout failed:', error);
    }
  }

  static async getUser(token: string): Promise<GitHubUser | null> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[AuthService] Failed to get user:', error);
      return null;
    }
  }

  static async checkAuthState(): Promise<AuthState> {
    const token = await this.getToken();
    if (!token) return { isAuthenticated: false, user: null, token: null };
    const user = await this.getUser(token);
    return { isAuthenticated: !!user, user, token };
  }

  static getAuthorizationHeader(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }
}

export default AuthService;
