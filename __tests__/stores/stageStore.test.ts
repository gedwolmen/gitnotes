jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: {
    listStaged: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    subscribe: jest.fn(() => () => {}),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

import { StagingService } from '../../src/services/git/StagingService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { StorageService } from '../../src/services/StorageService';
import { useStageStore, groupStaged } from '../../src/stores/stageStore';
import type { StagedItem } from '../../src/services/git/StagingService';

const REPO_A = 'a/repo';
const REPO_B = 'b/repo';

const item = (repoPath: string, branch: string, filePath: string): StagedItem => ({
  repoPath,
  branch,
  filePath,
  kind: 'upsert',
  mode: 'api',
});

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('stageStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('loadStaged groups staged items by repo+branch via helper', async () => {
    (StagingService.listStaged as jest.Mock).mockImplementation(async () => [
      item(REPO_A, 'main', 'notes/a.md'),
      item(REPO_A, 'main', 'notes/b.md'),
      item(REPO_B, 'develop', 'notes/c.md'),
    ]);

    await useStageStore.getState().loadStaged();

    const groups = groupStaged(useStageStore.getState().staged);
    expect(groups).toHaveLength(2);
    const mainGroup = groups.find((g) => g.key === 'a/repo::main');
    expect(mainGroup?.items).toHaveLength(2);
    expect(mainGroup?.repoPath).toBe(REPO_A);
    expect(mainGroup?.branch).toBe('main');
    const developGroup = groups.find((g) => g.key === 'b/repo::develop');
    expect(developGroup?.items).toHaveLength(1);
  });

  it('requestPush refuses to enqueue while the key is pushing, then enqueues after setPushing(false)', () => {
    const store = useStageStore.getState();
    const key = store.keyFor(REPO_A, 'main');

    store.setPushing(key, true);
    expect(store.requestPush(REPO_A, 'main')).toBeNull();
    expect(useStageStore.getState().pushQueue).toHaveLength(0);

    store.setPushing(key, false);
    expect(useStageStore.getState().requestPush(REPO_A, 'main')).toBe(key);
    expect(useStageStore.getState().pushQueue).toEqual([key]);

    // Already queued: no double-enqueue.
    expect(useStageStore.getState().requestPush(REPO_A, 'main')).toBeNull();
    expect(useStageStore.getState().pushQueue).toEqual([key]);
  });

  it('pushAll sets globalPushing and enqueues every staged key exactly once', async () => {
    (StagingService.listStaged as jest.Mock).mockImplementation(async () => [
      item(REPO_A, 'main', 'notes/a.md'),
      item(REPO_A, 'main', 'notes/b.md'),
      item(REPO_B, 'main', 'notes/c.md'),
    ]);
    await useStageStore.getState().loadStaged();

    useStageStore.getState().pushAll();

    const state = useStageStore.getState();
    expect(state.globalPushing).toBe(true);
    expect(state.pushQueue).toEqual(['a/repo::main', 'b/repo::main']);
  });

  it('setGlobalPushing toggles the globalPushing flag (reset after drain)', () => {
    useStageStore.getState().pushAll();
    expect(useStageStore.getState().globalPushing).toBe(true);

    useStageStore.getState().setGlobalPushing(false);
    expect(useStageStore.getState().globalPushing).toBe(false);

    useStageStore.getState().setGlobalPushing(true);
    expect(useStageStore.getState().globalPushing).toBe(true);
  });

  it('requestPush(key) during globalPushing still enqueues behind', () => {
    useStageStore.setState({ globalPushing: true, pushQueue: ['x/repo::main'] });

    expect(useStageStore.getState().requestPush(REPO_A, 'main')).toBe('a/repo::main');

    const state = useStageStore.getState();
    expect(state.globalPushing).toBe(true);
    expect(state.pushQueue).toEqual(['x/repo::main', 'a/repo::main']);
  });

  it('pendingCount reflects the staged list after loadStaged', async () => {
    (StagingService.listStaged as jest.Mock).mockImplementation(async () => [
      item(REPO_A, 'main', 'notes/a.md'),
      item(REPO_B, 'main', 'notes/b.md'),
    ]);

    await useStageStore.getState().loadStaged();

    expect(useStageStore.getState().staged).toHaveLength(2);
    expect(useStageStore.getState().pendingCount).toBe(2);
  });

  it('registerQueueSubscription reloads staged on queue notify (hydration path)', async () => {
    let churn: (() => void) | undefined;
    (NoteSyncQueueService.subscribe as jest.Mock).mockImplementation((cb: () => void) => {
      churn = cb;
      return () => {};
    });

    useStageStore.getState().registerQueueSubscription();
    expect(NoteSyncQueueService.subscribe).toHaveBeenCalledTimes(1);
    expect(churn).toBeDefined();

    (StagingService.listStaged as jest.Mock).mockImplementation(async () => [
      item(REPO_A, 'main', 'notes/a.md'),
    ]);
    expect(useStageStore.getState().staged).toHaveLength(0);

    churn!();
    await flushAsync();

    expect(StagingService.listStaged).toHaveBeenCalled();
    expect(useStageStore.getState().staged).toHaveLength(1);
  });

  it('filters staged items whose repo was removed from saved repositories', async () => {
    (StorageService.getSavedRepositories as jest.Mock).mockImplementation(async () => [
      { path: REPO_A },
    ]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (StagingService.listStaged as jest.Mock).mockImplementation(async () => [
      item(REPO_A, 'main', 'notes/kept.md'),
      item('gone/repo', 'main', 'notes/orphan.md'),
    ]);

    await useStageStore.getState().loadStaged();

    const state = useStageStore.getState();
    expect(state.staged.map((s) => s.repoPath)).toEqual([REPO_A]);
    expect(state.pendingCount).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
