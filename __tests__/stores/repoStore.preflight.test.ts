/**
 * Regression tests for repoStore.addRepository preflight boundary.
 *
 * Exercises the actual Zustand action with mocked dependencies to verify:
 * - Preflight failures (no_access, transient, write_unverified without override)
 *   throw BEFORE GitService.addRepository, GitFsService.cloneExclusive, and
 *   initializeForRepo are called.
 * - write_unverified with { allowUnverifiedWrite: true } proceeds to registration.
 * - ok case proceeds to registration and clone.
 */

import { RepoAccessPreflightError } from '@/services/git/repoAccessPreflight';

jest.mock('@/services/git/repoAccessPreflight', () => ({
  ...jest.requireActual('@/services/git/repoAccessPreflight'),
  checkGitHubRepoAccess: jest.fn(),
}));

jest.mock('@/services/GitService', () => ({
  GitService: {
    addRepository: jest.fn(),
  },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    cloneExclusive: jest.fn(),
  },
}));

jest.mock('@/services/git/activeBranchStore', () => ({
  initializeForRepo: jest.fn(),
  removeForRepo: jest.fn(),
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    addRepository: jest.fn(),
    removeRepository: jest.fn(),
    purgeRepoData: jest.fn(),
  },
}));

jest.mock('@/services/git/activeHost', () => ({
  getActiveGitHost: jest.fn(),
}));

jest.mock('@/stores/noteStore', () => ({
  useNoteStore: {
    getState: jest.fn(() => ({
      refreshNotes: jest.fn(),
    })),
  },
}));

jest.mock('@/stores/canvasStore', () => ({
  useCanvasStore: {
    getState: jest.fn(() => ({
      refreshCanvases: jest.fn(),
    })),
  },
}));

jest.mock('@/stores/todoStore', () => ({
  useTodoStore: {
    getState: jest.fn(() => ({
      refreshTodos: jest.fn(),
    })),
  },
}));

jest.mock('@/stores/aiStore', () => ({
  useAIStore: {
    getState: jest.fn(() => ({
      chatRepoOwner: null,
      chatRepoName: null,
      setChatRepo: jest.fn(),
    })),
  },
}));

