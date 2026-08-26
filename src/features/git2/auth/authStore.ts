/**
 * Auth store — manages Git credentials and identities.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type AuthMethod = 'https_token' | 'ssh_key' | 'github_oauth' | 'gitlab_oauth' | 'gitea_oauth';

export interface HttpsCredentials {
  type: 'https_token';
  host: string;
  username: string;
  token: string;
}

export interface SshKeyCredentials {
  type: 'ssh_key';
  host: string;
  username: string;
  publicKey: string;
  privateKey: string;
  passphrase: string;
}

export interface OAuthCredentials {
  type: 'github_oauth' | 'gitlab_oauth' | 'gitea_oauth';
  host: string;
  accessToken: string;
  refreshToken?: string;
}

export type Credentials = HttpsCredentials | SshKeyCredentials | OAuthCredentials;

export interface AuthState {
  credentials: Map<string, Credentials>;
  addCredentials(cred: Credentials): Promise<void>;
  removeCredentials(host: string): Promise<void>;
  getCredentials(host: string): Credentials | undefined;
  hasCredentials(host: string): boolean;
}

const CREDENTIAL_PREFIX = 'git2:cred:';

export const useAuthStore = create<AuthState>((set, get) => ({
  credentials: new Map(),

  async addCredentials(cred: Credentials) {
    const host = cred.host;
    const key = `${CREDENTIAL_PREFIX}${host}`;
    const serialized = JSON.stringify(cred);
    await SecureStore.setItemAsync(key, serialized);
    set((state) => {
      const next = new Map(state.credentials);
      next.set(host, cred);
      return { credentials: next };
    });
  },

  async removeCredentials(host: string) {
    const key = `${CREDENTIAL_PREFIX}${host}`;
    await SecureStore.deleteItemAsync(key);
    set((state) => {
      const next = new Map(state.credentials);
      next.delete(host);
      return { credentials: next };
    });
  },

  getCredentials(host: string) {
    return get().credentials.get(host);
  },

  hasCredentials(host: string) {
    return get().credentials.has(host);
  },
}));
