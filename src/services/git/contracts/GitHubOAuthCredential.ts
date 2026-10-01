/**
 * GitHub OAuth credential record.
 *
 * Produced by the backend's OAuth code-exchange endpoint after the mobile
 * PKCE flow completes. The mobile app never sees a client secret; it only
 * receives a mobile-safe opaque access token and a refresh handle.
 *
 * Stored under `OAUTH_CREDENTIAL_PREFIX + hostId` in SecureStore / AsyncStorage.
 * This is a separate key from the existing `host_token:*` key so that
 * token-based auth and OAuth auth remain fully independent at rest.
 */

import type { BaseCredentialRecord } from './CredentialKind';

/** Unix-ms timestamp at which the access token expires. */
export type OAuthExpiry = number;

/** Metadata needed to request a fresh access token from the backend. */
export interface OAuthRenewalMetadata {
  /** Opaque handle the backend issued alongside the original token pair. */
  refreshToken: string;
  /** Wall-clock ms when the refresh token itself expires (not the access token). */
  refreshExpiresAt: number;
  /** Base URL of the backend that issued this credential. */
  backendUrl: string;
}

/** Well-known error codes returned by the backend's OAuth exchange/refresh. */
export type OAuthErrorCode =
  | 'exchange_denied'
  | 'verifier_mismatch'
  | 'state_mismatch'
  | 'redirect_mismatch'
  | 'code_expired'
  | 'refresh_denied'
  | 'refresh_expired'
  | 'backend_unreachable'
  | 'malformed_response'
  | 'network_error';

export interface GitHubOAuthCredentialRecord extends BaseCredentialRecord {
  kind: 'oauth';
  /** GitHub OAuth access token — used as a bearer token for API calls. */
  accessToken: string;
  /** ISO 8601 login of the account that completed the OAuth flow. */
  login: string;
  /** Numeric GitHub user id. */
  userId: number;
  /** Unix-ms timestamp when `accessToken` expires. */
  expiresAt: OAuthExpiry;
  /** Metadata for refreshing an expired access token. */
  renewal: OAuthRenewalMetadata;
}

/** Feature-scoped availability state for GitHub OAuth.
 *
 * When the backend is unreachable or the token is expired/refresh-failed,
 * this struct carries the actionable error WITHOUT affecting token/PAT/SSH
 * or other providers.
 */
export interface GitHubOAuthAvailability {
  available: boolean;
  error: OAuthErrorCode | null;
  backendReachable: boolean;
}

/** Validate OAuth credential metadata.
 *
 * Checks: non-empty access token, positive expiry, non-expired refresh
 * token, valid backend URL shape. Does NOT check token acceptance with
 * GitHub — that is a runtime network call.
 */
export function validateOAuthCredential(
  cred: GitHubOAuthCredentialRecord,
): { valid: true } | { valid: false; reason: string } {
  if (!cred.accessToken || cred.accessToken.length === 0) {
    return { valid: false, reason: 'empty_access_token' };
  }
  if (typeof cred.expiresAt !== 'number' || cred.expiresAt <= Date.now()) {
    return { valid: false, reason: 'expired_metadata' };
  }
  if (!cred.renewal?.refreshToken) {
    return { valid: false, reason: 'invalid_renewal_metadata' };
  }
  if (!cred.renewal?.backendUrl) {
    return { valid: false, reason: 'invalid_renewal_metadata' };
  }
  if (typeof cred.userId !== 'number' || cred.userId <= 0) {
    return { valid: false, reason: 'corrupt_record' };
  }
  return { valid: true };
}

/** True when the access token is expired based on wall-clock time. */
export function isOAuthExpired(cred: GitHubOAuthCredentialRecord): boolean {
  return cred.expiresAt <= Date.now();
}

/** True when the refresh token itself has expired.
 * Refresh tokens have a longer lifetime than access tokens.
 */
export function isRefreshExpired(cred: GitHubOAuthCredentialRecord): boolean {
  return cred.renewal.refreshExpiresAt <= Date.now();
}
