import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  BackgroundTaskResult: { Success: 0, Failed: 1 },
  BackgroundTaskStatus: { Available: 'Available' },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => true),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => ({
    repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0,
  })),
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
  },
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(async () => jest.fn()),
    isCycleHeld: jest.fn(() => false),
  },
}));

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    schedulePushProgress: jest.fn(async () => null),
  },
}));

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: {
    listStaged: jest.fn(async () => []),
    pushStaged: jest.fn(async () => ({ success: true })),
  },
}));

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';
import { NotificationService } from '../../src/services/NotificationService';
import { pullAllFromRepos } from '../../src/services/RepoPullService';
import '../../src/services/BackgroundSyncService';

// defineTask registers the handler once at module load; capture it before
// clearAllMocks() wipes the call log in beforeEach.
const backgroundTaskHandler = (TaskManager.defineTask as jest.Mock).mock
  .calls[0][1] as () => Promise<number>;

const runTask = (): Promise<number> => backgroundTaskHandler();

describe('BackgroundSyncService notification decision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'a/repo' },
    ]);
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (pullAllFromRepos as jest.Mock).mockResolvedValue({
      repos: 1, notes: 3, canvases: 0, todos: 0, templates: 0,
    });
  });

  test('schedules one notification when the pull had changes', async () => {
    const result = await runTask();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(NotificationService.schedulePushProgress).toHaveBeenCalledTimes(1);
    expect(NotificationService.schedulePushProgress).toHaveBeenCalledWith(
      'Synced with origin',
      expect.stringContaining('3'),
      { kind: 'background-pull' },
    );
  });

  test('stays silent when the pull had zero changes', async () => {
    (pullAllFromRepos as jest.Mock).mockResolvedValue({
      repos: 1, notes: 0, canvases: 0, todos: 0, templates: 0,
    });

    const result = await runTask();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(pullAllFromRepos).toHaveBeenCalledTimes(1);
    expect(NotificationService.schedulePushProgress).not.toHaveBeenCalled();
  });

  test('returns Success without pulling or notifying when unauthenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);

    const result = await runTask();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(pullAllFromRepos).not.toHaveBeenCalled();
    expect(NotificationService.schedulePushProgress).not.toHaveBeenCalled();
  });
});
