import { githubContentsAdapter } from '../src/services/git/hostAdapters/contents';
import { GitHubService } from '../src/services/GitHubService';

/**
 * Smoke tests for the GitHubContentsAdapter translation layer.
 *
 * The adapter is a thin wrapper over `GitHubService`; the real
 * behaviour is covered by GitHubService's own tests. These cases
 * verify only that the adapter's I/O shapes match the
 * `ContentsAdapter` contract (so the per-host dispatch in the
 * `*GitHubSyncService` files compiles against the right types).
 *
 * We stub the underlying GitHubService methods via `jest.spyOn`
 * rather than mocking the network, so the tests don't depend on
 * any external state.
 */
describe('GitHubContentsAdapter — shape contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getFileSha returns the typed result shape verbatim', async () => {
    jest
      .spyOn(GitHubService, 'getFileSha')
      .mockResolvedValueOnce({ kind: 'found', sha: 'abc123' });
    const r = await githubContentsAdapter.getFileSha('octo', 'cat', 'notes/x.md');
    expect(r).toEqual({ kind: 'found', sha: 'abc123' });

    jest
      .spyOn(GitHubService, 'getFileSha')
      .mockResolvedValueOnce({ kind: 'not-found' });
    const r2 = await githubContentsAdapter.getFileSha('octo', 'cat', 'notes/y.md');
    expect(r2).toEqual({ kind: 'not-found' });

    jest.spyOn(GitHubService, 'getFileSha').mockResolvedValueOnce({
      kind: 'error',
      status: 500,
      message: 'boom',
    });
    const r3 = await githubContentsAdapter.getFileSha('octo', 'cat', 'notes/z.md');
    expect(r3).toEqual({ kind: 'error', status: 500, message: 'boom' });
  });

  test('updateFile unwraps GitHubService.GitHubFileCommit to ContentsFileCommit', async () => {
    jest.spyOn(GitHubService, 'updateFile').mockResolvedValueOnce({
      content: { sha: 'newBlob' },
      commit: { sha: 'newCommit' },
    } as any);
    const r = await githubContentsAdapter.updateFile('o', 'r', 'p.md', 'body', 'msg', 'main');
    expect(r).toEqual({ sha: 'newBlob', commitSha: 'newCommit' });
  });

  test('updateFile normalises missing content/commit to empty strings (synthetic success)', async () => {
    jest.spyOn(GitHubService, 'updateFile').mockResolvedValueOnce({
      content: { sha: '' },
      commit: { sha: '' },
    } as any);
    const r = await githubContentsAdapter.updateFile('o', 'r', 'p.md', 'body', 'msg', 'main');
    expect(r).toEqual({ sha: '', commitSha: '' });
  });

  test('getRepoPrivacy wraps the boolean in { isPrivate }', async () => {
    jest.spyOn(GitHubService, 'getRepoPrivacy').mockResolvedValueOnce(true);
    expect(await githubContentsAdapter.getRepoPrivacy('o', 'r')).toEqual({ isPrivate: true });

    jest.spyOn(GitHubService, 'getRepoPrivacy').mockResolvedValueOnce(null);
    expect(await githubContentsAdapter.getRepoPrivacy('o', 'r')).toEqual({ isPrivate: null });
  });

  test('getUser returns null when GitHubService has no user', async () => {
    jest.spyOn(GitHubService, 'getUser').mockReturnValueOnce(null);
    expect(await githubContentsAdapter.getUser()).toBeNull();
  });

  test('getUser projects the GitHubService.GitHubUser shape', async () => {
    jest.spyOn(GitHubService, 'getUser').mockReturnValueOnce({
      login: 'octo',
      id: 1,
      avatar_url: '',
      html_url: '',
      name: 'Octo Cat',
      email: 'octo@example.com',
    });
    expect(await githubContentsAdapter.getUser()).toEqual({
      login: 'octo',
      name: 'Octo Cat',
      email: 'octo@example.com',
    });
  });
});
