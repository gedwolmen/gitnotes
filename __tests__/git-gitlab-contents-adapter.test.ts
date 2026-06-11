import { Buffer } from 'buffer';
import { gitlabContentsAdapter } from '../src/services/git/hostAdapters/contents';
import { AuthService } from '../src/services/AuthService';
import { setActiveGitHostKind } from '../src/services/git/gitHttp';

/**
 * Tests for the GitLabContentsAdapter. Same strategy as the
 * Gitea tests: stub global `fetch` and verify request shape
 * (URL, method, body, auth header) and response shape
 * translation.
 */
describe('GitLabContentsAdapter — request shape', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    setActiveGitHostKind('gitlab');
    gitlabContentsAdapter.__resetShaCacheForTests();
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

  test('getFileSha returns { kind: "found", sha } on 200 with blob_id', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ blob_id: 'feedface', commit_id: 'abc' }), { status: 200 }),
    );
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('glpat_abc');

    const r = await gitlabContentsAdapter.getFileSha('group', 'project', 'p.md', 'main');
    expect(r).toEqual({ kind: 'found', sha: 'feedface' });

    const lastCall = (global.fetch as jest.Mock).mock.calls[0];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    // Project ID is URL-encoded: `group/project` → `group%2Fproject`
    expect(url).toContain('/api/v4/projects/group%2Fproject/repository/files/p.md');
    expect(url).toContain('ref=main');
    expect(init.method).toBe('GET');
    // Auth: empty username + PAT password, Basic
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf-8')).toBe(
      ':glpat_abc',
    );
  });

  test('getFileSha returns { kind: "not-found" } on 404', async () => {
    mockFetch(async () => new Response('not found', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('glpat_abc');

    const r = await gitlabContentsAdapter.getFileSha('group', 'project', 'missing.md');
    expect(r).toEqual({ kind: 'not-found' });
  });

  test('getFileShaOrNull returns the blob_id on hit', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ blob_id: 'cafe' }), { status: 200 }),
    );
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('glpat_abc');

    const sha = await gitlabContentsAdapter.getFileShaOrNull('group', 'project', 'p.md');
    expect(sha).toBe('cafe');
  });

  test('updateFile on a NEW file issues POST with encoding=base64', async () => {
    // First call (sha lookup GET) returns 404, so the adapter
    // takes the create path. Second call is the POST itself.
    let callIndex = 0;
    mockFetch(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({ blob_id: 'newBlob', commit_id: 'newCommit' }),
        { status: 201 },
      );
    });
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('glpat_abc');

    const r = await gitlabContentsAdapter.updateFile(
      'group',
      'project',
      'p.md',
      'body',
      'msg',
      'main',
    );
    expect(r).toEqual({ sha: 'newBlob', commitSha: 'newCommit' });

    const postInit = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
    expect(postInit.method).toBe('POST');
    const body = JSON.parse(postInit.body as string);
    expect(body).toMatchObject({
      message: 'msg',
      content: Buffer.from('body').toString('base64'),
      branch: 'main',
      encoding: 'base64',
    });
    // No last_commit_id on POST — adapter should not include it.
    expect(body.last_commit_id).toBeUndefined();
  });

  test('updateFile on an EXISTING file issues PUT with last_commit_id', async () => {
    let callIndex = 0;
    mockFetch(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify({ blob_id: 'existingBlob' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ blob_id: 'newBlob', commit_id: 'newCommit' }),
        { status: 200 },
      );
    });
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('glpat_abc');

    const r = await gitlabContentsAdapter.updateFile(
      'group',
      'project',
      'p.md',
      'body',
      'msg',
      'main',
    );
    expect(r).toEqual({ sha: 'newBlob', commitSha: 'newCommit' });

    const putInit = (global.fetch as jest.Mock).mock.calls[1][1] as RequestInit;
    expect(putInit.method).toBe('PUT');
    const putBody = JSON.parse(putInit.body as string);
    expect(putBody.last_commit_id).toBe('existingBlob');
  });

  test('updateFile with expectExists=true returns null on missing file', async () => {
    mockFetch(async () => new Response('missing', { status: 404 }));
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('glpat_abc');

    const r = await gitlabContentsAdapter.updateFile(
      'group',
      'project',
      'p.md',
      'body',
      'msg',
      'main',
      { expectExists: true },
    );
    expect(r).toBeNull();
  });

  test('deleteFile uses the Commits API with action=delete', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ id: 'commit-sha', short_id: 'abc1234' }), { status: 200 }),
    );
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('glpat_abc');

    const r = await gitlabContentsAdapter.deleteFile(
      'group',
      'project',
      'p.md',
      'msg',
      'someBlobId',
      'main',
    );
    expect(r).toEqual({ sha: '', commitSha: 'commit-sha' });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain('/api/v4/projects/group%2Fproject/repository/commits');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      branch: 'main',
      commit_message: 'msg',
      actions: [
        {
          action: 'delete',
          file_path: 'p.md',
          last_commit_id: 'someBlobId',
        },
      ],
    });
    // delete actions don't carry content/encoding
    expect(body.actions[0].content).toBeUndefined();
    expect(body.actions[0].encoding).toBeUndefined();
  });

  test('uploadBinaryFile uses the Commits API with action=create on missing file', async () => {
    // First call: sha lookup GET returns 404. Second call: POST to /commits.
    let callIndex = 0;
    mockFetch(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify({ id: 'newCommitId' }), { status: 200 });
    });
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('glpat_abc');

    const r = await gitlabContentsAdapter.uploadBinaryFile(
      'group',
      'project',
      'img.png',
      'iVBORw0KGgo=',
      'msg',
      'main',
    );
    // uploadBinaryFile returns the commit_id only (the new blob_id
    // is unknown until the next GET; the cache is invalidated).
    expect(r).toEqual({ sha: '', commitSha: 'newCommitId' });

    const commitCall = (global.fetch as jest.Mock).mock.calls[1];
    const init = commitCall[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      branch: 'main',
      commit_message: 'msg',
      actions: [
        {
          action: 'create',
          file_path: 'img.png',
          content: 'iVBORw0KGgo=',
          encoding: 'base64',
        },
      ],
    });
    // No last_commit_id on create.
    expect(body.actions[0].last_commit_id).toBeUndefined();
  });

  test('getFileShaCached returns cached blob_id without hitting the network on second call', async () => {
    const fetchSpy = jest.fn(
      async () => new Response(JSON.stringify({ blob_id: 'cached' }), { status: 200 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    jest.spyOn(AuthService, 'getToken').mockResolvedValue('glpat_abc');

    const r1 = await gitlabContentsAdapter.getFileShaCached('group', 'project', 'p.md', 'main');
    const r2 = await gitlabContentsAdapter.getFileShaCached('group', 'project', 'p.md', 'main');

    expect(r1).toEqual({ kind: 'found', sha: 'cached' });
    expect(r2).toEqual({ kind: 'found', sha: 'cached' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('throws when active host is not gitlab (defensive)', async () => {
    // Forget to set the active host — adapter should throw a
    // clear error rather than silently using the wrong host's
    // credentials.
    setActiveGitHostKind('github');
    jest.spyOn(AuthService, 'getToken').mockResolvedValueOnce('glpat_abc');
    mockFetch(async () => new Response('{}', { status: 200 }));

    await expect(gitlabContentsAdapter.getUser()).rejects.toThrow(/active gitlab host/);
  });
});
