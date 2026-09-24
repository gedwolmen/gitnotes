/**
 * Shared typed contracts for the Git host authentication API.
 *
 * These types mirror the Rust backend contracts in `gitnotes-backend/src/contracts.rs`.
 * All contracts live under the `/api/v1` namespace. Types are serialized to/from JSON.
 */

import type { GitHostProvider } from './GitHost';

export const API_VERSION = '/api/v1';

// Provider capabilities

export type Provider = GitHostProvider;

export type ProviderApiVersion = 'v3' | 'v4' | 'v1';

export interface ProviderCapabilities {
  provider: Provider;
  apiVersion: ProviderApiVersion;
  supportsOAuthRefresh: boolean;
  supportsFineGrainedPat: boolean;
  supportsSsh: boolean;
  supportsCapabilityHeaders: boolean;
  instanceBaseUrl: string | null;
}

export const PROVIDER_API_BASES: Record<Provider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
  gitea: 'https://gitea.com/api/v1',
  forgejo: 'https://codeberg.org/api/v1',
};

export const DEFAULT_CAPABILITIES: Record<Provider, Omit<ProviderCapabilities, 'instanceBaseUrl'>> = {
  github: {
    provider: 'github',
    apiVersion: 'v3',
    supportsOAuthRefresh: true,
    supportsFineGrainedPat: true,
    supportsSsh: true,
    supportsCapabilityHeaders: true,
  },
  gitlab: {
    provider: 'gitlab',
    apiVersion: 'v4',
    supportsOAuthRefresh: true,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
  gitea: {
    provider: 'gitea',
    apiVersion: 'v1',
    supportsOAuthRefresh: false,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
  forgejo: {
    provider: 'forgejo',
    apiVersion: 'v1',
    supportsOAuthRefresh: false,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
};

export function makeCapabilities(
  provider: Provider,
  instanceBaseUrl: string | null,
): ProviderCapabilities {
  return { ...DEFAULT_CAPABILITIES[provider], instanceBaseUrl };
}

// Credentials

export const CREDENTIAL_KIND = 'kind' as const;

export type CredentialKindValue = 'github_classic_pat' | 'github_fine_grained_pat' | 'pat' | 'ssh';

export interface GithubClassicPatCredential {
  kind: 'github_classic_pat';
  token: string;
  scopes: string[];
  label: string | null;
}

export interface GithubFineGrainedPatCredential {
  kind: 'github_fine_grained_pat';
  token: string;
  ownerLogin: string;
  repositories: string[] | { all: string };
  expiresAt: string | null;
  requiresPreflight: boolean;
  label: string | null;
}

export interface GenericPatCredential {
  kind: 'pat';
  token: string;
  expiresAt: string | null;
  refreshToken: string | null;
  label: string | null;
}

export interface SshCredential {
  kind: 'ssh';
  privateKey: string;
  publicKey: string;
  passphrase: string | null;
  fingerprint: string | null;
}

export type Credential =
  | GithubClassicPatCredential
  | GithubFineGrainedPatCredential
  | GenericPatCredential
  | SshCredential;

export function isGitHubFineGrainedPat(cred: Credential): boolean {
  return cred.kind === 'github_fine_grained_pat';
}

export function isSsh(cred: Credential): boolean {
  return cred.kind === 'ssh';
}

export function requiresPreflight(cred: Credential): boolean {
  if (cred.kind === 'github_fine_grained_pat') {
    return cred.requiresPreflight;
  }
  return false;
}

export function isExpired(cred: Credential): boolean {
  if (cred.kind === 'github_fine_grained_pat' && cred.expiresAt) {
    return new Date(cred.expiresAt) <= new Date();
  }
  if (cred.kind === 'pat' && cred.expiresAt) {
    return new Date(cred.expiresAt) <= new Date();
  }
  return false;
}

export function displayLabel(cred: Credential): string {
  if (cred.kind === 'github_classic_pat' && cred.label) return cred.label;
  if (cred.kind === 'github_fine_grained_pat' && cred.label) return cred.label;
  if (cred.kind === 'pat' && cred.label) return cred.label;
  if (cred.kind === 'github_fine_grained_pat') return 'GitHub Fine-Grained PAT';
  if (cred.kind === 'github_classic_pat') return 'GitHub Classic PAT';
  if (cred.kind === 'pat') return 'Personal Access Token';
  if (cred.kind === 'ssh') return 'SSH Key';
  return 'Unknown Credential';
}

export function parseCredentialKind(value: unknown): CredentialKindValue | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind !== 'string') return null;
  const valid = ['github_classic_pat', 'github_fine_grained_pat', 'pat', 'ssh'];
  if (!valid.includes(obj.kind)) return null;
  return obj.kind as CredentialKindValue;
}

// Repository

export interface CanonicalRepoId {
  version: number;
  id: string;
  provider: Provider;
  instanceKey: string;
  owner: string;
  repo: string;
  displayName: string;
}

export function computeInstanceKey(instanceBaseUrl: string | null): string {
  if (!instanceBaseUrl) return 'default';
  const normalized = instanceBaseUrl.replace(/\/+$/, '');
  const withoutScheme = normalized.replace(/^https?:\/\//, '');
  const portIdx = withoutScheme.indexOf(':');
  if (portIdx !== -1) {
    const host = withoutScheme.slice(0, portIdx).toLowerCase();
    const rest = withoutScheme.slice(portIdx + 1);
    const slashIdx = rest.indexOf('/');
    const port = slashIdx !== -1 ? rest.slice(0, slashIdx) : rest;
    return `${host}_port_${port}`;
  }
  const slashIdx = withoutScheme.indexOf('/');
  return slashIdx !== -1 ? withoutScheme.slice(0, slashIdx).toLowerCase() : withoutScheme.toLowerCase();
}

export function makeCanonicalRepoId(
  provider: Provider,
  instanceKey: string,
  owner: string,
  repo: string,
): string {
  return `${provider}:${instanceKey}/${owner}/${repo}`;
}

function parseProviderKey(key: string): Provider | null {
  const map: Record<string, Provider> = {
    github: 'github',
    gitlab: 'gitlab',
    gitea: 'gitea',
    forgejo: 'forgejo',
  };
  return map[key] ?? null;
}

export function parseCanonicalRepoId(id: string): {
  provider: Provider;
  instanceKey: string;
  owner: string;
  repo: string;
} | null {
  const colonIdx = id.indexOf(':');
  if (colonIdx === -1) return null;
  const providerStr = id.slice(0, colonIdx);
  const provider = parseProviderKey(providerStr);
  if (!provider) return null;

  const remainder = id.slice(colonIdx + 1);
  const slashIdx = remainder.indexOf('/');
  if (slashIdx === -1) return null;
  const instanceKey = remainder.slice(0, slashIdx);
  const afterInstance = remainder.slice(slashIdx + 1);

  const lastSlashIdx = afterInstance.lastIndexOf('/');
  if (lastSlashIdx === -1) return null;
  const owner = afterInstance.slice(0, lastSlashIdx);
  const repo = afterInstance.slice(lastSlashIdx + 1);

  if (!owner || !repo) return null;
  return { provider, instanceKey, owner, repo };
}

export function validateCanonicalRepoId(id: string): CanonicalRepoId | null {
  const parsed = parseCanonicalRepoId(id);
  if (!parsed) return null;
  const instanceKey = parsed.instanceKey === 'default' ? 'default' : computeInstanceKey(parsed.instanceKey);
  return {
    version: 1,
    id,
    provider: parsed.provider,
    instanceKey,
    owner: parsed.owner,
    repo: parsed.repo,
    displayName: `${parsed.owner}/${parsed.repo}`,
  };
}

export function matchesRepoId(
  repoId: string | CanonicalRepoId,
  provider: Provider,
  owner: string,
): boolean {
  if (typeof repoId === 'string') {
    const parsed = parseCanonicalRepoId(repoId);
    if (!parsed) return false;
    return parsed.provider === provider && parsed.owner === owner;
  }
  return repoId.provider === provider && repoId.owner === owner;
}

export function filterByProvider(ids: string[], provider: Provider): CanonicalRepoId[] {
  const result: CanonicalRepoId[] = [];
  for (const id of ids) {
    const validated = validateCanonicalRepoId(id);
    if (validated && validated.provider === provider) {
      result.push(validated);
    }
  }
  return result;
}

// Errors

export type ErrorCode =
  | 'MALFORMED_REQUEST'
  | 'INVALID_CREDENTIAL_KIND'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_REPO_ID_FORMAT'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_REVOKED'
  | 'CREDENTIAL_NOT_FOUND'
  | 'INSUFFICIENT_SCOPE'
  | 'REPOSITORY_ACCESS_DENIED'
  | 'REPOSITORY_NOT_IN_ALLOWLIST'
  | 'OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS'
  | 'REPOSITORY_NOT_FOUND'
  | 'CREDENTIAL_NOT_ACCESSIBLE'
  | 'REPOSITORY_ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'REAUTH_REQUIRED';

export type CredentialExpiredHint = 'refresh' | 'reauthenticate';

export type ReauthReason =
  | 'oauth_refresh_failed'
  | 'ssh_key_invalid'
  | 'pat_revoked'
  | 'session_expired'
  | 'consent_required';

export type ApiErrorDetails =
  | { kind: 'credential_expired'; expiredAt: string; hint: CredentialExpiredHint }
  | { kind: 'insufficient_scope'; requiredScope: string; currentScopes: string[] }
  | { kind: 'validation_error'; fieldErrors: FieldError[] }
  | { kind: 'rate_limited'; retryAfter: number | null; resetsAt: string | null }
  | { kind: 'backend_unavailable'; retryAfterSecs: number | null }
  | { kind: 'reauth_required'; reason: ReauthReason };

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  version: number;
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetails | null;
}

const HTTP_STATUS_MAP: Record<ErrorCode, number> = {
  MALFORMED_REQUEST: 400,
  INVALID_CREDENTIAL_KIND: 400,
  MISSING_REQUIRED_FIELD: 400,
  INVALID_REPO_ID_FORMAT: 400,
  CREDENTIAL_EXPIRED: 401,
  CREDENTIAL_REVOKED: 401,
  CREDENTIAL_NOT_FOUND: 401,
  INSUFFICIENT_SCOPE: 403,
  REPOSITORY_ACCESS_DENIED: 403,
  REPOSITORY_NOT_IN_ALLOWLIST: 403,
  OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS: 403,
  REPOSITORY_NOT_FOUND: 404,
  CREDENTIAL_NOT_ACCESSIBLE: 404,
  REPOSITORY_ALREADY_EXISTS: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  PROVIDER_UNAVAILABLE: 503,
  BACKEND_UNAVAILABLE: 503,
  REAUTH_REQUIRED: 401,
};

export function httpStatusForError(code: ErrorCode): number {
  return HTTP_STATUS_MAP[code];
}

export function isClientError(code: ErrorCode): boolean {
  const status = httpStatusForError(code);
  return status >= 400 && status < 500;
}

export function isServerError(code: ErrorCode): boolean {
  const status = httpStatusForError(code);
  return status >= 500;
}

export function isRetryable(code: ErrorCode): boolean {
  return code === 'RATE_LIMITED' || code === 'PROVIDER_UNAVAILABLE' || code === 'BACKEND_UNAVAILABLE' || isServerError(code);
}

export function makeApiError(
  code: ErrorCode,
  message: string,
  details?: ApiErrorDetails | null,
): Readonly<ApiError> {
  if (details) {
    return Object.freeze({ version: 1, code, message, details });
  }
  return Object.freeze({ version: 1, code, message });
}

export function errorCredentialExpired(
  expiredAt: string,
  hint: CredentialExpiredHint,
): Readonly<ApiError> {
  const details: ApiErrorDetails = { kind: 'credential_expired', expiredAt, hint };
  return Object.freeze({
    version: 1,
    code: 'CREDENTIAL_EXPIRED',
    message: 'The credential has expired.',
    details,
  });
}

export function errorMalformedRequest(message: string): Readonly<ApiError> {
  return Object.freeze({
    version: 1,
    code: 'MALFORMED_REQUEST',
    message,
    details: null,
  });
}

export function errorRepositoryNotInAllowlist(_repoId?: string): Readonly<ApiError> {
  return Object.freeze({
    version: 1,
    code: 'REPOSITORY_NOT_IN_ALLOWLIST',
    message: 'This repository is not in the sync allowlist.',
    details: null,
  });
}

const KNOWN_ERROR_CODES: ErrorCode[] = [
  'MALFORMED_REQUEST', 'INVALID_CREDENTIAL_KIND', 'MISSING_REQUIRED_FIELD',
  'INVALID_REPO_ID_FORMAT', 'CREDENTIAL_EXPIRED', 'CREDENTIAL_REVOKED',
  'CREDENTIAL_NOT_FOUND', 'INSUFFICIENT_SCOPE', 'REPOSITORY_ACCESS_DENIED',
  'REPOSITORY_NOT_IN_ALLOWLIST', 'OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS',
  'REPOSITORY_NOT_FOUND', 'CREDENTIAL_NOT_ACCESSIBLE', 'REPOSITORY_ALREADY_EXISTS',
  'VALIDATION_ERROR', 'RATE_LIMITED', 'INTERNAL_ERROR', 'PROVIDER_UNAVAILABLE',
  'BACKEND_UNAVAILABLE', 'REAUTH_REQUIRED',
];

export function parseApiErrorResponse(json: unknown): ApiError | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.version !== 'number' || obj.version !== 1) return null;
  if (typeof obj.code !== 'string') return null;
  if (typeof obj.message !== 'string') return null;
  if (!KNOWN_ERROR_CODES.includes(obj.code as ErrorCode)) return null;
  return {
    version: obj.version,
    code: obj.code as ErrorCode,
    message: obj.message,
    details: obj.details as ApiErrorDetails | null,
  };
}

