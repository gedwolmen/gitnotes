/**
 * Tests for host-identity preservation through repository discovery, add, and import.
 *
 * Host A (e.g. forgejo.mycompany.com) vs Host B (forgejo2.mycompany.com):
 * - A repo discovered from host A must retain host A's hostId/provider/instanceBaseUrl
 *   through addRepository and importRepoAtAdd.
 * - cloneExclusive must be called with host A's instanceBaseUrl, not host B's.
 * - importRepoAtAdd must use the repo's own hostId (not the global active host)
 *   when looking up credentials for clone.
 */
import { importRepoAtAdd } from '@/services/RepoImportService';
import { AccountStorage } from '@/services/AccountStorage';
import { AuthService } from '@/services/AuthService';
import { StorageService } from '@/services/StorageService';
import { GitFsService } from '@/services/git/GitFsService';
import { resolveBranch } from '@/services/git/branchResolver';
import * as GitEngine from '@/services/git/engine/GitEngine';

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getActiveHostConnection: jest.fn(),
    getHostConnection: jest.fn(),
    getHostToken: jest.fn(),
    getHostUseSsh: jest.fn(),
  },
}));

jest.mock('@/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(),
  },
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(),
    cloneExclusive: jest.fn(),
    getCommitOid: jest.fn(),
    listTree: jest.fn(),
    readFile: jest.fn(),
    pullWithFastForward: jest.fn(),
  },
}));

jest.mock('@/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  setCredential: jest.fn(),
}));

jest.mock('@/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getPathCommitDates: jest.fn(() => Promise.resolve({})),
  },
}));

const mockPullFromSingleRepo = jest.fn();
jest.mock('@/services/RepoPullService', () => ({
  pullFromSingleRepo: (...args: unknown[]) => mockPullFromSingleRepo(...args),
}));

const FORGEJO_HOST_A = {
  id: 'acc1:forgejo:forgejo.mycompany.com',
  accountId: 'acc1',
  provider: 'forgejo' as const,
  instanceBaseUrl: 'https://forgejo.mycompany.com',
  hostLogin: 'alice',
  hostUserId: 1,
  name: 'Alice',
  email: 'alice@mycompany.com',
  avatarUrl: null,
  addedAt: 1,
};

const FORGEJO_HOST_B = {
  id: 'acc1:forgejo:forgejo2.mycompany.com',
  accountId: 'acc1',
  provider: 'forgejo' as const,
  instanceBaseUrl: 'https://forgejo2.mycompany.com',
  hostLogin: 'alice',
  hostUserId: 1,
  name: 'Alice',
  email: 'alice@mycompany.com',
  avatarUrl: null,
  addedAt: 1,
};

describe('Host identity through importRepoAtAdd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPullFromSingleRepo.mockResolvedValue({
      repos: 1, notes: 0, canvases: 0, todos: 0, templates: 0,
    });
    jest.mocked(AuthService.getToken).mockResolvedValue('active-host-token');
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([]);
    jest.mocked(resolveBranch).mockResolvedValue('main');
    jest.mocked(GitFsService.isCloned).mockResolvedValue(false);
    jest.mocked(GitFsService.cloneExclusive).mockResolvedValue(undefined);
    jest.mocked(GitFsService.getCommitOid).mockResolvedValue('abc123head');
    jest.mocked(GitFsService.listTree).mockResolvedValue([]);
    jest.mocked(StorageService.getAllNotes).mockResolvedValue([]);
    jest.mocked(StorageService.saveAllNotes).mockResolvedValue(undefined);
  });

  it('FAILING: uses repo.hostId to find host connection even when active host differs', async () => {
    // Repo was added from forgejo.mycompany.com (host A), but active host is forgejo2.mycompany.com (host B)
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([
      {
        id: 'forgejo:mycompany/my-repo',
        path: 'mycompany/my-repo',
        name: 'my-repo',
        provider: 'forgejo',
        hostId: FORGEJO_HOST_A.id, // repo's true origin
        branch: 'main',
      },
    ]);

    // Active host connection is forgejo2.mycompany.com (NOT the repo's host)
    jest.mocked(AccountStorage.getActiveHostConnection).mockResolvedValue(FORGEJO_HOST_B);
    // Host A connection is forgejo.mycompany.com
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue(FORGEJO_HOST_A);
    jest.mocked(AccountStorage.getHostToken).mockResolvedValue('host-a-token');
    jest.mocked(AccountStorage.getHostUseSsh).mockResolvedValue(false);

    await importRepoAtAdd('mycompany/my-repo', 'my-repo');

    // Must use repo.hostId to find the correct host, NOT the active host
    expect(AccountStorage.getHostConnection).toHaveBeenCalledWith(FORGEJO_HOST_A.id);
    expect(AccountStorage.getActiveHostConnection).not.toHaveBeenCalled();

    // cloneExclusive must use host A's instanceBaseUrl
    expect(GitFsService.cloneExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceBaseUrl: 'https://forgejo.mycompany.com',
        provider: 'forgejo',
      }),
    );
    expect(GitEngine.setCredential).toHaveBeenCalledWith(
      'forgejo:mycompany/my-repo',
      { kind: 'token', username: 'alice', token: 'host-a-token' },
    );
  });

  it('FAILING: cloneExclusive gets forgejo.mycompany.com base URL when active host is forgejo2.mycompany.com', async () => {
    // Simulates: user added a forgejo.mycompany.com repo when that was the active host,
    // then switched to a different host, then did a re-import
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([
      {
        id: 'forgejo:mycompany/my-repo',
        path: 'mycompany/my-repo',
        name: 'my-repo',
        provider: 'forgejo',
        hostId: FORGEJO_HOST_A.id,
        branch: 'main',
      },
    ]);

    jest.mocked(AccountStorage.getActiveHostConnection).mockResolvedValue(FORGEJO_HOST_B);
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue(FORGEJO_HOST_A);
    jest.mocked(AccountStorage.getHostUseSsh).mockResolvedValue(false);

    await importRepoAtAdd('mycompany/my-repo', 'my-repo');

    // The bug: without hostId, this would call getActiveHostConnection() and use
    // forgejo2.mycompany.com's URL for clone, producing a wrong clone URL.
    // With the fix: getHostConnection(hostA.id) returns host A with the correct URL.
    const cloneCall = jest.mocked(GitFsService.cloneExclusive).mock.calls[0][0];
    expect(cloneCall.instanceBaseUrl).toBe('https://forgejo.mycompany.com');
  });

  it('FAILING: getActiveHostConnection is called as fallback only when repo has no hostId', async () => {
    // Repo has no hostId (legacy) — must fall back to active host
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([
      {
        id: 'forgejo:mycompany/my-repo',
        path: 'mycompany/my-repo',
        name: 'my-repo',
        provider: 'forgejo',
        // hostId is absent (legacy repo)
        branch: 'main',
      },
    ]);

    jest.mocked(AccountStorage.getActiveHostConnection).mockResolvedValue(FORGEJO_HOST_A);
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue(null); // hostId lookup returns null
    jest.mocked(AccountStorage.getHostUseSsh).mockResolvedValue(false);

    await importRepoAtAdd('mycompany/my-repo', 'my-repo');

    // Falls back to active host
    expect(AccountStorage.getActiveHostConnection).toHaveBeenCalled();
    expect(GitFsService.cloneExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceBaseUrl: 'https://forgejo.mycompany.com',
      }),
    );
  });
});
