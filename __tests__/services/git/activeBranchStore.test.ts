/**
 * activeBranchStore.test.ts
 *
 * Tests for the repository-scoped active-branch state contract.
 *
 * These tests verify:
 * 1. Baseline API contracts (getActiveBranch, subscribe, initializeForRepo)
 * 2. State reconciliation against local HEAD
 * 3. Stale detection when HEAD differs from persisted
 * 4. Subscription notifications
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GitFsService } from '@/services/git/GitFsService';
import { StorageService } from '@/services/StorageService';
import {
  getActiveBranch,
  subscribe,
  initializeForRepo,
  reconcileAllRepos,
  removeForRepo,
  isStale,
  getAllActiveBranches,
  __resetForTests,
  type ActiveBranchState,
} from '@/services/git/activeBranchStore';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock GitFsService
jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    getCurrentBranch: jest.fn(),
    isCloned: jest.fn(),
  },
}));

// Mock StorageService (getSavedRepositories)
jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

const mockGetCurrentBranch = GitFsService.getCurrentBranch as jest.Mock;
const mockAsyncStorageGetItem = AsyncStorage.getItem as jest.Mock;
const mockAsyncStorageSetItem = AsyncStorage.setItem as jest.Mock;
const mockAsyncStorageRemoveItem = AsyncStorage.removeItem as jest.Mock;

describe('activeBranchStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetForTests();
  });

  describe('getActiveBranch', () => {
    it('returns null for unknown repoId when no storage exists', async () => {
      mockAsyncStorageGetItem.mockResolvedValue(null);
      mockGetCurrentBranch.mockResolvedValue(null);

      const result = await getActiveBranch('unknown-repo-id');

      expect(result).toBeNull();
    });

    it('returns persisted state when it exists', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const result = await getActiveBranch('repo-1');

      expect(result).toEqual(persistedState);
    });

    it('reconciles against HEAD and marks stale when differs', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'persisted',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('feature-branch');

      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        repoId: 'repo-1',
        activeBranch: 'feature-branch',
        source: 'head',
        status: 'stale',
      });
    });

    it('marks stale when HEAD is null (detached or not cloned)', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue(null);

      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        status: 'stale',
        source: 'persisted',
      });
    });

    it('returns idle with source=head when HEAD matches persisted', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'persisted',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      });
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const unsubscribe = subscribe('repo-1', jest.fn());
      expect(typeof unsubscribe).toBe('function');
    });

    it('calls callback when state changes', async () => {
      const callback = jest.fn();
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const unsubscribe = subscribe('repo-1', callback);
      
      // Trigger a state change by calling getActiveBranch
      await getActiveBranch('repo-1');

      // Callback should have been called with initial state
      expect(callback).toHaveBeenCalled();
      
      unsubscribe();
    });

    it('does not call callback after unsubscribe', async () => {
      const callback = jest.fn();
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const unsubscribe = subscribe('repo-1', callback);
      unsubscribe();
      
      await getActiveBranch('repo-1');

      // Callback should NOT have been called since we unsubscribed
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('initializeForRepo', () => {
    it('uses local HEAD when repo is cloned', async () => {
      mockGetCurrentBranch.mockResolvedValue('feature-branch');
      mockAsyncStorageSetItem.mockResolvedValue(undefined);

      const repo = { id: 'repo-1', path: 'owner/repo', name: 'repo', branch: 'main' };
      const result = await initializeForRepo(repo);

      expect(result).toMatchObject({
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'feature-branch',
        source: 'head',
        status: 'idle',
      });
      expect(mockAsyncStorageSetItem).toHaveBeenCalled();
    });

    it('falls back to remote default when not cloned', async () => {
      mockGetCurrentBranch.mockResolvedValue(null);
      mockAsyncStorageSetItem.mockResolvedValue(undefined);

      const repo = { id: 'repo-1', path: 'owner/repo', name: 'repo', branch: 'develop' };
      const result = await initializeForRepo(repo);

      expect(result).toMatchObject({
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'develop',
        source: 'default',
        status: 'idle',
      });
    });

    it('uses main as fallback when no local HEAD and no remote default', async () => {
      mockGetCurrentBranch.mockResolvedValue(null);
      mockAsyncStorageSetItem.mockResolvedValue(undefined);

      const repo = { id: 'repo-1', path: 'owner/repo', name: 'repo' };
      const result = await initializeForRepo(repo);

      expect(result).toMatchObject({
        repoId: 'repo-1',
        activeBranch: 'main',
        source: 'default',
        status: 'idle',
      });
    });
  });

  describe('reconcileAllRepos', () => {
    it('initializes repos that have no existing state', async () => {
      mockGetCurrentBranch.mockResolvedValue('main');
      mockAsyncStorageGetItem.mockResolvedValue(null);
      mockAsyncStorageSetItem.mockResolvedValue(undefined);

      const repos = [
        { id: 'repo-1', path: 'owner/repo1', name: 'repo1', branch: 'main' },
        { id: 'repo-2', path: 'owner/repo2', name: 'repo2', branch: 'develop' },
      ];

      await reconcileAllRepos(repos);

      // Should have called setItem for each new repo
      expect(mockAsyncStorageSetItem).toHaveBeenCalled();
    });
  });

  describe('removeForRepo', () => {
    it('removes state from storage', async () => {
      mockAsyncStorageRemoveItem.mockResolvedValue(undefined);

      await removeForRepo('repo-1');

      expect(mockAsyncStorageRemoveItem).toHaveBeenCalledWith(
        '@GitNotes:activeBranches:repo-1',
      );
    });
  });

  describe('isStale', () => {
    it('returns true when status is stale', async () => {
      const staleState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'feature-branch',
        source: 'head',
        status: 'stale',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(staleState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const result = await isStale('repo-1');

      expect(result).toBe(true);
    });

    it('returns false when status is idle', async () => {
      const idleState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(idleState));
      mockGetCurrentBranch.mockResolvedValue('main');

      const result = await isStale('repo-1');

      expect(result).toBe(false);
    });
  });

  describe('getAllActiveBranches', () => {
    it('returns empty array when no state exists', async () => {
      mockAsyncStorageGetItem.mockResolvedValue(null);
      mockGetCurrentBranch.mockResolvedValue(null);

      const result = await getAllActiveBranches();

      expect(result).toEqual([]);
    });
  });

  describe('existing-branch preservation', () => {
    it('preserves existing branch state on re-initialization when HEAD matches', async () => {
      const existingState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'feature-branch',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(existingState));
      mockGetCurrentBranch.mockResolvedValue('feature-branch');

      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        activeBranch: 'feature-branch',
        source: 'head',
        status: 'idle',
      });
    });

    it('does not overwrite existing state when reconcile returns same values', async () => {
      const existingState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(existingState));
      mockGetCurrentBranch.mockResolvedValue('main');

      await getActiveBranch('repo-1');

      expect(mockAsyncStorageSetItem.mock.calls.length).toBe(0);
    });

    it('handles multiple repos with different active branches independently', async () => {
      const state1: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo1',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      const state2: ActiveBranchState = {
        repoId: 'repo-2',
        repoPath: 'owner/repo2',
        activeBranch: 'develop',
        source: 'head',
        status: 'idle',
      };

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(state1));
      mockGetCurrentBranch.mockResolvedValueOnce('main');

      const result1 = await getActiveBranch('repo-1');
      expect(result1?.activeBranch).toBe('main');

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(state2));
      mockGetCurrentBranch.mockResolvedValueOnce('develop');

      const result2 = await getActiveBranch('repo-2');
      expect(result2?.activeBranch).toBe('develop');
    });
  });

  describe('memory cache consistency', () => {
    it('returns cached state without re-reading from storage on second call', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('main');

      await getActiveBranch('repo-1');
      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      });
      expect(mockAsyncStorageGetItem).toHaveBeenCalledTimes(1);
    });

    it('updates cache when reconciliation detects stale state', async () => {
      const persistedState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'old-branch',
        source: 'persisted',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(persistedState));
      mockGetCurrentBranch.mockResolvedValue('new-branch');

      const result = await getActiveBranch('repo-1');

      expect(result).toMatchObject({
        activeBranch: 'new-branch',
        source: 'head',
        status: 'stale',
      });
    });
  });

  describe('add/remove initialization', () => {
    it('initializes for a new repo without existing state', async () => {
      mockAsyncStorageGetItem.mockResolvedValue(null);
      mockGetCurrentBranch.mockResolvedValue('main');
      mockAsyncStorageSetItem.mockResolvedValue(undefined);

      const repos = [
        { id: 'new-repo', path: 'owner/newrepo', name: 'newrepo', branch: 'main' },
      ];

      await reconcileAllRepos(repos);

      expect(mockAsyncStorageSetItem).toHaveBeenCalled();
      const savedState = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedState.repoId).toBe('new-repo');
      expect(savedState.activeBranch).toBe('main');
    });

    it('clears memory cache on removeForRepo', async () => {
      const existingState: ActiveBranchState = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        activeBranch: 'main',
        source: 'head',
        status: 'idle',
      };
      mockAsyncStorageGetItem.mockResolvedValue(JSON.stringify(existingState));
      mockGetCurrentBranch.mockResolvedValue('main');
      mockAsyncStorageRemoveItem.mockResolvedValue(undefined);

      await getActiveBranch('repo-1');

      await removeForRepo('repo-1');

      mockAsyncStorageGetItem.mockResolvedValue(null);
      mockGetCurrentBranch.mockResolvedValue(null);

      const result = await getActiveBranch('repo-1');
      expect(result).toBeNull();
    });
  });
});
