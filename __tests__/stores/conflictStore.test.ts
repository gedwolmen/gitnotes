import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConflictStore } from '../../src/stores/conflictStore';
import type { ConflictSet } from '../../src/services/conflict/types';

jest.mock('@react-native-async-storage/async-storage');

function makeConflict(repoPath: string, branch: string, detectedAt: number): ConflictSet {
  return {
    repoPath,
    branch,
    localRef: `refs/heads/${branch}`,
    remoteRef: `refs/remotes/origin/${branch}`,
    mergeBaseRef: 'abc123',
    files: [],
    detectedAt,
  };
}

describe('useConflictStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ conflicts: [], isLoading: false, loadError: false });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('smoke test', () => {
    expect(true).toBe(true);
  });

  describe('addConflict', () => {
    it('adds a new conflict when none exist', async () => {
      const store = useConflictStore.getState();
      await store.loadConflicts();
      const conflict = makeConflict('me/repo', 'main', 1);
      await store.addConflict(conflict);
      expect(store.getConflict('me/repo', 'main')).toEqual(conflict);
    });

    it('replaces existing conflict for same repoPath+branch', async () => {
      const store = useConflictStore.getState();
      await store.loadConflicts();
      const conflict1 = makeConflict('me/repo', 'main', 1);
      const conflict2 = makeConflict('me/repo', 'main', 2);
      await store.addConflict(conflict1);
      await store.addConflict(conflict2);
      const found = store.getConflict('me/repo', 'main');
      expect(found?.detectedAt).toBe(2);
    });

    it('concurrent addConflict calls do not lose entries', async () => {
      const store = useConflictStore.getState();
      await store.loadConflicts();
      const conflicts: ConflictSet[] = [
        makeConflict('me/repo1', 'main', 1),
        makeConflict('me/repo2', 'main', 2),
        makeConflict('me/repo3', 'main', 3),
        makeConflict('me/repo4', 'main', 4),
        makeConflict('me/repo5', 'main', 5),
      ];
      await Promise.all(conflicts.map((c) => store.addConflict(c)));
      const state = useConflictStore.getState();
      expect(state.conflicts).toHaveLength(5);
      for (const conflict of conflicts) {
        expect(state.getConflict(conflict.repoPath, conflict.branch)).toEqual(conflict);
      }
    });

    it('concurrent addConflict calls with different branches do not lose entries', async () => {
      const store = useConflictStore.getState();
      await store.loadConflicts();
      const conflicts: ConflictSet[] = [
        makeConflict('me/repo', 'feature-a', 1),
        makeConflict('me/repo', 'feature-b', 2),
        makeConflict('me/repo', 'feature-c', 3),
        makeConflict('me/repo', 'feature-d', 4),
        makeConflict('me/repo', 'feature-e', 5),
      ];
      await Promise.all(conflicts.map((c) => store.addConflict(c)));
      const state = useConflictStore.getState();
      expect(state.conflicts).toHaveLength(5);
      for (const conflict of conflicts) {
        expect(state.getConflict(conflict.repoPath, conflict.branch)).toEqual(conflict);
      }
    });
  });

  describe('loadError behavior', () => {
    it('sets loadError: true when AsyncStorage.getItem throws', async () => {
      useConflictStore.setState({ isLoading: true, loadError: false });
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
      await useConflictStore.getState().loadConflicts();
      expect(useConflictStore.getState().loadError).toBe(true);
    });

    it('sets loadError: false and populates conflicts on success', async () => {
      const conflictData = [makeConflict('test/repo', 'main', 1)];
      useConflictStore.setState({ isLoading: true, loadError: false });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(conflictData));
      await useConflictStore.getState().loadConflicts();
      expect(useConflictStore.getState().loadError).toBe(false);
      expect(useConflictStore.getState().conflicts).toEqual(conflictData);
    });

    it('sets loadError: false when AsyncStorage returns null', async () => {
      useConflictStore.setState({ isLoading: true, loadError: false });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
      await useConflictStore.getState().loadConflicts();
      expect(useConflictStore.getState().loadError).toBe(false);
      expect(useConflictStore.getState().conflicts).toEqual([]);
    });
  });
});
