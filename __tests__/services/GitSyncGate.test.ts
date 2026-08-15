jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
  deleteNoteFromGitHub: jest.fn(),
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { updateNote: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok') },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: { push: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { syncNoteToGitHub } from '../../src/services/NoteGitHubSyncService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { resolveBranch } from '../../src/services/git/resolveBranch';
import { GitSyncGate } from '../../src/services/git/GitSyncGate';
import { useGitOperationStore, GIT_OP_ALL_REPOS } from '../../src/stores/gitOperationStore';

const CYCLE_WATCHDOG_MS = 10 * 60 * 1_000;
const MARKER_MAX_AGE_MS = 10 * 60 * 1_000;

const resolveBranchMock = resolveBranch as jest.MockedFunction<typeof resolveBranch>;

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const activeOps = () =>
  Object.values(useGitOperationStore.getState().ops).filter((op) => op.status === 'running');

const opsByKind = (kind: string) =>
  Object.values(useGitOperationStore.getState().ops).filter((op) => op.kind === kind);

describe('GitSyncGate', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    GitSyncGate.__resetForTest();
    useGitOperationStore.setState({ ops: {} });
    await AsyncStorage.clear();
    resolveBranchMock.mockImplementation(async (_repo, hint) => hint ?? 'main');
    (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true });
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
  });

  afterEach(() => {
    GitSyncGate.__resetForTest();
    jest.useRealTimers();
  });

  test('two concurrent cycle acquires serialize — second body runs only after first release (case 1)', async () => {
    const events: string[] = [];

    const releaseA = await GitSyncGate.acquireCycle();
    events.push('a-body');

    const bPending = GitSyncGate.acquireCycle().then((release) => {
      events.push('b-body');
      return release;
    });
    const cPending = GitSyncGate.acquireCycle().then((release) => {
      events.push('c-body');
      return release;
    });
    await Promise.resolve();
    expect(events).toEqual(['a-body']);
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    releaseA();
    const releaseB = await bPending;
    expect(events).toEqual(['a-body', 'b-body']);
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    releaseB();
    const releaseC = await cPending;
    expect(events).toEqual(['a-body', 'b-body', 'c-body']);

    releaseC();
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('drain-then-pull inside ONE acquisition never self-deadlocks (case 2)', async () => {
    await NoteSyncQueueService.enqueueNoteUpsert({
      repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
    });

    const releaseCycle = await GitSyncGate.acquireCycle();
    const order: string[] = [];
    try {
      // Regression: with the cycle already held, drain() must skip its own
      // acquisition and run the body directly — awaiting acquireCycle here
      // would wait on itself forever.
      const result = await NoteSyncQueueService.drain();
      order.push('drain');
      expect(result).toMatchObject({ succeeded: 1, failed: 0, remaining: 0 });
      expect(GitSyncGate.isCycleHeld()).toBe(true);

      // The pull step of the same cycle proceeds with no gate wait.
      order.push('pull');
    } finally {
      releaseCycle();
    }
    expect(order).toEqual(['drain', 'pull']);
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('push marker makes the pull wait per-repo; repo S is unaffected (case 3)', async () => {
    GitSyncGate.markPushActive('owner/R', 'main');
    expect(GitSyncGate.isPushActive('owner/R')).toBe(true);
    expect(GitSyncGate.isPushActive('owner/S')).toBe(false);
    expect(GitSyncGate.isPushActive()).toBe(true);

    // Repo S pull reads immediately — markers never serialize across repos.
    await expect(GitSyncGate.waitForIdle('owner/S')).resolves.toBe(true);

    // Repo R pull waits on 250ms polls until the marker clears.
    let readR = false;
    const pullR = GitSyncGate.waitForIdle('owner/R').then((idle) => {
      if (idle) readR = true;
      return idle;
    });

    await jest.advanceTimersByTimeAsync(1_000);
    expect(readR).toBe(false);

    GitSyncGate.clearPushActive('owner/R', 'main');
    await jest.advanceTimersByTimeAsync(300);
    await expect(pullR).resolves.toBe(true);
    expect(readR).toBe(true);
    expect(GitSyncGate.isPushActive()).toBe(false);
  });

  test('watchdog force-releases a leaked cycle after 10 minutes (case 4)', async () => {
    const events: string[] = [];
    const leakedRelease = await GitSyncGate.acquireCycle();
    const waiterPending = GitSyncGate.acquireCycle().then((release) => {
      events.push('waiter-acquired');
      return release;
    });

    await jest.advanceTimersByTimeAsync(CYCLE_WATCHDOG_MS - 1_000);
    expect(GitSyncGate.isCycleHeld()).toBe(true);
    expect(events).toEqual([]);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(events).toEqual(['waiter-acquired']);
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    const waiterRelease = await waiterPending;
    // The leaked holder's late release is a no-op — the waiter owns the cycle.
    leakedRelease();
    expect(GitSyncGate.isCycleHeld()).toBe(true);
    waiterRelease();
    expect(GitSyncGate.isCycleHeld()).toBe(false);

    const failedPulls = opsByKind('pull').filter((op) => op.status === 'failed');
    expect(failedPulls).toHaveLength(1);
    expect(failedPulls[0].repo).toBe(GIT_OP_ALL_REPOS);
    expect(failedPulls[0].error).toMatch(/watchdog/i);
    expect(activeOps()).toHaveLength(0);

    // The gate is usable again immediately after expiry.
    const freshRelease = await GitSyncGate.acquireCycle();
    freshRelease();
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('reentrant drain during a held cycle returns early, not queued behind it (case 5)', async () => {
    let resolveSync: (value: { success: boolean }) => void = () => {};
    (syncNoteToGitHub as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolveSync = res; }),
    );

    await NoteSyncQueueService.enqueueNoteUpsert({
      repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
    });

    const firstDrain = NoteSyncQueueService.drain();
    // drain()'s synchronous prelude wins the reentrancy guard and acquires.
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    // The reentrant call resolves with the existing early contract while the
    // cycle is still held — proof it did not queue behind acquireCycle.
    const second = await NoteSyncQueueService.drain();
    expect(second).toEqual({ succeeded: 0, failed: 0, remaining: 1 });
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    // Let the first drain run down to its awaiting syncNoteToGitHub call
    // (its now-longer gated path takes more hops than the early-return above).
    await flushMicrotasks();
    resolveSync({ success: true });
    const first = await firstDrain;
    expect(first.succeeded).toBe(1);
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('registry op visible while marker held; removed on clear (case 6)', () => {
    GitSyncGate.markPushActive('owner/repo', 'dev');
    const pushOps = opsByKind('push');
    expect(pushOps).toHaveLength(1);
    expect(pushOps[0]).toMatchObject({
      kind: 'push',
      repo: 'owner/repo',
      branch: 'dev',
      entityIds: [],
      status: 'running',
    });

    GitSyncGate.clearPushActive('owner/repo', 'dev');
    expect(opsByKind('push')).toHaveLength(0);
  });

  test('cycle hold publishes an app-wide pull op; release removes it', async () => {
    const release = await GitSyncGate.acquireCycle();
    const pullOps = opsByKind('pull');
    expect(pullOps).toHaveLength(1);
    expect(pullOps[0]).toMatchObject({
      kind: 'pull',
      repo: GIT_OP_ALL_REPOS,
      entityIds: [],
      status: 'running',
    });

    release();
    expect(activeOps()).toHaveLength(0);
  });

  test('branchless markers normalize to main and double-mark refreshes without duplicating', () => {
    GitSyncGate.markPushActive('owner/repo');
    GitSyncGate.markPushActive('owner/repo', undefined);
    expect(opsByKind('push')).toHaveLength(1);
    expect(opsByKind('push')[0].branch).toBe('main');
    expect(GitSyncGate.isPushActive('owner/repo')).toBe(true);

    GitSyncGate.clearPushActive('owner/repo');
    expect(GitSyncGate.isPushActive()).toBe(false);
    expect(opsByKind('push')).toHaveLength(0);
  });

  test('waitForIdle resolves false when the marker outlives the timeout', async () => {
    GitSyncGate.markPushActive('owner/R', 'main');

    const wait = GitSyncGate.waitForIdle('owner/R', 1_000);
    await jest.advanceTimersByTimeAsync(1_300);

    await expect(wait).resolves.toBe(false);
    expect(GitSyncGate.isPushActive('owner/R')).toBe(true);
  });

  test('stuck markers older than 10 minutes are swept on the next markPushActive', () => {
    GitSyncGate.markPushActive('owner/stuck', 'main');

    jest.setSystemTime(Date.now() + MARKER_MAX_AGE_MS + 1_000);
    GitSyncGate.markPushActive('owner/fresh', 'main');

    expect(GitSyncGate.isPushActive('owner/stuck')).toBe(false);
    expect(GitSyncGate.isPushActive('owner/fresh')).toBe(true);
    const failed = Object.values(useGitOperationStore.getState().ops).filter(
      (op) => op.status === 'failed',
    );
    expect(failed).toHaveLength(1);
    expect(failed[0].repo).toBe('owner/stuck');
  });

  test('a throwing drain body releases the cycle and clears push markers in finally', async () => {
    (SyncEngineService.getMode as jest.Mock).mockRejectedValueOnce(new Error('mode lookup exploded'));
    await NoteSyncQueueService.enqueueNoteUpsert({
      repo: 'r', branch: 'main', filePath: 'a', title: 'A', content: '', format: 'markdown',
    });

    await expect(NoteSyncQueueService.drain()).rejects.toThrow('mode lookup exploded');

    expect(GitSyncGate.isCycleHeld()).toBe(false);
    expect(GitSyncGate.isPushActive()).toBe(false);
    expect(activeOps()).toHaveLength(0);
  });
});
