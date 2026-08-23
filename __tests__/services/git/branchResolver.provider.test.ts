jest.mock('../../../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCurrentBranch: jest.fn(async () => null),
  },
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../../../src/services/git/activeHost', () => ({
  getActiveGitHost: jest.fn(async () => null),
  clearActiveGitHostCache: jest.fn(),
}));

jest.mock('../../../src/services/AuthService', () => ({
  __esModule: true,
  default: {
    getToken: jest.fn(async () => 'tok'),
  },
  AuthService: {
    getToken: jest.fn(async () => 'tok'),
    getActiveSummary: jest.fn(async () => null),
  },
}));

import { resolveBranch, fetchGitLabDefaultBranch, __resetBranchCacheForTests } from '../../../src/services/git/branchResolver';
import { getActiveGitHost } from '../../../src/services/git/activeHost';
import AsyncStorage from '@react-native-async-storage/async-storage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  __resetBranchCacheForTests();
  mockFetch.mockReset();
  (getActiveGitHost as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.getItem as jest.Mock) = jest.fn(async () => null);
});

describe('resolveBranch provider routing + GitLab auth (bug-hunt loop4 #16)', () => {
  it('routes to the GitLab resolver when the active host is gitlab', async () => {
    (getActiveGitHost as jest.Mock).mockResolvedValue({
      provider: 'gitlab',
      baseUrl: 'https://gitlab.com/api/v4',
      token: 'glpat-x',
    });
    mockFetch.mockResolvedValue(jsonResponse({ default_branch: 'trunk' }));

    const branch = await resolveBranch('owner/repo');
    expect(branch).toBe('trunk');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gitlab.com/api/v4/projects/'),
      expect.any(Object),
    );
  });

  it('sends PRIVATE-TOKEN header for authenticated GitLab repos', async () => {
    (getActiveGitHost as jest.Mock).mockResolvedValue({
      provider: 'gitlab',
      baseUrl: 'https://gitlab.example.com/api/v4',
      token: 'glpat-secret',
    });
    await AsyncStorage.setItem('@gitnotes:gitlab_base_url', 'https://gitlab.example.com/api/v4/');
    mockFetch.mockResolvedValue(jsonResponse({ default_branch: 'main' }));

    const branch = await fetchGitLabDefaultBranch('owner/private-repo');
    expect(branch).toBe('main');

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-secret');
  });

  it('still uses the GitHub resolver when no host is active or provider is github', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ default_branch: 'develop' }));
    const branch = await resolveBranch('owner/repo');
    expect(branch).toBe('develop');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/'),
      expect.any(Object),
    );
  });
});
