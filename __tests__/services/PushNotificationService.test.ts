import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

type PushState = { isPushing: Record<string, boolean> };
type PushFailure = { key: string; error: string };
type ProgressListener = (state: PushState, prevState: PushState) => void;
type FailureHandler = (failure: PushFailure) => void;

const mockSchedulePushProgress = jest.fn(async () => 'progress-id');
const mockSchedulePushFailure = jest.fn(async () => 'failure-id');

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    schedulePushProgress: mockSchedulePushProgress,
    schedulePushFailure: mockSchedulePushFailure,
  },
}));

const mockSetOnPushFailure = jest.fn();
jest.mock('../../src/services/StagePushScheduler', () => ({
  setOnPushFailure: mockSetOnPushFailure,
}));

const mockSubscribe = jest.fn(() => jest.fn());
jest.mock('../../src/stores/stageStore', () => ({
  useStageStore: { subscribe: mockSubscribe },
}));

let pushService: typeof import('../../src/services/PushNotificationService');

describe('PushNotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(5000);
    jest.clearAllMocks();
    // Fresh module state per test so the module-level progress throttle
    // (lastProgressSentAt) and subscription guard reset.
    jest.isolateModules(() => {
      pushService = require('../../src/services/PushNotificationService');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('failure notification is scheduled with the push-failure payload shape', () => {
    pushService.attachToScheduler();
    const handler = mockSetOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/path::main', error: 'boom' });

    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(1);
    expect(mockSchedulePushFailure).toHaveBeenCalledWith(
      'Push failed',
      expect.any(String),
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: false },
    );
  });

  test('conflict-caused failures are flagged conflict: true', () => {
    pushService.attachToScheduler();
    const handler = mockSetOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/path::main', error: 'conflict-detected' });
    expect(mockSchedulePushFailure).toHaveBeenLastCalledWith(
      'Push failed',
      expect.any(String),
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: true },
    );

    handler({ key: '/repo/path::main', error: 'remote branch has conflicting changes' });
    expect(mockSchedulePushFailure).toHaveBeenLastCalledWith(
      'Push failed',
      expect.any(String),
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: true },
    );
  });

  test('progress notification is scheduled when a push starts', () => {
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener({ isPushing: { 'a/repo::main': true } }, { isPushing: {} });

    expect(mockSchedulePushProgress).toHaveBeenCalledTimes(1);
    expect(mockSchedulePushProgress).toHaveBeenCalledWith(
      'Pushing changes…',
      'Pushing staged changes to GitHub',
      { kind: 'push-progress' },
    );
  });

  test('progress notifications are throttled to at most one per second', () => {
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener({ isPushing: { a: true } }, { isPushing: {} });
    listener({ isPushing: { b: true } }, { isPushing: {} });
    expect(mockSchedulePushProgress).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    listener({ isPushing: { c: true } }, { isPushing: {} });
    expect(mockSchedulePushProgress).toHaveBeenCalledTimes(2);
  });

  test('resolvePushFailureRoute maps plain failures to stage and conflicts to conflicts', () => {
    expect(pushService.resolvePushFailureRoute(false)).toBe('gitnotes://stage');
    expect(pushService.resolvePushFailureRoute(true)).toBe('gitnotes://conflicts');
  });
});
