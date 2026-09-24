/**
 * OAuth discovery for self-hosted git hosts.
 *
 * Probes `GET {instanceBaseUrl}/.well-known/openid-configuration` with a
 * 3-second timeout. Returns whether the host speaks OAuth 2.0 with PKCE based
 * on the presence of `authorization_endpoint` and `token_endpoint`.
 *
 * Does NOT persist credentials. Does NOT implement backend routes.
 */

import type { GitHostProvider } from './git/GitHost';

const DISCOVERY_TIMEOUT_MS = 3_000;

export interface OAuthDiscoveryResult {
  /** `true` when the host has a valid OpenID/OAuth 2.0 discovery document. */
  supported: boolean;
  /** Human-readable reason when `supported` is `false`. */
  reason?: 'network' | 'not_oauth' | 'missing_endpoint';
  /** `authorization_endpoint` from the discovery document. */
  authorizationEndpoint?: string;
  /** `token_endpoint` from the discovery document. */
  tokenEndpoint?: string;
}

/**
 * Probes the OpenID Connect discovery endpoint for the given host.
 *
 * Only checks for the presence of `authorization_endpoint` and `token_endpoint`.
 * Any other fields (userinfo, issuer, etc.) are ignored.
 *
 * Returns `{ supported: true }` only when BOTH endpoints are present.
 * Returns `{ supported: false, reason }` for every failure mode.
 *
 * @param instanceBaseUrl  Base URL of the self-hosted instance (e.g. "https://gitea.example.com").
 * @param _provider        The git host provider (reserved for provider-specific overrides).
 */
export async function probeOAuthSupport(
  instanceBaseUrl: string,
  _provider: GitHostProvider,
): Promise<OAuthDiscoveryResult> {
  const url = `${instanceBaseUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;

  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  try {
    const controller = new AbortController();
    const { signal } = controller;

    timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { supported: false, reason: 'not_oauth' };
    }

    let doc: { authorization_endpoint?: unknown; token_endpoint?: unknown };
    try {
      doc = (await response.json()) as typeof doc;
    } catch {
      return { supported: false, reason: 'not_oauth' };
    }

    const authEndpoint = typeof doc.authorization_endpoint === 'string' ? doc.authorization_endpoint : undefined;
    const tokenEndpoint = typeof doc.token_endpoint === 'string' ? doc.token_endpoint : undefined;

    if (!authEndpoint || !tokenEndpoint) {
      return { supported: false, reason: 'missing_endpoint' };
    }

    return { supported: true, authorizationEndpoint: authEndpoint, tokenEndpoint };
  } catch {
    clearTimeout(timeoutId);
    return { supported: false, reason: 'network' };
  }
}
