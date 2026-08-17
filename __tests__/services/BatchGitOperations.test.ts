jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    getBranchHead: jest.fn(),
    getCommit: jest.fn(),
    getTreeRaw: jest.fn(),
    createTree: jest.fn(),
    createCommit: jest.fn(),
    updateRef: jest.fn(),
    getFileSha: jest.fn(),
    deleteFile: jest.fn(),
    createBlob: jest.fn(),
    updateFile: jest.fn(),
  },
}));

import { GitHubService } from '../../src/services/GitHubService';
import {
  batchDeleteFiles,
  buildTreeMinusPaths,
  batchUpsertFiles,
} from '../../src/services/git/BatchGitOperations';

const TREE_ENTRIES = [
  { path: 'notes', mode: '040000', type: 'tree', sha: 'tree-notes' },
  { path: 'notes/a.md', mode: '100644', type: 'blob', sha: 'blob-a' },
  { path: 'notes/b.md', mode: '100644', type: 'blob', sha: 'blob-b' },
  { path: 'notes/c.md', mode: '100644', type: 'blob', sha: 'blob-c' },
  { path: 'notes/d.md', mode: '100644', type: 'blob', sha: 'blob-d' },
  { path: 'notes/e.md', mode: '100644', type: 'blob', sha: 'blob-e' },
  { path: 'notes/keep.md', mode: '100644', type: 'blob', sha: 'blob-keep' },
  { path: 'other', mode: '040000', type: 'tree', sha: 'tree-other' },
  { path: 'other/x.md', mode: '100644', type: 'blob', sha: 'blob-x' },
  { path: 'readme.md', mode: '100644', type: 'blob', sha: 'blob-readme' },
];

const FIVE_PATHS = [
  'notes/a.md',
  'notes/b.md',
  'notes/c.md',
  'notes/d.md',
  'notes/e.md',
];

function happyPathMocks(headSha = 'head-1'): void {
  (GitHubService.getBranchHead as jest.Mock).mockResolvedValue({ sha: headSha });
  (GitHubService.getCommit as jest.Mock).mockResolvedValue({ treeSha: 'tree-root' });
  (GitHubService.getTreeRaw as jest.Mock).mockResolvedValue(TREE_ENTRIES);
  (GitHubService.createTree as jest.Mock).mockResolvedValue({ sha: 'new-tree-1' });
  (GitHubService.createCommit as jest.Mock).mockResolvedValue({ sha: 'new-commit-1' });
  (GitHubService.updateRef as jest.Mock).mockResolvedValue(undefined);
  (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'found', sha: 'file-sha' });
  (GitHubService.deleteFile as jest.Mock).mockResolvedValue({
    content: null,
    commit: { sha: 'fallback-commit' },
  });
}

