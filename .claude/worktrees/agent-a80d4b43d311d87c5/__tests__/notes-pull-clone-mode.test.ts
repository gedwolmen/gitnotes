jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getAllNotes: jest.fn(async () => []),
    saveAllNotes: jest.fn(async () => undefined),
    getSavedRepositories: jest.fn(async () => [
      { id: '1', name: 'gitnotes', path: 'me/gitnotes', branch: 'main' },
    ]),
  },
}));

jest.mock('../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok-abc') },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'clone') },
}));

jest.mock('../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    clone: jest.fn(async () => undefined),
    fetch: jest.fn(async () => undefined),
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    listTree: jest.fn(async () => [
      { path: 'notes/foo.md', type: 'blob', sha: 'aa' },
      { path: 'notes/images/cover.png', type: 'blob', sha: 'bb' },
    ]),
    readFile: jest.fn(async (opts: { filepath: string }) => {
      if (opts.filepath === 'notes/foo.md') return 'hello body';
      return null;
    }),
  },
}));

import { GitFsService } from '../src/services/git/GitFsService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';
import { SyncEngineService } from '../src/services/SyncEngineService';
import { pullFromSingleRepo } from '../src/services/RepoPullService';

describe('pullNotesFromRepo via clone mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { id: '1', name: 'gitnotes', path: 'me/gitnotes', branch: 'main' },
    ]);
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(false);
  });

  test('first pull clones the repo, subsequent pulls fetch only', async () => {
    await pullFromSingleRepo('me/gitnotes');
    expect(GitFsService.clone).toHaveBeenCalledWith({
      repoPath: 'me/gitnotes',
      branch: 'main',
      token: 'tok-abc',
    });
    expect(GitFsService.fetch).not.toHaveBeenCalled();

    (GitFsService.isCloned as jest.Mock).mockResolvedValueOnce(true);
    (GitFsService.clone as jest.Mock).mockClear();
    (GitFsService.pullWithFastForward as jest.Mock).mockClear();
    await pullFromSingleRepo('me/gitnotes');
    expect(GitFsService.clone).not.toHaveBeenCalled();
    expect(GitFsService.pullWithFastForward).toHaveBeenCalledWith({
      repoPath: 'me/gitnotes',
      branch: 'main',
      token: 'tok-abc',
    });
  });

  test('diverged local commits abort pull (no reconcile, saveAllNotes not called)', async () => {
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'diverged',
    });
    const result = await pullFromSingleRepo('me/gitnotes');
    expect(result.notes).toBe(0);
    expect(StorageService.saveAllNotes).not.toHaveBeenCalled();
    expect(GitFsService.listTree).not.toHaveBeenCalled();
  });

  test('listTree + readFile go through GitFsService, not GitHubService', async () => {
    await pullFromSingleRepo('me/gitnotes');
    expect(GitFsService.listTree).toHaveBeenCalledWith({
      repoPath: 'me/gitnotes',
      ref: 'main',
    });
    // Only the non-image .md is fetched — images/ subpath is filtered out.
    expect(GitFsService.readFile).toHaveBeenCalledTimes(1);
    expect(GitFsService.readFile).toHaveBeenCalledWith({
      repoPath: 'me/gitnotes',
      ref: 'main',
      filepath: 'notes/foo.md',
    });
    // The Contents API path must not be touched in clone mode.
    expect(GitHubService.getTreeRecursiveOrThrow).not.toHaveBeenCalled();
    expect(GitHubService.getFileContent).not.toHaveBeenCalled();
  });

  test('api mode keeps using GitHubService (no clone-mode side effects)', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValueOnce('api');
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValueOnce([
      { path: 'notes/foo.md', type: 'blob', sha: 'aa' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValueOnce('hello');

    await pullFromSingleRepo('me/gitnotes');
    expect(GitFsService.clone).not.toHaveBeenCalled();
    expect(GitFsService.fetch).not.toHaveBeenCalled();
    expect(GitFsService.listTree).not.toHaveBeenCalled();
    expect(GitHubService.getTreeRecursiveOrThrow).toHaveBeenCalledWith('me', 'gitnotes', 'main');
  });

  test('clone failure returns 0 and skips reconcile (saveAllNotes not called)', async () => {
    (GitFsService.clone as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const result = await pullFromSingleRepo('me/gitnotes');
    expect(result.notes).toBe(0);
    expect(StorageService.saveAllNotes).not.toHaveBeenCalled();
  });
});
