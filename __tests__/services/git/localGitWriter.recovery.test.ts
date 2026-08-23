jest.mock('isomorphic-git', () => {
  const mocks = {
    add: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    commit: jest.fn(async () => 'commit-sha-1'),
    push: jest.fn(async () => ({ ok: true })),
    currentBranch: jest.fn(async () => 'main'),
    checkout: jest.fn(async () => undefined),
    fetch: jest.fn(async () => undefined),
    status: jest.fn(async () => 'modified'),
  };
  (globalThis as any).__lgw2GitMocks = mocks;
  return { __esModule: true, default: mocks };
});

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  (globalThis as any).__lgw2FsStore = fsStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri);
      return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
    },
    async writeAsStringAsync(uri: string) {
      fsStore.set(uri, { type: 'file' });
    },
    async deleteAsync(uri: string) {
      fsStore.delete(uri);
    },
    async makeDirectoryAsync(uri: string) {
      fsStore.set(uri, { type: 'dir' });
    },
  };
});

jest.mock('../../../src/services/git/GitFsService', () => ({
  GitFsService: {
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    removeRepo: jest.fn(async () => undefined),
    clone: jest.fn(async () => undefined),
    getCommitOid: jest.fn(async () => 'same-commit'),
    findMergeBase: jest.fn(async () => 'same-commit'),
  },
}));

import { LocalGitWriter } from '../../../src/services/git/LocalGitWriter';
import { GitFsService } from '../../../src/services/git/GitFsService';

function getGitMocks() {
  return (globalThis as any).__lgw2GitMocks as {
    add: jest.Mock;
    commit: jest.Mock;
    push: jest.Mock;
    currentBranch: jest.Mock;
    status: jest.Mock;
  };
}

const author = { name: 'Test', email: 'test@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__lgw2FsStore.clear();
});

describe('LocalGitWriter push-rejected recovery (bug-hunt loop4 #15)', () => {
  test('writeAndCommit surfaces unknown pull failure instead of blind retry push', async () => {
    getGitMocks().push
      .mockRejectedValueOnce(new Error('push rejected non-fast-forward'))
      .mockResolvedValue({ ok: true });
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'unknown',
      error: 'network timeout during fetch',
    });

    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'hello',
      message: 'm',
      author,
      token: 'tok',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network timeout/);
    // The stale-branch retry must not run when the refresh pull failed.
    expect(getGitMocks().push).toHaveBeenCalledTimes(1);
  });

  test('push treats "Could not find <sha>" as corruption error and recovers via re-clone', async () => {
    // First push fails with isomorphic-git missing-object error.
    // hasUnpushedLocalCommits returns false (local === remote === merge-base),
    // so the corruption recovery path re-clones and retries.
    getGitMocks().push
      .mockRejectedValueOnce(new Error('Could not find fc19c489cbd51e123949d74aecb9cf1a9267641a'))
      .mockResolvedValueOnce({ ok: true });

    const result = await LocalGitWriter.push({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });

    expect(result.success).toBe(true);
    expect(GitFsService.removeRepo).toHaveBeenCalledWith({ repoPath: 'me/repo' });
    expect(GitFsService.clone).toHaveBeenCalledWith({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });
    // Two pushes: one failed, one succeeded after re-clone
    expect(getGitMocks().push).toHaveBeenCalledTimes(2);
  });

  test('push surfaces error when "Could not find" fires but local commits exist', async () => {
    // hasUnpushedLocalCommits returns true (localOid !== mergeBase)
    (GitFsService.getCommitOid as jest.Mock)
      .mockResolvedValueOnce('local-commit') // localRef
      .mockResolvedValueOnce('remote-commit') // remoteRef
      .mockResolvedValueOnce('base-commit'); // findMergeBase
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValueOnce('base-commit');

    getGitMocks().push.mockRejectedValueOnce(
      new Error('Could not find fc19c489cbd51e123949d74aecb9cf1a9267641a'),
    );

    const result = await LocalGitWriter.push({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Clone corruption detected with unpushed local commits/);
    // Must NOT attempt re-clone when local commits exist — user must push or reset
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
    expect(GitFsService.clone).not.toHaveBeenCalled();
  });

  test('deleteAndCommit surfaces unknown pull failure (parity with existing behavior)', async () => {
    getGitMocks().push
      .mockRejectedValueOnce(new Error('push rejected non-fast-forward'))
      .mockResolvedValue({ ok: true });
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'unknown',
      error: 'packfile checksum mismatch',
    });

    const result = await LocalGitWriter.deleteAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/old.md',
      message: 'Delete note: old',
      author,
      token: 'tok',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/packfile checksum mismatch|Push failed/);
    expect(getGitMocks().push).toHaveBeenCalledTimes(1);
  });
});
