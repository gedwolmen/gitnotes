import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { GitHostProvider } from './git/GitHost';

const ACCOUNTS_KEY = '@gitnotes:accounts';
const HOSTS_KEY = '@gitnotes:host_connections';
const ACTIVE_HOST_KEY = '@gitnotes:active_host_id';
const ACTIVE_ACCOUNT_ID_KEY = '@gitnotes:active_account_id';
const PER_ID_TOKEN_PREFIX_WEB = '@gitnotes:account_token:';
const PER_HOST_TOKEN_PREFIX_WEB = '@gitnotes:host_token:';
const PER_ID_TOKEN_PREFIX_NATIVE = 'gitnotes_account_token_';
const PER_HOST_TOKEN_PREFIX_NATIVE = 'gitnotes_host_token_';

const LEGACY_TOKEN_KEY_WEB = '@gitnotes:github_token';
const LEGACY_TOKEN_KEY_NATIVE = 'gitnotes_github_token';

export interface StoredAccount {
  id: string;
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
  addedAt: number;
  /**
   * ids of `HostConnection`s that belong to this account. Always present
   * (defaulted to `[]` for legacy rows). One account may be connected to
   * several git hosts (e.g. personal GitHub + work self-hosted GitLab).
   */
  hostIds: string[];
}

