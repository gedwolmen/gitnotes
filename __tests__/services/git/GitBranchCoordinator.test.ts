/**
 * TDD tests for GitBranchCoordinator checkout safety state machine.
 *
 * These tests define the expected behavior of the checkout safety system.
 * They FAIL until the implementation is added (failing-first TDD approach).
 *
 * State machine states:
 *   - idle: no checkout or mutation in progress
 *   - checkout-running: a branch checkout is in progress
 *   - mutation-running: a git mutation (stage, commit, etc.) is in progress
 *   - failed: a checkout or mutation failed; requires explicit recovery
 *
 * Key invariants:
 *   - Checkout acquires the repo cycle gate BEFORE checking working tree status
 *   - Any staged or modified (non-Unmodified) file blocks checkout
 *   - Mutations are rejected/queued while checkout-running
 *   - Checkout failure leaves branch and working tree unchanged
 *   - Watchdog recovers from leaked state after timeout
 */

import { gitOperationRegistry } from '@/stores/gitOperationStore';

// Mock the entire GitEngine module first
jest.mock('@/services/git/engine/GitEngine', () => ({
  statuses: jest.fn(),
  checkoutBranch: jest.fn(),
  isBusy: jest.fn(),
}));

// Mock GitSyncGate
jest.mock('@/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(),
    verifyCheckoutPostflight: jest.fn(),
    isCycleHeld: jest.fn(),
    forceReleaseCycle: jest.fn(),
    __resetForTest: jest.fn(),
  },
}));

jest.mock('@/services/git/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pauseAllExcept: jest.fn(),
  },
}));

// Mock the native module for isRepoLocked
jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({
    isRepoLocked: jest.fn(() => Promise.resolve(false)),
  })),
}));

// Import types after mocks are set up
import * as GitEngine from '@/services/git/engine/GitEngine';
import { GitSyncGate } from '@/services/git/GitSyncGate';
import { NoteSyncQueueService } from '@/services/git/NoteSyncQueueService';
import { GitBranchCoordinator } from '@/services/git/GitBranchCoordinator';

const GitEngineMock = GitEngine as jest.Mocked<typeof GitEngine>;
const GitSyncGateMock = GitSyncGate as jest.Mocked<typeof GitSyncGate>;
const NoteSyncQueueServiceMock = NoteSyncQueueService as jest.Mocked<typeof NoteSyncQueueService>;

const TEST_REPO_PATH = '/mock/repo';
const TEST_REPO_ID = 'test-repo-id';

const MOCK_RELEASE_CYCLE = jest.fn();

