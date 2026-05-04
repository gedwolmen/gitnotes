// Mock isomorphic-git and expo-file-system/legacy so the service can be
// exercised without touching the network or the device FS.

jest.mock('isomorphic-git', () => {
  // Build the mocks inside the factory so jest.mock hoisting doesn't strand
  // us with `undefined` const refs (the const declarations below the import
  // would otherwise be evaluated AFTER the factory's first invocation).
  const mocks = {
    clone: jest.fn(async (..._args: any[]) => undefined),
    fetch: jest.fn(async (..._args: any[]) => ({ defaultBranch: 'main' })),
    walk: jest.fn(async (..._args: any[]): Promise<any[]> => []),
    resolveRef: jest.fn(async (..._args: any[]) => 'oid-deadbeef'),
    readBlob: jest.fn(async (..._args: any[]) => ({
      oid: 'oid',
      blob: new TextEncoder().encode('hello body'),
    })),
    TREE: jest.fn((opts: { ref: string }) => ({ __tree: opts.ref })),
  };
  (globalThis as any).__isomorphicGitMocks = mocks;
  return {
    __esModule: true,
    default: {
      clone: mocks.clone,
      fetch: mocks.fetch,
      walk: mocks.walk,
      resolveRef: mocks.resolveRef,
      readBlob: mocks.readBlob,
    },
    TREE: mocks.TREE,
  };
});

function getGitMocks() {
  return (globalThis as any).__isomorphicGitMocks as {
    clone: jest.Mock;
    fetch: jest.Mock;
    walk: jest.Mock;
    resolveRef: jest.Mock;
    readBlob: jest.Mock;
    TREE: jest.Mock;
  };
}

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  (globalThis as any).__gitFsServiceTestFsStore = fsStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri);
      return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
    },
    async deleteAsync(uri: string) {
      fsStore.delete(uri);
    },
  };
});

function getFsStore(): Map<string, { type: 'file' | 'dir' }> {
  return (globalThis as any).__gitFsServiceTestFsStore;
}

import { GitFsService } from '../../../src/services/git/GitFsService';

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore().clear();
});

describe('GitFsService', () => {
  test('clone forwards owner/repo + shallow defaults to isomorphic-git', async () => {
    await GitFsService.clone({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(getGitMocks().clone).toHaveBeenCalledTimes(1);
    const args = getGitMocks().clone.mock.calls[0][0];
    expect(args.url).toBe('https://github.com/me/repo.git');
    expect(args.dir).toBe('/me/repo');
    expect(args.ref).toBe('main');
    expect(args.singleBranch).toBe(true);
    expect(args.depth).toBe(1);
    expect(typeof args.onAuth).toBe('function');
    const auth = args.onAuth();
    expect(auth).toEqual({ username: 'x-access-token', password: 'tok' });
  });

  test('clone passes through custom depth and skips onAuth when no token', async () => {
    await GitFsService.clone({ repoPath: 'me/repo', branch: 'main', depth: 50 });
    const args = getGitMocks().clone.mock.calls[0][0];
    expect(args.depth).toBe(50);
    expect(args.onAuth).toBeUndefined();
  });

  test('clone rejects on invalid repoPath', async () => {
    await expect(
      GitFsService.clone({ repoPath: 'not-a-repo', branch: 'main' }),
    ).rejects.toThrow(/Invalid repo path/);
    expect(getGitMocks().clone).not.toHaveBeenCalled();
  });

  test('fetch forwards branch + depth + token-derived auth', async () => {
    await GitFsService.fetch({ repoPath: 'me/repo', branch: 'feature/x', token: 'tok', depth: 2 });
    expect(getGitMocks().fetch).toHaveBeenCalledTimes(1);
    const args = getGitMocks().fetch.mock.calls[0][0];
    expect(args.dir).toBe('/me/repo');
    expect(args.ref).toBe('feature/x');
    expect(args.depth).toBe(2);
    expect(args.tags).toBe(false);
    expect(args.onAuth()).toEqual({ username: 'x-access-token', password: 'tok' });
  });

  test('listTree maps walk entries into the tree-entry shape (matches GitHubService)', async () => {
    getGitMocks().walk.mockImplementationOnce(async (opts: any) => {
      const entries = [
        { name: '.', type: 'tree', oid: 'root' },
        { name: 'notes/foo.md', type: 'blob', oid: 'aa' },
        { name: 'notes', type: 'tree', oid: 'bb' },
      ];
      const collected: any[] = [];
      for (const e of entries) {
        const got = await opts.map(e.name, [
          {
            type: async () => e.type,
            oid: async () => e.oid,
          },
        ]);
        if (got !== undefined) collected.push(got);
      }
      return collected;
    });

    const tree = await GitFsService.listTree({ repoPath: 'me/repo', ref: 'main' });
    expect(tree).toEqual([
      { path: 'notes/foo.md', type: 'blob', sha: 'aa' },
      { path: 'notes', type: 'tree', sha: 'bb' },
    ]);
    expect(getGitMocks().TREE).toHaveBeenCalledWith({ ref: 'main' });
  });

  test('readFile resolves ref then reads blob and decodes utf-8', async () => {
    const contents = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: 'notes/x.md',
    });
    expect(getGitMocks().resolveRef).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      ref: 'main',
    });
    expect(getGitMocks().readBlob).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      oid: 'oid-deadbeef',
      filepath: 'notes/x.md',
    });
    expect(contents).toBe('hello body');
  });

  test('readFile returns null when isomorphic-git throws NotFoundError', async () => {
    getGitMocks().readBlob.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'NotFoundError' }));
    const contents = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: 'missing.md',
    });
    expect(contents).toBeNull();
  });

  test('readFile rethrows non-not-found errors', async () => {
    getGitMocks().readBlob.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'Other' }));
    await expect(
      GitFsService.readFile({ repoPath: 'me/repo', ref: 'main', filepath: 'x.md' }),
    ).rejects.toThrow(/boom/);
  });

  test('isCloned reflects the on-disk presence of <root>/.git/HEAD', async () => {
    expect(await GitFsService.isCloned({ repoPath: 'me/repo' })).toBe(false);
    getFsStore().set('file:///doc/gitnotes-clones/me/repo/.git/HEAD', { type: 'file' });
    expect(await GitFsService.isCloned({ repoPath: 'me/repo' })).toBe(true);
  });

  test('removeRepo deletes the on-disk dir and is idempotent', async () => {
    getFsStore().set('file:///doc/gitnotes-clones/me/repo', { type: 'dir' });
    await GitFsService.removeRepo({ repoPath: 'me/repo' });
    expect(getFsStore().has('file:///doc/gitnotes-clones/me/repo')).toBe(false);
    // Second call must not throw.
    await GitFsService.removeRepo({ repoPath: 'me/repo' });
  });

  test('workingTreeUri returns the absolute URI', () => {
    expect(GitFsService.workingTreeUri({ repoPath: 'me/repo' })).toBe(
      'file:///doc/gitnotes-clones/me/repo',
    );
  });
});
