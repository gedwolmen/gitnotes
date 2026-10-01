/**
 * GitHub App installation credential record.
 *
 * Produced by the backend after the user installs the GitHub App and selects
 * repositories. The mobile app receives only the installation token and
 * metadata; the private key never leaves the backend.
 *
 * Stored under `GITHUB_APP_CREDENTIAL_PREFIX + hostId` in SecureStore / AsyncStorage.
 * This is a separate key from all existing credential keys so that a
 * GitHub App failure cannot interfere with token/PAT/SSH for the same host.
 */

import type { BaseCredentialRecord } from './CredentialKind';

/** Numeric GitHub App installation id. Unique per-user/per-organization install. */
export type GitHubInstallationId = number;

/** Numeric GitHub App id (found in the App's settings). Used in JWT iss field. */
export type GitHubAppId = number;

/** Unix-ms timestamp when the installation token expires (GitHub default: 1 hour). */
export type InstallationTokenExpiry = number;

/** Repository that the installation token is scoped to.
 *
 * Selected during the GitHub App installation flow and stored
 * so the app can re-present the same selection after token renewal.
 */
export interface SelectedRepository {
  owner: string;
  repo: string;
}

/** Metadata needed to request a renewed installation token from the backend.
 *
 * The backend provides a one-time renewal grant that is single-use and
 * expires shortly after issuance.
 */
export interface AppRenewalMetadata {
  /** Opaque renewal-grant token issued by the backend. */
  grantToken: string;
  /** Wall-clock ms when the grant token itself expires. */
  grantExpiresAt: number;
  /** Base URL of the backend that manages this installation. */
  backendUrl: string;
}

/** Well-known error codes from the GitHub App flow. */
export type GitHubAppErrorCode =
  | 'installation_denied'
  | 'callback_denied'
  | 'wrong_app'
  | 'duplicate'
  | 'installation_inactive'
  | 'selection_empty'
  | 'selection_mismatch'
  | 'token_exchange_failed'
  | 'renewal_denied'
  | 'renewal_replayed'
  | 'backend_unreachable'
  | 'network_error'
  | 'malformed_response'
  | 'owner_not_allowed';

export interface GitHubAppCredentialRecord extends BaseCredentialRecord {
  kind: 'github_app';
  /** GitHub App installation id. */
  installationId: GitHubInstallationId;
  /** Numeric App ID used in the JWT iss field. */
  appId: GitHubAppId;
  /** Slug from the GitHub App's settings URL. */
  appSlug: string;
  /** OAuth login of the user or organization that owns the installation. */
  accountLogin: string;
  /** Numeric id of the installing account (user or org). */
  accountId: number;
  /** Repositories selected during the installation flow.
   *
   * NEVER empty — the installer must choose at least one repo.
   * An empty array is treated as a validation error.
   */
  selectedRepositories: SelectedRepository[];
  /** Active installation token — used as a bearer for API calls. */
  token: string;
  /** Unix-ms timestamp when `token` expires (GitHub default: 3600s). */
  expiresAt: InstallationTokenExpiry;
  /** Metadata for renewing the installation token. */
  renewal: AppRenewalMetadata;
}

/** Feature-scoped availability state for GitHub App.
 *
 * Independent of OAuth, token/PAT, SSH, and other providers.
 */
export interface GitHubAppAvailability {
  available: boolean;
  error: GitHubAppErrorCode | null;
  backendReachable: boolean;
}

/** Validate GitHub App credential metadata.
 *
 * Checks: positive installation id, non-empty repo list, non-expired
 * installation token, valid renewal metadata, non-empty token string.
 * Does NOT check GitHub API acceptance — that is a runtime call.
 */
export function validateGitHubAppCredential(
  cred: GitHubAppCredentialRecord,
): { valid: true } | { valid: false; reason: string } {
  if (
    typeof cred.installationId !== 'number' ||
    cred.installationId <= 0
  ) {
    return { valid: false, reason: 'invalid_installation_id' };
  }
  if (typeof cred.appId !== 'number' || cred.appId <= 0) {
    return { valid: false, reason: 'invalid_app_id' };
  }
  if (!cred.token || cred.token.length === 0) {
    return { valid: false, reason: 'empty_token' };
  }
  if (typeof cred.expiresAt !== 'number' || cred.expiresAt <= Date.now()) {
    return { valid: false, reason: 'expired_metadata' };
  }
  if (!Array.isArray(cred.selectedRepositories) || cred.selectedRepositories.length === 0) {
    return { valid: false, reason: 'empty_repository_selection' };
  }
  for (const repo of cred.selectedRepositories) {
    if (!repo.owner || !repo.repo) {
      return { valid: false, reason: 'corrupt_record' };
    }
  }
  if (!cred.renewal?.grantToken) {
    return { valid: false, reason: 'invalid_renewal_metadata' };
  }
  if (!cred.renewal?.backendUrl) {
    return { valid: false, reason: 'invalid_renewal_metadata' };
  }
  return { valid: true };
}

/** True when the installation token is expired based on wall-clock time. */
export function isInstallationTokenExpired(cred: GitHubAppCredentialRecord): boolean {
  return cred.expiresAt <= Date.now();
}

/** True when the renewal grant has expired. */
export function isGrantExpired(cred: GitHubAppCredentialRecord): boolean {
  return cred.renewal.grantExpiresAt <= Date.now();
}

/** True when the selected repo list is empty. */
export function hasEmptyRepositorySelection(cred: GitHubAppCredentialRecord): boolean {
  return cred.selectedRepositories.length === 0;
}
