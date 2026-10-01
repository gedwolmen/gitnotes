/**
 * GitHub OAuth PKCE flow service for mobile.
 *
 * This service handles the OAuth PKCE flow using the Worker backend at
 * https://api.gitnotes.org/api/v1. The mobile app acts as a public PKCE client
 * - it generates the code verifier and challenge client-side and uses only
 * the public OAuth client ID. The backend holds the client secret and
 * performs the confidential token exchange with GitHub.
 *
 * Key invariants:
 * - No client secret in mobile
 * - PKCE S256 only (no plain challenge method)
 * - State replay protection via backend Durable Object
 *
 * Callbacks:
 * - OAuth callback: gitnotes://oauth/callback
 */

import * as crypto from "expo-crypto";
import { workerApi } from "./workerApi";
import {
  WorkerApiError,
  OAUTH_CALLBACK_URL,
  GITHUB_OAUTH_CLIENT_ID_ENV,
} from "../types/worker";

/**
 * Default OAuth scopes requested.
 * Empty array means GitHub defaults to read:user scope.
 */
const DEFAULT_SCOPES: string[] = [];

/**
 * Result of a successful OAuth token exchange.
 */
export interface OAuthTokenResult {
  login: string;
  userId: number;
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

/**
 * Generate a cryptographically random code verifier for PKCE.
 * The verifier is a high-entropy random string between 43-128 characters.
 */
function generateCodeVerifier(): string {
  // Generate 32 bytes (256 bits) of random data, base64url encoded
  const randomBytes = crypto.getRandomBytes(32);
  // Convert to base64url (RFC 4648 §5)
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return base64;
}

/**
 * Compute the S256 code challenge from a code verifier.
 * challenge = BASE64URL(SHA256(verifier))
 */
async function computeS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.digestStringAsync(
    crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: crypto.CryptoEncoding.BASE64 }
  );
  // Convert from base64 to base64url
  return digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Get the configured OAuth client ID.
 * Uses EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID env var.
 */
function getOAuthClientId(): string {
  const clientId = process.env[GITHUB_OAUTH_CLIENT_ID_ENV];
  if (!clientId || clientId.length === 0) {
    throw new Error("EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID is not configured");
  }
  return clientId;
}

/**
 * Generate a random state parameter for CSRF protection.
 */
function generateState(): string {
  const randomBytes = crypto.getRandomBytes(16);
  return btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * GitHub OAuth PKCE service for mobile.
 *
 * Usage:
 * ```typescript
 * const service = new GitHubOAuthService();
 *
 * // Step 1: Initiate - get the GitHub authorization URL
 * const { authorizationUrl, state, codeVerifier } = await service.initiate();
 *
 * // Step 2: Open the URL in a browser
 * await WebBrowser.openBrowserAsync(authorizationUrl);
 *
 * // Step 3: After user approves, handle the callback with the code
 * const result = await service.exchangeCode(code, state, codeVerifier);
 *
 * // Step 4: Use the tokens
 * const { accessToken, login } = result;
 * ```
 */
export class GitHubOAuthService {
  /**
   * Initiate the OAuth flow.
   *
   * @param scopes - Optional array of GitHub OAuth scopes. Defaults to empty (read:user).
   * @param signal - Optional AbortSignal for cancellation
   * @returns Object containing authorization URL, state, and code verifier to store
   * @throws WorkerApiError if the backend returns an error
   */
  async initiate(
    scopes: string[] = DEFAULT_SCOPES,
    signal?: AbortSignal
  ): Promise<{ authorizationUrl: string; state: string; codeVerifier: string }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeS256Challenge(codeVerifier);
    const state = generateState();

    const response = await workerApi.oauth.initiate(
      {
        state,
        code_challenge: codeChallenge,
        redirect_uri: OAUTH_CALLBACK_URL,
        scopes,
      },
      signal
    );

    return {
      authorizationUrl: response.authorization_url,
      state: response.state,
      codeVerifier,
    };
  }

  /**
   * Exchange the authorization code for tokens.
   *
   * @param code - Authorization code from GitHub callback
   * @param state - State parameter from callback (must match what was sent)
   * @param codeVerifier - PKCE code verifier generated during initiate
   * @param signal - Optional AbortSignal for cancellation
   * @returns OAuth tokens and user info
   * @throws WorkerApiError if the code exchange fails
   */
  async exchangeCode(
    code: string,
    state: string,
    codeVerifier: string,
    signal?: AbortSignal
  ): Promise<OAuthTokenResult> {
    const response = await workerApi.oauth.exchange(
      {
        code,
        code_verifier: codeVerifier,
        state,
        redirect_uri: OAUTH_CALLBACK_URL,
        client_id: getOAuthClientId(),
      },
      signal
    );

    return {
      login: response.login,
      userId: response.user_id,
      accessToken: response.access_token,
      expiresAt: response.expires_at,
      refreshToken: response.refresh_token,
      refreshExpiresAt: response.refresh_expires_at,
    };
  }

  /**
   * Refresh an access token.
   *
   * Note: GitHub OAuth does not support token refresh. This will always
   * fail with a WorkerApiError. The refresh token is only useful for
   * tracking when the user needs to re-authenticate.
   *
   * @param refreshToken - The refresh token handle
   * @param signal - Optional AbortSignal for cancellation
   * @throws WorkerApiError always - GitHub OAuth has no refresh
   */
  async refreshAccessToken(
    refreshToken: string,
    signal?: AbortSignal
  ): Promise<never> {
    try {
      await workerApi.oauth.refresh({ refresh_token: refreshToken }, signal);
      // This should never succeed for GitHub OAuth
      throw new WorkerApiError(
        "refresh_denied",
        "GitHub OAuth does not support token refresh",
        400
      );
    } catch (error) {
      if (error instanceof WorkerApiError) throw error;
      throw new WorkerApiError(
        "network_error",
        error instanceof Error ? error.message : "Unknown error",
        0
      );
    }
  }

  /**
   * Revoke an access token.
   *
   * @param accessToken - The access token to revoke
   * @param signal - Optional AbortSignal for cancellation
   * @throws WorkerApiError if revocation fails
   */
  async revokeToken(accessToken: string, signal?: AbortSignal): Promise<void> {
    const response = await workerApi.oauth.revoke(
      { access_token: accessToken },
      signal
    );
    if (!response.revoked) {
      throw new WorkerApiError(
        "backend_unreachable",
        "Token revocation failed",
        500
      );
    }
  }
}

/**
 * Singleton instance for convenience.
 */
export const gitHubOAuthService = new GitHubOAuthService();
