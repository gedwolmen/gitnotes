import { GitLabService } from '../src/services/git/GitLabService';
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
    .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
}

function primeAuth(): GitLabService {
  mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
  return new GitLabService();
}

// ── getFileSha edge cases ──────────────────────────────────────────

describe('GitLabService — getFileSha edge cases', () => {
  it('triggers getDefaultBranch when ref is not provided', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    // getDefaultBranch fetch
    mockFetch.mockResolvedValueOnce(jsonResponse({ default_branch: 'develop' }));
    // getFileSha fetch
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'blob1', file_name: 'f', file_path: 'f' }));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'f');
    expect(result).toEqual({ kind: 'found', sha: 'blob1' });
    // Verify getDefaultBranch was called (project endpoint)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v4/projects/inkscape%2Finkscape'),
      expect.any(Object),
    );
  });

  it('does NOT trigger getDefaultBranch when ref is provided', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'blob1', file_name: 'f', file_path: 'f' }));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'f', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'blob1' });
    // Only one fetch after auth: the file endpoint
    // No default branch probe
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/repository/files/'),
    );
    expect(calls).toHaveLength(1);
  });

  it('returns error kind when authedFetchRaw throws', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    // fetch throws → authedFetchRaw returns null → getFileSha returns error
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'f', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Network error' });
  });

  it('returns error kind on unexpected status code', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'f', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Unexpected status: 500' });
  });

  it('returns error kind on 200 without blob_id', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ file_name: 'f' }, 200));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'f', 'main');
    expect(result).toEqual({ kind: 'error', message: 'Unexpected status: 200' });
  });
});

// ── updateFile edge cases ──────────────────────────────────────────

describe('GitLabService — updateFile edge cases', () => {
  it('throws on non-409 failure without retry', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(
      svc.updateFile('inkscape', 'inkscape', 'f.md', 'content', 'msg', 'main'),
    ).rejects.toThrow('GitLab updateFile failed: 401');
    // Only 1 attempt — no retry for non-409
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/repository/files/'),
    );
    expect(calls).toHaveLength(1);
  });

  it('uses POST when no knownSha and no retry sha', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'newsha' }));
    await svc.updateFile('inkscape', 'inkscape', 'new.md', 'content', 'msg', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/new.md'),
    );
    expect(call[1].method).toBe('POST');
    const body = JSON.parse(call[1].body);
    expect(body.encoding).toBe('base64');
    expect(body.commit_message).toBe('msg');
    expect(body.branch).toBe('main');
    expect(body.sha).toBeUndefined();
  });

  it('uses PUT with knownSha in body', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'newsha' }));
    await svc.updateFile('inkscape', 'inkscape', 'f.md', 'v2', 'msg', 'main', 'knownsha');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/f.md'),
    );
    expect(call[1].method).toBe('PUT');
    const body = JSON.parse(call[1].body);
    expect(body.sha).toBe('knownsha');
  });

  it('throws when update succeeds but sha re-fetch returns not-found', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(
      svc.updateFile('inkscape', 'inkscape', 'f.md', 'content', 'msg', 'main'),
    ).rejects.toThrow('GitLab updateFile succeeded but could not resolve SHA');
  });
});

// ── deleteFile edge cases ──────────────────────────────────────────

describe('GitLabService — deleteFile edge cases', () => {
  it('body does NOT include sha (GitLab ignores sha param)', async () => {
    primeAuthAndEndpoint({}, 204);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    await svc.deleteFile('inkscape', 'inkscape', 'x.md', 'remove it', 'ignored-sha', 'main');
    const call = mockFetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/x.md'),
    );
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ branch: 'main', commit_message: 'remove it' });
    expect(body.sha).toBeUndefined();
    expect(call[1].method).toBe('DELETE');
  });

  it('throws on 404 with descriptive message', async () => {
    primeAuthAndEndpoint({}, 404);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    await expect(
      svc.deleteFile('inkscape', 'inkscape', 'x.md', 'msg', 'sha', 'main'),
    ).rejects.toThrow('GitLab deleteFile failed: 404');
  });
});

// ── uploadBinaryFile edge cases ────────────────────────────────────

describe('GitLabService — uploadBinaryFile edge cases', () => {
  it('strips /api/v4 from base URL in returned raw URL', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    // getFileSha returns not-found
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    // POST succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('inkscape', 'inkscape', 'img.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitlab.com/inkscape/inkscape/-/raw/main/img.png');
  });

  it('uses PUT when file exists (sha found)', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    // getFileSha finds existing file
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'existsha', file_name: 'img.png', file_path: 'img.png' }));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    await svc.uploadBinaryFile('inkscape', 'inkscape', 'img.png', 'b64', 'upload', 'main');
    // getFileSha is the first call to /files/img.png; the upload is the second
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/img.png'),
    );
    expect(calls).toHaveLength(2);
    const call = calls[1];
    expect(call[1].method).toBe('PUT');
    const body = JSON.parse(call[1].body);
    expect(body.sha).toBe('existsha');
  });

  it('uses POST when file does not exist', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    // getFileSha returns not-found
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    // POST succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    await svc.uploadBinaryFile('inkscape', 'inkscape', 'new.png', 'b64', 'upload', 'main');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/new.png'),
    );
    expect(calls).toHaveLength(2);
    expect(calls[1][1].method).toBe('POST');
    const body = JSON.parse(calls[1][1].body);
    expect(body.sha).toBeUndefined();
  });

  it('includes encoding: base64 in body', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    await svc.uploadBinaryFile('inkscape', 'inkscape', 'img.png', 'b64data', 'upload', 'main');
    const calls = mockFetch.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('/files/img.png'),
    );
    expect(calls).toHaveLength(2);
    const body = JSON.parse(calls[1][1].body);
    expect(body.encoding).toBe('base64');
    expect(body.content).toBe('b64data');
  });
});

// ── getRepoPrivacy edge cases ──────────────────────────────────────

describe('GitLabService — getRepoPrivacy edge cases', () => {
  it('returns true for visibility: private', async () => {
    primeAuthAndEndpoint({ visibility: 'private' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBe(true);
  });

  it('returns false for visibility: public', async () => {
    primeAuthAndEndpoint({ visibility: 'public' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBe(false);
  });

  it('returns false for visibility: internal', async () => {
    primeAuthAndEndpoint({ visibility: 'internal' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBe(false);
  });

  it('returns null when authedFetch returns null', async () => {
    primeAuthAndEndpoint(null, 200);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBeNull();
  });
});

// ── getFileShaOrNull ───────────────────────────────────────────────

describe('GitLabService — getFileShaOrNull', () => {
  it('returns sha when found', async () => {
    primeAuthAndEndpoint({ blob_id: 'blob1', file_name: 'f', file_path: 'f' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const sha = await svc.getFileShaOrNull('inkscape', 'inkscape', 'f', 'main');
    expect(sha).toBe('blob1');
  });

  it('returns null on error kind', async () => {
    const svc = primeAuth();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse(null, 0));
    const sha = await svc.getFileShaOrNull('inkscape', 'inkscape', 'f', 'main');
    expect(sha).toBeNull();
  });
});