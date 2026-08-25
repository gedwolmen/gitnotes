import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

type PushState = { isPushing: Record<string, boolean>; pushProgress?: number | null; pendingCount?: number };
type PushFailure = { key: string; error: string };
type ProgressListener = (state: PushState, prevState: PushState) => void;
type FailureHandler = (failure: PushFailure) => void;
type NotificationContent = { title: string; body: string; data: Record<string, unknown> };

const mockDismissAndReschedule = jest.fn(async () => 'reschedule-id');
const mockSchedulePushFailure = jest.fn(async () => 'failure-id');

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    dismissAndReschedule: mockDismissAndReschedule,
    schedulePushFailure: mockSchedulePushFailure,
  },
}));

const mockAddOnPushFailure = jest.fn(() => jest.fn());
jest.mock('../../src/services/StagePushScheduler', () => ({
  setOnPushFailure: jest.fn(),
  addOnPushFailure: mockAddOnPushFailure,
}));

const mockSubscribe = jest.fn(() => jest.fn());
jest.mock('../../src/stores/stageStore', () => ({
  useStageStore: { subscribe: mockSubscribe },
}));

let mockAppState = 'background';
jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockAppState;
    },
  },
}));

let pushService: typeof import('../../src/services/PushNotificationService');

describe('PushNotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(5000);
    jest.clearAllMocks();
    mockAppState = 'background';
    jest.isolateModules(() => {
      pushService = require('../../src/services/PushNotificationService');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('failure notification is scheduled with the push-failure payload shape', () => {
    pushService.attachToScheduler();
    const handler = mockAddOnPushFailure.mock.calls[0][0] as FailureHandler;

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
    const handler = mockAddOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/path::main', error: 'conflict-detected' });
    expect(mockSchedulePushFailure).toHaveBeenLastCalledWith(
      'Push failed',
      expect.any(String),
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: true },
    );
  });

  test('repeated push failures for the same (repo, branch) within the dedup window are suppressed', () => {
    pushService.attachToScheduler();
    const handler = mockAddOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/path::main', error: 'boom' });
    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(1);

    jest.setSystemTime(5000 + 30 * 1000);
    handler({ key: '/repo/path::main', error: 'still failing' });
    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(1);
  });

  test('push failures for different (repo, branch) are not deduped against each other', () => {
    pushService.attachToScheduler();
    const handler = mockAddOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/a::main', error: 'boom' });
    handler({ key: '/repo/b::main', error: 'boom' });
    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(2);
  });

  test('push failures for the same (repo, branch) past the dedup window are notified again', () => {
    pushService.attachToScheduler();
    const handler = mockAddOnPushFailure.mock.calls[0][0] as FailureHandler;

    handler({ key: '/repo/path::main', error: 'boom' });
    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(1);
    jest.setSystemTime(5000 + 3 * 60 * 1000);
    handler({ key: '/repo/path::main', error: 'boom' });
    expect(mockSchedulePushFailure).toHaveBeenCalledTimes(2);
  });

  test('start notification fires via dismissAndReschedule with body-text file count', () => {
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener(
      { isPushing: { 'a/repo::main': true }, pendingCount: 5, pushProgress: null },
      { isPushing: {}, pendingCount: 5, pushProgress: null },
    );

    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(1);
    const [id, content] = mockDismissAndReschedule.mock.calls[0] as [string, NotificationContent];
    expect(id).toBe('gitnotes-push-progress');
    expect(content.title).toBe('Pushing changes…');
    expect(content.body).toBe('Pushing 0/5 files…');
    expect(content.data).toEqual({ kind: 'push-progress' });
  });

  test('throttled body-text updates during push', () => {
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener(
      { isPushing: { a: true }, pendingCount: 10, pushProgress: 0 },
      { isPushing: {}, pendingCount: 10, pushProgress: null },
    );
    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(1);

    listener(
      { isPushing: { a: true }, pendingCount: 10, pushProgress: 0.3 },
      { isPushing: { a: true }, pendingCount: 10, pushProgress: 0 },
    );
    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    listener(
      { isPushing: { a: true }, pendingCount: 10, pushProgress: 0.6 },
      { isPushing: { a: true }, pendingCount: 10, pushProgress: 0.3 },
    );
    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(2);
    const [, updatedContent] = mockDismissAndReschedule.mock.calls[1] as [string, NotificationContent];
    expect(updatedContent.body).toBe('Pushing 6/10 files…');
  });

  test('completion notification fires when push ends', () => {
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener(
      { isPushing: { a: true }, pendingCount: 3, pushProgress: null },
      { isPushing: {}, pendingCount: 3, pushProgress: null },
    );
    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(1);

    listener(
      { isPushing: {}, pendingCount: 0, pushProgress: null },
      { isPushing: { a: true }, pendingCount: 3, pushProgress: 1 },
    );
    expect(mockDismissAndReschedule).toHaveBeenCalledTimes(2);
    const [, completionContent] = mockDismissAndReschedule.mock.calls[1] as [string, NotificationContent];
    expect(completionContent.title).toBe('Push complete');
    expect(completionContent.body).toBe('All staged changes pushed to GitHub');
    expect(completionContent.data).toEqual({ kind: 'push-complete' });
  });

  test('no notifications fire while the app is foregrounded (start/progress/completion)', () => {
    mockAppState = 'active';
    pushService.subscribeToPushProgress();
    const listener = mockSubscribe.mock.calls[0][0] as ProgressListener;

    listener(
      { isPushing: { a: true }, pendingCount: 3, pushProgress: null },
      { isPushing: {}, pendingCount: 3, pushProgress: null },
    );
    listener(
      { isPushing: { a: true }, pendingCount: 3, pushProgress: 0.5 },
      { isPushing: { a: true }, pendingCount: 3, pushProgress: 0.25 },
    );
    listener(
      { isPushing: {}, pendingCount: 0, pushProgress: null },
      { isPushing: { a: true }, pendingCount: 3, pushProgress: 1 },
    );

    expect(mockDismissAndReschedule).not.toHaveBeenCalled();
  });

  test('resolvePushFailureRoute maps plain failures to stage and conflicts to conflicts', () => {
    expect(pushService.resolvePushFailureRoute(false)).toBe('gitnotes://stage');
    expect(pushService.resolvePushFailureRoute(true)).toBe('gitnotes://conflicts');
  });
});
