import AsyncStorage from '@react-native-async-storage/async-storage';

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
  static async checkAuthState(): Promise<AuthState> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return { isAuthenticated: false, user: null, token: null };
    const user = await this.getUser(token);
    return { isAuthenticated: !!user, user, token };
  }

  static async setToken(token: string): Promise<AuthState> {
    const user = await this.getUser(token);
    if (!user) return { isAuthenticated: false, user: null, token: null };
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return { isAuthenticated: true, user, token };
  }

  static async clearToken(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_KEY);
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

  static getAuthorizationHeader(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }
}

export default AuthService;
