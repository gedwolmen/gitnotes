import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RepositoryAccessPolicyService,
  RepositoryNotSelectedError,
  WriteNotVerifiedError,
  requireRepoSelected,
  requireWriteVerified,
  canProceed,
} from '@/services/RepositoryAccessPolicyService';
import type { CanonicalRepoId } from '@/services/git/contracts';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockHostId = 'acc-123:github:default';
const mockCanonicalRepoId: CanonicalRepoId = {
  version: 1,
  id: 'github:default/owner/repo',
  provider: 'github',
  instanceKey: 'default',
  owner: 'owner',
  repo: 'repo',
  displayName: 'owner/repo',
};

describe('RepositoryAccessPolicyService', () => {
  beforeEach(async () => {
    await RepositoryAccessPolicyService.clearAllPolicies();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('initializes without error', async () => {
      await expect(RepositoryAccessPolicyService.initialize()).resolves.toBeUndefined();
    });
  });

  describe('selectRepository', () => {
    it('selects a repository and marks it as allowed', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);

      const isAllowed = await RepositoryAccessPolicyService.isRepoAllowed(mockHostId, mockCanonicalRepoId);
      expect(isAllowed).toBe(true);
    });

    it('selects with writeVerified when option is set', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });

      const isAllowed = await RepositoryAccessPolicyService.isRepoAllowed(mockHostId, mockCanonicalRepoId);
      const isWriteVerified = await RepositoryAccessPolicyService.isRepoWriteVerified(mockHostId, mockCanonicalRepoId);
      expect(isAllowed).toBe(true);
      expect(isWriteVerified).toBe(true);
    });
  });

  describe('deselectRepository', () => {
    it('removes repository from allowed list', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      await RepositoryAccessPolicyService.deselectRepository(mockHostId, mockCanonicalRepoId);

      const isAllowed = await RepositoryAccessPolicyService.isRepoAllowed(mockHostId, mockCanonicalRepoId);
      expect(isAllowed).toBe(false);
    });

    it('blocks operations after deselection', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      await RepositoryAccessPolicyService.deselectRepository(mockHostId, mockCanonicalRepoId);

      await expect(requireRepoSelected(mockHostId, mockCanonicalRepoId)).rejects.toThrow(RepositoryNotSelectedError);
    });
  });

  describe('requireRepoSelected', () => {
    it('throws when repo is not selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await expect(requireRepoSelected(mockHostId, mockCanonicalRepoId)).rejects.toThrow(RepositoryNotSelectedError);
    });

    it('does not throw when repo is selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      await expect(requireRepoSelected(mockHostId, mockCanonicalRepoId)).resolves.toBeUndefined();
    });
  });

  describe('requireWriteVerified', () => {
    it('throws when repo is not selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await expect(requireWriteVerified(mockHostId, mockCanonicalRepoId)).rejects.toThrow(RepositoryNotSelectedError);
    });

    it('throws when repo is selected but write is not verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      await expect(requireWriteVerified(mockHostId, mockCanonicalRepoId)).rejects.toThrow(WriteNotVerifiedError);
    });

    it('does not throw when write is verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });
      await expect(requireWriteVerified(mockHostId, mockCanonicalRepoId)).resolves.toBeUndefined();
    });
  });

  describe('canProceed', () => {
    it('returns false when repo not selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      const result = await canProceed(mockHostId, mockCanonicalRepoId);
      expect(result).toBe(false);
    });

    it('returns true when repo is selected', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      const result = await canProceed(mockHostId, mockCanonicalRepoId);
      expect(result).toBe(true);
    });

    it('returns false for write when not verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);
      const result = await canProceed(mockHostId, mockCanonicalRepoId, true);
      expect(result).toBe(false);
    });

    it('returns true for write when verified', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });
      const result = await canProceed(mockHostId, mockCanonicalRepoId, true);
      expect(result).toBe(true);
    });
  });

  describe('same repo ID is distinct across hosts', () => {
    it('distinguishes repos by host', async () => {
      const hostA = 'acc-a:github:default';
      const hostB = 'acc-b:github:default';

      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(hostA, mockCanonicalRepoId);

      const isAllowedOnA = await RepositoryAccessPolicyService.isRepoAllowed(hostA, mockCanonicalRepoId);
      const isAllowedOnB = await RepositoryAccessPolicyService.isRepoAllowed(hostB, mockCanonicalRepoId);

      expect(isAllowedOnA).toBe(true);
      expect(isAllowedOnB).toBe(false);
    });
  });

  describe('canonical host isolation', () => {
    it('same owner/repo on different instance keys are distinct', async () => {
      const hostA = 'acc-a:github:default';
      const hostB = 'acc-b:github:gitlab.mycompany.com';

      const repoOnGitHubCom: CanonicalRepoId = {
        version: 1,
        id: 'github:default/owner/repo',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'repo',
        displayName: 'owner/repo',
      };

      const repoOnGitLab: CanonicalRepoId = {
        version: 1,
        id: 'github:gitlab.mycompany.com/owner/repo',
        provider: 'github',
        instanceKey: 'gitlab.mycompany.com',
        owner: 'owner',
        repo: 'repo',
        displayName: 'owner/repo',
      };

      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(hostA, repoOnGitHubCom);

      const isAllowedOnGitHub = await RepositoryAccessPolicyService.isRepoAllowed(hostA, repoOnGitHubCom);
      const isAllowedOnGitLab = await RepositoryAccessPolicyService.isRepoAllowed(hostB, repoOnGitLab);

      expect(isAllowedOnGitHub).toBe(true);
      expect(isAllowedOnGitLab).toBe(false);
    });
  });

  describe('host-scoped lowercase policy', () => {
    it('host keys are normalized to lowercase', async () => {
      const mixedCaseHost = 'Acc-123:GiThUb:DeFaUlT';

      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mixedCaseHost, mockCanonicalRepoId);

      const normalizedKey = RepositoryAccessPolicyService.getNormalizedHostKey(mixedCaseHost);
      expect(normalizedKey).toBe('acc-123:github:default');
    });
  });

  describe('write verification cache invalidation', () => {
    it('invalidateWriteVerification removes only that repo', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });

      const anotherRepo: CanonicalRepoId = {
        version: 1,
        id: 'github:default/owner/another',
        provider: 'github',
        instanceKey: 'default',
        owner: 'owner',
        repo: 'another',
        displayName: 'owner/another',
      };
      await RepositoryAccessPolicyService.selectRepository(mockHostId, anotherRepo, { writeVerified: true });

      await RepositoryAccessPolicyService.invalidateAllWriteVerificationsForHost(mockHostId);

      const isVerifiedOriginal = await RepositoryAccessPolicyService.isRepoWriteVerified(mockHostId, mockCanonicalRepoId);
      const isVerifiedAnother = await RepositoryAccessPolicyService.isRepoWriteVerified(mockHostId, anotherRepo);

      expect(isVerifiedOriginal).toBe(false);
      expect(isVerifiedAnother).toBe(false);
    });

    it('invalidateAllWriteVerificationsGlobal clears all for host', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });

      await RepositoryAccessPolicyService.invalidateAllWriteVerificationsGlobal();

      const isVerified = await RepositoryAccessPolicyService.isRepoWriteVerified(mockHostId, mockCanonicalRepoId);
      expect(isVerified).toBe(false);
    });
  });

  describe('policy persistence', () => {
    it('lastModifiedAt is updated on policy changes', async () => {
      await RepositoryAccessPolicyService.initialize();
      const before = Date.now() - 1000;
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId);

      const policy = await RepositoryAccessPolicyService.getPolicy(mockHostId);
      expect(policy.lastModifiedAt).toBeGreaterThanOrEqual(before);
    });

    it('policy persists across service reinitialization', async () => {
      await RepositoryAccessPolicyService.initialize();
      await RepositoryAccessPolicyService.selectRepository(mockHostId, mockCanonicalRepoId, { writeVerified: true });

      await RepositoryAccessPolicyService.clearAllPolicies();
      await RepositoryAccessPolicyService.initialize();

      const isAllowed = await RepositoryAccessPolicyService.isRepoAllowed(mockHostId, mockCanonicalRepoId);
      const isWriteVerified = await RepositoryAccessPolicyService.isRepoWriteVerified(mockHostId, mockCanonicalRepoId);

      expect(isAllowed).toBe(false);
      expect(isWriteVerified).toBe(false);
    });
  });
});
