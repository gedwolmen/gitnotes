import { fetchGitHubDefaultBranch } from '../../../src/services/git/branchResolver';
import AuthService from '../../../src/services/AuthService';

jest.mock('../../../src/services/AuthService', () => ({
  __esModule: true,
  default: { getToken: jest.fn() },
}));

jest.mock('../../../src/services/git/GitFsService', () => ({
  GitFsService: { getCurrentBranch: jest.fn() },
}));

const getTokenMock = AuthService.getToken as jest.Mock;

describe('fetchGitHubDefaultBranch', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    (global.fetch as jest.Mock | undefined)?.mockReset?.();
  });

  it('sends an Authorization header when a token is available', async () => {
    getTokenMock.mockResolvedValue('ghp_token');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ default_branch: 'trunk' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchGitHubDefaultBranch('foo/bar')).toBe('trunk');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/foo/bar',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer ghp_token',
          Accept: 'application/vnd.github.v3+json',
        },
      }),
    );
  });

  it('omits the Authorization header when no token is available', async () => {
    getTokenMock.mockResolvedValue(null);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ default_branch: 'main' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchGitHubDefaultBranch('foo/bar')).toBe('main');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/foo/bar',
      expect.objectContaining({
        headers: { Accept: 'application/vnd.github.v3+json' },
      }),
    );
  });

  it('returns null on a non-OK response', async () => {
    getTokenMock.mockResolvedValue('ghp_token');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    expect(await fetchGitHubDefaultBranch('foo/bar')).toBeNull();
  });

  it('returns null when the token lookup fails', async () => {
    getTokenMock.mockRejectedValue(new Error('storage unavailable'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ default_branch: 'main' }),
    }) as unknown as typeof fetch;

    expect(await fetchGitHubDefaultBranch('foo/bar')).toBeNull();
  });
});
