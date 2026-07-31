jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  NetInfoStateType: { wifi: 'wifi', none: 'none' },
  default: {
    addEventListener: jest.fn(() => jest.fn()),
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

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    drain: jest.fn(),
  },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(),
}));

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import { GitHubService } from '../src/services/GitHubService';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';
import {
  __resetForegroundSyncForTest,
  __runPullForTest,
} from '../src/services/ForegroundSyncService';
import { pullAllFromRepos } from '../src/services/RepoPullService';
import { StorageService } from '../src/services/StorageService';
import type { PullResult } from '../src/services/RepoPullService';
import type { GitRepository } from '../src/services/GitService';

const authMock = jest.mocked(GitHubService.isAuthenticated);
const reposMock = jest.mocked(StorageService.getSavedRepositories);
const netInfoFetchMock = jest.mocked(NetInfo.fetch);
const drainMock = jest.mocked(NoteSyncQueueService.drain);
const pullMock = jest.mocked(pullAllFromRepos);

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
    authMock.mockReturnValue(true);
    reposMock.mockResolvedValue([repository]);
    netInfoFetchMock.mockResolvedValue(reachableState);
    drainMock.mockResolvedValue({ succeeded: 0, failed: 0, remaining: 0 });
    pullMock.mockResolvedValue(pullResult);
  });

  afterEach(() => {
    __resetForegroundSyncForTest();
    jest.useRealTimers();
  });

  test('drains queued mutations before pulling remote state', async () => {
    const order: string[] = [];
    drainMock.mockImplementation(async () => {
      order.push('drain');
      return { succeeded: 1, failed: 0, remaining: 0 };
    });
    pullMock.mockImplementation(async () => {
      order.push('pull');
      return pullResult;
    });

    await __runPullForTest();

    expect(order).toEqual(['drain', 'pull']);
  });

  test('does not drain or pull while offline', async () => {
    netInfoFetchMock.mockResolvedValue(offlineState);

    await __runPullForTest();

    expect(drainMock).not.toHaveBeenCalled();
    expect(pullMock).not.toHaveBeenCalled();
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
    expect(drainMock).toHaveBeenCalledTimes(1);
    expect(pullMock).toHaveBeenCalledTimes(1);

    resolvePull?.();
    await firstPull;
  });

  test('coalesces triggers within the existing window', async () => {
    await __runPullForTest('first');
    jest.setSystemTime(11000);
    await __runPullForTest('second');

    expect(drainMock).toHaveBeenCalledTimes(1);
    expect(pullMock).toHaveBeenCalledTimes(1);
  });

  test('recovers when draining fails without entering pull backoff', async () => {
    drainMock.mockRejectedValueOnce(new Error('drain failed'));

    await __runPullForTest('first');
    jest.setSystemTime(40000);
    await __runPullForTest('second');

    expect(drainMock).toHaveBeenCalledTimes(2);
    expect(pullMock).toHaveBeenCalledTimes(2);
  });
});
