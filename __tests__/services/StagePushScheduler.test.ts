import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { StagedItem } from '../../src/services/git/StagingService';

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: {
    listStaged: jest.fn(async () => []),
    pushStaged: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(async () => jest.fn()),
    isCycleHeld: jest.fn(() => false),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    subscribe: jest.fn(() => jest.fn()),
    getAll: jest.fn(async () => []),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

import { StagingService } from '../../src/services/git/StagingService';
import { StorageService } from '../../src/services/StorageService';
import { useStageStore } from '../../src/stores/stageStore';
import {
  STAGE_PUSH_IDLE_MS,
  drainPushQueue,
  flushStaged,
  onStagedChanged,
  setOnPushFailure,
  startScheduler,
  stopScheduler,
} from '../../src/services/StagePushScheduler';
import { flushStagedSetsForBackgroundTask } from '../../src/services/BackgroundSyncService';

const REPO_A = 'a/repo';
const REPO_B = 'b/repo';

const item = (repoPath: string, branch: string, filePath: string): StagedItem => ({
  repoPath,
  branch,
  filePath,
  kind: 'upsert',
  mode: 'api',
});

const flushAsync = async (rounds = 20): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
};

describe('StagePushScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    stopScheduler();
    setOnPushFailure(null);
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: [],
      pendingCount: 0,
    });
    (StorageService.getSavedRepositories as jest.Mock).mockImplementation(async () => [
      { path: REPO_A },
      { path: REPO_B },
    ]);
  });

  afterEach(() => {
    stopScheduler();
    jest.useRealTimers();
  });

  test('idle timer fires after STAGE_PUSH_IDLE_MS of no changes and flushes staged', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    startScheduler();

    jest.advanceTimersByTime(STAGE_PUSH_IDLE_MS - 1);
    await flushAsync();
    expect(StagingService.pushStaged).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main');
  });

  test('timer resets on a new staged item (onStagedChanged restarts the window)', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    startScheduler();

    jest.advanceTimersByTime(2 * 60 * 1000);
    onStagedChanged();

    jest.advanceTimersByTime(STAGE_PUSH_IDLE_MS - 1);
    await flushAsync();
    expect(StagingService.pushStaged).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
  });

  test('FIFO serialization: two queued keys push one at a time', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md'), item(REPO_B, 'main', 'notes/b.md')],
      pendingCount: 2,
    });

    const pushOrder: string[] = [];
    let activePushes = 0;
    (StagingService.pushStaged as jest.Mock).mockImplementation(async (repoPath: string) => {
      activePushes += 1;
      expect(activePushes).toBe(1);
      pushOrder.push(repoPath);
      await Promise.resolve();
      activePushes -= 1;
      return { success: true };
    });

    flushStaged();
    await flushAsync();

    expect(pushOrder).toEqual([REPO_A, REPO_B]);
    expect(activePushes).toBe(0);
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(1, REPO_A, 'main');
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(2, REPO_B, 'main');
    const state = useStageStore.getState();
    expect(state.pushQueue).toHaveLength(0);
    expect(Object.values(state.isPushing).every((p) => !p)).toBe(true);
  });

  test('background flush honors the ≤10-files-per-repo cap', async () => {
    const big: StagedItem[] = [];
    for (let i = 0; i < 12; i += 1) {
      big.push(item(REPO_A, 'main', `notes/${i}.md`));
    }
    big.push(item(REPO_B, 'main', 'notes/small.md'));
    (StagingService.listStaged as jest.Mock).mockImplementation(async () => big);

    await flushStagedSetsForBackgroundTask();

    expect(StagingService.pushStaged).not.toHaveBeenCalledWith(REPO_A, 'main');
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_B, 'main');
  });

  test('restart with an in-flight push does not deadlock (isPushing reset, queue survives)', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: ['a/repo::main', 'b/repo::main'],
      pendingCount: 0,
    });

    await drainPushQueue();
    await flushAsync();

    expect(StagingService.pushStaged).toHaveBeenCalledTimes(2);
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(1, REPO_A, 'main');
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(2, REPO_B, 'main');
    expect(useStageStore.getState().pushQueue).toHaveLength(0);
  });

  test('failed push invokes the registered push-failure callback with {key, error}', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });
    (StagingService.pushStaged as jest.Mock).mockImplementation(async () => ({
      success: false,
      error: 'boom',
    }));

    const failures: Array<{ key: string; error: string }> = [];
    setOnPushFailure((failure) => {
      failures.push(failure);
    });

    startScheduler();
    jest.advanceTimersByTime(STAGE_PUSH_IDLE_MS);
    await flushAsync();

    expect(failures).toEqual([{ key: 'a/repo::main', error: 'boom' }]);
    expect(useStageStore.getState().isPushing['a/repo::main']).toBe(false);
    expect(useStageStore.getState().pushQueue).toHaveLength(0);
  });
});
