import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetBranchCacheForTests,
  fetchGitHubDefaultBranch,
  fetchGitLabDefaultBranch,
  invalidateBranchCache,
  resolveBranch,
} from '../../src/services/git/branchResolver';
import { GitFsService } from '../../src/services/git/GitFsService';

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCurrentBranch: jest.fn(),
  },
}));

const mockedGetCurrentBranch = GitFsService.getCurrentBranch as jest.MockedFunction<
  typeof GitFsService.getCurrentBranch
>;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(async () => {
  __resetBranchCacheForTests();
  mockedGetCurrentBranch.mockReset();
  (global.fetch as jest.Mock | undefined)?.mockReset?.();
  await AsyncStorage.clear();
});

describe('resolveBranch', () => {
  it('returns the hint when provided', async () => {
    mockedGetCurrentBranch.mockResolvedValue('master');
    const result = await resolveBranch('owner/repo', 'feature/x');
    expect(result).toBe('feature/x');
    expect(mockedGetCurrentBranch).not.toHaveBeenCalled();
  });

  it('falls back to local clone HEAD when no hint', async () => {
    mockedGetCurrentBranch.mockResolvedValue('master');
    const result = await resolveBranch('owner/repo');
    expect(result).toBe('master');
  });

  it('caches local lookup so a second call skips fs', async () => {
    mockedGetCurrentBranch.mockResolvedValue('develop');
    await resolveBranch('owner/repo');
    await resolveBranch('owner/repo');
    expect(mockedGetCurrentBranch).toHaveBeenCalledTimes(1);
  });

  it('invalidateBranchCache forces a re-lookup', async () => {
    mockedGetCurrentBranch.mockResolvedValue('main');
    await resolveBranch('owner/repo');
    invalidateBranchCache('owner/repo');
    await resolveBranch('owner/repo');
    expect(mockedGetCurrentBranch).toHaveBeenCalledTimes(2);
  });

  it('falls back to GitHub default_branch when local clone missing', async () => {
    mockedGetCurrentBranch.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ default_branch: 'trunk' }),
    }) as unknown as typeof fetch;
    const result = await resolveBranch('owner/repo');
    expect(result).toBe('trunk');
  });

  it('falls back to "main" when GitHub fetch fails', async () => {
    mockedGetCurrentBranch.mockResolvedValue(null);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const result = await resolveBranch('owner/repo');
    expect(result).toBe('main');
  });

  it('falls back to "main" when GitHub responds non-OK', async () => {
    mockedGetCurrentBranch.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const result = await resolveBranch('owner/repo');
    expect(result).toBe('main');
  });
});

describe('fetchGitHubDefaultBranch', () => {
  it('returns null on invalid path', async () => {
    expect(await fetchGitHubDefaultBranch('nope')).toBeNull();
  });

  it('returns the parsed default_branch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ default_branch: 'master' }),
    }) as unknown as typeof fetch;
    expect(await fetchGitHubDefaultBranch('foo/bar')).toBe('master');
  });
});

describe('fetchGitLabDefaultBranch', () => {
  it('returns null on invalid path', async () => {
    expect(await fetchGitLabDefaultBranch('nope')).toBeNull();
  });

  it('hits the gitlab.com public API when no base URL is persisted', async () => {
    const mockFetch = jest.fn().mockResolvedValue(jsonResponse({ default_branch: 'main' }));
    global.fetch = mockFetch as unknown as typeof fetch;
    const branch = await fetchGitLabDefaultBranch('inkscape/inkscape');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://gitlab.com/api/v4/projects/inkscape%2Finkscape'),
      expect.any(Object),
    );
    expect(branch).toBe('main');
  });

  it('honors a persisted self-hosted base URL', async () => {
    await AsyncStorage.setItem('@gitnotes:gitlab_base_url', 'https://gl.example.com/api/v4/');
    const mockFetch = jest.fn().mockResolvedValue(jsonResponse({ default_branch: 'develop' }));
    global.fetch = mockFetch as unknown as typeof fetch;
    const branch = await fetchGitLabDefaultBranch('team/repo');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gl.example.com/api/v4/projects/team%2Frepo',
      expect.any(Object),
    );
    expect(branch).toBe('develop');
  });

  it('returns null when the API call fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchGitLabDefaultBranch('x/y')).toBeNull();
  });
});
