jest.mock('isomorphic-git', () => {
  const mocks = {
    add: jest.fn(async (..._a: any[]) => undefined),
    remove: jest.fn(async (..._a: any[]) => undefined),
    commit: jest.fn(async (..._a: any[]) => 'commit-sha-1'),
    push: jest.fn(async (..._a: any[]) => ({ ok: true })),
    currentBranch: jest.fn(async (..._a: any[]) => 'main'),
    checkout: jest.fn(async (..._a: any[]) => undefined),
    fetch: jest.fn(async (..._a: any[]) => undefined),
    // Default to "modified" so the idempotent-commit guard (#565 phase
    // B.1) doesn't short-circuit the existing tests. Tests that exercise
    // the unmodified path can override per-call.
    status: jest.fn(async (..._a: any[]) => 'modified'),
  };
  (globalThis as any).__lgwGitMocks = mocks;
  return {
    __esModule: true,
    default: mocks,
  };
});

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  (globalThis as any).__lgwFsStore = fsStore;
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

import { LocalGitWriter } from '../../../src/services/git/LocalGitWriter';

function getGitMocks() {
  return (globalThis as any).__lgwGitMocks as {
    add: jest.Mock;
    remove: jest.Mock;
    commit: jest.Mock;
    push: jest.Mock;
    currentBranch: jest.Mock;
    checkout: jest.Mock;
    fetch: jest.Mock;
    status: jest.Mock;
  };
}

function getFsStore() {
  return (globalThis as any).__lgwFsStore as Map<string, { type: 'file' | 'dir' }>;
}

const author = { name: 'Test', email: 'test@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore().clear();
});

describe('LocalGitWriter', () => {
  test('writeAndCommit writes file, stages, commits, pushes by default', async () => {
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'hello',
      message: 'Add note: foo',
      author,
      token: 'tok',
    });
    expect(result.success).toBe(true);
    expect(result.filePath).toBe('notes/foo.md');

    expect(getFsStore().has('file:///doc/GitNotes/me/repo/notes/foo.md')).toBe(true);

    expect(getGitMocks().add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/foo.md',
    });
    expect(getGitMocks().commit).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      message: 'Add note: foo',
      author,
    });
    expect(getGitMocks().push).toHaveBeenCalledWith(
      expect.objectContaining({ dir: '/me/repo', ref: 'main', remoteRef: 'main' }),
    );
    const pushArgs = getGitMocks().push.mock.calls[0][0];
    expect(pushArgs.onAuth()).toEqual({ username: 'x-access-token', password: 'tok' });
  });

  test('writeAndCommit with push:false stages + commits but does not push', async () => {
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/bar.md',
      content: 'x',
      message: 'm',
      author,
      push: false,
    });
    expect(result.success).toBe(true);
    expect(getGitMocks().commit).toHaveBeenCalledTimes(1);
    expect(getGitMocks().push).not.toHaveBeenCalled();
  });

  test('writeAndCommit returns failure when commit throws', async () => {
    getGitMocks().commit.mockRejectedValueOnce(new Error('nothing to commit'));
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/x.md',
      content: 'x',
      message: 'm',
      author,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nothing to commit/);
    expect(getGitMocks().push).not.toHaveBeenCalled();
  });

  test('deleteAndCommit removes the on-disk file, runs git remove + commit + push', async () => {
    getFsStore().set('file:///doc/GitNotes/me/repo/notes/old.md', { type: 'file' });
    const result = await LocalGitWriter.deleteAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/old.md',
      message: 'Delete note: old',
      author,
      token: 'tok',
    });
    expect(result.success).toBe(true);
    expect(getFsStore().has('file:///doc/GitNotes/me/repo/notes/old.md')).toBe(false);
    expect(getGitMocks().remove).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/old.md',
    });
    expect(getGitMocks().commit).toHaveBeenCalled();
    expect(getGitMocks().push).toHaveBeenCalled();
  });

  test('push only flushes pending commits without staging anything new', async () => {
    const result = await LocalGitWriter.push({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });
    expect(result.success).toBe(true);
    expect(getGitMocks().add).not.toHaveBeenCalled();
    expect(getGitMocks().commit).not.toHaveBeenCalled();
    expect(getGitMocks().push).toHaveBeenCalledTimes(1);
  });

  test('push forwards onProgress to git.push', async () => {
    const onProgress = jest.fn();
    const result = await LocalGitWriter.push({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
      onProgress,
    });
    expect(result.success).toBe(true);
    expect(getGitMocks().push).toHaveBeenCalledTimes(1);
    expect(getGitMocks().push).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress }),
    );
  });

  test('rejects an invalid repoPath without touching the FS or git', async () => {
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'not-a-repo',
      branch: 'main',
      filePath: 'x.md',
      content: 'x',
      message: 'm',
      author,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid repo path/);
    expect(getGitMocks().add).not.toHaveBeenCalled();
  });
});
