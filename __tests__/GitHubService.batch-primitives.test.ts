jest.mock('../src/services/http', () => ({
  __esModule: true,
  default: { request: jest.fn() },
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

jest.mock('../src/services/AuthService', () => ({
  __esModule: true,
  default: { setToken: jest.fn(), clearToken: jest.fn() },
}));

import { GitHubService } from '../src/services/GitHubService';
import http from '../src/services/http';

const mockHttpRequest = http.request as jest.Mock;

const testUser = {
  login: 'octocat',
  id: 1,
  avatar_url: '',
  html_url: '',
  name: 'Octocat',
  email: 'octocat@example.com',
};

describe('GitHubService Git-Data batch primitives', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await GitHubService.setToken('token', testUser);
  });

  afterEach(async () => {
    await GitHubService.clearToken();
  });

  test('createBlob posts base64 content to /git/blobs', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { sha: 'blob-sha' } });

    await expect(GitHubService.createBlob('owner', 'repo', 'hello')).resolves.toEqual({ sha: 'blob-sha' });

    expect(mockHttpRequest).toHaveBeenCalledWith({
      url: 'https://api.github.com/repos/owner/repo/git/blobs',
      method: 'POST',
      data: { content: Buffer.from('hello', 'utf-8').toString('base64'), encoding: 'base64' },
    });
  });

  test('createTree sends base_tree when baseTree is provided', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { sha: 'tree-sha' } });
    const tree = [{ path: 'notes/a.md', mode: '100644', type: 'blob', sha: 'blob-sha' }];

    await expect(
      GitHubService.createTree('owner', 'repo', tree, { baseTree: 'base-tree-sha' }),
    ).resolves.toEqual({ sha: 'tree-sha' });

    expect(mockHttpRequest).toHaveBeenCalledWith({
      url: 'https://api.github.com/repos/owner/repo/git/trees',
      method: 'POST',
      data: { tree, base_tree: 'base-tree-sha' },
    });
  });

  test('createTree omits base_tree when no baseTree provided', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { sha: 'tree-sha' } });
    const tree = [{ path: 'notes/a.md', mode: '100644', type: 'blob', sha: 'blob-sha' }];

    await expect(GitHubService.createTree('owner', 'repo', tree)).resolves.toEqual({ sha: 'tree-sha' });

    expect(mockHttpRequest).toHaveBeenCalledWith({
      url: 'https://api.github.com/repos/owner/repo/git/trees',
      method: 'POST',
      data: { tree },
    });
  });

  test('getRepositorySize returns the repo size in KB (#1037)', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { size: 262144 } });

    await expect(GitHubService.getRepositorySize('owner', 'repo')).resolves.toBe(262144);
    expect(mockHttpRequest).toHaveBeenCalledWith({
      url: 'https://api.github.com/repos/owner/repo',
      method: 'GET',
      data: undefined,
    });
  });

  test('getRepositorySize returns null when size is absent', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { name: 'repo' } });

    await expect(GitHubService.getRepositorySize('owner', 'repo')).resolves.toBeNull();
  });

  test('getRepositorySize returns null on request failure', async () => {
    mockHttpRequest.mockRejectedValueOnce(new Error('network down'));

    await expect(GitHubService.getRepositorySize('owner', 'repo')).resolves.toBeNull();
  });
});
