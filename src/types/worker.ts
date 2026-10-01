/**
 * Types for the GitNotēs Worker API.
 * These types preserve the contract from the Cloudflare Worker implementation.
 *
 * Base URL: https://api.gitnotes.org/api/v1
 * Error envelope: { code: string, message: string } with snake_case codes.
 */

import { z } from "zod";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/**
 * Production base URL for the Worker API.
 * Local overrides supported via EXPO_PUBLIC_GITNOTES_BACKEND_URL env var.
 */
export const WORKER_BASE_URL = "https://api.gitnotes.org/api/v1";

/**
 * Environment variable name for backend URL override.
 * Supports Expo build-time environment substitution.
 */
export const WORKER_BACKEND_URL_ENV = "EXPO_PUBLIC_GITNOTES_BACKEND_URL";

/**
 * Environment variable name for GitHub OAuth client ID.
 * This is the public OAuth client ID - NOT a secret.
 */
export const GITHUB_OAUTH_CLIENT_ID_ENV = "EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID";

// -----------------------------------------------------------------------------
// Error Envelope - matches Rust ApiErrorCode and ApiErrorResponse.
// The `code` field uses snake_case strings matching Rust enum variants.
// -----------------------------------------------------------------------------

/**
 * Stable error codes used in API responses.
 * Values match Rust/Worker ApiErrorCode enum variants exactly.
 */
export const WorkerErrorCode = {
  // Bootstrap errors (no Rust equivalent)
  INTERNAL_NOT_FOUND: "not_found",
  INTERNAL_MALFORMED_REQUEST: "malformed_request",
  INTERNAL_MISSING_FIELD: "missing_field",
  INTERNAL_INVALID_FIELD: "invalid_field",

  // OAuth errors
  EXCHANGE_DENIED: "exchange_denied",
  VERIFIER_MISMATCH: "verifier_mismatch",
  STATE_MISMATCH: "state_mismatch",
  REDIRECT_MISMATCH: "redirect_mismatch",
  CODE_EXPIRED: "code_expired",
  REFRESH_DENIED: "refresh_denied",
  REFRESH_EXPIRED: "refresh_expired",

  // GitHub errors
  BACKEND_UNREACHABLE: "backend_unreachable",
  MALFORMED_RESPONSE: "malformed_response",
  NETWORK_ERROR: "network_error",

  // GitHub App errors
  INSTALLATION_DENIED: "installation_denied",
  WRONG_APP: "wrong_app",
  INSTALLATION_INACTIVE: "installation_inactive",
  SELECTION_EMPTY: "selection_empty",
  SELECTION_MISMATCH: "selection_mismatch",
  RENEWAL_DENIED: "renewal_denied",
  RENEWAL_REPLAYED: "renewal_replayed",
  OWNER_NOT_ALLOWED: "owner_not_allowed",

  // Configuration
  CONFIGURATION_MISSING: "configuration_missing",
} as const;

// eslint-disable-next-line no-redeclare
export type WorkerErrorCode = (typeof WorkerErrorCode)[keyof typeof WorkerErrorCode];

/**
 * Error response body matching Rust ApiErrorResponse.
 * Never leaks internal details, stack traces, or secrets.
 */
export interface WorkerErrorResponse {
  readonly code: WorkerErrorCode;
  readonly message: string;
}

/**
 * Zod schema for validating error responses.
 */
export const WorkerErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
});

// -----------------------------------------------------------------------------
// OAuth Types
// -----------------------------------------------------------------------------

/**
 * OAuth callback URLs used by the mobile app.
 * These are fixed deep-link URLs registered in the app.
 */
export const OAUTH_CALLBACK_URL = "gitnotes://oauth/callback";

/**
 * App callback URL used by the mobile app.
 * This is a fixed deep-link URL registered in the app.
 */
export const APP_CALLBACK_URL = "gitnotes://app/callback";

/**
 * Request to initiate OAuth flow - store PKCE state, return GitHub auth URL.
 */
export interface OAuthInitiateRequest {
  state: string;
  code_challenge: string;
  redirect_uri: string;
  scopes?: string[];
}

/**
 * Response from OAuth initiation - contains the GitHub authorization URL.
 */
export interface OAuthInitiateResponse {
  authorization_url: string;
  state: string;
}

/**
 * Request to exchange authorization code for tokens.
 */
export interface OAuthExchangeRequest {
  code: string;
  code_verifier: string;
  state: string;
  redirect_uri: string;
  client_id: string;
}

/**
 * Response from successful OAuth code exchange.
 */
export interface OAuthExchangeResponse {
  login: string;
  user_id: number;
  access_token: string;
  expires_at: number;
  refresh_token: string;
  refresh_expires_at: number;
}

/**
 * Request to refresh an OAuth access token.
 * Note: GitHub OAuth does not support refresh - this always returns RefreshDenied.
 */
export interface OAuthRefreshRequest {
  refresh_token: string;
}

/**
 * Response from token refresh.
 */
export interface OAuthRefreshResponse {
  access_token: string;
  expires_at: number;
  refresh_token: string;
  refresh_expires_at: number;
}

/**
 * Request to revoke an access token.
 */
export interface OAuthRevokeRequest {
  access_token: string;
}

/**
 * Response from token revocation.
 */
export interface OAuthRevokeResponse {
  revoked: boolean;
}

// -----------------------------------------------------------------------------
// GitHub App Types
// -----------------------------------------------------------------------------

/**
 * Request to generate GitHub App installation URL with signed JWS state.
 */
export interface GitHubAppInstallUrlRequest {
  selected_repository_ids?: number[];
}

/**
 * Response with installation URL and state for CSRF protection.
 */
export interface GitHubAppInstallUrlResponse {
  installation_url: string;
  state: string;
}

/**
 * Request after user approves GitHub App installation.
 */
export interface GitHubAppCallbackRequest {
  installation_id: number;
  state: string;
  selected_repository_ids?: number[];
}

/**
 * Response from successful GitHub App installation token exchange.
 */
export interface GitHubAppInstallResponse {
  installation_id: number;
  app_id: number;
  app_slug: string;
  account_login: string;
  account_id: number;
  token: string;
  expires_at: number;
  renewal_grant_token: string;
  renewal_grant_expires_at: number;
}

/**
 * Request to renew an installation token.
 */
export interface GitHubAppRenewalRequest {
  installation_id: number;
  renewal_grant_token: string;
  jti: string;
}

/**
 * Response from successful installation token renewal.
 */
export type GitHubAppRenewalResponse = GitHubAppInstallResponse;

// -----------------------------------------------------------------------------
// Health Check
// -----------------------------------------------------------------------------

/**
 * Health check response.
 */
export interface HealthResponse {
  status: "ok";
  version: string;
}

// -----------------------------------------------------------------------------
// Error Classes
// -----------------------------------------------------------------------------

/**
 * Error thrown when the Worker API returns a non-2xx response.
 */
export class WorkerApiError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "WorkerApiError";
  }
}

/**
 * Attempt to parse a response as a WorkerErrorResponse.
 */
export function parseWorkerError(response: unknown): WorkerApiError | null {
  const parsed = WorkerErrorResponseSchema.safeParse(response);
  if (!parsed.success) return null;
  const { code, message } = parsed.data;
  return new WorkerApiError(code as WorkerErrorCode, message, 0);
}