export interface AccountProfile {
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export interface HostConnection {
  /** Stable id; format `<accountId>:<provider>:<instanceKey>`. */
  id: string;
  accountId: string;
  provider: GitHostProvider;
  /** Self-hosted instance base URL. `null` for SaaS defaults (github.com / gitlab.com / gitea.com / codeberg.org). */
  instanceBaseUrl: string | null;
  /** User login *on this host* (can differ from `account.login` across providers). */
  hostLogin: string;
  /** Provider-side numeric id. */
  hostUserId: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  addedAt: number;
}

/** Composite id used as a token key suffix. */
export function makeHostId(
  accountId: string,
  provider: GitHostProvider,
  instanceBaseUrl: string | null,
): string {
  const instanceKey = (instanceBaseUrl ?? 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${accountId}:${provider}:${instanceKey}`;
}

function tokenKeyFor(id: string): string {
  if (Platform.OS === 'web') return `${PER_ID_TOKEN_PREFIX_WEB}${id}`;
  // SecureStore on iOS allows alphanumerics, `.`, `-`, `_`. Our ids already match.
  return `${PER_ID_TOKEN_PREFIX_NATIVE}${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function hostTokenKeyFor(hostId: string): string {
  if (Platform.OS === 'web') return `${PER_HOST_TOKEN_PREFIX_WEB}${hostId}`;
  return `${PER_HOST_TOKEN_PREFIX_NATIVE}${hostId.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

async function readTokenById(id: string): Promise<string | null> {
  const key = tokenKeyFor(id);
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn('[AccountStorage] Failed to read token:', error);
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

async function readHostToken(hostId: string): Promise<string | null> {
  return readTokenById(hostTokenKeyFor(hostId));
}

async function writeHostToken(hostId: string, token: string): Promise<void> {
  return writeTokenById(hostTokenKeyFor(hostId), token);
}

async function deleteHostToken(hostId: string): Promise<void> {
  return deleteTokenById(hostTokenKeyFor(hostId));
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

async function listHostConnections(): Promise<HostConnection[]> {
  const raw = await AsyncStorage.getItem(HOSTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is HostConnection =>
        typeof h?.id === 'string' &&
        typeof h?.accountId === 'string' &&
        typeof h?.provider === 'string' &&
        typeof h?.hostLogin === 'string',
    );
  } catch {
    return [];
  }
}

async function writeHostConnections(connections: HostConnection[]): Promise<void> {
  await AsyncStorage.setItem(HOSTS_KEY, JSON.stringify(connections));
}

const sanitizeAccount = (acc: StoredAccount): StoredAccount => ({
  ...acc,
  hostIds: Array.isArray(acc.hostIds) ? acc.hostIds : [],
});

export class AccountStorage {
  // ── Accounts ─────────────────────────────────────────────────────────

  static async listAccounts(): Promise<StoredAccount[]> {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (a): a is StoredAccount =>
            typeof a?.id === 'string' && typeof a?.login === 'string',
        )
        .map(sanitizeAccount);
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

  static async getActiveHostId(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_HOST_KEY);
  }

  static async setActiveHostId(id: string | null): Promise<void> {
    if (id === null) {
      await AsyncStorage.removeItem(ACTIVE_HOST_KEY);
      return;
    }
    await AsyncStorage.setItem(ACTIVE_HOST_KEY, id);
  }

  /**
   * @deprecated used by legacy single-host flow; `connectHost` is the
   * preferred entry point. Kept for back-compat.
   */
  static async getActiveAccount(): Promise<StoredAccount | null> {
    const id = await this.getActiveAccountId();
    if (!id) return null;
    const accounts = await this.listAccounts();
    return accounts.find((a) => a.id === id) ?? null;
  }

  static async getTokenById(id: string): Promise<string | null> {
    return readTokenById(id);
  }

  /**
   * Returns the token for the currently active account, falling back to the
   * legacy single-token storage for installs that haven't migrated yet.
   */
  static async getActiveToken(): Promise<string | null> {
    const activeHostId = await this.getActiveHostId();
    if (activeHostId) {
      const hostToken = await readHostToken(activeHostId);
      if (hostToken) return hostToken;
    }
    const id = await this.getActiveAccountId();
    if (id) {
      const t = await readTokenById(id);
      if (t) return t;
    }
    return readLegacyToken();
  }

  static async getActiveHostConnection(): Promise<HostConnection | null> {
    const hostId = await this.getActiveHostId();
    if (!hostId) return null;
    const hosts = await listHostConnections();
    return hosts.find((h) => h.id === hostId) ?? null;
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
        hostIds: existing.hostIds ?? [],
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
      hostIds: [],
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

    // also remove any host connections bound to this account
    const hosts = await listHostConnections();
    const remainingHosts = hosts.filter((h) => h.accountId !== id);
    for (const host of hosts) {
      if (host.accountId === id) {
        await deleteHostToken(host.id);
      }
    }
    await writeHostConnections(remainingHosts);

    // SECURITY: clear AI provider API keys from SecureStore and wipe the
    // AI settings blob so a re-added account can't inherit the previous
    // user's provider keys (bug-hunt 2026-08).
    await this.clearAccountAiState();

    const activeId = await this.getActiveAccountId();
    if (activeId === id) {
      await this.setActiveAccountId(remaining[0]?.id ?? null);
    }
    const activeHostId = await this.getActiveHostId();
    if (activeHostId && !remainingHosts.some((h) => h.id === activeHostId)) {
      await this.setActiveHostId(remainingHosts[0]?.id ?? null);
    }
  }

  private static async clearAccountAiState(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem('ai-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        const providers: Array<{ id?: string }> = Array.isArray(parsed?.providers) ? parsed.providers : [];
        await Promise.all(
          providers
            .filter((p): p is { id: string } => typeof p?.id === 'string')
            .map((p) => SecureStore.deleteItemAsync(`ai-provider-key-${p.id}`).catch(() => undefined)),
        );
      }
    } catch { /* best-effort */ }
    try {
      await AsyncStorage.removeItem('ai-settings');
    } catch { /* best-effort */ }
  }

  static async clearAll(): Promise<void> {
    const accounts = await this.listAccounts();
    await Promise.all(accounts.map((a) => deleteTokenById(a.id)));
    const hosts = await listHostConnections();
    await Promise.all(hosts.map((h) => deleteHostToken(h.id)));
    await writeHostConnections([]);
    await this.writeAccounts([]);
    await this.setActiveAccountId(null);
    await this.setActiveHostId(null);
    await deleteLegacyToken();
  }

  // ── Host connections ─────────────────────────────────────────────────

  static async listHostConnections(): Promise<HostConnection[]> {
    return listHostConnections();
  }

  /**
   * Adds a new host connection. If a connection already exists for the same
   * (accountId, provider, instanceBaseUrl) tuple its profile is updated and
   * its token is replaced; otherwise a fresh connection is created.
   *
   * Returns the resulting `HostConnection`. The caller is responsible for
   * appending its id to the owning account's `hostIds`.
   */
  static async upsertHostConnection(
    connection: Omit<HostConnection, 'id' | 'addedAt'> & { token: string },
  ): Promise<HostConnection> {
    const hosts = await listHostConnections();
    const accounts = await this.listAccounts();
    const account = accounts.find((a) => a.id === connection.accountId);
    if (!account) {
      throw new Error(`Cannot attach host to unknown account ${connection.accountId}.`);
    }

    const id = makeHostId(connection.accountId, connection.provider, connection.instanceBaseUrl);
    const existingIndex = hosts.findIndex((h) => h.id === id);

    const persisted: HostConnection = {
      id,
      accountId: connection.accountId,
      provider: connection.provider,
      instanceBaseUrl: connection.instanceBaseUrl,
      hostLogin: connection.hostLogin,
      hostUserId: connection.hostUserId,
      name: connection.name,
      email: connection.email,
      avatarUrl: connection.avatarUrl,
      addedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      hosts[existingIndex] = { ...hosts[existingIndex], ...persisted, id };
    } else {
      hosts.push(persisted);
    }

    await writeHostConnections(hosts);
    await writeHostToken(id, connection.token);

    if (!account.hostIds.includes(id)) {
      account.hostIds = [...account.hostIds, id];
      const accountIndex = accounts.findIndex((a) => a.id === account.id);
      accounts[accountIndex] = account;
      await this.writeAccounts(accounts);
    }

    return persisted;
  }

  static async getHostConnection(hostId: string): Promise<HostConnection | null> {
    const hosts = await listHostConnections();
    return hosts.find((h) => h.id === hostId) ?? null;
  }

  static async getHostToken(hostId: string): Promise<string | null> {
    return readHostToken(hostId);
  }

  static async removeHostConnection(hostId: string): Promise<void> {
    const hosts = await listHostConnections();
    const remaining = hosts.filter((h) => h.id !== hostId);
    await writeHostConnections(remaining);
    await deleteHostToken(hostId);

    const accounts = await this.listAccounts();
    let mutated = false;
    const updated = accounts.map((a) => {
      if (a.hostIds.includes(hostId)) {
        mutated = true;
        return { ...a, hostIds: a.hostIds.filter((hid) => hid !== hostId) };
      }
      return a;
    });

    // Drop accounts whose host list is now empty — they have nothing to
    // manage, so leaving them as ghost rows in Settings just shows a stale
    // account row (avatar + name) that only goes away on app reload.
    const accountsToKeep = updated.filter((a) => a.hostIds.length > 0);
    const removedAccountIds = updated
      .filter((a) => a.hostIds.length === 0)
      .map((a) => a.id);
    if (removedAccountIds.length > 0) {
      mutated = true;
    }
    if (mutated) await this.writeAccounts(accountsToKeep);

    // Migrate the active pointers so they don't dangle onto deleted rows.
    const activeAccountId = await this.getActiveAccountId();
    const activeHostId = await this.getActiveHostId();
    const activeAccountWasRemoved =
      !!activeAccountId && removedAccountIds.includes(activeAccountId);

    if (activeAccountWasRemoved) {
      const next = accountsToKeep[0];
      if (next) {
        await this.setActiveAccountId(next.id);
        await this.setActiveHostId(next.hostIds[0] ?? null);
      } else {
        await this.setActiveAccountId(null);
        await this.setActiveHostId(null);
      }
    } else if (activeHostId === hostId) {
      // The disconnected host was active but the owning account is still
      // alive — pick the first remaining host on that account.
      const stillActive = accountsToKeep.find((a) => a.id === activeAccountId);
      await this.setActiveHostId(stillActive?.hostIds[0] ?? null);
    }

    // SECURITY: clear AI keys only when the account is actually dropped
    // (not on every host disconnect), mirroring removeAccount.
    if (removedAccountIds.length > 0) {
      await this.clearAccountAiState();
    }
  }

  // ── Legacy ───────────────────────────────────────────────────────────

  static async deleteLegacy(): Promise<void> {
    await deleteLegacyToken();
  }

  // ── Internal helpers used by tests ───────────────────────────────────

  /** @internal raw write — used by migration to rewrite the accounts list. */
  static async _rawWriteAccounts(accounts: StoredAccount[]): Promise<void> {
    await this.writeAccounts(accounts);
  }

  /** @internal raw write — used by migration to add host connections. */
  static async _rawWriteHostConnections(connections: HostConnection[]): Promise<void> {
    await writeHostConnections(connections);
  }
}

export default AccountStorage;
