import { GiteaLikeHostService } from '../src/services/git/GiteaLikeHostService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  (AsyncStorage.getItem as jest.Mock) = jest.fn(async () => null);
  (AsyncStorage.setItem as jest.Mock) = jest.fn(async () => undefined);
  (AsyncStorage.removeItem as jest.Mock) = jest.fn(async () => undefined);
});

function primeAuthAndEndpoint(endpointBody: unknown, endpointStatus = 200): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
}

function primeAuth(): GiteaLikeHostService {
  mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }));
  return new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
}

function forgejoAuth(): GiteaLikeHostService {
  mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }));
  return new GiteaLikeHostService('forgejo', 'https://codeberg.org/api/v1');
}

// ── getFileSha edge cases ──────────────────────────────────────────

describe('GiteaLikeHostService — getFileSha edge cases', () => {
  it('triggers getDefaultBranch when ref is not provided', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    // getDefaultBranch fetch
    mockFetch.mockResolvedValueOnce(jsonResponse({ default_branch: 'develop' }));
    // getFileSha fetch
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md');
    expect(result).toEqual({ kind: 'found', sha: 'abc123' });
    // Verify getDefaultBranch was called (repo endpoint)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/repos/octocat/hello'),
      expect.any(Object),
    );
  });

  it('does NOT trigger getDefaultBranch when ref is provided', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'abc123' }));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'abc123' });
    // Only one fetch after auth: the contents endpoint
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/'),
    );
    expect(calls).toHaveLength(1);
  });

  it('returns error kind when authedFetchRaw throws', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Network error' });
  });

  it('returns not-found kind on 404', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md', 'main');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns error kind on unexpected status code', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Unexpected status: 500' });
  });

  it('returns error kind on 200 without sha', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'f.md' }, 200));
    const result = await svc.getFileSha('octocat', 'hello', 'f.md', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Unexpected status: 200' });
  });
});

// ── updateFile edge cases ──────────────────────────────────────────

describe('GiteaLikeHostService — updateFile edge cases', () => {
  it('throws on non-409 failure without retry', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(
      svc.updateFile('octocat', 'hello', 'f.md', 'content', 'msg', 'main'),
    ).rejects.toThrow('gitea updateFile failed: 401');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/'),
    );
    expect(calls).toHaveLength(1);
  });

  it('always uses PUT method', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ content: { sha: 'newsha' } }, 201),
    );
    await svc.updateFile('octocat', 'hello', 'new.md', 'content', 'msg', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/new.md'),
    );
    expect(call[1].method).toBe('PUT');
  });

  it('body has message field (not commit_message)', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ content: { sha: 'newsha' } }, 201),
    );
    await svc.updateFile('octocat', 'hello', 'new.md', 'content', 'my commit msg', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/new.md'),
    );
    const body = JSON.parse(call[1].body);
    expect(body.message).toBe('my commit msg');
    expect(body.commit_message).toBeUndefined();
  });

  it('body has no encoding field', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ content: { sha: 'newsha' } }, 201),
    );
    await svc.updateFile('octocat', 'hello', 'new.md', 'content', 'msg', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/new.md'),
    );
    const body = JSON.parse(call[1].body);
    expect(body.encoding).toBeUndefined();
  });

  it('returns result.body.content.sha on success', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ content: { sha: 'returnedsha' } }, 201),
    );
    const sha = await svc.updateFile('octocat', 'hello', 'new.md', 'c', 'msg', 'main');
    expect(sha).toBe('returnedsha');
  });

  it('throws when response has no content.sha', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    await expect(
      svc.updateFile('octocat', 'hello', 'f.md', 'c', 'msg', 'main'),
    ).rejects.toThrow('gitea updateFile succeeded but no sha in response');
  });

  it('retries on 409 with fresh sha', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    // First attempt: 409
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    // getFileSha re-fetch after 409
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'freshsha' }));
    // Second attempt: success
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ content: { sha: 'newsha' } }, 200),
    );
    const sha = await svc.updateFile('octocat', 'hello', 'f.md', 'c', 'msg', 'main');
    expect(sha).toBe('newsha');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/'),
    );
    expect(calls).toHaveLength(3);
    // Second attempt body should include fresh sha
    const body = JSON.parse(calls[2][1].body);
    expect(body.sha).toBe('freshsha');
  });

  it('throws when retries are exhausted', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    // 3 attempts all fail with 409
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'sha1' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'sha2' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    await expect(
      svc.updateFile('octocat', 'hello', 'f.md', 'c', 'msg', 'main'),
    ).rejects.toThrow('gitea updateFile failed: 409');
  });
});

