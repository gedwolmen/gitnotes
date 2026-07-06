import { GitHubHostService } from '../src/services/git/GitHubHostService';
import { GitLabService } from '../src/services/git/GitLabService';
import { GiteaLikeHostService } from '../src/services/git/GiteaLikeHostService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── GitHub mocks ────────────────────────────────────────────────────

const mockGetFileSha = jest.fn();
const mockGetFileShaOrNull = jest.fn();
const mockUpdateFile = jest.fn();
const mockDeleteFile = jest.fn();
const mockUploadBinaryFile = jest.fn();
const mockGetRepoPrivacy = jest.fn();

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    getFileSha: (...args: unknown[]) => mockGetFileSha(...args),
    getFileShaOrNull: (...args: unknown[]) => mockGetFileShaOrNull(...args),
    updateFile: (...args: unknown[]) => mockUpdateFile(...args),
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
    uploadBinaryFile: (...args: unknown[]) => mockUploadBinaryFile(...args),
    getRepoPrivacy: (...args: unknown[]) => mockGetRepoPrivacy(...args),
  },
  GitHubServiceStatic: {
    rawGet: jest.fn(async () => null),
    getRepoMeta: jest.fn(async () => ({ default_branch: 'main' })),
  },
}));

beforeEach(() => {
  mockGetFileSha.mockReset();
  mockGetFileShaOrNull.mockReset();
  mockUpdateFile.mockReset();
  mockDeleteFile.mockReset();
  mockUploadBinaryFile.mockReset();
  mockGetRepoPrivacy.mockReset();
});

// ── GitLab & Gitea fetch mock ───────────────────────────────────────

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

function primeGitLab(endpointBody: unknown, endpointStatus = 200): GitLabService {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
  return new GitLabService();
}

function primeGitea(endpointBody: unknown, endpointStatus = 200): GiteaLikeHostService {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
  return new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
}

// ════════════════════════════════════════════════════════════════════
// GitHubHostService write tests
// ════════════════════════════════════════════════════════════════════

