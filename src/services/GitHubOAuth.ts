/**
 * GitHub OAuth 2.0 PKCE flow for mobile.
 *
 * Uses the GitHub browser-based OAuth with PKCE.
 * No client secret is used — this is the standard public-client OAuth flow.
 *
 * Scopes requested: `read:user` (profile identity only).
 * Repository access is determined by the backend exchange, not by scope.
 *
 * Does NOT call the GitHub token endpoint from the mobile app.
 * On success, returns a typed authorization payload to be exchanged
 * by the backend. The provider access token never reaches the mobile flow.
 *
 * Does NOT persist credentials.
 */

import * as WebBrowser from 'expo-web-browser';

import { makeRedirectUri } from 'expo-auth-session';
import { generateCodeVerifier, generateCodeChallenge, generateState } from './OAuthPKCE';
import { validateOAuthCallback, RejectedOAuthCallback } from './OAuthCallback';
import type { GitHostProvider } from './git/GitHost';

export const OAUTH_CALLBACK_URI = makeRedirectUri({
  scheme: 'gitnotes',
  path: 'oauth-callback',
});

// In production this would come from a GitHub App registration.
// During development / for the plumbing to work, a GitHub OAuth App
// client ID must be configured in AccountStorage.
export const GITHUB_OAUTH_CLIENT_ID_KEY = 'gitnotes_github_oauth_client_id';

/** Scopes for the GitHub OAuth token — identity only, no repo access. */
const GITHUB_SCOPES = 'read:user';

/** GitHub authorization endpoint. */
const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize';

/** GitHub token endpoint (used only by backend for exchange — never called from mobile). */
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

/**
 * Payload returned after successful browser OAuth flow.
 * The mobile app sends this to the backend for token exchange.
 * The authorization code, verifier, state, and redirect URI are
 * sufficient for the backend to complete the exchange server-side.
 */
export interface OAuthAuthorizationPayload {
  readonly code: string;
  readonly codeVerifier: string;
  readonly state: string;
  readonly redirectUri: string;
  readonly provider: 'github';
  readonly clientId: string;
  readonly authorizationEndpoint: string;
}

export interface GitHubOAuthError {
  ok: false;
  reason:
    | 'network'
    | 'callback_timeout'
    | 'state_mismatch'
    | 'provider_denied'
    | 'user_cancelled'
    | 'missing_client_id'
    | 'callback_mismatch';
  errorDescription?: string;
}

/** Result when OAuth authorization completes successfully in the browser. */
export interface GitHubOAuthAuthorizationSuccess {
  ok: true;
  payload: OAuthAuthorizationPayload;
}

export type GitHubOAuthResult = GitHubOAuthAuthorizationSuccess | GitHubOAuthError;

/**
 * Performs the GitHub OAuth PKCE flow:
 *  1. Generates PKCE code verifier + challenge and a random state.
 *  2. Opens the system browser for user authorization.
 *  3. Validates the callback URL (state, scheme, presence of code).
 *  4. Returns the authorization payload for backend exchange.
 *
 * The provider access token is NEVER received by or persisted in the mobile app.
 * Token exchange happens server-side via the backend.
 *
 * @param clientId   GitHub OAuth App client ID. If empty, returns `missing_client_id`.
 * @param instanceBaseUrl  GitHub.com = "https://github.com" or self-hosted base URL.
 */
