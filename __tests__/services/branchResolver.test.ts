import {
  __resetBranchCacheForTests,
  fetchGitHubDefaultBranch,
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

beforeEach(() => {
  __resetBranchCacheForTests();
  mockedGetCurrentBranch.mockReset();
  (global.fetch as jest.Mock | undefined)?.mockReset?.();
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