describe('GitHubHostService — write', () => {
  it('getFileSha delegates to GitHubService.getFileSha', async () => {
    mockGetFileSha.mockResolvedValueOnce({ kind: 'found', sha: 'abc123' });
    const svc = new GitHubHostService();
    const result = await svc.getFileSha('octocat', 'hello', 'README.md', 'main');
    expect(mockGetFileSha).toHaveBeenCalledWith('octocat', 'hello', 'README.md', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'abc123' });
  });

  it('getFileSha returns not-found', async () => {
    mockGetFileSha.mockResolvedValueOnce({ kind: 'not-found' });
    const result = await new GitHubHostService().getFileSha('octocat', 'hello', 'x.md');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('getFileShaOrNull delegates to GitHubService.getFileShaOrNull', async () => {
    mockGetFileShaOrNull.mockResolvedValueOnce('abc123');
    const result = await new GitHubHostService().getFileShaOrNull('octocat', 'hello', 'README.md', 'main');
    expect(mockGetFileShaOrNull).toHaveBeenCalledWith('octocat', 'hello', 'README.md', 'main');
    expect(result).toBe('abc123');
  });

  it('getFileShaOrNull returns null when not found', async () => {
    mockGetFileShaOrNull.mockResolvedValueOnce(null);
    const result = await new GitHubHostService().getFileShaOrNull('octocat', 'hello', 'x.md');
    expect(result).toBeNull();
  });

  it('updateFile delegates to GitHubService.updateFile and returns new sha', async () => {
    mockUpdateFile.mockResolvedValueOnce({ content: { sha: 'newsha' } });
    const result = await new GitHubHostService().updateFile(
      'octocat', 'hello', 'README.md', 'hello', 'update', 'main',
    );
    expect(mockUpdateFile).toHaveBeenCalledWith(
      'octocat', 'hello', 'README.md', 'hello', 'update', 'main',
      { expectExists: false },
    );
    expect(result).toBe('newsha');
  });

  it('updateFile passes expectExists:true when knownSha is provided', async () => {
    mockUpdateFile.mockResolvedValueOnce({ content: { sha: 'newsha' } });
    await new GitHubHostService().updateFile(
      'octocat', 'hello', 'README.md', 'hello', 'update', 'main', 'known',
    );
    expect(mockUpdateFile).toHaveBeenCalledWith(
      'octocat', 'hello', 'README.md', 'hello', 'update', 'main',
      { expectExists: true },
    );
  });

  it('updateFile throws when no sha in response', async () => {
    mockUpdateFile.mockResolvedValueOnce({ content: {} });
    await expect(
      new GitHubHostService().updateFile('octocat', 'hello', 'x.md', 'hi', 'msg', 'main'),
    ).rejects.toThrow('GitHub updateFile returned no sha');
  });

  it('deleteFile delegates to GitHubService.deleteFile', async () => {
    mockDeleteFile.mockResolvedValueOnce(undefined);
    await new GitHubHostService().deleteFile('octocat', 'hello', 'x.md', 'msg', 'abc', 'main');
    expect(mockDeleteFile).toHaveBeenCalledWith('octocat', 'hello', 'x.md', 'msg', 'abc', 'main');
  });

  it('uploadBinaryFile delegates to GitHubService and returns raw URL', async () => {
    mockUploadBinaryFile.mockResolvedValueOnce({});
    const url = await new GitHubHostService().uploadBinaryFile(
      'octocat', 'hello', 'img.png', 'b64', 'upload', 'main',
    );
    expect(mockUploadBinaryFile).toHaveBeenCalledWith(
      'octocat', 'hello', 'img.png', 'b64', 'upload', 'main',
    );
    expect(url).toBe('https://raw.githubusercontent.com/octocat/hello/main/img.png');
  });

  it('uploadBinaryFile throws on failure', async () => {
    mockUploadBinaryFile.mockResolvedValueOnce(null);
    await expect(
      new GitHubHostService().uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'msg', 'main'),
    ).rejects.toThrow('GitHub uploadBinaryFile failed');
  });

  it('getRepoPrivacy delegates to GitHubService.getRepoPrivacy', async () => {
    mockGetRepoPrivacy.mockResolvedValueOnce(true);
    const result = await new GitHubHostService().getRepoPrivacy('octocat', 'hello');
    expect(mockGetRepoPrivacy).toHaveBeenCalledWith('octocat', 'hello');
    expect(result).toBe(true);
  });

  it('getRepoPrivacy returns false for public repos', async () => {
    mockGetRepoPrivacy.mockResolvedValueOnce(false);
    const result = await new GitHubHostService().getRepoPrivacy('octocat', 'hello');
    expect(result).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// GitLabService write tests
// ════════════════════════════════════════════════════════════════════

describe('GitLabService — write', () => {
  it('getFileSha returns found with blob_id when file exists', async () => {
    const svc = primeGitLab({ blob_id: 'blob1', file_name: 'README.md', file_path: 'README.md' });
    await svc.setToken('glpat-abc');
    const result = await svc.getFileSha('inkscape', 'inkscape', 'README.md', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'blob1' });
  });

  it('getFileSha returns not-found on 404', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }))
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // Second call: getDefaultBranch succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await svc.getFileSha('inkscape', 'inkscape', 'missing.md');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('getFileShaOrNull returns sha string', async () => {
    const svc = primeGitLab({ blob_id: 'blob1', file_name: 'f', file_path: 'f' });
    await svc.setToken('glpat-abc');
    const sha = await svc.getFileShaOrNull('inkscape', 'inkscape', 'f', 'main');
    expect(sha).toBe('blob1');
  });

  it('getFileShaOrNull returns null when not found', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }))
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const sha = await svc.getFileShaOrNull('inkscape', 'inkscape', 'missing.md');
    expect(sha).toBeNull();
  });

  it('updateFile creates new file with POST', async () => {
    // Auth: user probe
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // POST succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    // getFileSha after success
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'newsha' }));
    const sha = await svc.updateFile('inkscape', 'inkscape', 'new.md', 'content', 'add', 'main');
    expect(sha).toBe('newsha');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 2];
    expect(call).toEqual([
      expect.stringContaining('https://gitlab.com/api/v4/projects/'),
      expect.objectContaining({ method: 'POST' }),
    ]);
  });

  it('updateFile updates existing file with PUT when knownSha provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    // getFileSha after success
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'updatedsha' }));
    const sha = await svc.updateFile('inkscape', 'inkscape', 'f.md', 'v2', 'update', 'main', 'oldspec');
    expect(sha).toBe('updatedsha');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 2];
    expect(call).toEqual([
      expect.stringContaining('https://gitlab.com/api/v4/projects/'),
      expect.objectContaining({ method: 'PUT' }),
    ]);
  });

  it('updateFile retries on 409', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // First attempt: 409
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    // Re-fetch sha
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'latest' }));
    // Second attempt: success
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));
    // getFileSha after success
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'final' }));
    const sha = await svc.updateFile('inkscape', 'inkscape', 'f.md', 'v3', 'update', 'main');
    expect(sha).toBe('final');
  });

  it('updateFile throws after 3 failures', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // 3 attempts all 409, with re-fetches between
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'sha1' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'sha2' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      svc.updateFile('inkscape', 'inkscape', 'f.md', 'v3', 'update', 'main'),
    ).rejects.toThrow('GitLab updateFile failed: 500');
  });

  it('deleteFile succeeds', async () => {
    const svc = primeGitLab({}, 204);
    await svc.setToken('glpat-abc');
    await expect(
      svc.deleteFile('inkscape', 'inkscape', 'x.md', 'msg', 'sha', 'main'),
    ).resolves.toBeUndefined();
  });

  it('deleteFile throws on failure', async () => {
    const svc = primeGitLab({}, 403);
    await svc.setToken('glpat-abc');
    await expect(
      svc.deleteFile('inkscape', 'inkscape', 'x.md', 'msg', 'sha', 'main'),
    ).rejects.toThrow('GitLab deleteFile failed: 403');
  });

  it('uploadBinaryFile returns /-/raw/ URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // getFileSha for existing file
    mockFetch.mockResolvedValueOnce(jsonResponse({ blob_id: 'oldsha' }));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('inkscape', 'inkscape', 'img.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitlab.com/inkscape/inkscape/-/raw/main/img.png');
  });

  it('uploadBinaryFile creates with POST when file does not exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    // getFileSha returns not-found
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    // POST succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('inkscape', 'inkscape', 'new.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitlab.com/inkscape/inkscape/-/raw/main/new.png');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(call).toEqual([
      expect.stringContaining('https://gitlab.com/api/v4/projects/'),
      expect.objectContaining({ method: 'POST' }),
    ]);
  });

  it('uploadBinaryFile throws on failure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));
    await expect(
      svc.uploadBinaryFile('inkscape', 'inkscape', 'img.png', 'b64', 'msg', 'main'),
    ).rejects.toThrow('GitLab uploadBinaryFile failed: 400');
  });

  it('getRepoPrivacy returns true for private repos', async () => {
    const svc = primeGitLab({ visibility: 'private' });
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBe(true);
  });

  it('getRepoPrivacy returns false for public repos', async () => {
    const svc = primeGitLab({ visibility: 'public' });
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBe(false);
  });

  it('getRepoPrivacy returns null on error', async () => {
    const svc = primeGitLab(null, 404);
    await svc.setToken('glpat-abc');
    const result = await svc.getRepoPrivacy('inkscape', 'inkscape');
    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// GiteaLikeHostService write tests
// ════════════════════════════════════════════════════════════════════

describe('GiteaLikeHostService — write', () => {
  it('getFileSha returns found with sha field', async () => {
    const svc = primeGitea({ name: 'README.md', sha: 'giteasha1' });
    await svc.setToken('gt-abc');
    const result = await svc.getFileSha('octocat', 'hello', 'README.md', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'giteasha1' });
  });

  it('getFileSha returns not-found on 404', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }))
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await svc.getFileSha('octocat', 'hello', 'missing.md');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('getFileShaOrNull returns sha string', async () => {
    const svc = primeGitea({ name: 'f', sha: 'giteasha1' });
    await svc.setToken('gt-abc');
    const sha = await svc.getFileShaOrNull('octocat', 'hello', 'f', 'main');
    expect(sha).toBe('giteasha1');
  });

  it('getFileShaOrNull returns null when not found', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }))
      .mockResolvedValueOnce(jsonResponse({}, 200));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    const sha = await svc.getFileShaOrNull('octocat', 'hello', 'missing.md');
    expect(sha).toBeNull();
  });

  it('updateFile creates new file with PUT', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    // PUT succeeds with content.sha in response
    mockFetch.mockResolvedValueOnce(jsonResponse({ content: { sha: 'giteasha2' } }));
    const sha = await svc.updateFile('octocat', 'hello', 'new.md', 'content', 'add', 'main');
    expect(sha).toBe('giteasha2');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(call).toEqual([
      expect.stringContaining('https://gitea.com/api/v1/repos/octocat/hello/contents/'),
      expect.objectContaining({ method: 'PUT' }),
    ]);
  });

  it('updateFile includes sha when knownSha provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ content: { sha: 'giteasha3' } }));
    const sha = await svc.updateFile('octocat', 'hello', 'f.md', 'v2', 'update', 'main', 'oldsha');
    expect(sha).toBe('giteasha3');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const body = JSON.parse(call[1].body);
    expect(body.sha).toBe('oldsha');
  });

  it('updateFile retries on 409', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    // First attempt: 409
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    // Re-fetch sha
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'f.md', sha: 'latest' }));
    // Second attempt: success
    mockFetch.mockResolvedValueOnce(jsonResponse({ content: { sha: 'final' } }));
    const sha = await svc.updateFile('octocat', 'hello', 'f.md', 'v3', 'update', 'main');
    expect(sha).toBe('final');
  });

  it('updateFile throws after 3 failures', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'f.md', sha: 'sha1' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'f.md', sha: 'sha2' }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      svc.updateFile('octocat', 'hello', 'f.md', 'v3', 'update', 'main'),
    ).rejects.toThrow('gitea updateFile failed: 500');
  });

  it('deleteFile succeeds', async () => {
    const svc = primeGitea({}, 204);
    await svc.setToken('gt-abc');
    await expect(
      svc.deleteFile('octocat', 'hello', 'x.md', 'msg', 'sha', 'main'),
    ).resolves.toBeUndefined();
  });

  it('deleteFile includes sha and branch in body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 204));
    await svc.deleteFile('octocat', 'hello', 'x.md', 'remove', 'abcsha', 'dev');
    const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ message: 'remove', sha: 'abcsha', branch: 'dev' });
  });

  it('deleteFile throws on failure', async () => {
    const svc = primeGitea({}, 403);
    await svc.setToken('gt-abc');
    await expect(
      svc.deleteFile('octocat', 'hello', 'x.md', 'msg', 'sha', 'main'),
    ).rejects.toThrow('gitea deleteFile failed: 403');
  });

  it('uploadBinaryFile returns /raw/branch/ URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    // getFileSha for existing file
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'img.png', sha: 'oldsha' }));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitea.com/octocat/hello/raw/branch/main/img.png');
  });

  it('uploadBinaryFile creates without sha when file does not exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    // getFileSha returns not-found
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    // PUT succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 201));
    const url = await svc.uploadBinaryFile('octocat', 'hello', 'new.png', 'b64', 'upload', 'main');
    expect(url).toBe('https://gitea.com/octocat/hello/raw/branch/main/new.png');
  });

  it('uploadBinaryFile throws on failure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));
    await expect(
      svc.uploadBinaryFile('octocat', 'hello', 'img.png', 'b64', 'msg', 'main'),
    ).rejects.toThrow('gitea uploadBinaryFile failed: 400');
  });

  it('getRepoPrivacy returns true for private repos', async () => {
    const svc = primeGitea({ private: true });
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBe(true);
  });

  it('getRepoPrivacy returns false for public repos', async () => {
    const svc = primeGitea({ private: false });
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBe(false);
  });

  it('getRepoPrivacy returns null on error', async () => {
    const svc = primeGitea(null, 404);
    await svc.setToken('gt-abc');
    const result = await svc.getRepoPrivacy('octocat', 'hello');
    expect(result).toBeNull();
  });
});

describe('Forgejo write (same implementation)', () => {
  it('constructs with forgejo provider and codeberg URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('forgejo', 'https://codeberg.org/api/v1');
    await svc.setToken('fj-abc');
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: 'f', sha: 'fjsha' }));
    const result = await svc.getFileSha('octocat', 'hello', 'f', 'main');
    expect(result).toEqual({ kind: 'found', sha: 'fjsha' });
  });
});