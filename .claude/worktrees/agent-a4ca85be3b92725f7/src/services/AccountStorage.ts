import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCOUNTS_KEY = '@gitnotes:accounts';
const ACTIVE_ACCOUNT_ID_KEY = '@gitnotes:active_account_id';
const PER_ID_TOKEN_PREFIX_WEB = '@gitnotes:account_token:';
const PER_ID_TOKEN_PREFIX_NATIVE = 'gitnotes_account_token_';

const LEGACY_TOKEN_KEY_WEB = '@gitnotes:github_token';
const LEGACY_TOKEN_KEY_NATIVE = 'gitnotes_github_token';

export interface StoredAccount {
  id: string;
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
  addedAt: number;
}

export interface AccountProfile {
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
}

function tokenKeyFor(id: string): string {
  if (Platform.OS === 'web') return `${PER_ID_TOKEN_PREFIX_WEB}${id}`;
  // SecureStore on iOS allows alphanumerics, `.`, `-`, `_`. Our ids already match.
  return `${PER_ID_TOKEN_PREFIX_NATIVE}${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

async function readTokenById(id: string): Promise<string | null> {
  const key = tokenKeyFor(id);
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeTokenById(id: string, token: string): Promise<void> {
  const key = tokenKeyFor(id);
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, token);
    return;
  }
  await SecureStore.setItemAsync(key, token);
}

async function deleteTokenById(id: string): Promise<void> {
  const key = tokenKeyFor(id);
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

async function readLegacyToken(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(LEGACY_TOKEN_KEY_WEB);
  try {
    const secure = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY_NATIVE);
    if (secure) return secure;
  } catch {
    // fall through
  }
  return AsyncStorage.getItem(LEGACY_TOKEN_KEY_WEB);
}

async function deleteLegacyToken(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY_WEB).catch(() => undefined);
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY_NATIVE).catch(() => undefined);
  }
}

function generateAccountId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AccountStorage {
  static async listAccounts(): Promise<StoredAccount[]> {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((a): a is StoredAccount => typeof a?.id === 'string' && typeof a?.login === 'string');
    } catch {
      return [];
    }
  }

  static async writeAccounts(accounts: StoredAccount[]): Promise<void> {
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  static async getActiveAccountId(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_ACCOUNT_ID_KEY);
  }

  static async setActiveAccountId(id: string | null): Promise<void> {
    if (id === null) {
      await AsyncStorage.removeItem(ACTIVE_ACCOUNT_ID_KEY);
      return;
    }
    await AsyncStorage.setItem(ACTIVE_ACCOUNT_ID_KEY, id);
  }

  static async getActiveAccount(): Promise<StoredAccount | null> {
    const id = await this.getActiveAccountId();
    if (!id) return null;
    const accounts = await this.listAccounts();
    return accounts.find((a) => a.id === id) ?? null;
  }

  static async getTokenById(id: string): Promise<string | null> {
    return readTokenById(id);
  }

  static async getActiveToken(): Promise<string | null> {
    const id = await this.getActiveAccountId();
    if (id) {
      const t = await readTokenById(id);
      if (t) return t;
    }
    return readLegacyToken();
  }

  /**
   * Persist a token + profile as an account. If an account with the same
   * login exists, its token + profile are replaced (no duplicate). Sets
   * active account when none is currently active. Drops the legacy token
   * after the first account is created.
   */
  static async addAccount(token: string, profile: AccountProfile): Promise<StoredAccount> {
    const accounts = await this.listAccounts();
    const existingIndex = accounts.findIndex((a) => a.login === profile.login);

    if (existingIndex >= 0) {
      const existing = accounts[existingIndex];
      const updated: StoredAccount = {
        ...existing,
        login: profile.login,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      };
      accounts[existingIndex] = updated;
      await writeTokenById(existing.id, token);
      await this.writeAccounts(accounts);
      const activeId = await this.getActiveAccountId();
      if (!activeId) await this.setActiveAccountId(existing.id);
      return updated;
    }

    const id = generateAccountId();
    const newAccount: StoredAccount = {
      id,
      addedAt: Date.now(),
      login: profile.login,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    };
    accounts.push(newAccount);
    await writeTokenById(id, token);
    await this.writeAccounts(accounts);

    const activeId = await this.getActiveAccountId();
    if (!activeId) await this.setActiveAccountId(id);

    if (accounts.length === 1) {
      await deleteLegacyToken();
    }

    return newAccount;
  }

  static async removeAccount(id: string): Promise<void> {
    const accounts = await this.listAccounts();
    const remaining = accounts.filter((a) => a.id !== id);
    await this.writeAccounts(remaining);
    await deleteTokenById(id);
    const activeId = await this.getActiveAccountId();
    if (activeId === id) {
      await this.setActiveAccountId(remaining[0]?.id ?? null);
    }
  }

  static async clearAll(): Promise<void> {
    const accounts = await this.listAccounts();
    await Promise.all(accounts.map((a) => deleteTokenById(a.id)));
    await this.writeAccounts([]);
    await this.setActiveAccountId(null);
    await deleteLegacyToken();
  }

  static async deleteLegacy(): Promise<void> {
    await deleteLegacyToken();
  }
}

export default AccountStorage;
