import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type {
  Credential as ContractCredential,
  GithubClassicPatCredential,
  GithubFineGrainedPatCredential,
  GenericPatCredential,
  SshCredential,
  Provider,
} from '../contracts';
import { parseCanonicalRepoId } from '../contracts';

const isNative = Platform.OS !== 'web';

const CREDENTIAL_PREFIX = 'gitnotes_cred_';
const REFRESH_PREFIX = 'gitnotes_refresh_';
const EXPIRY_PREFIX = 'gitnotes_expiry_';
const OAUTH_META_PREFIX = 'gitnotes_oauth_meta_';

function sanitizeKeySuffix(repoId: string): string {
  return repoId.replace(/[^A-Za-z0-9_]/g, '_');
}

function credKey(repoId: string): string {
  return `${CREDENTIAL_PREFIX}${sanitizeKeySuffix(repoId)}`;
}

function refreshKey(repoId: string): string {
  return `${REFRESH_PREFIX}${sanitizeKeySuffix(repoId)}`;
}

function expiryKey(repoId: string): string {
  return `${EXPIRY_PREFIX}${sanitizeKeySuffix(repoId)}`;
}

function oauthMetaKey(repoId: string): string {
  return `${OAUTH_META_PREFIX}${sanitizeKeySuffix(repoId)}`;
}

interface OAuthMeta {
  provider: Provider;
  instanceBaseUrl: string | null;
}

const inflightRefresh = new Map<string, Promise<RefreshOutcome>>();

interface RefreshResult {
  accessToken: string;
  expiresIn: number;
  expiresAt: string | null;
  refreshToken?: string | null;
}

type RefreshOutcome =
  | { ok: true; result: RefreshResult }
  | { ok: false; code: string; message: string; retryAfterSecs?: number | null };

export interface OAuthCredential {
  kind: 'OAuth';
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string[] | null;
  provider: Provider;
  instanceBaseUrl: string | null;
}

export type StoredCredential = ContractCredential | OAuthCredential;

export type DoneClaim =
  | { ok: true; credential: StoredCredential }
  | { ok: false; reason: 'credential_not_found' }
  | { ok: false; reason: 'backend_unavailable'; retryAfterSecs: number | null; credential?: StoredCredential }
  | { ok: false; reason: 'reauth_required'; reauthCause: ReauthReason }
  | { ok: false; reason: 'refresh_rejected'; message: string }
  | { ok: false; reason: 'secure_store_error'; cause: string };

export type ReauthReason =
  | 'oauth_refresh_failed'
  | 'ssh_key_invalid'
  | 'pat_revoked'
  | 'session_expired'
  | 'consent_required';

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn('[CredentialStore] SecureStore.getItemAsync failed:', err);
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn('[CredentialStore] SecureStore.setItemAsync failed:', err);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn('[CredentialStore] SecureStore.deleteItemAsync failed:', err);
  }
}

async function webStorageGet(key: string): Promise<string | null> {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(key);
}

async function webStorageSet(key: string, value: string): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(key, value);
}

async function webStorageDelete(key: string): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(key);
}

const storage = {
  async get(key: string): Promise<string | null> {
    return isNative ? secureGet(key) : webStorageGet(key);
  },
  async set(key: string, value: string): Promise<void> {
    return isNative ? secureSet(key, value) : webStorageSet(key, value);
  },
  async delete(key: string): Promise<void> {
    return isNative ? secureDelete(key) : webStorageDelete(key);
  },
};

export function isGitHubClassicPat(token: string): boolean {
  return token.startsWith('ghp_');
}

export function isGitHubFineGrainedPat(token: string): boolean {
  return token.startsWith('github_pat_');
}

export function isGitLabPat(token: string): boolean {
  return token.startsWith('glpat-') || token.startsWith('gitlab_pat_');
}

const REFRESH_GRACE_SECONDS = 60;

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiryMs = new Date(expiresAt).getTime();
  const graceMs = REFRESH_GRACE_SECONDS * 1000;
  return expiryMs - Date.now() < graceMs;
}

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) <= new Date();
}

const BACKEND_BASE_URL = 'https://api.gitnotes.app';

async function refreshOAuthToken(
  refreshToken: string,
  provider: string,
  instanceBaseUrl: string | null,
): Promise<RefreshOutcome> {
  const url = `${BACKEND_BASE_URL}/api/v1/auth/${provider}/refresh`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
        provider,
        instanceBaseUrl,
      }),
    });
  } catch (networkError) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: networkError instanceof Error ? networkError.message : 'Network error',
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'REAUTH_REQUIRED', message: 'Refresh token rejected' };
  }

  if (response.status >= 500) {
    let retryAfter: number | null = null;
    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      retryAfter = parseInt(retryAfterHeader, 10) || null;
    }
    return {
      ok: false,
      code: 'BACKEND_UNAVAILABLE',
      message: `Backend error ${response.status}`,
      retryAfterSecs: retryAfter,
    };
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json?.message) message = json.message;
    } catch {
      // ignore parse errors
    }
    return { ok: false, code: 'REFRESH_FAILED', message };
  }

  try {
    const json = await response.json();
    return {
      ok: true,
      result: {
        accessToken: json.accessToken,
        expiresIn: json.expiresIn ?? 0,
        expiresAt: json.expiresAt ?? null,
        refreshToken: json.refreshToken ?? null,
      },
    };
  } catch (parseError) {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: parseError instanceof Error ? parseError.message : 'Parse error',
    };
  }
}

