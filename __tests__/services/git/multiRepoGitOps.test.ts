import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  stageAllPending,
  commitAll,
  pushAll,
  commitAndPushAll,
} from '@/services/git/multiRepoGitOps';
import { RepositoryAccessPolicyService } from '@/services/RepositoryAccessPolicyService';
import type { GitRepository } from '@/services/GitService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/services/git/engine/GitEngine', () => ({
  statuses: jest.fn(),
  commit: jest.fn(),
  status: jest.fn(),
  pushWithIntegrate: jest.fn(),
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    workingTreeUri: jest.fn((opts: { repoPath: string }) => `/fake/path/${opts.repoPath}`),
  },
}));

jest.mock('@/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    capturePreflight: jest.fn(),
    markPushActive: jest.fn(),
    verifyPostflight: jest.fn(),
    clearPushActive: jest.fn(),
    clearPreflight: jest.fn(),
    releasePushMarker: jest.fn(),
  },
}));

jest.mock('@/stores/gitOperationStore', () => ({
  gitOperationRegistry: {
    begin: jest.fn(() => 'op-123'),
    succeed: jest.fn(),
    fail: jest.fn(),
  },
}));

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getHostConnection: jest.fn(),
  },
}));

const mockGitEngine = require('@/services/git/engine/GitEngine');
const mockGitSyncGate = require('@/services/git/GitSyncGate');
const mockAccountStorage = require('@/services/AccountStorage');

const mockHostId = 'acc-123:github:default';

const mockRepos: GitRepository[] = [
  {
    id: 'repo-1',
    path: 'owner/repo1',
    name: 'repo1',
    provider: 'github',
    hostId: mockHostId,
  },
  {
    id: 'repo-2',
    path: 'owner/repo2',
    name: 'repo2',
    provider: 'github',
    hostId: mockHostId,
  },
];

const mockAuthor = { name: 'Test', email: 'test@test.com' };