jest.mock('@/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('@/services/LastUsedRepoService', () => ({
  LastUsedRepoService: {
    get: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('@/services/TemplateMarkdownService', () => ({
  serializeTemplate: jest.fn(),
  templateSlug: jest.fn(),
}));

import { checkGitHubRepoAccess } from '@/services/git/repoAccessPreflight';
import { GitService } from '@/services/GitService';
import { GitFsService } from '@/services/git/GitFsService';
import { initializeForRepo } from '@/services/git/activeBranchStore';
import { StorageService } from '@/services/StorageService';
import { getActiveGitHost } from '@/services/git/activeHost';
import { useRepoStore } from '@/stores/repoStore';

const mockHost = {
  provider: 'github' as const,
  token: 'tok_test_abc123',
  hostId: 'host1',
  instanceBaseUrl: undefined,
};

const mockRepoResult = {
  id: 'github:12345',
  name: 'my-repo',
  path: 'me/my-repo',
  branch: 'main',
  provider: 'github' as const,
  hostId: 'host1',
};

describe('repoStore.addRepository preflight boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getActiveGitHost).mockResolvedValue(mockHost);
    jest.mocked(GitService.addRepository).mockResolvedValue(mockRepoResult);
    jest.mocked(GitFsService.cloneExclusive).mockResolvedValue(undefined);
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([mockRepoResult]);
    useRepoStore.setState({ repositories: [], isLoading: false });
  });

  // -----------------------------------------------------------------------
  // no_access — terminal, throws immediately before registration
  // -----------------------------------------------------------------------
  describe('no_access preflight failure', () => {
    it('throws RepoAccessPreflightError before calling GitService.addRepository', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'no_access',
        message: 'This GitHub repository is not accessible.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitService.addRepository).not.toHaveBeenCalled();
    });

    it('throws before calling GitFsService.cloneExclusive', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'no_access',
        message: 'This GitHub repository is not accessible.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitFsService.cloneExclusive).not.toHaveBeenCalled();
    });

    it('throws before calling initializeForRepo', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'no_access',
        message: 'This GitHub repository is not accessible.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(initializeForRepo).not.toHaveBeenCalled();
    });

    it('error canRetry is false (terminal — no retry)', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'no_access',
        message: 'This GitHub repository is not accessible.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toMatchObject({ canRetry: false });
    });
  });

  // -----------------------------------------------------------------------
  // transient — retryable, throws before registration
  // -----------------------------------------------------------------------
  describe('transient preflight failure', () => {
    it('throws RepoAccessPreflightError before calling GitService.addRepository', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'transient',
        message: 'Could not verify access right now.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitService.addRepository).not.toHaveBeenCalled();
    });

    it('throws before calling GitFsService.cloneExclusive', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'transient',
        message: 'Could not verify access right now.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitFsService.cloneExclusive).not.toHaveBeenCalled();
    });

    it('throws before calling initializeForRepo', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'transient',
        message: 'Could not verify access right now.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(initializeForRepo).not.toHaveBeenCalled();
    });

    it('error canRetry is true (retryable)', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'transient',
        message: 'Could not verify access right now.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toMatchObject({ canRetry: true });
    });
  });

  // -----------------------------------------------------------------------
  // write_unverified without override — throws before registration
  // -----------------------------------------------------------------------
  describe('write_unverified preflight failure (no override)', () => {
    it('throws RepoAccessPreflightError before calling GitService.addRepository', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitService.addRepository).not.toHaveBeenCalled();
    });

    it('throws before calling GitFsService.cloneExclusive', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(GitFsService.cloneExclusive).not.toHaveBeenCalled();
    });

    it('throws before calling initializeForRepo', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toThrow(RepoAccessPreflightError);

      expect(initializeForRepo).not.toHaveBeenCalled();
    });

    it('error canRetry is true (user can override with Add Anyway)', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await expect(
        useRepoStore.getState().addRepository('me/my-repo'),
      ).rejects.toMatchObject({ canRetry: true });
    });
  });

  // -----------------------------------------------------------------------
  // write_unverified WITH override — proceeds to registration
  // -----------------------------------------------------------------------
  describe('write_unverified with allowUnverifiedWrite override', () => {
    it('calls GitService.addRepository when override is passed', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await useRepoStore.getState().addRepository('me/my-repo', undefined, 'github', {
        allowUnverifiedWrite: true,
      });

      expect(GitService.addRepository).toHaveBeenCalledWith(
        'me/my-repo',
        undefined,
        'github',
        mockHost.hostId,
      );
    });

    it('calls GitFsService.cloneExclusive after override', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await useRepoStore.getState().addRepository('me/my-repo', undefined, 'github', {
        allowUnverifiedWrite: true,
      });

      expect(GitFsService.cloneExclusive).toHaveBeenCalled();
    });

    it('calls initializeForRepo after override', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'write_unverified',
        message: 'Write access could not be verified.',
      });

      await useRepoStore.getState().addRepository('me/my-repo', undefined, 'github', {
        allowUnverifiedWrite: true,
      });

      expect(initializeForRepo).toHaveBeenCalledWith(mockRepoResult);
    });
  });

  // -----------------------------------------------------------------------
  // ok case — proceeds to registration
  // -----------------------------------------------------------------------
  describe('ok preflight result', () => {
    it('calls GitService.addRepository', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'ok',
        writeVerified: true,
      });

      await useRepoStore.getState().addRepository('me/my-repo');

      expect(GitService.addRepository).toHaveBeenCalledWith(
        'me/my-repo',
        undefined,
        'github',
        mockHost.hostId,
      );
    });

    it('calls GitFsService.cloneExclusive', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'ok',
        writeVerified: true,
      });

      await useRepoStore.getState().addRepository('me/my-repo');

      expect(GitFsService.cloneExclusive).toHaveBeenCalledWith(
        expect.objectContaining({
          repoPath: mockRepoResult.path,
          branch: 'main',
          token: mockHost.token,
          repoId: mockRepoResult.id,
          provider: 'github',
        }),
      );
    });

    it('calls initializeForRepo', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'ok',
        writeVerified: true,
      });

      await useRepoStore.getState().addRepository('me/my-repo');

      expect(initializeForRepo).toHaveBeenCalledWith(mockRepoResult);
    });

    it('updates store repositories on success', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'ok',
        writeVerified: true,
      });

      await useRepoStore.getState().addRepository('me/my-repo');

      expect(useRepoStore.getState().repositories).toEqual([mockRepoResult]);
    });
  });

  // -----------------------------------------------------------------------
  // non-github provider skips preflight entirely
  // -----------------------------------------------------------------------
  describe('non-github provider skips preflight', () => {
    it('does not call checkGitHubRepoAccess for gitlab', async () => {
      jest.mocked(checkGitHubRepoAccess).mockResolvedValue({
        kind: 'no_access',
        message: 'Should not be called',
      });

      await useRepoStore.getState().addRepository('me/my-gitlab-repo', undefined, 'gitlab');

      expect(checkGitHubRepoAccess).not.toHaveBeenCalled();
    });

    it('still calls GitService.addRepository for gitlab', async () => {
      await useRepoStore.getState().addRepository('me/my-gitlab-repo', undefined, 'gitlab');

      expect(GitService.addRepository).toHaveBeenCalled();
    });
  });
});