// Repository allowlist

export interface RepositoryAccessPolicy {
  hostId: string;
  allowedRepositories: CanonicalRepoId[];
  writeVerifiedRepositories: CanonicalRepoId[];
  lastModifiedAt: number;
}

export function createRepositoryAccessPolicy(hostId: string): RepositoryAccessPolicy {
  return {
    hostId,
    allowedRepositories: [],
    writeVerifiedRepositories: [],
    lastModifiedAt: 0,
  };
}

export function isRepoAllowed(policy: RepositoryAccessPolicy, repoId: CanonicalRepoId): boolean {
  return policy.allowedRepositories.some((r) => r.id === repoId.id);
}

export function isRepoWriteVerified(policy: RepositoryAccessPolicy, repoId: CanonicalRepoId): boolean {
  return policy.writeVerifiedRepositories.some((r) => r.id === repoId.id);
}

export function addRepoToPolicy(policy: RepositoryAccessPolicy, repoId: CanonicalRepoId): void {
  if (!isRepoAllowed(policy, repoId)) {
    policy.allowedRepositories.push(repoId);
    policy.lastModifiedAt = Date.now();
  }
}

export function removeRepoFromPolicy(policy: RepositoryAccessPolicy, repoId: CanonicalRepoId): void {
  policy.allowedRepositories = policy.allowedRepositories.filter((r) => r.id !== repoId.id);
  policy.writeVerifiedRepositories = policy.writeVerifiedRepositories.filter((r) => r.id !== repoId.id);
  policy.lastModifiedAt = Date.now();
}