export async function performGitHubOAuth(
  clientId: string,
  instanceBaseUrl: string,
): Promise<GitHubOAuthResult> {
  if (!clientId.trim()) {
    return { ok: false, reason: 'missing_client_id' };
  }

  // ── Step 1: PKCE + state ────────────────────────────────────────────
  let codeVerifier: string;
  let codeChallenge: string;
  let state: string;
  try {
    codeVerifier = await generateCodeVerifier();
    codeChallenge = await generateCodeChallenge(codeVerifier);
    state = await generateState();
  } catch {
    return { ok: false, reason: 'network' };
  }

  // ── Step 2: Build authorization URL ──────────────────────────────────
  const redirectUri = OAUTH_CALLBACK_URI;
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${instanceBaseUrl.replace(/\/$/, '')}/login/oauth/authorize?${authParams.toString()}`;

  // ── Step 3: Open browser and wait for callback ──────────────────────
  let callbackUrl: string;
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { ok: false, reason: 'user_cancelled' };
    }
    if (result.type !== 'success') {
      return { ok: false, reason: 'user_cancelled' };
    }
    callbackUrl = result.url;
  } catch {
    return { ok: false, reason: 'network' };
  }

  // ── Step 4: Validate callback ─────────────────────────────────────────
  const validated = validateOAuthCallback(callbackUrl, state);
  if (validated.success === false) {
    const rejected = validated as RejectedOAuthCallback;
    if (rejected.reason === 'provider_error') {
      return { ok: false, reason: 'provider_denied', errorDescription: rejected.errorDescription };
    }
    if (rejected.reason === 'state_mismatch') {
      return { ok: false, reason: 'state_mismatch' };
    }
    if (rejected.reason === 'wrong_scheme' || rejected.reason === 'parse_error') {
      return { ok: false, reason: 'callback_mismatch', errorDescription: rejected.errorDescription };
    }
    return { ok: false, reason: 'user_cancelled' };
  }

  // ── Step 5: Return authorization payload for backend exchange ────────
  // The provider access token NEVER reaches the mobile app.
  // The backend is responsible for exchanging the code for a token server-side.
  return {
    ok: true,
    payload: {
      code: validated.code,
      codeVerifier,
      state,
      redirectUri,
      provider: 'github',
      clientId: clientId.trim(),
      authorizationEndpoint: authUrl.split('?')[0] ?? authUrl,
    },
  };
}

/**
 * Probes the GitHub.com or self-hosted GitHub Enterprise instance for OAuth support.
 *
 * For github.com, returns `supported: true` (GitHub.com always supports OAuth PKCE).
 * For self-hosted URLs, probes `/.well-known/openid-configuration` — if missing,
 * falls back to assuming OAuth is available (some GitHub Enterprise instances don't
 * expose OIDC discovery).
 *
 * @param provider      Always 'github' for this implementation.
 * @param instanceBaseUrl  "https://github.com" or self-hosted GitHub Enterprise URL.
 */
export async function probeGitHubOAuthSupport(
  provider: GitHostProvider,
  instanceBaseUrl: string,
): Promise<{ supported: true; authorizationEndpoint: string; tokenEndpoint: string } | { supported: false; reason: 'network' | 'not_oauth' }> {
  // GitHub.com always supports OAuth with PKCE.
  if (
    instanceBaseUrl === 'https://github.com' ||
    instanceBaseUrl === 'https://api.github.com' ||
    instanceBaseUrl === 'github.com'
  ) {
    return {
      supported: true,
      authorizationEndpoint: GITHUB_AUTH_ENDPOINT,
      tokenEndpoint: GITHUB_TOKEN_ENDPOINT,
    };
  }

  // For self-hosted: try OIDC discovery.
  const discoveryUrl = `${instanceBaseUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;

  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 3_000);

    const response = await fetch(discoveryUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { supported: true, authorizationEndpoint: `${instanceBaseUrl}/login/oauth/authorize`, tokenEndpoint: GITHUB_TOKEN_ENDPOINT };
    }

    const doc = (await response.json()) as { authorization_endpoint?: unknown; token_endpoint?: unknown };

    const authEp = typeof doc.authorization_endpoint === 'string' ? doc.authorization_endpoint : undefined;
    const tokenEp = typeof doc.token_endpoint === 'string' ? doc.token_endpoint : undefined;

    if (!authEp || !tokenEp) {
      return { supported: false, reason: 'not_oauth' };
    }

    return { supported: true, authorizationEndpoint: authEp, tokenEndpoint: tokenEp };
  } catch {
    clearTimeout(timeoutId);
    return { supported: true, authorizationEndpoint: `${instanceBaseUrl}/login/oauth/authorize`, tokenEndpoint: GITHUB_TOKEN_ENDPOINT };
  }
}
