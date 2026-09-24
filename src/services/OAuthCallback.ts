/**
 * OAuth callback validation for the mobile deep-link flow.
 *
 * Validates the `gitnotes://oauth-callback` URI that WebBrowser opens after
 * the user approves or denies the authorization request inside the system
 * browser.
 *
 * Validates:
 *  - Correct scheme (gitnotes://)
 *  - No `error` parameter (provider-denied flow)
 *  - Presence of `code` parameter
 *  - State parameter matches what was stored in-memory
 *
 * Does NOT exchange the code for a token — that exchange happens server-side
 * and the result is persisted by the caller via `connectHost`.
 *
 * Does NOT persist credentials.
 */

import { makeRedirectUri } from 'expo-auth-session';

export const OAUTH_CALLBACK_PATH = 'oauth-callback';

export const OAUTH_CALLBACK_URI = makeRedirectUri({
  scheme: 'gitnotes',
  path: OAUTH_CALLBACK_PATH,
});

export interface ValidatedOAuthCallback {
  success: true;
  code: string;
  state: string;
}

export interface RejectedOAuthCallback {
  success: false;
  reason: 'missing_code' | 'state_mismatch' | 'provider_error' | 'wrong_scheme' | 'parse_error';
  errorDescription?: string;
  error?: string;
}

export type OAuthCallbackResult = ValidatedOAuthCallback | RejectedOAuthCallback;

export function validateOAuthCallback(
  callbackUrl: string,
  expectedState: string,
): OAuthCallbackResult {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return { success: false, reason: 'parse_error' };
  }

  if (parsed.protocol !== 'gitnotes:') {
    return { success: false, reason: 'wrong_scheme' };
  }

  // Node 26+ changed custom-protocol URL parsing: the path segment appears in
  // `hostname` and `pathname` is empty (e.g. gitnotes://oauth-callback has
  // hostname="oauth-callback", pathname=""). Earlier Node versions put it in
  // `pathname`. Support both.
  const callbackPath = parsed.hostname || parsed.pathname.replace(/^\//, '');
  if (callbackPath !== OAUTH_CALLBACK_PATH) {
    return { success: false, reason: 'parse_error' };
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    const errorDescription = parsed.searchParams.get('error_description') ?? undefined;
    return { success: false, reason: 'provider_error', error, errorDescription };
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    return { success: false, reason: 'missing_code' };
  }

  const state = parsed.searchParams.get('state') ?? '';
  if (state !== expectedState) {
    return { success: false, reason: 'state_mismatch' };
  }

  return { success: true, code, state };
}
