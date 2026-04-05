import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID';
const GITHUB_CLIENT_SECRET = 'YOUR_GITHUB_CLIENT_SECRET';

const TOKEN_KEY = '@gitnotes:github_token';

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
  private static getRedirectUri(): string {
    return Linking.createURL('oauth/github');
  }

  private static getAuthUrl(): string {
    const redirectUri = this.getRedirectUri();
    return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;
  }

  static async loginWithBrowser(): Promise<AuthState> {
    try {
      const redirectUri = this.getRedirectUri();
      const authUrl = this.getAuthUrl();

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUri
      );

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        
        if (code) {
          const token = await this.exchangeCodeForToken(code);
          
          if (token) {
            await this.storeToken(token);
            const user = await this.getUser(token);
            
            return {
              isAuthenticated: true,
              user,
              token,
            };
          }
        }
      }

      return {
        isAuthenticated: false,
        user: null,
        token: null,
      };
    } catch (error) {
      console.error('[AuthService] Login with browser failed:', error);
      return {
        isAuthenticated: false,
        user: null,
        token: null,
      };
    }
  }

  private static async exchangeCodeForToken(code: string): Promise<string | null> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data = await response.json();
      return data.access_token || null;
    } catch (error) {
      console.error('[AuthService] Token exchange failed:', error);
      return null;
    }
  }

  private static async storeToken(token: string): Promise<void> {
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
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[AuthService] Failed to get user:', error);
      return null;
    }
  }

  static async checkAuthState(): Promise<AuthState> {
    const token = await this.getToken();
    
    if (!token) {
      return {
        isAuthenticated: false,
        user: null,
        token: null,
      };
    }

    const user = await this.getUser(token);
    
    return {
      isAuthenticated: !!user,
      user,
      token,
    };
  }

  static getAuthorizationHeader(token: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    };
  }
}

export default AuthService;