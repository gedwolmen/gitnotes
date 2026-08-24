let mockNetInfoListener: ((state: NetInfoState) => void) | undefined;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  NetInfoStateType: { wifi: 'wifi', none: 'none' },
  default: {
    addEventListener: jest.fn((listener: (state: NetInfoState) => void) => {
      mockNetInfoListener = listener;
      return jest.fn();
    }),
    fetch: jest.fn(),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(),
}));

jest.mock('../src/services/StagePushScheduler', () => ({
  hasPushSession: jest.fn(),
  drainPushQueue: jest.fn(),
}));

jest.mock('../src/stores/stageStore', () => ({
  useStageStore: {
    getState: jest.fn(),
  },
}));

let mockAppStateChangeListener: ((state: AppStateStatus) => void) | undefined;

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: jest.fn((_event: string, listener: (state: AppStateStatus) => void) => {
      mockAppStateChangeListener = listener;
      return { remove: jest.fn() };
    }),
  },
}));

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import type { AppStateStatus } from 'react-native';
import { GitHubService } from '../src/services/GitHubService';
import {
  __resetForegroundSyncForTest,
  __runPullForTest,
  getForegroundSyncHealth,
  isForegroundSyncInFlight,
  startForegroundWatcher,
  updateForegroundWatcherConfig,
} from '../src/services/ForegroundSyncService';
import { pullAllFromRepos } from '../src/services/RepoPullService';
import { hasPushSession, drainPushQueue } from '../src/services/StagePushScheduler';
import { StorageService } from '../src/services/StorageService';
import { useStageStore } from '../src/stores/stageStore';
import type { PullResult } from '../src/services/RepoPullService';
import type { GitRepository } from '../src/services/GitService';

const authMock = jest.mocked(GitHubService.isAuthenticated);
const reposMock = jest.mocked(StorageService.getSavedRepositories);
const netInfoFetchMock = jest.mocked(NetInfo.fetch);
const pullMock = jest.mocked(pullAllFromRepos);
const hasPushSessionMock = jest.mocked(hasPushSession);
const drainPushQueueMock = jest.mocked(drainPushQueue);
const useStageStoreMock = jest.mocked(useStageStore);

const repository: GitRepository = { id: 'repo-id', name: 'repo', path: 'owner/repo' };
const reachableState: NetInfoState = {
  type: NetInfoStateType.wifi,
  isConnected: true,
  isInternetReachable: true,
  details: {
    isConnectionExpensive: false,
    ssid: null,
    bssid: null,
    strength: null,
    ipAddress: null,
    subnet: null,
    frequency: null,
    linkSpeed: null,
    rxLinkSpeed: null,
    txLinkSpeed: null,
  },
};
const offlineState: NetInfoState = {
  type: NetInfoStateType.none,
  isConnected: false,
  isInternetReachable: false,
  details: null,
};
const pullResult: PullResult = { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };

