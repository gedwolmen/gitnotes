/**
 * Unit tests for syncTiming.ts HTTP instrumentation.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../../src/services/git/gitHttp', () => ({
  gitHttp: {
    request: jest.fn(),
  },
}));

let gitHttp: { request: jest.Mock };
let syncTiming: typeof import('../../src/services/git/syncTiming');

beforeEach(() => {
  jest.resetModules();
  // Re-import after reset to get the mocked gitHttp
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mod = require('../../src/services/git/gitHttp') as { gitHttp: { request: jest.Mock } };
  gitHttp = mod.gitHttp;
  syncTiming = require('../../src/services/git/syncTiming');
  jest.clearAllMocks();
  gitHttp.request.mockResolvedValue({
    url: 'https://api.github.com/repos/test/notes',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    statusCode: 200,
    statusMessage: 'OK',
    body: null,
  });
});

afterEach(() => {
  syncTiming.disableSyncTiming();
});

describe('syncTiming', () => {
  describe('enableSyncTiming', () => {
    test('first call enables timing', () => {
      syncTiming.enableSyncTiming();
      expect(syncTiming.isSyncTimingEnabled()).toBe(true);
    });

    test('second call is idempotent (no-op, does not throw)', () => {
      syncTiming.enableSyncTiming();
      syncTiming.enableSyncTiming();
      expect(syncTiming.isSyncTimingEnabled()).toBe(true);
    });
  });

  describe('HTTP wrapper', () => {
    test('records an entry on request and passes response through unchanged', async () => {
      syncTiming.enableSyncTiming();
      const req = { url: 'https://api.github.com/repos/test/notes', method: 'POST', headers: {}, body: null };
      const result = await gitHttp.request(req);

      expect(result).toHaveProperty('statusCode', 200);
      const entries = syncTiming.flushSyncTiming();
      expect(entries).toHaveLength(1);
      expect(entries[0].kind).toBe('http');
      expect(entries[0].op).toContain('request:POST');
      expect(entries[0].url).toBe('https://api.github.com/repos/test/notes');
      expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test('records multiple entries for multiple requests', async () => {
      syncTiming.enableSyncTiming();
      await gitHttp.request({ url: 'https://example.com/1', method: 'GET', headers: {}, body: null });
      await gitHttp.request({ url: 'https://example.com/2', method: 'POST', headers: {}, body: null });

      const entries = syncTiming.flushSyncTiming();
      expect(entries).toHaveLength(2);
      expect(entries[0].url).toBe('https://example.com/1');
      expect(entries[1].url).toBe('https://example.com/2');
    });

    test('does not record calls made after disableSyncTiming', async () => {
      syncTiming.enableSyncTiming();
      await gitHttp.request({ url: 'https://example.com', method: 'GET', headers: {}, body: null });

      syncTiming.disableSyncTiming();
      await gitHttp.request({ url: 'https://example.com', method: 'GET', headers: {}, body: null });

      const entries = syncTiming.flushSyncTiming();
      expect(entries).toHaveLength(1);
      expect(entries[0].url).toBe('https://example.com');
    });
  });

  describe('flushSyncTiming', () => {
    test('returns and clears buffer', async () => {
      syncTiming.enableSyncTiming();
      await gitHttp.request({ url: 'https://example.com', method: 'GET', headers: {}, body: null });

      const entries = syncTiming.flushSyncTiming();
      expect(entries).toHaveLength(1);

      const second = syncTiming.flushSyncTiming();
      expect(second).toHaveLength(0);
    });
  });

  describe('attachMode', () => {
    test('labels entries with the current mode', async () => {
      syncTiming.enableSyncTiming();
      await gitHttp.request({ url: 'https://example.com', method: 'GET', headers: {}, body: null });

      syncTiming.attachMode('api');
      await gitHttp.request({ url: 'https://example.com', method: 'GET', headers: {}, body: null });

      const entries = syncTiming.flushSyncTiming();
      const clone = entries.filter((e) => e.mode === 'clone');
      const api = entries.filter((e) => e.mode === 'api');
      expect(clone).toHaveLength(1);
      expect(api).toHaveLength(1);
    });
  });
});
