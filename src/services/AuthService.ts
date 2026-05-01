import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = '@gitnotes:github_token';
const SECURE_KEY = 'gitnotes_github_token';

async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  try {
    const secure = await SecureStore.getItemAsync(SECURE_KEY);
    if (secure) return secure;
    // One-time migration from legacy AsyncStorage location.
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(SECURE_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
      return legacy;
    }
    return null;
  } catch (err) {
    console.error('[AuthService] readToken error:', err);
    return null;
  }
}

async function writeToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(SECURE_KEY, token);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

async function deleteToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SECURE_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

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
    const token = await readToken();
    if (!token) return { isAuthenticated: false, user: null, token: null };
    const user = await this.getUser(token);
    return { isAuthenticated: !!user, user, token };
  }

  static async setToken(token: string): Promise<AuthState> {
    const user = await this.getUser(token);
    if (!user) return { isAuthenticated: false, user: null, token: null };
    await writeToken(token);
    return { isAuthenticated: true, user, token };
  }

  static async clearToken(): Promise<void> {
    await deleteToken();
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