describe('ForegroundSyncService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    jest.clearAllMocks();
    __resetForegroundSyncForTest();
    mockAppStateChangeListener = undefined;
    authMock.mockReturnValue(true);
    reposMock.mockResolvedValue([repository]);
    netInfoFetchMock.mockResolvedValue(reachableState);
    pullMock.mockResolvedValue(pullResult);
    hasPushSessionMock.mockResolvedValue(false);
    drainPushQueueMock.mockResolvedValue(undefined);
    useStageStoreMock.getState.mockReturnValue({ staged: [] } as never);
  });

  afterEach(() => {
    __resetForegroundSyncForTest();
    jest.useRealTimers();
  });

  test('pulls remote state without draining queued mutations', async () => {
    const order: string[] = [];
    pullMock.mockImplementation(async () => {
      order.push('pull');
      return pullResult;
    });

    await __runPullForTest();

    expect(order).toEqual(['pull']);
  });

  test('does not pull while offline', async () => {
    netInfoFetchMock.mockResolvedValue(offlineState);

    await __runPullForTest();

    expect(pullMock).not.toHaveBeenCalled();
  });

  test('does not pull while paused and resumes after unpausing (#1174)', async () => {
    updateForegroundWatcherConfig({
      syncFrequentlyEnabled: true,
      syncIntervalSeconds: 60,
      syncPaused: true,
    });

    await __runPullForTest();
    expect(pullMock).not.toHaveBeenCalled();

    updateForegroundWatcherConfig({
      syncFrequentlyEnabled: true,
      syncIntervalSeconds: 60,
      syncPaused: false,
    });

    await __runPullForTest();
    expect(pullMock).toHaveBeenCalledTimes(1);
  });

  test('skips a trigger while another foreground sync is in flight', async () => {
    let resolvePull: (() => void) | undefined;
    pullMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = () => resolve(pullResult);
        }),
    );

    const firstPull = __runPullForTest('first');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const secondPull = __runPullForTest('second');

    await secondPull;
    expect(pullMock).toHaveBeenCalledTimes(1);

    resolvePull?.();
    await firstPull;
  });

  test('coalesces triggers within the existing window', async () => {
    await __runPullForTest('first');
    jest.setSystemTime(11000);
    await __runPullForTest('second');

    expect(pullMock).toHaveBeenCalledTimes(1);
  });

  test('recovers after a pull failure once backoff elapses', async () => {
    pullMock.mockRejectedValueOnce(new Error('pull failed'));

    await __runPullForTest('first');
    jest.setSystemTime(40000);
    await __runPullForTest('second');

    expect(pullMock).toHaveBeenCalledTimes(2);
  });

  test('keeps later AppState cycles from starting while a timed-out pull remains pending', async () => {
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });

    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(pullMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(600_000);
    expect(isForegroundSyncInFlight()).toBe(false);
    await jest.advanceTimersByTimeAsync(30_000);

    mockAppStateChangeListener?.('background');
    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(pullMock).toHaveBeenCalledTimes(1);

    resolvePull?.(pullResult);
    await jest.advanceTimersByTimeAsync(0);
  });

  test('allows AppState cycles after timed-out background pull completes', async () => {
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });

    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(600_000);
    resolvePull?.(pullResult);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(30_000);

    mockAppStateChangeListener?.('background');
    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);

    expect(pullMock).toHaveBeenCalledTimes(2);
  });

  test('resumes push drain when foreground returns with active session and staged items', async () => {
    hasPushSessionMock.mockResolvedValue(true);
    useStageStoreMock.getState.mockReturnValue({ staged: [{ id: '1' }] } as never);
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });

    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);

    expect(drainPushQueueMock).toHaveBeenCalledTimes(1);
  });

  test('does not resume push drain when foreground returns without active session', async () => {
    hasPushSessionMock.mockResolvedValue(false);
    useStageStoreMock.getState.mockReturnValue({ staged: [{ id: '1' }] } as never);
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });

    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);

    expect(drainPushQueueMock).not.toHaveBeenCalled();
  });

  test('does not resume push drain when foreground returns with active session but no staged items', async () => {
    hasPushSessionMock.mockResolvedValue(true);
    useStageStoreMock.getState.mockReturnValue({ staged: [] } as never);
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });

    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);

    expect(drainPushQueueMock).not.toHaveBeenCalled();
  });

  test('throttles repeated busy-skip log lines to one per window', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    const firstPull = __runPullForTest('interval');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await __runPullForTest('interval');
    await __runPullForTest('interval');
    await __runPullForTest('interval');

    const skipLines = logSpy.mock.calls.filter(([msg]) => String(msg).includes('[ForegroundSync] skip'));
    expect(skipLines.length).toBe(1);

    resolvePull?.(pullResult);
    await firstPull;
    logSpy.mockRestore();
  });

  test('reports healthy sync state after a successful pull', async () => {
    expect(getForegroundSyncHealth().status).toBe('idle');

    await __runPullForTest('appstate-active');

    const health = getForegroundSyncHealth();
    expect(health.status).toBe('ok');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastCompletedAt).toBeGreaterThan(0);
  });

  test('reports failed sync state after a failed pull', async () => {
    pullMock.mockRejectedValueOnce(new Error('pull failed'));

    await __runPullForTest('appstate-active');

    const health = getForegroundSyncHealth();
    expect(health.status).toBe('failed');
    expect(health.consecutiveFailures).toBe(1);
    expect(health.lastFailedAt).toBeGreaterThan(0);
  });

  test('reports timed-out sync state when the pull watchdog fires', async () => {
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    const pull = __runPullForTest('interval');
    await jest.advanceTimersByTimeAsync(0);
    expect(getForegroundSyncHealth().status).toBe('syncing');

    await jest.advanceTimersByTimeAsync(60_000);
    await jest.advanceTimersByTimeAsync(540_000);

    const health = getForegroundSyncHealth();
    expect(health.status).toBe('timedout');
    expect(health.consecutiveFailures).toBe(1);

    resolvePull?.(pullResult);
    await jest.advanceTimersByTimeAsync(0);
    await pull;
  });

  test('backs off interval checks while a pull stays stuck', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    let resolvePull: ((result: PullResult) => void) | undefined;
    pullMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    startForegroundWatcher({ syncFrequentlyEnabled: true, syncIntervalSeconds: 2 });
    mockAppStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(isForegroundSyncInFlight()).toBe(true);

    // A fixed 2s interval would fire ~30 times over a minute of stuck pull;
    // the jittered back-off must keep the pull single-flight throughout.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(pullMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(540_000);
    expect(isForegroundSyncInFlight()).toBe(false);
    expect(pullMock).toHaveBeenCalledTimes(1);

    const skipLines = logSpy.mock.calls.filter(([msg]) => String(msg).includes('[ForegroundSync] skip'));
    expect(skipLines.length).toBeGreaterThan(0);
    expect(skipLines.length).toBeLessThanOrEqual(10);

    const callsBeforeRecovery = pullMock.mock.calls.length;
    resolvePull?.(pullResult);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(200_000);
    expect(pullMock.mock.calls.length).toBeGreaterThan(callsBeforeRecovery);

    randomSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('does NOT pull when NetInfo fires reachable=true while app is backgrounded', async () => {
    startForegroundWatcher({ syncFrequentlyEnabled: false, syncIntervalSeconds: 0 });
    expect(mockNetInfoListener).toBeDefined();
    mockNetInfoListener!(offlineState);
    await Promise.resolve();
    pullMock.mockClear();
    mockNetInfoListener!(reachableState);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(pullMock).not.toHaveBeenCalled();
  });
});
