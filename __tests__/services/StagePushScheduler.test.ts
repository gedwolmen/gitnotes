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

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: {
    begin: jest.fn(),
    end: jest.fn(),
    setProgress: jest.fn(),
  },
}));

import { StagingService } from '../../src/services/git/StagingService';
import { StorageService } from '../../src/services/StorageService';
import { useStageStore } from '../../src/stores/stageStore';
import { githubActivity } from '../../src/stores/githubActivityStore';
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
  let loadStagedSpy: jest.SpiedFunction<() => Promise<void>>;
  let registerQueueSubscriptionSpy: jest.SpiedFunction<() => void>;

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
      pushProgress: null,
    });
    // No-op the store actions startScheduler() triggers so the real async
    // loadStaged cannot clobber fixture state mid-test.
    loadStagedSpy = jest
      .spyOn(useStageStore.getState(), 'loadStaged')
      .mockResolvedValue(undefined);
    registerQueueSubscriptionSpy = jest
      .spyOn(useStageStore.getState(), 'registerQueueSubscription')
      .mockImplementation(() => undefined);
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
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
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
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(1, REPO_A, 'main', expect.any(Function));
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(2, REPO_B, 'main', expect.any(Function));
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

    expect(StagingService.pushStaged).not.toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
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
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(1, REPO_A, 'main', expect.any(Function));
    expect(StagingService.pushStaged).toHaveBeenNthCalledWith(2, REPO_B, 'main', expect.any(Function));
    expect(useStageStore.getState().pushQueue).toHaveLength(0);
  });

  test('drainPushQueue resets globalPushing once the queue empties', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: true,
      pushQueue: ['a/repo::main'],
      pendingCount: 0,
    });

    const setGlobalPushingSpy = jest.spyOn(useStageStore.getState(), 'setGlobalPushing');

    await drainPushQueue();
    await flushAsync();

    expect(setGlobalPushingSpy).toHaveBeenCalledWith(false);
    expect(useStageStore.getState().globalPushing).toBe(false);
    expect(useStageStore.getState().pushQueue).toHaveLength(0);

    setGlobalPushingSpy.mockRestore();
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

  test('drainPushQueue wraps each pushStaged in a githubActivity.begin/end cycle', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: ['a/repo::main'],
      pendingCount: 0,
    });

    await drainPushQueue();
    await flushAsync();

    expect(githubActivity.begin).toHaveBeenCalledWith('Pushing changes');
    expect(githubActivity.end).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
  });

  test('failed push still ends the githubActivity cycle (end called in finally)', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: ['a/repo::main'],
      pendingCount: 0,
    });
    (StagingService.pushStaged as jest.Mock).mockImplementation(async () => ({
      success: false,
      error: 'boom',
    }));

    await drainPushQueue();
    await flushAsync();

    expect(githubActivity.begin).toHaveBeenCalledWith('Pushing changes');
    expect(githubActivity.end).toHaveBeenCalledTimes(1);
  });

  test('explicit drain after requestPush starts network immediately without idle timer', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    useStageStore.getState().pushAll();
    void drainPushQueue();

    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
  });

  test('explicit drain after requestPush(key) starts network immediately', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    useStageStore.getState().requestPush(REPO_A, 'main');
    void drainPushQueue();

    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
  });

  test('idle auto-push still works after idle timer elapses', async () => {
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
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
  });

  test('startScheduler() loads staged state once and registers the queue subscription', async () => {
    startScheduler();
    await flushAsync();

    expect(loadStagedSpy).toHaveBeenCalledTimes(1);
    expect(registerQueueSubscriptionSpy).toHaveBeenCalledTimes(1);
  });

  test('explicit pushAll + drainPushQueue starts draining immediately (no idle wait)', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    startScheduler();

    useStageStore.getState().pushAll();
    void drainPushQueue();
    await flushAsync();

    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
  });

  test('explicit requestPush + drainPushQueue drains single-group immediately', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    startScheduler();

    useStageStore.getState().requestPush(REPO_A, 'main');
    void drainPushQueue();
    await flushAsync();

    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);
    expect(StagingService.pushStaged).toHaveBeenCalledWith(REPO_A, 'main', expect.any(Function));
  });

  test('idle auto-push still works after explicit push (regression guard)', async () => {
    useStageStore.setState({
      staged: [item(REPO_A, 'main', 'notes/a.md')],
      pendingCount: 1,
    });

    startScheduler();

    useStageStore.getState().pushAll();
    void drainPushQueue();
    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(STAGE_PUSH_IDLE_MS);
    await flushAsync();
    expect(StagingService.pushStaged).toHaveBeenCalledTimes(2);
  });

  test('drainPushQueue resets pushProgress to null when the queue empties', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: ['a/repo::main'],
      pendingCount: 0,
      pushProgress: 0.5,
    });

    (StagingService.pushStaged as jest.Mock).mockImplementation(
      async (_repoPath: string, _branch: string, onProgress?: (f: number | null) => void) => {
        if (onProgress) onProgress(0.75);
        return { success: true };
      },
    );

    const setPushProgressSpy = jest.spyOn(useStageStore.getState(), 'setPushProgress');

    await drainPushQueue();
    await flushAsync();

    expect(setPushProgressSpy).toHaveBeenCalledWith(null);
    expect(useStageStore.getState().pushProgress).toBeNull();

    setPushProgressSpy.mockRestore();
  });

  test('drainPushQueue forwards pushProgress from pushStaged to stageStore', async () => {
    useStageStore.setState({
      staged: [],
      isPushing: {},
      globalPushing: false,
      pushQueue: ['a/repo::main'],
      pendingCount: 0,
    });

    (StagingService.pushStaged as jest.Mock).mockImplementation(
      async (_repoPath: string, _branch: string, onProgress?: (f: number | null) => void) => {
        if (onProgress) {
          onProgress(0.3);
          onProgress(0.6);
          onProgress(1);
        }
        return { success: true };
      },
    );

    await drainPushQueue();
    await flushAsync();

    expect(useStageStore.getState().pushProgress).toBeNull();
  });
});