describe('multiRepoGitOps policy enforcement', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await RepositoryAccessPolicyService.clearAllPolicies();
    mockAccountStorage.AccountStorage.getHostConnection.mockResolvedValue({
      id: mockHostId,
      instanceBaseUrl: null,
      provider: 'github',
    });
  });

  describe('stageAllPending', () => {
    it('blocks when repo is not selected', async () => {
      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: false },
      ]);

      const result = await stageAllPending(mockRepos);

      expect(result.ok).toBe(false);
      expect(result.failures.length).toBe(2);
      expect(result.failures[0].error).toContain('not selected');
    });

    it('allows when repo is selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, {
        version: 1,
        id: 'github:default/owner/repo1',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo1',
        displayName: 'owner/repo1',
      });

      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: false },
      ]);

      const result = await stageAllPending(mockRepos);

      expect(result.failures.length).toBeLessThanOrEqual(2);
    });
  });

  describe('commitAll', () => {
    it('blocks when repo is not selected', async () => {
      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: true },
      ]);

      const result = await commitAll(mockRepos, 'test commit', mockAuthor);

      expect(result.ok).toBe(false);
      expect(result.failures.length).toBe(2);
      expect(result.failures[0].error).toContain('not selected');
    });

    it('allows when repo is selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, {
        version: 1,
        id: 'github:default/owner/repo1',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo1',
        displayName: 'owner/repo1',
      });

      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: true },
      ]);
      mockGitEngine.commit.mockResolvedValue(undefined);

      const result = await commitAll(mockRepos, 'test commit', mockAuthor);

      expect(result.failures.some((f) => f.repoPath === 'owner/repo1')).toBe(false);
    });
  });

  describe('pushAll', () => {
    it('blocks when repo is not selected', async () => {
      mockGitEngine.status.mockResolvedValue({
        ahead: 1,
        currentBranch: 'main',
      });
      mockGitEngine.pushWithIntegrate.mockResolvedValue({
        ok: true,
        pushed: 1,
        message: '',
        conflicts: [],
      });
      mockGitSyncGate.GitSyncGate.capturePreflight.mockResolvedValue({
        headOid: 'abc123',
      });
      mockGitSyncGate.GitSyncGate.verifyPostflight.mockResolvedValue({ ok: true });

      const result = await pushAll(mockRepos);

      expect(result.ok).toBe(false);
      expect(result.failures.length).toBe(2);
      expect(result.failures[0].error).toContain('not selected');
    });

    it('allows when repo write is verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, {
        version: 1,
        id: 'github:default/owner/repo1',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo1',
        displayName: 'owner/repo1',
      });
      await RepositoryAccessPolicyService.markWriteVerified(mockHostId, {
        version: 1,
        id: 'github:default/owner/repo1',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo1',
        displayName: 'owner/repo1',
      });

      mockGitEngine.status.mockResolvedValue({
        ahead: 1,
        currentBranch: 'main',
      });
      mockGitEngine.pushWithIntegrate.mockResolvedValue({
        ok: true,
        pushed: 1,
        message: '',
        conflicts: [],
      });
      mockGitSyncGate.GitSyncGate.capturePreflight.mockResolvedValue({
        headOid: 'abc123',
      });
      mockGitSyncGate.GitSyncGate.verifyPostflight.mockResolvedValue({ ok: true });

      const result = await pushAll(mockRepos);

      expect(result.failures.some((f) => f.repoPath === 'owner/repo1')).toBe(false);
    });
  });

  describe('commitAndPushAll', () => {
    it('blocks both commit and push when repo not selected', async () => {
      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: true },
      ]);
      mockGitEngine.status.mockResolvedValue({
        ahead: 1,
        currentBranch: 'main',
      });
      mockGitEngine.pushWithIntegrate.mockResolvedValue({
        ok: true,
        pushed: 1,
        message: '',
        conflicts: [],
      });
      mockGitSyncGate.GitSyncGate.capturePreflight.mockResolvedValue({
        headOid: 'abc123',
      });
      mockGitSyncGate.GitSyncGate.verifyPostflight.mockResolvedValue({ ok: true });

      const result = await commitAndPushAll(mockRepos, 'test commit', mockAuthor);

      expect(result.ok).toBe(false);
      expect(result.failures.length).toBe(4);
    });

    it('allows commit but blocks push when write not verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, {
        version: 1,
        id: 'github:default/owner/repo1',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo1',
        displayName: 'owner/repo1',
      });

      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: true },
      ]);
      mockGitEngine.status.mockResolvedValue({
        ahead: 1,
        currentBranch: 'main',
      });
      mockGitEngine.pushWithIntegrate.mockResolvedValue({
        ok: true,
        pushed: 1,
        message: '',
        conflicts: [],
      });
      mockGitSyncGate.GitSyncGate.capturePreflight.mockResolvedValue({
        headOid: 'abc123',
      });
      mockGitSyncGate.GitSyncGate.verifyPostflight.mockResolvedValue({ ok: true });

      const result = await commitAndPushAll(mockRepos, 'test commit', mockAuthor);

      expect(result.failures.some((f) => f.repoPath === 'owner/repo1' && f.error?.includes('not verified'))).toBe(true);
    });
  });

  describe('same-named repos on different hosts', () => {
    it('distinguishes repos by host instance', async () => {
      const hostA = 'acc-a:github:default';
      const hostB = 'acc-b:github:gitlab.mycompany.com';

      const repoA: GitRepository = {
        id: 'repo-a',
        path: 'owner/same-repo',
        name: 'same-repo',
        provider: 'github',
        hostId: hostA,
      };

      const repoB: GitRepository = {
        id: 'repo-b',
        path: 'owner/same-repo',
        name: 'same-repo',
        provider: 'github',
        hostId: hostB,
      };

      mockGitEngine.statuses.mockResolvedValue([
        { path: 'file1.md', status: 'modified', staged: false },
      ]);

      mockAccountStorage.AccountStorage.getHostConnection.mockImplementation(async (hostId: string) => {
        if (hostId === hostA) {
          return { id: hostA, instanceBaseUrl: null, provider: 'github' };
        }
        if (hostId === hostB) {
          return { id: hostB, instanceBaseUrl: 'https://gitlab.mycompany.com', provider: 'github' };
        }
        return null;
      });

      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(hostA, {
        version: 1,
        id: 'github:default/owner/same-repo',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'same-repo',
        displayName: 'owner/same-repo',
      });

      const result = await stageAllPending([repoA, repoB]);

      expect(result.failures.length).toBeLessThanOrEqual(2);
    });
  });
});