export function verifyWriteForRepo(policy: RepositoryAccessPolicy, repoId: CanonicalRepoId): void {
  if (isRepoAllowed(policy, repoId) && !isRepoWriteVerified(policy, repoId)) {
    policy.writeVerifiedRepositories.push(repoId);
    policy.lastModifiedAt = Date.now();
  }
}

// OAuth exchange types

export interface OAuthCodeExchangeRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
  provider: Provider;
  instanceBaseUrl: string | null;
}

export interface OAuthCodeExchangeResponse {
  accessToken: string;
  tokenType: string;
  refreshToken: string | null;
  expiresIn: number;
  expiresAt: string | null;
  scopes: string[] | null;
  provider: Provider;
  instanceBaseUrl: string | null;
}

export interface OAuthRefreshRequest {
  refreshToken: string;
  provider: Provider;
  instanceBaseUrl: string | null;
}

export interface OAuthRefreshResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: string | null;
}

// GitHub App tokens

export interface GitHubAppInstallStartRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  selectedRepoIds: string[] | null;
}

export interface GitHubAppInstallStartResponse {
  installUrl: string;
  nonce: string;
}

export interface GitHubAppTokenRequest {
  handoffToken: string;
  selectedRepoIds: string[];
}

export interface GitHubAppTokenResponse {
  token: string;
  expiresAt: string;
  tokenType: string;
  repositorySelection: GitHubAppRepoSelection;
}

export type GitHubAppRepoSelection =
  | { kind: 'all' }
  | { kind: 'selected'; repositories: CanonicalRepoId[] };
