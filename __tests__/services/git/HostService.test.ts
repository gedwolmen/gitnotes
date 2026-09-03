const mockGetGitHostService = jest.fn();

jest.mock('../../../src/services/git/gitHostFactory', () => ({
  getGitHostService: (...args: unknown[]) => mockGetGitHostService(...args),
}));

import { HostService } from '../../../src/services/git/HostService';

const repo = {
  provider: 'github',
  full_name: 'octocat/hello-world',
};

describe('HostService repository item loading', () => {
  beforeEach(() => {
    mockGetGitHostService.mockReset();
  });

  it('dispatches GitHub pull requests and preserves valid data', async () => {
    const pullRequests = [{ id: 1, number: 12, title: 'Fix it' }];
    const listPullRequests = jest.fn().mockResolvedValue(pullRequests);
    mockGetGitHostService.mockReturnValue({ listPullRequests });

    await expect(HostService.listPullRequests(repo)).resolves.toEqual({ data: pullRequests });
    expect(mockGetGitHostService).toHaveBeenCalledWith('github');
    expect(listPullRequests).toHaveBeenCalledWith('octocat', 'hello-world', 'open');
  });

  it('returns a permission result instead of an empty issue list for a 403', async () => {
    const error = Object.assign(new Error('GitHub API error: 403 (Resource not accessible)'), { status: 403 });
    mockGetGitHostService.mockReturnValue({
      listIssues: jest.fn().mockRejectedValue(error),
    });

    await expect(HostService.listIssues(repo)).resolves.toEqual({
      kind: 'permission',
      message: 'GitHub API error: 403 (Resource not accessible)',
    });
  });
});