describe('GitBranchCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MOCK_RELEASE_CYCLE.mockReturnValue(undefined);
    GitSyncGateMock.acquireCycle.mockResolvedValue(MOCK_RELEASE_CYCLE);
    GitSyncGateMock.verifyCheckoutPostflight.mockResolvedValue({ ok: true });
    NoteSyncQueueServiceMock.pauseAllExcept.mockResolvedValue(undefined);
    GitSyncGateMock.isCycleHeld.mockReturnValue(false);
    GitBranchCoordinator.__resetForTests();
  });

  describe('state machine states', () => {
    it('starts in idle state', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      expect(GitBranchCoordinator.getState()).toBe('idle');
    });

    it('transitions to checkout-running when checkout starts', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      const checkoutPromise = GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      // Should transition to checkout-running immediately
      await expect(GitBranchCoordinator.getState()).toBe('checkout-running');

      await checkoutPromise;
    });

    it('transitions back to idle after successful checkout', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      expect(GitBranchCoordinator.getState()).toBe('idle');
    });

    it('transitions to failed when checkout throws', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow('Checkout failed');

      expect(GitBranchCoordinator.getState()).toBe('failed');
    });

    it('can recover from failed state via explicit reset', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow('Checkout failed');

      expect(GitBranchCoordinator.getState()).toBe('failed');

      GitBranchCoordinator.reset();

      expect(GitBranchCoordinator.getState()).toBe('idle');
    });

    it('transitions to mutation-running when mutation starts', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');
      await GitBranchCoordinator.beginMutation('test-op');

      expect(GitBranchCoordinator.getState()).toBe('mutation-running');
    });
  });

  describe('working tree safety checks', () => {
    it('accepts the requested branch after checkout changes HEAD', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).resolves.not.toThrow();

      expect(GitSyncGateMock.verifyCheckoutPostflight).toHaveBeenCalledWith(
        TEST_REPO_PATH,
        'feature-branch',
        expect.any(String),
      );
      expect(NoteSyncQueueServiceMock.pauseAllExcept).toHaveBeenCalledWith(
        TEST_REPO_ID,
        'feature-branch',
      );
    });

    it('fails when checkout postflight finds a different branch', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);
      GitSyncGateMock.verifyCheckoutPostflight.mockResolvedValue({
        ok: false,
        reason: 'branch-changed',
      });

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow(/branch state changed/i);
      expect(GitBranchCoordinator.getState()).toBe('failed');
    });

    it('allows checkout when all files are Unmodified (clean tree)', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([
        { path: 'notes/readme.md', status: 'Unmodified', staged: false, conflicted: false, indexStatus: '', workdirStatus: '' },
      ]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).resolves.not.toThrow();

      expect(GitEngineMock.checkoutBranch).toHaveBeenCalledWith(
        TEST_REPO_PATH,
        'feature-branch',
        expect.any(String)
      );
    });

    it('rejects checkout when any file is staged', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([
        { path: 'notes/readme.md', status: 'Modified', staged: true, conflicted: false, indexStatus: 'Modified', workdirStatus: '' },
      ]);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow(/staged/i);

      expect(GitEngineMock.checkoutBranch).not.toHaveBeenCalled();
    });

    it('rejects checkout when any file is modified (dirty tree)', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([
        { path: 'notes/readme.md', status: 'Modified', staged: false, conflicted: false, indexStatus: '', workdirStatus: 'Modified' },
      ]);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow(/modified|dirty/i);

      expect(GitEngineMock.checkoutBranch).not.toHaveBeenCalled();
    });

    it('rejects checkout when any file is untracked', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([
        { path: 'notes/new-file.md', status: 'Untracked', staged: false, conflicted: false, indexStatus: '', workdirStatus: 'Untracked' },
      ]);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow(/untracked|working tree/i);

      expect(GitEngineMock.checkoutBranch).not.toHaveBeenCalled();
    });

    it('rejects checkout when file is conflicted', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([
        { path: 'notes/conflicted.md', status: 'Conflicted', staged: false, conflicted: true, indexStatus: '', workdirStatus: '' },
      ]);

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow(/conflicted/i);

      expect(GitEngineMock.checkoutBranch).not.toHaveBeenCalled();
    });
  });

  describe('cycle gate acquisition', () => {
    it('acquires repo cycle gate BEFORE checking statuses', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      // acquireCycle should be called before statuses
      const acquireCallOrder = GitSyncGateMock.acquireCycle.mock.invocationCallOrder[0];
      const statusesCallOrder = GitEngineMock.statuses.mock.invocationCallOrder[0];
      expect(acquireCallOrder).toBeLessThan(statusesCallOrder);
    });

    it('releases cycle gate even when statuses check fails', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockRejectedValue(new Error('Status check failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow();

      expect(MOCK_RELEASE_CYCLE).toHaveBeenCalled();
    });

    it('releases cycle gate even when checkout fails', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow();

      expect(MOCK_RELEASE_CYCLE).toHaveBeenCalled();
    });
  });

  describe('gitOperationStore integration', () => {
    it('registers checkout operation in gitOperationStore', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      const beginSpy = jest.spyOn(gitOperationRegistry, 'begin');
      const succeedSpy = jest.spyOn(gitOperationRegistry, 'succeed');

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      expect(beginSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'checkout',
          repo: TEST_REPO_PATH,
          status: 'running',
        })
      );
      expect(succeedSpy).toHaveBeenCalled();
    });

    it('marks checkout as failed in gitOperationStore on error', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      const failSpy = jest.spyOn(gitOperationRegistry, 'fail');

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow();

      expect(failSpy).toHaveBeenCalledWith(
        expect.any(String),
        'Checkout failed'
      );
    });
  });

  describe('concurrent mutation blocking', () => {
    it('rejects mutation when checkout is running', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      // Start checkout
      const checkoutPromise = GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      // Wait for checkout to start
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(GitBranchCoordinator.getState()).toBe('checkout-running');

      // Try to start mutation - should be rejected
      await expect(GitBranchCoordinator.beginMutation('test-op')).rejects.toThrow(/checkout/i);

      await checkoutPromise;
    });

    it('allows mutation after checkout completes', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      // After checkout, mutation should be allowed
      await expect(GitBranchCoordinator.beginMutation('test-op')).resolves.not.toThrow();
    });
  });

  describe('checkout-during-mutation race', () => {
    it('rejects checkout when mutation is running', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      // Start a mutation
      await GitBranchCoordinator.beginMutation('test-op');
      expect(GitBranchCoordinator.getState()).toBe('mutation-running');

      // Try to checkout - should be rejected
      expect(() =>
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).toThrow(/mutation|running/i);

      GitBranchCoordinator.endMutation();
    });

    it('allows checkout after mutation completes', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.beginMutation('test-op');
      GitBranchCoordinator.endMutation();

      // After mutation ends, checkout should be allowed
      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).resolves.not.toThrow();
    });
  });

  describe('watchdog timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('recovers from leaked checkout state after watchdog timeout', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockImplementation(
        () => new Promise<void>(() => { /* intentionally unresolved */ })
      );

      const watchdogMs = 10 * 60 * 1_000; // 10 minutes

      // Start checkout but never complete
      void GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      // Advance time past watchdog
      await jest.advanceTimersByTimeAsync(watchdogMs + 1);

      expect(GitBranchCoordinator.getState()).toBe('failed');
      expect(GitSyncGateMock.forceReleaseCycle).toHaveBeenCalled();
    });

    it('clears watchdog on successful checkout', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockResolvedValue(undefined);

      await GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch');

      expect(GitBranchCoordinator.getState()).toBe('idle');
    });

    it('clears watchdog on failed checkout', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow();

      expect(GitBranchCoordinator.getState()).toBe('failed');
    });
  });

  describe('checkout failure atomicity', () => {
    it('leaves branch unchanged after checkout failure', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow('Checkout failed');

      // The state should be 'failed', not 'idle' (which would indicate successful checkout)
      expect(GitBranchCoordinator.getState()).toBe('failed');
    });

    it('leaves working tree unchanged after checkout failure', async () => {
      const { GitBranchCoordinator } = await import('@/services/git/GitBranchCoordinator');
      GitEngineMock.statuses.mockResolvedValue([]);
      GitEngineMock.checkoutBranch.mockRejectedValue(new Error('Checkout failed'));

      await expect(
        GitBranchCoordinator.checkout(TEST_REPO_ID, TEST_REPO_PATH, 'feature-branch')
      ).rejects.toThrow();

      // statuses should not have been affected beyond the initial check
      expect(GitEngineMock.statuses).toHaveBeenCalledTimes(1);
    });
  });
});
