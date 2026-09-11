import { GitFsService } from '@/services/git/GitFsService';
import * as GitEngine from '@/services/git/engine/GitEngine';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  fetch: jest.fn(),
  pull: jest.fn(),
}));

jest.mock('@/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({ promises: { readFile: jest.fn() } })),
}));

jest.mock('@/services/git/lfs', () => ({
  LfsService: { scanRepo: jest.fn() },
}));

describe('GitFsService.pullWithFastForward', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pulls remote changes through the native GitEngine bridge', async () => {
    const pull = GitEngine.pull as jest.MockedFunction<typeof GitEngine.pull>;
    pull.mockResolvedValue({ ok: true });

    const result = await GitFsService.pullWithFastForward({
      repoPath: 'owner/repo',
      branch: 'main',
      token: 'token',
      repoId: 'repo-id',
    });

    expect(result).toEqual({ ok: true });
    expect(pull).toHaveBeenCalledWith('file:///documents/GitNotes/owner/repo', 'origin', 'repo-id');
  });

  it('surfaces native pull conflicts instead of reporting success', async () => {
    const pull = GitEngine.pull as jest.MockedFunction<typeof GitEngine.pull>;
    pull.mockResolvedValue({ ok: false, error: 'merge conflict in notes/example.md' });

    const result = await GitFsService.pullWithFastForward({
      repoPath: 'owner/repo',
      branch: 'main',
      repoId: 'repo-id',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'diverged',
      error: 'merge conflict in notes/example.md',
    });
  });
});

describe('GitFsService.fetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the absolute worktree path to the native GitEngine bridge', async () => {
    const fetch = GitEngine.fetch as jest.MockedFunction<typeof GitEngine.fetch>;
    fetch.mockResolvedValue(undefined);

    await GitFsService.fetch({
      repoPath: 'owner/repo',
      branch: 'main',
      token: 'token',
      repoId: 'repo-id',
    });

    expect(fetch).toHaveBeenCalledWith('file:///documents/GitNotes/owner/repo', 'origin', 'repo-id');
  });
});
