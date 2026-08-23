import { writeThroughPush, SYNC_SAVE_WAIT_MS } from '../../../src/services/git/StagingService';

const mockReleaseCycle = jest.fn();
const mockBegin = jest.fn();
const mockEnd = jest.fn();
const mockDrain = jest.fn();
const mockGetAll = jest.fn();
const mockOnDropped = jest.fn();
const mockEmitDropped = jest.fn();
const mockPullFromSingleRepo = jest.fn();
const mockRefreshStores = jest.fn();

jest.mock('../../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    drain: (...args: unknown[]) => mockDrain(...args),
    getAll: () => mockGetAll(),
    onDroppedMutation: (cb: (event: { mutation: { id: string } }) => void) => {
      mockOnDropped(cb);
      return mockEmitDropped;
    },
    emitDroppedMutation: (event: unknown) => mockEmitDropped(event),
  },
}));

jest.mock('../../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(async () => mockReleaseCycle),
  },
}));

jest.mock('../../../src/stores/githubActivityStore', () => ({
  githubActivity: {
    begin: (...args: unknown[]) => mockBegin(...args),
    end: (...args: unknown[]) => mockEnd(...args),
  },
}));

jest.mock('../../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: (...args: unknown[]) => mockPullFromSingleRepo(...args),
}));

describe('writeThroughPush unsubDrop race (C4 bug-hunt 2026-08)', () => {
  let droppedCallback: ((event: { mutation: { id: string } }) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    droppedCallback = null;
    mockOnDropped.mockImplementation((cb) => {
      droppedCallback = cb;
    });
    mockEmitDropped.mockReset();
    mockGetAll.mockResolvedValue([]);
    mockPullFromSingleRepo.mockResolvedValue({ repos: 1, notes: 0, canvases: 0, todos: 0, templates: 0 });
    mockRefreshStores.mockResolvedValue(undefined);
    mockBegin.mockReturnValue(undefined);
    mockEnd.mockReturnValue(undefined);
  });

  it('keeps drop listener active after timeout so late drops are still detected', async () => {
    jest.useFakeTimers();
    let resolveDrain: (value: unknown) => void = () => undefined;
    mockDrain.mockImplementation(
      () => new Promise((resolve) => {
        resolveDrain = resolve;
      }),
    );

    const promise = writeThroughPush('/repo', 'mutation-123');

    // Let the timeout fire (45s race timeout)
    await jest.advanceTimersByTimeAsync(SYNC_SAVE_WAIT_MS);

    // After timeout, the function should have returned pendingSync:true
    const result = await promise;
    expect(result).toEqual({ success: true, pendingSync: true });

    // SECURITY: at this point, the drop listener should STILL be active.
    // The chain continues detached — if the mutation is dropped now,
    // the chain must detect it (otherwise the user is told "will sync"
    // when the mutation was permanently dropped).
    expect(mockEmitDropped).not.toHaveBeenCalled();

    // Emit a drop event AFTER the timeout (simulating a late drop while
    // the chain is still running detached).
    expect(droppedCallback).not.toBeNull();
    droppedCallback!({ mutation: { id: 'mutation-123' } });

    // Now let the chain complete (drain resolves)
    resolveDrain({ succeeded: 0, failed: 0, remaining: 0 });
    // Let pending microtasks settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The chain should have detected the drop and returned droppedConflict
    // (which skips pullFromSingleRepo). If pullFromSingleRepo was called,
    // it means the drop was missed.
    expect(mockPullFromSingleRepo).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
