jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { drain: jest.fn() },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(),
  pullFromSingleRepo: jest.fn(),
}));

const mockRefreshNotes = jest.fn<() => Promise<void>>();
const mockRefreshCanvases = jest.fn<() => Promise<void>>();
const mockRefreshTodos = jest.fn<() => Promise<void>>();

jest.mock('../../src/stores/noteStore', () => ({
  useNoteStore: { getState: () => ({ refreshNotes: mockRefreshNotes }) },
}));

jest.mock('../../src/stores/canvasStore', () => ({
  useCanvasStore: { getState: () => ({ refreshCanvases: mockRefreshCanvases }) },
}));

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: { getState: () => ({ refreshTodos: mockRefreshTodos }) },
}));

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { pullAllFromRepos, pullFromSingleRepo } from '../../src/services/RepoPullService';
import type { PullResult } from '../../src/services/RepoPullService';
import { GitSyncGate } from '../../src/services/git/GitSyncGate';
import { isSyncNowRunning, syncNow } from '../../src/services/git/manualSync';

const drainMock = jest.mocked(NoteSyncQueueService.drain);
const pullAllMock = jest.mocked(pullAllFromRepos);
const pullSingleMock = jest.mocked(pullFromSingleRepo);

const pullResult: PullResult = { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
const SYNC_TIMEOUT_MS = 60_000;

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('manualSync.syncNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    GitSyncGate.__resetForTest();
    drainMock.mockResolvedValue({ succeeded: 0, failed: 0, remaining: 0 });
    pullAllMock.mockResolvedValue(pullResult);
    pullSingleMock.mockResolvedValue(pullResult);
    mockRefreshNotes.mockResolvedValue(undefined);
    mockRefreshCanvases.mockResolvedValue(undefined);
    mockRefreshTodos.mockResolvedValue(undefined);
  });

  afterEach(() => {
    GitSyncGate.__resetForTest();
    jest.useRealTimers();
  });

  test('runs drain → pull → store refresh inside one held gate cycle (case 1)', async () => {
    const events: string[] = [];
    drainMock.mockImplementation(async () => {
      events.push(`drain:held=${GitSyncGate.isCycleHeld()}`);
      return { succeeded: 1, failed: 0, remaining: 0 };
    });
    pullAllMock.mockImplementation(async () => {
      events.push(`pull:held=${GitSyncGate.isCycleHeld()}`);
      return pullResult;
    });
    mockRefreshNotes.mockImplementation(async () => {
      events.push(`refreshNotes:held=${GitSyncGate.isCycleHeld()}`);
    });
    mockRefreshCanvases.mockImplementation(async () => {
      events.push(`refreshCanvases:held=${GitSyncGate.isCycleHeld()}`);
    });
    mockRefreshTodos.mockImplementation(async () => {
      events.push(`refreshTodos:held=${GitSyncGate.isCycleHeld()}`);
    });

    expect(GitSyncGate.isCycleHeld()).toBe(false);
    const acquireSpy = jest.spyOn(GitSyncGate, 'acquireCycle');

    const result = await syncNow();

    expect(result).toEqual({ ok: true });
    expect(events).toEqual([
      'drain:held=true',
      'pull:held=true',
      'refreshNotes:held=true',
      'refreshCanvases:held=true',
      'refreshTodos:held=true',
    ]);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
    acquireSpy.mockRestore();
    expect(GitSyncGate.isCycleHeld()).toBe(false);
    expect(isSyncNowRunning()).toBe(false);
  });

  test('concurrent second call returns already-running without touching services (case 2)', async () => {
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullAllMock.mockImplementation(
      () =>
        new Promise<PullResult>((resolve) => {
          resolvePull = resolve;
        }),
    );

    const first = syncNow();
    await flushMicrotasks();
    expect(isSyncNowRunning()).toBe(true);
    expect(drainMock).toHaveBeenCalledTimes(1);
    expect(pullAllMock).toHaveBeenCalledTimes(1);

    const second = await syncNow();
    expect(second).toEqual({ ok: false, error: 'already-running' });
    expect(drainMock).toHaveBeenCalledTimes(1);
    expect(pullAllMock).toHaveBeenCalledTimes(1);
    expect(mockRefreshNotes).not.toHaveBeenCalled();
    expect(mockRefreshCanvases).not.toHaveBeenCalled();
    expect(mockRefreshTodos).not.toHaveBeenCalled();

    resolvePull?.(pullResult);
    const firstResult = await first;
    expect(firstResult).toEqual({ ok: true });
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('pull rejection returns ok:false, releases the cycle, next call allowed (case 3)', async () => {
    pullAllMock.mockRejectedValueOnce(new Error('boom'));

    const first = await syncNow();

    expect(first.ok).toBe(false);
    expect(first.error).toBe('boom');
    expect(GitSyncGate.isCycleHeld()).toBe(false);
    expect(isSyncNowRunning()).toBe(false);

    const second = await syncNow();
    expect(second).toEqual({ ok: true });
    expect(pullAllMock).toHaveBeenCalledTimes(2);
    expect(GitSyncGate.isCycleHeld()).toBe(false);
  });

  test('timeout releases the cycle when work settles and resets reentrancy (case 4)', async () => {
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullAllMock.mockImplementation(
      () =>
        new Promise<PullResult>((resolve) => {
          resolvePull = resolve;
        }),
    );

    const pending = syncNow();
    await flushMicrotasks();
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    await jest.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS);
    const timedOut = await pending;
    expect(timedOut).toEqual({ ok: false, error: 'Sync timed out' });
    expect(isSyncNowRunning()).toBe(false);
    // The timed-out work keeps holding the cycle until it actually settles.
    expect(GitSyncGate.isCycleHeld()).toBe(true);

    resolvePull?.(pullResult);
    await flushMicrotasks();
    expect(GitSyncGate.isCycleHeld()).toBe(false);

    pullAllMock.mockResolvedValue(pullResult);
    const next = await syncNow();
    expect(next).toEqual({ ok: true });
    expect(pullAllMock).toHaveBeenCalledTimes(2);
  });

  test('single-repo option routes through pullFromSingleRepo', async () => {
    const result = await syncNow({ repos: ['owner/repo'] });

    expect(result).toEqual({ ok: true });
    expect(pullSingleMock).toHaveBeenCalledWith('owner/repo');
    expect(pullAllMock).not.toHaveBeenCalled();
  });
});
