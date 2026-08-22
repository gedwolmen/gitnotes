/**
 * Tests for gitHttp.ts HTTP streaming (issue #790).
 *
 * Verifies:
 * - When `response.body.getReader()` exists -> streaming path is used,
 *   chunks are collected and concatenated correctly.
 * - When `response.body` is null -> falls back to `response.arrayBuffer()`.
 * - When `reader.read()` throws mid-stream -> `reader.cancel()` is called
 *   and the error is rethrown.
 * - When the AbortController fires during streaming -> a timeout-like error
 *   is thrown and `reader.cancel()` is invoked.
 */

import type { GitHttpRequest } from 'isomorphic-git';
import { gitHttp } from '../../../src/services/git/gitHttp';

const buildRequest = (url: string): GitHttpRequest => ({
  url,
  method: 'POST' as const,
  headers: {},
  body: undefined,
});

function collectBody(body: AsyncIterableIterator<Uint8Array>): Promise<Uint8Array> {
  return (async () => {
    const chunks: Uint8Array[] = [];
    for await (const ch of body) chunks.push(ch);
    let total = 0;
    for (const c of chunks) total += c.length;
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    return merged;
  })();
}

describe('gitHttp.request streaming (issue #790)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('Case A: streams response body via getReader() and concatenates chunks', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    const chunk3 = new Uint8Array([9, 10, 11, 12]);
    const chunks = [chunk1, chunk2, chunk3];
    let i = 0;
    const cancel = jest.fn().mockResolvedValue(undefined);
    const reader = {
      read: jest.fn().mockImplementation(async () => {
        if (i >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[i++] };
      }),
      cancel,
    };
    const responseBody = { getReader: () => reader };
    const mockHeaders = { forEach: (_cb: (v: string, k: string) => void) => {} };

    (globalThis as { fetch?: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        url: 'https://example.git/info/refs',
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: responseBody,
        arrayBuffer: jest.fn(),
      }) as unknown as typeof fetch;

    const resp = await gitHttp.request(buildRequest('https://example.git/info/refs'));
    const bytes = await collectBody(resp.body!);

    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(reader.read).toHaveBeenCalledTimes(4);
    expect(resp.statusCode).toBe(200);
  });

  test('Case A2: preserves chunk granularity instead of merging into one buffer (#982)', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6, 7, 8]);
    const chunk3 = new Uint8Array([9, 10, 11, 12]);
    const chunks = [chunk1, chunk2, chunk3];
    let i = 0;
    const reader = {
      read: jest.fn().mockImplementation(async () => {
        if (i >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[i++] };
      }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    const responseBody = { getReader: () => reader };
    const mockHeaders = { forEach: (_cb: (v: string, k: string) => void) => {} };

    (globalThis as { fetch?: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        url: 'https://example.git/info/refs',
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: responseBody,
        arrayBuffer: jest.fn(),
      }) as unknown as typeof fetch;

    const resp = await gitHttp.request(buildRequest('https://example.git/info/refs'));
    const yielded: Uint8Array[] = [];
    for await (const ch of resp.body!) yielded.push(ch);

    expect(yielded).toHaveLength(3);
    expect(yielded[0]).toEqual(chunk1);
    expect(yielded[1]).toEqual(chunk2);
    expect(yielded[2]).toEqual(chunk3);
  });

  test('Case B: falls back to arrayBuffer when response.body is null', async () => {
    const mockHeaders = { forEach: (_cb: (v: string, k: string) => void) => {} };
    const arrayBuffer = jest
      .fn()
      .mockResolvedValue(new Uint8Array([100, 200, 255]).buffer);

    (globalThis as { fetch?: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        url: 'https://example.git/info/refs',
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: null,
        arrayBuffer,
      }) as unknown as typeof fetch;

    const resp = await gitHttp.request(buildRequest('https://example.git/info/refs'));
    const bytes = await collectBody(resp.body!);

    expect(bytes).toEqual(new Uint8Array([100, 200, 255]));
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  test('Case C: rethrows error and calls reader.cancel() when read() throws', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const readError = new Error('unexpected EOF during stream');
    const reader = {
      read: jest.fn().mockRejectedValue(readError),
      cancel,
    };
    const responseBody = { getReader: () => reader };
    const mockHeaders = { forEach: (_cb: (v: string, k: string) => void) => {} };

    (globalThis as { fetch?: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        url: 'https://example.git/info/refs',
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: responseBody,
      }) as unknown as typeof fetch;

    await expect(
      gitHttp.request(buildRequest('https://example.git/info/refs')),
    ).rejects.toThrow('unexpected EOF during stream');

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('Case D: emits timeout error and cancels reader when AbortError during streaming', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const reader = {
      read: jest.fn().mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(abortError), 5);
        });
      }),
      cancel,
    };
    const responseBody = { getReader: () => reader };
    const mockHeaders = { forEach: (_cb: (v: string, k: string) => void) => {} };

    (globalThis as { fetch?: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue({
        url: 'https://example.git/info/refs',
        status: 200,
        statusText: 'OK',
        headers: mockHeaders,
        body: responseBody,
      }) as unknown as typeof fetch;

    await expect(
      gitHttp.request(buildRequest('https://example.git/info/refs')),
    ).rejects.toThrow(/timed out/);

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
