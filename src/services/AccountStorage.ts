import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { GitHostKind } from './git/hostAdapters';

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
  /**
   * Which Git host this account points at. Optional for
   * backward compatibility — accounts persisted before the
   * host-adapter refactor don't have this field and are
   * defensively coerced to `'github'` on read. New accounts
   * always set it explicitly via `addAccount` opts.
   */
  hostKind?: GitHostKind;
  /**
   * Self-hosted baseUrl for the host. Only meaningful when
   * `hostKind` is `'gitea'` or `'gitlab'`. For GitHub.com the
   * field is omitted; for GitHub Enterprise the field carries
   * the enterprise base URL.
   */
  baseUrl?: string;
}

export interface AccountProfile {
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export interface AddAccountOpts {
  /**
   * Which Git host this account points at. Defaults to
   * `'github'` for backward compatibility with the GitHub-only
   * sign-in flow that's been the only path until now.
   */
  hostKind?: GitHostKind;
  /**
   * Self-hosted baseUrl. Required for self-hosted Gitea /
   * GitLab (the caller gets the URL from the user) and
   * optional for GitHub Enterprise.
   */
  baseUrl?: string;
}

function tokenKeyFor(id: string): string {
  if (Platform.OS === 'web') return `${PER_ID_TOKEN_PREFIX_WEB}${id}`;
  // SecureStore on iOS allows alphanumerics, `.`, `-`, `_`. Our ids already match.
  return `${PER_ID_TOKEN_PREFIX_NATIVE}${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/**
 * Defensive normalisation of an account read from storage.
 * - Coerces a missing / unknown `hostKind` to `'github'`
 *   (the pre-host-adapter default).
 * - Drops an invalid `hostKind` string (e.g. `'bitbucket'` from
 *   a future build that we don't yet support) and falls back
 *   to `'github'`.
 * - Strips a `baseUrl` when the host is GitHub.com (it carries
 *   no meaning there).
 * - Trims trailing slashes from `baseUrl` so the host adapter's
 *   `apiBaseFor` doesn't have to repeat the work.
 *
 * No-op for accounts that already match the normalised form,
 * so repeated reads don't allocate or rewrite the record.
 */
function normalizeAccount(account: StoredAccount): StoredAccount {
  const hostKind: GitHostKind =
    account.hostKind === 'github' ||
    account.hostKind === 'gitea' ||
    account.hostKind === 'gitlab'
      ? account.hostKind
      : 'github';
  // baseUrl handling:
  //   - GitHub.com (no enterprise) → drop the field. Applies
  //     both to records that never had a baseUrl and to records
  //     whose `hostKind` was coerced to `'github'` from an
  //     unsupported value (e.g. `'bitbucket'`).
  //   - GitHub Enterprise / Gitea / GitLab → keep the field,
  //     strip trailing slashes so the host adapter's
  //     `apiBaseFor` doesn't have to repeat the work.
  let baseUrl: string | undefined;
  if (hostKind !== 'github' && typeof account.baseUrl === 'string' && account.baseUrl.length > 0) {
    baseUrl = account.baseUrl.replace(/\/+$/, '') || undefined;
  }
  return {
    ...account,
    hostKind,
    baseUrl,
  };
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
      return parsed
        .filter((a): a is StoredAccount => typeof a?.id === 'string' && typeof a?.login === 'string')
        // Defensive coercion of legacy accounts (persisted before
        // the host-adapter refactor) so the rest of the app can
        // rely on `hostKind` being defined. We don't write the
        // coerced value back to storage here — that happens
        // lazily on the next `writeAccounts` call, which is fine
        // because every account is rewritten on add / update.
        .map((a) => normalizeAccount(a));
    } catch {
      return [];
    }
  }

  static async writeAccounts(accounts: StoredAccount[]): Promise<void> {
    // Persist normalised records so the on-disk shape always
    // carries the latest schema. No-op for fields that already
    // match the normalised form.
    const normalised = accounts.map((a) => normalizeAccount(a));
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(normalised));
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
   *
   * `opts.hostKind` and `opts.baseUrl` are persisted so the per-repo
   * dispatch in `SyncEngineService` (and the Phase D2 host picker
   * UI) can route the right adapter. Existing accounts without
   * `hostKind` (persisted before this refactor) are coerced to
   * `'github'` on read — see `normalizeAccount`.
   */
  static async addAccount(
    token: string,
    profile: AccountProfile,
    opts: AddAccountOpts = {},
  ): Promise<StoredAccount> {
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
        // Re-set host info on every update so a user signing in
        // to the same account on a different host updates the
        // persisted record.
        hostKind: opts.hostKind ?? existing.hostKind,
        baseUrl: opts.baseUrl ?? existing.baseUrl,
      };
      accounts[existingIndex] = updated;
      await writeTokenById(existing.id, token);
      await this.writeAccounts(accounts);
      const activeId = await this.getActiveAccountId();
      if (!activeId) await this.setActiveAccountId(existing.id);
      // Return the normalised form so the caller sees the
      // same shape they'd get from `getAccount` / `listAccounts`.
      return normalizeAccount(updated);
    }

    const id = generateAccountId();
    const newAccount: StoredAccount = {
      id,
      addedAt: Date.now(),
      login: profile.login,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      hostKind: opts.hostKind,
      baseUrl: opts.baseUrl,
    };
    accounts.push(newAccount);
    await writeTokenById(id, token);
    await this.writeAccounts(accounts);

    const activeId = await this.getActiveAccountId();
    if (!activeId) await this.setActiveAccountId(id);

    if (accounts.length === 1) {
      await deleteLegacyToken();
    }

    // Normalise before returning so the caller sees the same
    // shape they'd get from `getAccount` / `listAccounts`
    // (trailing slashes stripped, github.com baseUrl dropped).
    return normalizeAccount(newAccount);
  }

  /**
   * Look up a single account by id. Returns `null` if the id is
   * unknown. The returned record is normalised (`hostKind`
   * defaulted to `'github'` if missing on the legacy record).
   */
  static async getAccount(id: string): Promise<StoredAccount | null> {
    const accounts = await this.listAccounts();
    return accounts.find((a) => a.id === id) ?? null;
  }

  /**
   * Update the host info on an existing account. Used by the
   * Phase D2 host picker UI when a user re-binds a repo to a
   * different host (e.g. switches a GitHub account to a
   * self-hosted GHE instance). No-op if the account id is
   * unknown.
   */
  static async updateAccountHost(
    id: string,
    hostKind: GitHostKind,
    baseUrl?: string,
  ): Promise<StoredAccount | null> {
    const accounts = await this.listAccounts();
    const index = accounts.findIndex((a) => a.id === id);
    if (index < 0) return null;
    const updated: StoredAccount = {
      ...accounts[index],
      hostKind,
      baseUrl,
    };
    accounts[index] = updated;
    await this.writeAccounts(accounts);
    // Normalise so the caller sees the same shape they'd get
    // from `getAccount` / `listAccounts` (trailing slashes
    // stripped, github.com baseUrl dropped).
    return normalizeAccount(updated);
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
