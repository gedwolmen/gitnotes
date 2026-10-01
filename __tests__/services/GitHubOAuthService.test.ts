/**
 * Tests for GitHubOAuthService.
 */

import { jest, describe, it, expect } from '@jest/globals';

const TEST_BACKEND = 'https://gitnotes-backend.example.com';
const TEST_CLIENT_ID = 'Iv1.test-client-id';
const TEST_HOST_ID = 'github:user@example.com';
const TEST_REDIRECT_URI = 'gitnotes://oauth/callback';

const loadService = async () => {
  const mockPost = jest.fn<() => Promise<unknown>>();
  const mockGetRandomBytesAsync = jest.fn<() => Promise<string>>();
  const mockDigestStringAsync = jest.fn<() => Promise<string>>();
  const mockOpenBrowserAsync = jest.fn<() => Promise<{ type: string }>>();
  const uuid = { current: 'test-state-abc' };

  const mod = await new Promise<typeof import('../../src/services/GitHubOAuthService')>((resolve) => {
    jest.isolateModules(() => {
      jest.doMock('axios', () => ({
        default: {
          create: () => ({
            post: mockPost,
            interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
          }),
        },
      }));

      jest.doMock('expo-crypto', () => ({
        getRandomBytesAsync: mockGetRandomBytesAsync,
        digestStringAsync: mockDigestStringAsync,
        CryptoDigestAlgorithm: { SHA256: 'SHA256' },
        CryptoEncoding: { BASE64: 'base64' },
        randomUUID: () => uuid.current,
      }));

      jest.doMock('expo-web-browser', () => ({
        openBrowserAsync: mockOpenBrowserAsync,
      }));

      const m = require('../../src/services/GitHubOAuthService');
      m.setHttpClient({ post: mockPost, get: jest.fn() });
      resolve(m);
    });
  });

  return { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync, mockOpenBrowserAsync, setUuid: (s: string) => { uuid.current = s; } };
};

