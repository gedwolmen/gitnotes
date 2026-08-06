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

describe('GitHubService.updateFile', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await GitHubService.setToken('token', testUser);
  });

  afterEach(async () => {
    await GitHubService.clearToken();
  });

  test('throws terminal contents API errors with HTTP details', async () => {
    const error = {
      response: {
        status: 403,
        headers: { 'x-github-sso': 'required' },
        data: { message: 'Permission denied' },
      },
    };
    mockHttpRequest.mockResolvedValueOnce({ data: { sha: 'old-sha' } });
    mockHttpRequest.mockRejectedValue(error);

    await expect(
      GitHubService.updateFile('owner', 'repo', 'notes/forbidden.md', 'content', 'Update note'),
    ).rejects.toMatchObject({
      status: 403,
      headers: { 'x-github-sso': 'required' },
      message: 'Permission denied',
    });
  });

  test('returns null when an expected remote file no longer exists', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: {} });

    await expect(
      GitHubService.updateFile('owner', 'repo', 'notes/deleted.md', 'content', 'Update note', 'main', {
        expectExists: true,
      }),
    ).resolves.toBeNull();
  });

  test('returns the synthetic empty-SHA result for 422 responses', async () => {
    mockHttpRequest.mockResolvedValueOnce({ data: { sha: 'old-sha' } });
    mockHttpRequest.mockRejectedValueOnce({
      response: { status: 422, data: { message: 'Unprocessable entity' } },
    });

    await expect(
      GitHubService.updateFile('owner', 'repo', 'notes/already-updated.md', 'content', 'Update note'),
    ).resolves.toEqual({ content: { sha: '' }, commit: { sha: '' } });
  });
});