// ── deleteFile edge cases ──────────────────────────────────────────

describe('GiteaLikeHostService — deleteFile edge cases', () => {
  it('body includes sha field', async () => {
    primeAuthAndEndpoint({}, 204);
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    await svc.deleteFile('octocat', 'hello', 'x.md', 'remove it', 'my-sha', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/x.md'),
    );
    const body = JSON.parse(call[1].body);
    expect(body.sha).toBe('my-sha');
    expect(body.message).toBe('remove it');
    expect(body.branch).toBe('main');
    expect(call[1].method).toBe('DELETE');
  });

  it('throws on 404', async () => {
    primeAuthAndEndpoint({}, 404);
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    await expect(
      svc.deleteFile('octocat', 'hello', 'x.md', 'msg', 'sha', 'main'),
    ).rejects.toThrow('gitea deleteFile failed: 404');
  });

  it('throws when authedFetchRaw returns null', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      svc.deleteFile('octocat', 'hello', 'x.md', 'msg', 'sha', 'main'),
    ).rejects.toThrow('gitea deleteFile failed: unknown');
  });
});

// ── uploadBinaryFile edge cases ────────────────────────────────────

describe('GiteaLikeHostService — uploadBinaryFile edge cases', () => {
  it('strips /api/v1 from base URL in returned raw URL', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    // getFileSha returns not-found
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitea.com/octocat/hello/raw/branch/main/img.png');
  });

  it('always uses PUT method', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    await svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/img.png'),
    );
    expect(calls).toHaveLength(2);
    expect(calls[1][1].method).toBe('PUT');
  });

  it('includes sha in body when file already exists', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    // getFileSha finds existing file
    mockFetch.mockResolvedValueOnce(jsonResponse({ sha: 'existsha' }));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    await svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/img.png'),
    );
    expect(calls).toHaveLength(2);
    const body = JSON.parse(calls[1][1].body);
    expect(body.sha).toBe('existsha');
  });

  it('does not include sha in body when file does not exist', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    await svc.uploadBinaryFile('octocat', 'hello', 'new.png', 'b64', 'upload', 'main');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/contents/new.png'),
    );
    expect(calls).toHaveLength(2);
    const body = JSON.parse(calls[1][1].body);
    expect(body.sha).toBeUndefined();
  });

  it('throws on upload failure', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main'),
    ).rejects.toThrow('gitea uploadBinaryFile failed: 500');
  });

  it('throws when authedFetchRaw returns null', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main'),
    ).rejects.toThrow('gitea uploadBinaryFile failed: unknown');
  });
});

// ── getRepoPrivacy edge cases ──────────────────────────────────────

describe('GiteaLikeHostService — getRepoPrivacy edge cases', () => {
  it('returns true for private: true', async () => {
    primeAuthAndEndpoint({ private: true });
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBe(true);
  });

  it('returns false for private: false', async () => {
    primeAuthAndEndpoint({ private: false });
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBe(false);
  });

  it('returns null when authedFetch returns null', async () => {
    primeAuthAndEndpoint(null, 200);
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBeNull();
  });
});

// ── getFileShaOrNull ───────────────────────────────────────────────

describe('GiteaLikeHostService — getFileShaOrNull', () => {
  it('returns sha when found', async () => {
    primeAuthAndEndpoint({ sha: 'abc123' });
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const sha = await svc.getFileShaOrNull('octocat', 'hello', 'f.md', 'main');
    expect(sha).toBe('abc123');
  });

  it('returns null on error kind', async () => {
    const svc = primeAuth();
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    const sha = await svc.getFileShaOrNull('octocat', 'hello', 'f.md', 'main');
    expect(sha).toBeNull();
  });
});

// ── Forgejo-specific tests ─────────────────────────────────────────

describe('GiteaLikeHostService — Forgejo', () => {
  it('uses forgejo provider label in error messages', async () => {
    const svc = forgejoAuth();
    await svc.setToken('fj-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(
      svc.updateFile('octocat', 'hello', 'f.md', 'c', 'msg', 'main'),
    ).rejects.toThrow('forgejo updateFile failed: 401');
  });

  it('returns codeberg raw URL for uploadBinaryFile', async () => {
    const svc = forgejoAuth();
    await svc.setToken('fj-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://codeberg.org/octocat/hello/raw/branch/main/img.png');
  });
});