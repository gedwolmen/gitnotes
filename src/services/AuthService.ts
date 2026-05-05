import AccountStorage, { StoredAccount } from './AccountStorage';

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

export type TokenValidity =
  | { ok: true; user: GitHubUser }
  | { ok: false; reason: 'invalid' | 'network' };

function profileFromUser(user: GitHubUser) {
  return {
    login: user.login,
    name: user.name ?? user.login,
    email: user.email ?? '',
    avatarUrl: user.avatar_url,
  };
}

function userFromAccount(account: StoredAccount): GitHubUser {
  return {
    id: 0,
    login: account.login,
    name: account.name,
    email: account.email,
    avatar_url: account.avatarUrl,
  };
}

export class AuthService {
  static async checkAuthState(): Promise<AuthState> {
    const token = await AccountStorage.getActiveToken();
    if (!token) return { isAuthenticated: false, user: null, token: null };
    const active = await AccountStorage.getActiveAccount();
    if (active) {
      return { isAuthenticated: true, user: userFromAccount(active), token };
    }
    const user = await this.getUser(token);
    return { isAuthenticated: !!user, user, token };
  }

  static async setToken(token: string): Promise<AuthState> {
    const user = await this.getUser(token);
    if (!user) return { isAuthenticated: false, user: null, token: null };
    await AccountStorage.addAccount(token, profileFromUser(user));
    return { isAuthenticated: true, user, token };
  }

  /**
   * Add another account without changing the currently-active one. Returns
   * the persisted account, or null if the token is invalid.
   */
  static async addAccount(token: string): Promise<StoredAccount | null> {
    const user = await this.getUser(token);
    if (!user) return null;
    const accountsBefore = await AccountStorage.listAccounts();
    const account = await AccountStorage.addAccount(token, profileFromUser(user));
    if (accountsBefore.length > 0) {
      const currentActive = await AccountStorage.getActiveAccountId();
      if (!currentActive) {
        await AccountStorage.setActiveAccountId(account.id);
      }
    }
    return account;
  }

  static async clearToken(): Promise<void> {
    const id = await AccountStorage.getActiveAccountId();
    if (id) await AccountStorage.removeAccount(id);
    await AccountStorage.deleteLegacy();
  }

  static async getToken(): Promise<string | null> {
    return AccountStorage.getActiveToken();
  }

  static async getTokenById(id: string): Promise<string | null> {
    return AccountStorage.getTokenById(id);
  }

  static async listAccounts(): Promise<StoredAccount[]> {
    return AccountStorage.listAccounts();
  }

  static async getActiveAccount(): Promise<StoredAccount | null> {
    return AccountStorage.getActiveAccount();
  }

  static async getActiveAccountId(): Promise<string | null> {
    return AccountStorage.getActiveAccountId();
  }

  static async setActiveAccount(id: string): Promise<AuthState> {
    const accounts = await AccountStorage.listAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) return { isAuthenticated: false, user: null, token: null };
    await AccountStorage.setActiveAccountId(id);
    const token = await AccountStorage.getTokenById(id);
    return {
      isAuthenticated: !!token,
      user: token ? userFromAccount(account) : null,
      token,
    };
  }

  static async removeAccount(id: string): Promise<void> {
    await AccountStorage.removeAccount(id);
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

  /**
   * Hits GET /user to check if a token is still accepted by GitHub.
   * Distinguishes auth failure (401/403) from network/server failure so we
   * don't wipe valid tokens just because the device is offline.
   */
  static async validateToken(token: string): Promise<TokenValidity> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: 'invalid' };
      }
      if (!response.ok) {
        return { ok: false, reason: 'network' };
      }
      const user = (await response.json()) as GitHubUser;
      return { ok: true, user };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  /**
   * Validates every stored account's token against GitHub. Removes accounts
   * whose tokens are explicitly rejected (401/403). Network/server errors
   * leave accounts intact.
   */
  static async validateAllAccounts(): Promise<{ removed: string[] }> {
    const accounts = await AccountStorage.listAccounts();
    const removed: string[] = [];
    for (const account of accounts) {
      const token = await AccountStorage.getTokenById(account.id);
      if (!token) {
        await AccountStorage.removeAccount(account.id);
        removed.push(account.id);
        continue;
      }
      const result = await this.validateToken(token);
      if (!result.ok && result.reason === 'invalid') {
        await AccountStorage.removeAccount(account.id);
        removed.push(account.id);
      }
    }
    return { removed };
  }

  static getAuthorizationHeader(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    };
  }
}

export default AuthService;