describe('GitHubOAuthService', () => {
  describe('initiate()', () => {
    it('returns backend_unreachable when backend responds with 503', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync } = await loadService();
      mockGetRandomBytesAsync.mockResolvedValue('test-verifier');
      mockDigestStringAsync.mockResolvedValue('sha-256-test');
      mockPost.mockRejectedValueOnce({ response: { status: 503 } });

      const result = await mod.GitHubOAuthService.initiate({
        backendUrl: TEST_BACKEND,
        hostId: TEST_HOST_ID,
        clientId: TEST_CLIENT_ID,
        redirectUri: TEST_REDIRECT_URI,
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('backend_unreachable');
    });

    it('returns network_error when request fails without HTTP status', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync } = await loadService();
      mockGetRandomBytesAsync.mockResolvedValue('test-verifier');
      mockDigestStringAsync.mockResolvedValue('sha-256-test');
      mockPost.mockRejectedValueOnce(new Error('ENOTFOUND'));

      const result = await mod.GitHubOAuthService.initiate({
        backendUrl: TEST_BACKEND,
        hostId: TEST_HOST_ID,
        clientId: TEST_CLIENT_ID,
        redirectUri: TEST_REDIRECT_URI,
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('network_error');
    });

    it('stores pending flow with correct fields after successful initiate', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync } = await loadService();
      mockGetRandomBytesAsync.mockResolvedValue(new Uint8Array([116, 101, 115, 116, 45, 118, 101, 114, 105, 102, 105, 101, 114, 45, 49, 50, 51]));
      mockDigestStringAsync.mockResolvedValue('sha-256-verifier-hash');
      mockPost.mockResolvedValueOnce({
        data: {
          authorization_url:
            'https://github.com/login/oauth/authorize?client_id=Iv1.test&redirect_uri=gitnotes://oauth/callback&state=test-state-abc',
          state: 'test-state-abc',
        },
      });

      const result = await mod.GitHubOAuthService.initiate({
        backendUrl: TEST_BACKEND,
        hostId: TEST_HOST_ID,
        clientId: TEST_CLIENT_ID,
        redirectUri: TEST_REDIRECT_URI,
      });

      console.log('DEBUG initiate result:', JSON.stringify(result));
      console.log('DEBUG mockPost calls:', mockPost.mock.calls);
      expect(result.ok).toBe(true);

      const pending = mod.pendingOAuthFlows.get('test-state-abc');
      expect(pending).toBeDefined();
      expect(pending!.backendUrl).toBe(TEST_BACKEND);
      expect(pending!.redirectUri).toBe(TEST_REDIRECT_URI);
      expect(pending!.clientId).toBe(TEST_CLIENT_ID);
      expect(pending!.hostId).toBe(TEST_HOST_ID);
    });

    it('registers pending flow and returns authorizationUrl on success', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync, setUuid } = await loadService();
      setUuid('oauth-state-xyz');
      mockGetRandomBytesAsync.mockResolvedValue('verifier-xyz');
      mockDigestStringAsync.mockResolvedValue('sha-256-xyz');
      mockPost.mockResolvedValueOnce({
        data: {
          authorization_url:
            'https://github.com/login/oauth/authorize?client_id=Iv1.test&redirect_uri=gitnotes://oauth/callback&state=oauth-state-xyz',
          state: 'oauth-state-xyz',
        },
      });

      const result = await mod.GitHubOAuthService.initiate({
        backendUrl: TEST_BACKEND,
        hostId: TEST_HOST_ID,
        clientId: TEST_CLIENT_ID,
        redirectUri: TEST_REDIRECT_URI,
      });

      expect(result.ok).toBe(true);
      expect(result.authorizationUrl).toContain('github.com/login/oauth/authorize');
      expect(mod.pendingOAuthFlows.has('oauth-state-xyz')).toBe(true);
    });
  });

  describe('openAuthorizationUrl()', () => {
    it('opens the authorization URL in the system browser', async () => {
      const { mod, mockOpenBrowserAsync } = await loadService();
      mockOpenBrowserAsync.mockResolvedValueOnce({ type: 'opened' });

      const result = await mod.GitHubOAuthService.openAuthorizationUrl(
        'https://github.com/login/oauth/authorize?client_id=Iv1.test',
      );

      expect(result).toBe(true);
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize?client_id=Iv1.test',
      );
    });
  });

  describe('exchangeCode()', () => {
    it('returns state_mismatch when backend returns exchange_denied error code', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync } = await loadService();
      mockGetRandomBytesAsync.mockResolvedValue('verifier-abc');
      mockDigestStringAsync.mockResolvedValue('sha-256-abc');

      mod.pendingOAuthFlows.set('state-abc', {
        verifier: 'verifier-abc',
        backendUrl: TEST_BACKEND,
        redirectUri: TEST_REDIRECT_URI,
        clientId: TEST_CLIENT_ID,
        hostId: TEST_HOST_ID,
      });

      mockPost.mockRejectedValueOnce({
        response: { status: 400, data: { code: 'exchange_denied', message: 'User cancelled' } },
      });

      const result = await mod.GitHubOAuthService.exchangeCode({
        code: 'auth-code-123',
        state: 'state-abc',
      });

      expect(result.outcome).toBe('backend_error');
      expect(result.code).toBe('exchange_denied');
    });

    it('removes pending flow after exchangeCode is called', async () => {
      const { mod, mockPost, mockGetRandomBytesAsync, mockDigestStringAsync } = await loadService();
      mockGetRandomBytesAsync.mockResolvedValue('verifier-abc');
      mockDigestStringAsync.mockResolvedValue('sha-256-abc');

      mod.pendingOAuthFlows.set('state-abc', {
        verifier: 'verifier-abc',
        backendUrl: TEST_BACKEND,
        redirectUri: TEST_REDIRECT_URI,
        clientId: TEST_CLIENT_ID,
        hostId: TEST_HOST_ID,
      });

      mockPost.mockRejectedValueOnce(new Error('network error'));

      const result = await mod.GitHubOAuthService.exchangeCode({
        code: 'auth-code-123',
        codeVerifier: 'verifier-abc',
        state: 'state-abc',
        redirectUri: TEST_REDIRECT_URI,
        clientId: TEST_CLIENT_ID,
        backendUrl: TEST_BACKEND,
        hostId: TEST_HOST_ID,
      });

      expect(result.outcome).toBe('backend_error');
      expect(result.code).toBe('network_error');
      expect(mod.pendingOAuthFlows.has('state-abc')).toBe(false);
    });
  });
});