async function doRefresh(
  repoId: string,
  refreshToken: string,
): Promise<RefreshOutcome> {
  let provider: Provider = 'github';
  let instanceBaseUrl: string | null = null;

  // Derive provider from canonical repoId format: provider:instanceKey/owner/repo
  const parsed = parseCanonicalRepoId(repoId);
  if (parsed) {
    provider = parsed.provider;
  }

  // Try to get instanceBaseUrl from stored OAuth metadata
  const metaRaw = await storage.get(oauthMetaKey(repoId));
  if (metaRaw) {
    try {
      const meta: OAuthMeta = JSON.parse(metaRaw);
      instanceBaseUrl = meta.instanceBaseUrl;
      // If we didn't get provider from repoId, try from metadata
      if (!parsed) {
        provider = meta.provider;
      }
    } catch {
      // ignore parse errors
    }
  }

  return refreshOAuthToken(refreshToken, provider, instanceBaseUrl);
}

function toInternalCredential(stored: StoredCredential): { kind: string; username?: string; privateKey?: string; publicKey?: string | null; passphrase?: string | null; token?: string } {
  const c = stored as ContractCredential;
  const kind: string = c.kind;
  if (kind === 'ssh' || kind === 'SSH') {
    const ssh = c as SshCredential;
    return {
      kind: 'SSH',
      username: 'git',
      privateKey: ssh.privateKey,
      publicKey: ssh.publicKey ?? null,
      passphrase: ssh.passphrase ?? null,
    };
  }
  if (kind === 'github_classic_pat' || kind === 'github_fine_grained_pat' || kind === 'pat') {
    return {
      kind: 'token',
      username: 'x-access-token',
      token: (stored as Exclude<ContractCredential, SshCredential>).token,
    };
  }
  return { kind: 'token', username: 'git', token: '' };
}

async function handleOAuthCredential(
  repoId: string,
  credential: OAuthCredential,
): Promise<DoneClaim> {
  if (!isExpiringSoon(credential.expiresAt) && !isTokenExpired(credential.expiresAt)) {
    return { ok: true, credential };
  }

  const existing = inflightRefresh.get(repoId);
  if (existing) {
    const result = await existing;
    return await oauthResultToDoneClaim(result, repoId, credential);
  }

  const refreshToken = await storage.get(refreshKey(repoId));
  if (!refreshToken) {
    return {
      ok: false,
      reason: 'reauth_required',
      reauthCause: 'session_expired',
    };
  }

  const refreshPromise = doRefresh(repoId, refreshToken);
  inflightRefresh.set(repoId, refreshPromise);

  try {
    const result = await refreshPromise;
    return await oauthResultToDoneClaim(result, repoId, credential);
  } finally {
    inflightRefresh.delete(repoId);
  }
}

async function oauthResultToDoneClaim(
  result: RefreshOutcome,
  repoId: string,
  cachedCredential: OAuthCredential,
): Promise<DoneClaim> {
  if (!result.ok) {
    if (result.code === 'REAUTH_REQUIRED') {
      await deleteAllSecrets(repoId);
      return {
        ok: false,
        reason: 'reauth_required',
        reauthCause: 'oauth_refresh_failed',
      };
    }

    if (result.code === 'BACKEND_UNAVAILABLE') {
      return {
        ok: false,
        reason: 'backend_unavailable',
        retryAfterSecs: result.retryAfterSecs ?? null,
        credential: cachedCredential,
      };
    }

    return {
      ok: false,
      reason: 'refresh_rejected',
      message: result.message,
    };
  }

  const rotatedRefreshToken = result.result.refreshToken ?? cachedCredential.refreshToken;

  const updatedCredential: OAuthCredential = {
    kind: 'OAuth',
    accessToken: result.result.accessToken,
    refreshToken: rotatedRefreshToken,
    expiresAt: result.result.expiresAt,
    scopes: cachedCredential.scopes,
    provider: cachedCredential.provider,
    instanceBaseUrl: cachedCredential.instanceBaseUrl,
  };

  // Persist all credential data atomically before returning
  await Promise.all([
    storage.set(credKey(repoId), JSON.stringify(updatedCredential)),
    storage.set(refreshKey(repoId), rotatedRefreshToken),
    result.result.expiresAt ? storage.set(expiryKey(repoId), result.result.expiresAt) : Promise.resolve(),
    storage.set(oauthMetaKey(repoId), JSON.stringify({
      provider: cachedCredential.provider,
      instanceBaseUrl: cachedCredential.instanceBaseUrl,
    })),
  ]);

  return { ok: true, credential: updatedCredential };
}

