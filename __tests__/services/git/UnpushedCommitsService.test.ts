jest.mock('isomorphic-git', () => {
  const mocks = {
    log: jest.fn(),
    readCommit: jest.fn(),
    readTree: jest.fn(),
  };
  (globalThis as any).__csGitMocks = mocks;
  return {
    __esModule: true,
    default: mocks,
  };
});

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
}));

jest.mock('../../../src/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      unlink: jest.fn(),
    },
  })),
}));

jest.mock('../../../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCommitOid: jest.fn(),
    findMergeBase: jest.fn(),
    getChangedFilesBetweenRefs: jest.fn(),
  },
}));

import { UnpushedCommitsService } from '../../../src/services/git/UnpushedCommitsService';
import { GitFsService } from '../../../src/services/git/GitFsService';

function getGitMocks() {
  return (globalThis as any).__csGitMocks as {
    log: jest.Mock;
    readCommit: jest.Mock;
    readTree: jest.Mock;
  };
}

const mockGit = () => getGitMocks();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UnpushedCommitsService', () => {
  describe('list()', () => {
    test('returns empty array when repo path is invalid', async () => {
      const result = await UnpushedCommitsService.list({ repo: 'invalid', branch: 'main' });
      expect(result).toEqual([]);
    });

    test('returns empty array when local ref does not exist', async () => {
      GitFsService.getCommitOid.mockResolvedValue(null);
      const result = await UnpushedCommitsService.list({ repo: 'me/repo', branch: 'main' });
      expect(result).toEqual([]);
    });

    test('returns empty array when local and remote are in sync', async () => {
      GitFsService.getCommitOid
        .mockResolvedValueOnce('local-oid') // local ref
        .mockResolvedValueOnce('local-oid'); // remote ref
      const result = await UnpushedCommitsService.list({ repo: 'me/repo', branch: 'main' });
      expect(result).toEqual([]);
    });

    test('returns empty array when local is at merge base with remote', async () => {
      GitFsService.getCommitOid
        .mockResolvedValueOnce('local-oid')
        .mockResolvedValueOnce('remote-oid');
      GitFsService.findMergeBase.mockResolvedValue('local-oid');
      const result = await UnpushedCommitsService.list({ repo: 'me/repo', branch: 'main' });
      expect(result).toEqual([]);
    });

    test('returns unpushed commits when remote does not exist (all local commits)', async () => {
      GitFsService.getCommitOid
        .mockResolvedValueOnce('local-oid') // local ref
        .mockResolvedValueOnce(null); // no remote ref
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['notes/foo.md', 'notes/bar.md']);

      const mockCommits = [
        {
          oid: 'commit-2',
          commit: {
            message: 'Second commit\nbody',
            author: { name: 'Test User', email: 'test@example.com', timestamp: 2000 },
            parent: ['commit-1'],
            tree: 'tree-2',
          },
        },
        {
          oid: 'commit-1',
          commit: {
            message: 'First commit\nbody',
            author: { name: 'Test User', email: 'test@example.com', timestamp: 1000 },
            parent: [],
            tree: 'tree-1',
          },
        },
      ];
      mockGit().log.mockResolvedValue(mockCommits);

      // countFilesChanged for commit-2 (has parent commit-1): reads commit tree then parent tree
      // countFilesChanged for commit-1 (root, no parent): reads commit tree, returns tree.length
      mockGit().readTree
        .mockResolvedValueOnce({ tree: [{ path: 'a.md', oid: 'a1', type: 'blob' }, { path: 'b.md', oid: 'b1', type: 'blob' }] }) // commit-2's tree
        .mockResolvedValueOnce({ tree: [] }) // commit-1's tree (parent of commit-2)
        .mockResolvedValueOnce({ tree: [] }); // commit-1's tree (root commit, no parent)

      const result = await UnpushedCommitsService.list({ repo: 'me/repo', branch: 'main' });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        subject: 'Second commit',
        oid: 'commit-2',
        author: 'Test User',
        timestamp: 2000,
        filesChangedCount: 2,
      });
      // Initial commit has no parent, so countFilesChanged returns tree.length (0)
      expect(result[1]).toMatchObject({
        subject: 'First commit',
        oid: 'commit-1',
        author: 'Test User',
        timestamp: 1000,
        filesChangedCount: 0,
      });
    });

    test('walks commits from merge base to local HEAD', async () => {
      GitFsService.getCommitOid
        .mockResolvedValueOnce('local-oid')
        .mockResolvedValueOnce('remote-oid');
      GitFsService.findMergeBase.mockResolvedValue('merge-base-oid');
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['notes/changed.md']);

      const mockCommits = [
        {
          oid: 'local-oid',
          commit: {
            message: 'Local commit\nbody',
            author: { name: 'Test User', email: 'test@example.com', timestamp: 3000 },
            parent: ['merge-base-oid'],
            tree: 'tree-3',
          },
        },
      ];
      mockGit().log.mockResolvedValue(mockCommits);
      mockGit().readTree.mockResolvedValue({ tree: [] });

      const result = await UnpushedCommitsService.list({ repo: 'me/repo', branch: 'main' });

      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe('Local commit');
      expect(GitFsService.findMergeBase).toHaveBeenCalledWith({
        repoPath: 'me/repo',
        ref1: 'refs/heads/main',
        ref2: 'refs/remotes/origin/main',
      });
    });
  });

  describe('count()', () => {
    test('returns 0 when no unpushed commits', async () => {
      GitFsService.getCommitOid.mockResolvedValue(null);
      const count = await UnpushedCommitsService.count({ repo: 'me/repo', branch: 'main' });
      expect(count).toBe(0);
    });

    test('returns correct count of unpushed commits', async () => {
      GitFsService.getCommitOid
        .mockResolvedValueOnce('local-oid')
        .mockResolvedValueOnce(null);
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['file.md']);

      const mockCommits = [
        { oid: 'c2', commit: { message: 'c2', author: { name: 'User', email: 'u@e.com', timestamp: 2000 }, parent: ['c1'], tree: 't2' } },
        { oid: 'c1', commit: { message: 'c1', author: { name: 'User', email: 'u@e.com', timestamp: 1000 }, parent: [], tree: 't1' } },
      ];
      mockGit().log.mockResolvedValue(mockCommits);
      mockGit().readTree.mockResolvedValue({ tree: [] });

      const count = await UnpushedCommitsService.count({ repo: 'me/repo', branch: 'main' });
      expect(count).toBe(2);
    });
  });

  describe('listFiles()', () => {
    test('returns empty array when repo path is invalid', async () => {
      const result = await UnpushedCommitsService.listFiles({ repo: 'invalid', branch: 'main', oid: 'abc' });
      expect(result).toEqual([]);
    });

    test('returns empty array on error', async () => {
      mockGit().readCommit.mockRejectedValue(new Error('commit not found'));
      const result = await UnpushedCommitsService.listFiles({ repo: 'me/repo', branch: 'main', oid: 'abc' });
      expect(result).toEqual([]);
    });

    test('returns all files as added for initial commit (no parent)', async () => {
      mockGit().readCommit.mockResolvedValue({
        commit: {
          tree: 'tree-1',
          parent: [],
          message: 'Initial commit',
          author: { name: 'User', email: 'u@e.com', timestamp: 1000 },
        },
        oid: 'initial-oid',
      });
      mockGit().readTree.mockResolvedValue({
        tree: [
          { path: 'notes/foo.md', oid: 'abc123', type: 'blob' },
          { path: 'notes/bar.md', oid: 'def456', type: 'blob' },
        ],
      });

      const result = await UnpushedCommitsService.listFiles({ repo: 'me/repo', branch: 'main', oid: 'initial-oid' });

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ path: 'notes/foo.md', status: 'added' });
      expect(result).toContainEqual({ path: 'notes/bar.md', status: 'added' });
    });

    test('returns modified files when file changed between parent and commit', async () => {
      mockGit().readCommit.mockResolvedValue({
        commit: {
          tree: 'tree-2',
          parent: ['parent-oid'],
          message: 'Update foo',
          author: { name: 'User', email: 'u@e.com', timestamp: 2000 },
        },
        oid: 'commit-oid',
      });
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['notes/foo.md']);
      mockGit().readTree.mockImplementation((args: any) => {
        if (args?.oid === 'tree-2') {
          return Promise.resolve({ tree: [{ path: 'notes/foo.md', oid: 'new-oid', type: 'blob' }] });
        }
        return Promise.resolve({ tree: [{ path: 'notes/foo.md', oid: 'old-oid', type: 'blob' }] });
      });

      const result = await UnpushedCommitsService.listFiles({ repo: 'me/repo', branch: 'main', oid: 'commit-oid' });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ path: 'notes/foo.md', status: 'modified' });
    });

    test('returns deleted files when file removed between parent and commit', async () => {
      mockGit().readCommit.mockResolvedValue({
        commit: {
          tree: 'tree-2',
          parent: ['parent-oid'],
          message: 'Delete foo',
          author: { name: 'User', email: 'u@e.com', timestamp: 2000 },
        },
        oid: 'commit-oid',
      });
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['notes/deleted.md']);
      mockGit().readTree.mockImplementation((args: any) => {
        if (args?.oid === 'tree-2') {
          return Promise.resolve({ tree: [] });
        }
        return Promise.resolve({ tree: [{ path: 'notes/deleted.md', oid: 'old-oid', type: 'blob' }] });
      });

      const result = await UnpushedCommitsService.listFiles({ repo: 'me/repo', branch: 'main', oid: 'commit-oid' });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ path: 'notes/deleted.md', status: 'deleted' });
    });

    test('returns added files when new file added between parent and commit', async () => {
      mockGit().readCommit.mockResolvedValue({
        commit: {
          tree: 'tree-2',
          parent: ['parent-oid'],
          message: 'Add new file',
          author: { name: 'User', email: 'u@e.com', timestamp: 2000 },
        },
        oid: 'commit-oid',
      });
      GitFsService.getChangedFilesBetweenRefs.mockResolvedValue(['notes/new.md']);
      mockGit().readTree.mockImplementation((args: any) => {
        if (args?.oid === 'tree-2') {
          return Promise.resolve({ tree: [{ path: 'notes/new.md', oid: 'new-oid', type: 'blob' }] });
        }
        return Promise.resolve({ tree: [] });
      });

      const result = await UnpushedCommitsService.listFiles({ repo: 'me/repo', branch: 'main', oid: 'commit-oid' });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ path: 'notes/new.md', status: 'added' });
    });
  });
});
