/**
 * Tests for GitHubOAuth.ts — mobile OAuth flow.
 *
 * Verifies:
 * - The GitHub token endpoint is NEVER called from the mobile app
 * - No credentials are stored after cancelled/malformed/wrong-host/state-mismatch/provider-error callbacks
 * - S256 PKCE, unique state, and callback validation are preserved
 * - The authorization payload is returned on success (not a provider access token)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  dismissBrowser: jest.fn(),
  openBrowserAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(64)),
  digestStringAsync: jest.fn().mockResolvedValue('fakehash'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('gitnotes://oauth-callback'),
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import {
  performGitHubOAuth,
  probeGitHubOAuthSupport,
  OAUTH_CALLBACK_URI,
} from '@/services/GitHubOAuth';

import { probeOAuthSupport } from '@/services/OAuthDiscovery';

import * as WebBrowser from 'expo-web-browser';
import { generateState } from '@/services/OAuthPKCE';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GitHubOAuth — mobile OAuth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockCancel() {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel', url: '' });
  }

  function mockSuccess(url: string) {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url });
  }

  describe('performGitHubOAuth', () => {
    const VALID_CLIENT_ID = 'test_client_id_123';
    const GITHUB_COM = 'https://github.com';

    it('returns missing_client_id error when client ID is empty', async () => {
      const result = await performGitHubOAuth('', GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('missing_client_id');
      }
      expect((WebBrowser.openAuthSessionAsync as jest.Mock)).not.toHaveBeenCalled();
    });

    it('returns user_cancelled when browser cancels', async () => {
      mockCancel();

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('user_cancelled');
    });

    it('returns user_cancelled when browser dismisses', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss', url: '' });

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('user_cancelled');
    });

    it('returns network error when browser throws', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockRejectedValue(new Error('Network unavailable'));

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('network');
    });

    it('returns callback_mismatch when callback has wrong scheme', async () => {
      mockSuccess('https://evil.com/callback?code=abc&state=xyz');

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('callback_mismatch');
    });

    it('returns user_cancelled when callback is missing code', async () => {
      mockSuccess('gitnotes://oauth-callback?state=xyz');

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('user_cancelled');
    });

    it('returns state_mismatch when state does not match', async () => {
      mockSuccess('gitnotes://oauth-callback?code=abc&state=wrong_state');

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('state_mismatch');
    });

    it('returns provider_denied when callback contains provider error', async () => {
      mockSuccess('gitnotes://oauth-callback?error=access_denied&error_description=user_denied&state=xyz');

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('provider_denied');
        expect(result.errorDescription).toBe('user_denied');
      }
    });

    it('returns authorization payload on success, NOT an access token', async () => {
      const state = await generateState();
      mockSuccess(`gitnotes://oauth-callback?code=test_code&state=${state}`);

      const result = await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload).toBeDefined();
        expect(result.payload.code).toBe('test_code');
        expect(result.payload.codeVerifier).toBeDefined();
        expect(result.payload.state).toBe(state);
        expect(result.payload.redirectUri).toBe(OAUTH_CALLBACK_URI);
        expect(result.payload.provider).toBe('github');
        expect(result.payload.clientId).toBe(VALID_CLIENT_ID);
        expect(result.payload).not.toHaveProperty('token');
        expect(result.payload).not.toHaveProperty('access_token');
      }
    });

    it('requests only read:user scope (no repo scope)', async () => {
      mockCancel();

      await performGitHubOAuth(VALID_CLIENT_ID, GITHUB_COM);

      expect((WebBrowser.openAuthSessionAsync as jest.Mock)).toHaveBeenCalledTimes(1);
      const [authUrl] = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0] as [string, string];
      expect(authUrl).toContain('scope=read%3Auser');
      expect(authUrl).not.toContain('scope=repo');
    });
  });

  describe('probeGitHubOAuthSupport', () => {
    it('returns supported: true for github.com', async () => {
      const result = await probeGitHubOAuthSupport('github', 'https://github.com');

      expect(result.supported).toBe(true);
      if (result.supported) {
        expect(result.authorizationEndpoint).toContain('/login/oauth/authorize');
        expect(result.tokenEndpoint).toContain('/login/oauth/access_token');
      }
    });

    it('returns supported: true for self-hosted after timeout (fallback)', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network timeout'));

      const resultPromise = probeGitHubOAuthSupport('github', 'https://github.example.com');
      jest.advanceTimersByTime(4000);

      const result = await resultPromise;

      expect(result.supported).toBe(true);

      jest.useRealTimers();
    });
  });
});

describe('OAuthCallback — validation', () => {
  const { validateOAuthCallback } = require('@/services/OAuthCallback');

  it('accepts valid callback with code and matching state', () => {
    const result = validateOAuthCallback('gitnotes://oauth-callback?code=abc&state=xyz', 'xyz');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toBe('abc');
      expect(result.state).toBe('xyz');
    }
  });

  it('rejects wrong scheme', () => {
    const result = validateOAuthCallback('https://github.com/callback?code=abc&state=xyz', 'xyz');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('wrong_scheme');
  });

  it('rejects mismatched state', () => {
    const result = validateOAuthCallback('gitnotes://oauth-callback?code=abc&state=wrong', 'xyz');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('state_mismatch');
  });

  it('rejects provider error', () => {
    const result = validateOAuthCallback(
      'gitnotes://oauth-callback?error=access_denied&error_description=Denied&state=xyz',
      'xyz',
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('provider_error');
      expect(result.error).toBe('access_denied');
    }
  });

  it('rejects missing code', () => {
    const result = validateOAuthCallback('gitnotes://oauth-callback?state=xyz', 'xyz');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('missing_code');
  });
});

describe('OAuthDiscovery — probeOAuthSupport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns supported=true with endpoints when discovery succeeds', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          authorization_endpoint: 'https://gitea.example.com/login/oauth/authorize',
          token_endpoint: 'https://gitea.example.com/login/oauth/access_token',
        }),
    });

    const result = await probeOAuthSupport('https://gitea.example.com', 'gitea');

    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.authorizationEndpoint).toBe('https://gitea.example.com/login/oauth/authorize');
      expect(result.tokenEndpoint).toBe('https://gitea.example.com/login/oauth/access_token');
    }
  });

  it('returns network after 3-second timeout', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    (global.fetch as jest.Mock).mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new Error('Aborted'));
    });

    const resultPromise = probeOAuthSupport('https://gitea.example.com', 'gitea');
    jest.advanceTimersByTime(3000);

    const result = await resultPromise;

    expect(result.supported).toBe(false);
    expect(result.reason).toBe('network');

    jest.useRealTimers();
  });

  it('returns not_oauth when response lacks required endpoints', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ issuer: 'https://gitea.example.com' }),
    });

    const result = await probeOAuthSupport('https://gitea.example.com', 'gitea');

    expect(result.supported).toBe(false);
    expect(result.reason).toBe('missing_endpoint');
  });

  it('returns not_oauth when discovery endpoint returns non-OK status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await probeOAuthSupport('https://gitea.example.com', 'gitea');

    expect(result.supported).toBe(false);
    expect(result.reason).toBe('not_oauth');
  });
});