export async function save(
  repoId: string,
  credential: StoredCredential,
): Promise<void> {
  const key = credKey(repoId);
  await storage.set(key, JSON.stringify(credential));

  if ((credential as OAuthCredential).kind === 'OAuth') {
    const oauth = credential as OAuthCredential;
    if (oauth.refreshToken) {
      await storage.set(refreshKey(repoId), oauth.refreshToken);
    }
    if (oauth.expiresAt) {
      await storage.set(expiryKey(repoId), oauth.expiresAt);
    }
    // Persist OAuth metadata for provider/instance routing during refresh
    await storage.set(oauthMetaKey(repoId), JSON.stringify({
      provider: oauth.provider,
      instanceBaseUrl: oauth.instanceBaseUrl,
    }));
  } else if ((credential as GithubFineGrainedPatCredential).kind === 'github_fine_grained_pat') {
    const fgPat = credential as GithubFineGrainedPatCredential;
    if (fgPat.expiresAt) {
      await storage.set(expiryKey(repoId), fgPat.expiresAt);
    }
    await storage.delete(refreshKey(repoId));
    await storage.delete(oauthMetaKey(repoId));
  } else {
    await storage.delete(refreshKey(repoId));
    await storage.delete(expiryKey(repoId));
    await storage.delete(oauthMetaKey(repoId));
  }
}

export async function get(repoId: string): Promise<DoneClaim> {
  const key = credKey(repoId);
  const raw = await storage.get(key);

  if (!raw) {
    return { ok: false, reason: 'credential_not_found' };
  }

  let credential: StoredCredential;
  try {
    credential = JSON.parse(raw) as StoredCredential;
  } catch {
    return { ok: false, reason: 'credential_not_found' };
  }

  if ((credential as OAuthCredential).kind === 'OAuth') {
    return handleOAuthCredential(repoId, credential as OAuthCredential);
  }

  if ((credential as GithubFineGrainedPatCredential).kind === 'github_fine_grained_pat') {
    const fgPat = credential as GithubFineGrainedPatCredential;
    if (fgPat.expiresAt && (isExpiringSoon(fgPat.expiresAt) || isTokenExpired(fgPat.expiresAt))) {
      return {
        ok: false,
        reason: 'reauth_required',
        reauthCause: 'pat_revoked',
      };
    }
  }

  return { ok: true, credential };
}

export async function deleteAllSecrets(repoId: string): Promise<void> {
  inflightRefresh.delete(repoId);
  await Promise.all([
    storage.delete(credKey(repoId)),
    storage.delete(refreshKey(repoId)),
    storage.delete(expiryKey(repoId)),
    storage.delete(oauthMetaKey(repoId)),
  ]);
}

export async function clearEngineCredential(_repoId: string): Promise<void> {
  // Handled by GitEngine.clearEngineCredential()
}

export async function importToken(
  repoId: string,
  token: string,
  scopes?: readonly string[] | null,
  expiresAt?: string | null,
  refreshToken?: string | null,
  provider?: Provider,
  instanceBaseUrl?: string | null,
): Promise<void> {
  if (isGitHubClassicPat(token) || isGitLabPat(token)) {
    const cred: GithubClassicPatCredential = {
      kind: 'github_classic_pat',
      token,
      scopes: scopes ? [...scopes] : [],
      label: null,
    };
    await save(repoId, cred);
  } else if (isGitHubFineGrainedPat(token)) {
    const cred: GithubFineGrainedPatCredential = {
      kind: 'github_fine_grained_pat',
      token,
      ownerLogin: '',
      repositories: { all: '*' },
      expiresAt: expiresAt ?? null,
      requiresPreflight: false,
      label: null,
    };
    await save(repoId, cred);
  } else if (refreshToken && isNative) {
    const parsed = parseCanonicalRepoId(repoId);
    const derivedProvider: Provider = provider ?? parsed?.provider ?? 'github';
    const derivedInstanceBaseUrl: string | null = instanceBaseUrl ?? null;
    const cred: OAuthCredential = {
      kind: 'OAuth',
      accessToken: token,
      refreshToken,
      expiresAt: expiresAt ?? null,
      scopes: scopes ? [...scopes] : null,
      provider: derivedProvider,
      instanceBaseUrl: derivedInstanceBaseUrl,
    };
    await save(repoId, cred);
  } else {
    const cred: GenericPatCredential = {
      kind: 'pat',
      token,
      expiresAt: expiresAt ?? null,
      refreshToken: isNative ? (refreshToken ?? null) : null,
      label: null,
    };
    await save(repoId, cred);
  }
}

export { toInternalCredential, deleteAllSecrets as delete };