describe('batchDeleteFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    happyPathMocks();
  });

  test('5 paths -> ONE createTree + ONE createCommit + ONE updateRef; tree omits exactly those 5 (case 1)', async () => {
    const result = await batchDeleteFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      paths: FIVE_PATHS,
      message: 'Delete 5 notes',
    });

    expect(result).toEqual({ success: true, deleted: FIVE_PATHS, failed: [] });
    expect(GitHubService.getBranchHead).toHaveBeenCalledTimes(1);
    expect(GitHubService.getCommit).toHaveBeenCalledTimes(1);
    expect(GitHubService.getTreeRaw).toHaveBeenCalledTimes(1);
    expect(GitHubService.createTree).toHaveBeenCalledTimes(1);
    expect(GitHubService.createCommit).toHaveBeenCalledTimes(1);
    expect(GitHubService.updateRef).toHaveBeenCalledTimes(1);
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();

    // Full explicit tree: deleted paths gone, untouched subtree kept with its
    // original mode/type/sha, stale 'notes' subtree dropped (its descendants
    // were deleted), survivors preserved — no base_tree anywhere.
    const [treeOwner, treeRepo, treePayload] = (GitHubService.createTree as jest.Mock).mock.calls[0];
    expect(treeOwner).toBe('owner');
    expect(treeRepo).toBe('repo');
    expect(treePayload).toEqual([
      { path: 'notes/keep.md', mode: '100644', type: 'blob', sha: 'blob-keep' },
      { path: 'other', mode: '040000', type: 'tree', sha: 'tree-other' },
      { path: 'readme.md', mode: '100644', type: 'blob', sha: 'blob-readme' },
    ]);
    for (const path of FIVE_PATHS) {
      expect(treePayload.some((e: { path: string }) => e.path === path)).toBe(false);
    }

    expect(GitHubService.createCommit).toHaveBeenCalledWith(
      'owner',
      'repo',
      { message: 'Delete 5 notes', tree: 'new-tree-1', parents: ['head-1'] },
      undefined,
    );
    expect(GitHubService.updateRef).toHaveBeenCalledWith(
      'owner',
      'repo',
      'heads/main',
      'new-commit-1',
      false,
      undefined,
    );
  });

  test('updateRef 422 once -> full retry with FRESH head, then success (case 2)', async () => {
    (GitHubService.getBranchHead as jest.Mock)
      .mockResolvedValueOnce({ sha: 'head-1' })
      .mockResolvedValueOnce({ sha: 'head-2' });
    (GitHubService.createTree as jest.Mock)
      .mockResolvedValueOnce({ sha: 'new-tree-1' })
      .mockResolvedValueOnce({ sha: 'new-tree-2' });
    (GitHubService.createCommit as jest.Mock)
      .mockResolvedValueOnce({ sha: 'new-commit-1' })
      .mockResolvedValueOnce({ sha: 'new-commit-2' });
    (GitHubService.updateRef as jest.Mock)
      .mockRejectedValueOnce(Object.assign(new Error('Update is not a fast forward'), { status: 422 }))
      .mockResolvedValueOnce(undefined);

    const result = await batchDeleteFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      paths: FIVE_PATHS,
      message: 'Delete 5 notes',
    });

    expect(result).toEqual({ success: true, deleted: FIVE_PATHS, failed: [] });
    // Whole cycle re-ran: fresh head, new tree, new commit, second ref update.
    expect(GitHubService.getBranchHead).toHaveBeenCalledTimes(2);
    expect(GitHubService.getCommit).toHaveBeenCalledTimes(2);
    expect(GitHubService.getTreeRaw).toHaveBeenCalledTimes(2);
    expect(GitHubService.createTree).toHaveBeenCalledTimes(2);
    expect(GitHubService.createCommit).toHaveBeenCalledTimes(2);
    expect(GitHubService.updateRef).toHaveBeenCalledTimes(2);
    expect((GitHubService.createCommit as jest.Mock).mock.calls[1][2].parents).toEqual(['head-2']);
    expect(GitHubService.updateRef).toHaveBeenLastCalledWith(
      'owner',
      'repo',
      'heads/main',
      'new-commit-2',
      false,
      undefined,
    );
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
  });

  test('createTree 500 -> falls back to sequential typed-sha deleteFile for all 5 (case 3)', async () => {
    (GitHubService.createTree as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Internal Server Error'), { status: 500 }),
    );

    const result = await batchDeleteFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      paths: FIVE_PATHS,
      message: 'Delete 5 notes',
    });

    expect(GitHubService.createTree).toHaveBeenCalledTimes(1);
    expect(GitHubService.createCommit).not.toHaveBeenCalled();
    expect(GitHubService.updateRef).not.toHaveBeenCalled();

    // Sequential fallback covers every path with typed-sha deletes.
    expect(GitHubService.getFileSha).toHaveBeenCalledTimes(5);
    expect(GitHubService.deleteFile).toHaveBeenCalledTimes(5);
    for (const path of FIVE_PATHS) {
      expect(GitHubService.deleteFile).toHaveBeenCalledWith(
        'owner',
        'repo',
        path,
        'Delete 5 notes',
        'file-sha',
        'main',
        undefined,
      );
    }
    expect(result).toEqual({ success: true, deleted: FIVE_PATHS, failed: [] });
  });

  test('1 path -> throws (case 4)', async () => {
    await expect(
      batchDeleteFiles({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        paths: ['notes/a.md'],
        message: 'Delete 1 note',
      }),
    ).rejects.toThrow(/at least 2 paths/);

    expect(GitHubService.getBranchHead).not.toHaveBeenCalled();
    expect(GitHubService.createTree).not.toHaveBeenCalled();
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
  });

  test('updateRef conflict on every attempt exhausts retries then falls back', async () => {
    (GitHubService.updateRef as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Cannot force-update ref'), { status: 409 }),
    );
    // Two paths already gone remotely, one hard failure among the rest.
    (GitHubService.getFileSha as jest.Mock).mockImplementation(async (_o, _r, path) => {
      if (path === 'notes/a.md' || path === 'notes/b.md') return { kind: 'not-found' };
      return { kind: 'found', sha: 'file-sha' };
    });
    (GitHubService.deleteFile as jest.Mock).mockImplementation(async (_o, _r, path) => {
      if (path === 'notes/e.md') {
        throw Object.assign(new Error('Server exploded'), { status: 500 });
      }
      return { content: null, commit: { sha: 'fallback-commit' } };
    });

    const result = await batchDeleteFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      paths: FIVE_PATHS,
      message: 'Delete 5 notes',
    });

    expect(GitHubService.getBranchHead).toHaveBeenCalledTimes(3);
    expect(GitHubService.updateRef).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    expect(result.deleted).toEqual(['notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md']);
    expect(result.failed).toEqual([{ path: 'notes/e.md', error: 'Server exploded' }]);
  });

  test('fallback records lookup errors per path without aborting the batch', async () => {
    (GitHubService.createTree as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Bad Gateway'), { status: 502 }),
    );
    (GitHubService.getFileSha as jest.Mock).mockImplementation(async (_o, _r, path) => {
      if (path === 'notes/b.md') return { kind: 'error', message: 'lookup blew up' };
      return { kind: 'found', sha: 'file-sha' };
    });

    const result = await batchDeleteFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      paths: ['notes/a.md', 'notes/b.md'],
      message: 'Delete 2 notes',
    });

    expect(result.success).toBe(false);
    expect(result.deleted).toEqual(['notes/a.md']);
    expect(result.failed).toEqual([{ path: 'notes/b.md', error: 'lookup blew up' }]);
    expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe('batchUpsertFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    happyPathMocks();
    (GitHubService.createBlob as jest.Mock).mockImplementation(
      async (_o: string, _r: string, content: string) => ({ sha: `blob-${content}` }),
    );
    (GitHubService.updateFile as jest.Mock).mockResolvedValue({
      content: { sha: 'fallback-sha' },
      commit: { sha: 'fallback-commit' },
    });
  });

  test('2 files -> parallel createBlob + ONE createTree(base_tree) + ONE commit + ONE updateRef', async () => {
    const result = await batchUpsertFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      files: [
        { path: 'notes/a.md', content: 'AAA' },
        { path: 'notes/b.md', content: 'BBB' },
      ],
      message: 'Update 2 notes',
    });

    expect(result).toEqual({ success: true, upserted: ['notes/a.md', 'notes/b.md'], failed: [] });
    expect(GitHubService.getBranchHead).toHaveBeenCalledTimes(1);
    expect(GitHubService.getCommit).toHaveBeenCalledTimes(1);
    // No recursive tree read: base_tree derives parents/structure.
    expect(GitHubService.getTreeRaw).not.toHaveBeenCalled();
    expect(GitHubService.createBlob).toHaveBeenCalledTimes(2);
    expect(GitHubService.createTree).toHaveBeenCalledTimes(1);
    expect(GitHubService.createCommit).toHaveBeenCalledTimes(1);
    expect(GitHubService.updateRef).toHaveBeenCalledTimes(1);
    expect(GitHubService.updateFile).not.toHaveBeenCalled();

    // Tree entries map each blob sha to its path in input order; base_tree set.
    const [treeOwner, treeRepo, treeEntries, treeOpts] = (GitHubService.createTree as jest.Mock).mock.calls[0];
    expect(treeOwner).toBe('owner');
    expect(treeRepo).toBe('repo');
    expect(treeEntries).toEqual([
      { path: 'notes/a.md', mode: '100644', type: 'blob', sha: 'blob-AAA' },
      { path: 'notes/b.md', mode: '100644', type: 'blob', sha: 'blob-BBB' },
    ]);
    expect(treeOpts).toEqual({ baseTree: 'tree-root' });

    expect(GitHubService.createCommit).toHaveBeenCalledWith(
      'owner',
      'repo',
      { message: 'Update 2 notes', tree: 'new-tree-1', parents: ['head-1'] },
      undefined,
    );
    expect(GitHubService.updateRef).toHaveBeenCalledWith(
      'owner',
      'repo',
      'heads/main',
      'new-commit-1',
      false,
      undefined,
    );
  });

  test('updateRef 409 on every attempt -> falls back to sequential updateFile', async () => {
    (GitHubService.updateRef as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Cannot force-update ref'), { status: 409 }),
    );
    (GitHubService.updateFile as jest.Mock).mockImplementation(async (_o: string, _r: string, path: string) => {
      if (path === 'notes/b.md') {
        throw Object.assign(new Error('Server exploded'), { status: 500 });
      }
      return { content: { sha: 'fallback-sha' }, commit: { sha: 'fallback-commit' } };
    });

    const result = await batchUpsertFiles({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      files: [
        { path: 'notes/a.md', content: 'AAA' },
        { path: 'notes/b.md', content: 'BBB' },
      ],
      message: 'Update 2 notes',
    });

    // Initial cycle + 2 branch-moved retries, then sequential fallback.
    expect(GitHubService.getBranchHead).toHaveBeenCalledTimes(3);
    expect(GitHubService.updateRef).toHaveBeenCalledTimes(3);
    expect(GitHubService.createBlob).toHaveBeenCalledTimes(6);
    expect(GitHubService.updateFile).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      success: false,
      upserted: ['notes/a.md'],
      failed: [{ path: 'notes/b.md', error: 'Server exploded' }],
    });
  });

  test('1 file -> throws (case 4)', async () => {
    await expect(
      batchUpsertFiles({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        files: [{ path: 'notes/a.md', content: 'AAA' }],
        message: 'Update 1 note',
      }),
    ).rejects.toThrow(/at least 2 files/);

    expect(GitHubService.getBranchHead).not.toHaveBeenCalled();
    expect(GitHubService.createBlob).not.toHaveBeenCalled();
    expect(GitHubService.updateFile).not.toHaveBeenCalled();
  });
});

describe('buildTreeMinusPaths', () => {
  test('keeps untouched subtrees with original mode/type and drops stale ones', () => {
    const payload = buildTreeMinusPaths(TREE_ENTRIES, ['readme.md', 'other/x.md']);

    // 'notes' is untouched: kept as ONE subtree entry (its blobs are fully
    // described by that sha). 'other' had an internal delete so its stale
    // subtree entry is dropped and no descendants survive.
    expect(payload).toEqual([
      { path: 'notes', mode: '040000', type: 'tree', sha: 'tree-notes' },
    ]);
  });

  test('deleting a whole directory removes the subtree and everything below it', () => {
    const payload = buildTreeMinusPaths(TREE_ENTRIES, ['notes', 'readme.md']);
    expect(payload.map((e) => e.path)).toEqual(['other']);
  });
});
