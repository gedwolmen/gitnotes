import { Buffer } from 'buffer';
import { giteaContentsAdapter } from '../src/services/git/hostAdapters/contents';
import { AuthService } from '../src/services/AuthService';
import { setActiveGitHostKind } from '../src/services/git/gitHttp';

/**
 * Tests for the GiteaContentsAdapter. Strategy: stub global
 * `fetch` (the adapter hits Gitea directly) and verify request
 * shape (URL, method, body, auth header) and response shape
 * translation.
 *
 * The `setActiveGitHostKind('gitea')` call mirrors what
 * `GitFsService` does right before every clone / fetch / push —
 * the adapter reads it to build the Basic auth header.
 */
describe('GiteaContentsAdapter — request shape', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    setActiveGitHostKind('gitea');
    giteaContentsAdapter.__resetShaCacheForTests();
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function mockFetch(responder: (url: string, init: RequestInit) => Promise<Response> | Response) {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      return responder(url, init);
    }) as unknown as typeof fetch;
  }

  test('getFileSha returns { kind: "found", sha } on 200 with sha', async () => {
    mockFetch(async () => new Response(JSON.stringify({ sha: 'deadbeef' }), { status: 200 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('gt_abc');

    const r = await giteaContentsAdapter.getFileSha('me', 'notes', 'p.md', 'main');
    expect(r).toEqual({ kind: 'found', sha: 'deadbeef' });

    const lastCall = (global.fetch as jest.Mock).mock.calls[0];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toContain('/api/v1/repos/me/notes/contents/p.md');
    expect(url).toContain('ref=main');
    expect(init.method).toBe('GET');
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf-8')).toBe(
      'oauth2:gt_abc',
    );
  });

  test('getFileSha returns { kind: "not-found" } on 404', async () => {
    mockFetch(async () => new Response('not found', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('gt_abc');

    const r = await giteaContentsAdapter.getFileSha('me', 'notes', 'missing.md');
    expect(r).toEqual({ kind: 'not-found' });
  });

  test('getFileSha returns { kind: "error" } on 5xx', async () => {
    mockFetch(async () => new Response('boom', { status: 500 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('gt_abc');

    const r = await giteaContentsAdapter.getFileSha('me', 'notes', 'p.md');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.status).toBe(500);
  });

  test('getFileShaOrNull returns the sha string on hit', async () => {
    mockFetch(async () => new Response(JSON.stringify({ sha: 'cafe' }), { status: 200 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('gt_abc');

    const sha = await giteaContentsAdapter.getFileShaOrNull('me', 'notes', 'p.md');
    expect(sha).toBe('cafe');
  });

  test('getFileShaOrNull returns null on 404', async () => {
    mockFetch(async () => new Response('missing', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('gt_abc');

    const sha = await giteaContentsAdapter.getFileShaOrNull('me', 'notes', 'p.md');
    expect(sha).toBeNull();
  });

  test('updateFile on a NEW file uses POST', async () => {
    // First call (sha lookup GET) returns 404, so the adapter
    // takes the create path. Second call is the POST itself.
    let callIndex = 0;
    mockFetch(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({ content: { sha: 'newBlob' }, commit: { sha: 'newCommit' } }),
        { status: 201 },
      );
    });
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    const r = await giteaContentsAdapter.updateFile('me', 'notes', 'p.md', 'body', 'msg', 'main');
    expect(r).toEqual({ sha: 'newBlob', commitSha: 'newCommit' });

    const postInit = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
    expect(postInit.method).toBe('POST');
    const body = JSON.parse(postInit.body as string);
    expect(body).toMatchObject({
      message: 'msg',
      content: Buffer.from('body').toString('base64'),
      branch: 'main',
    });
    // No sha on POST — adapter should not include it.
    expect(body.sha).toBeUndefined();
  });

  test('updateFile on an EXISTING file uses PUT with the looked-up sha', async () => {
    // First call: getFileSha (sha lookup). Second call: PUT.
    let callIndex = 0;
    mockFetch(async (url) => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify({ sha: 'existingSha' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ content: { sha: 'newBlob' }, commit: { sha: 'newCommit' } }),
        { status: 200 },
      );
    });
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    const r = await giteaContentsAdapter.updateFile('me', 'notes', 'p.md', 'body', 'msg', 'main');
    expect(r).toEqual({ sha: 'newBlob', commitSha: 'newCommit' });

    const putInit = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
    expect(putInit.method).toBe('PUT');
    const putBody = JSON.parse(putInit.body as string);
    expect(putBody.sha).toBe('existingSha');
  });

  test('updateFile with expectExists=true returns null on missing file', async () => {
    mockFetch(async () => new Response('missing', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    const r = await giteaContentsAdapter.updateFile('me', 'notes', 'p.md', 'body', 'msg', 'main', {
      expectExists: true,
    });
    expect(r).toBeNull();
  });

  test('deleteFile returns synthetic success on 404', async () => {
    mockFetch(async () => new Response('already gone', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    const r = await giteaContentsAdapter.deleteFile('me', 'notes', 'p.md', 'msg', 'someSha', 'main');
    expect(r).toEqual({ sha: '', commitSha: '' });
  });

  test('deleteFile throws on terminal failure (preserves #567 contract)', async () => {
    mockFetch(async () => new Response('boom', { status: 500 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    await expect(
      giteaContentsAdapter.deleteFile('me', 'notes', 'p.md', 'msg', 'someSha', 'main'),
    ).rejects.toBeDefined();
  });

  test('getFileShaCached returns cached sha without hitting the network on second call', async () => {
    const fetchSpy = jest.fn(
      async () => new Response(JSON.stringify({ sha: 'cached' }), { status: 200 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('gt_abc');

    const r1 = await giteaContentsAdapter.getFileShaCached('me', 'notes', 'p.md', 'main');
    const r2 = await giteaContentsAdapter.getFileShaCached('me', 'notes', 'p.md', 'main');

    expect(r1).toEqual({ kind: 'found', sha: 'cached' });
    expect(r2).toEqual({ kind: 'found', sha: 'cached' });
    // Second call must be a cache hit — fetch should only have
    // been called once.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
