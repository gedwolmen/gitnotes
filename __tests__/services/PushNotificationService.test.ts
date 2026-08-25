jest.mock('expo-notifications');
jest.mock('../../src/services/NotificationService');

const mockOnDropped = jest.fn();
const mockQueueSubscribe = jest.fn();
const mockGetAll = jest.fn();
const mockGitOpSubscribe = jest.fn();

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  __esModule: true,
  get NoteSyncQueueService() {
    return {
      onDroppedMutation: mockOnDropped,
      subscribe: mockQueueSubscribe,
      getAll: mockGetAll,
    };
  },
}));

jest.mock('../../src/stores/gitOperationStore', () => ({
  __esModule: true,
  get useGitOperationStore() {
    return {
      subscribe: mockGitOpSubscribe,
      getState: jest.fn(() => ({ ops: {} })),
    };
  },
}));

import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { NotificationService } from '../../src/services/NotificationService';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';
import * as PushNotificationService from '../../src/services/PushNotificationService';

// Mock react-native AFTER imports to ensure correct ordering
let mockAppState = 'background';
jest.mock('react-native', () => ({
  AppState: {
    get currentState() { return mockAppState; },
  },
}));

describe('PushNotificationService', () => {
  let droppedCb: any;
  let gitOpCb: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(5000);
    jest.clearAllMocks();
    mockAppState = 'background';

    PushNotificationService._resetPushStartState();

    mockOnDropped.mockImplementation((cb: any) => {
      droppedCb = cb;
      return () => {};
    });

    mockQueueSubscribe.mockImplementation((cb: any) => {
      return () => {};
    });

    mockGetAll.mockResolvedValue([]);

    mockGitOpSubscribe.mockImplementation((cb: any) => {
      gitOpCb = cb;
      return () => {};
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.setSystemTime(5000);
    droppedCb = null;
    gitOpCb = null;
  });
  
  test('resolvePushFailureRoute maps plain failures to home and conflicts to conflicts', () => {
    expect(PushNotificationService.resolvePushFailureRoute(false)).toBe('gitnotes://home');
    expect(PushNotificationService.resolvePushFailureRoute(true)).toBe('gitnotes://conflicts');
  });
  
  test('attachToScheduler calls schedulePushFailure on permanent failure', () => {
    PushNotificationService.attachToScheduler();
    
    droppedCb({
      mutation: { id: '1', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'foo.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(1);
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledWith(
      'Push failed', 'boom',
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: false },
    );
  });
  
  test('attachToScheduler marks conflict: true when error contains conflict', () => {
    PushNotificationService.attachToScheduler();
    
    droppedCb({
      mutation: { id: '1', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'foo.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'conflict-detected',
    });
    
    expect(NotificationService.schedulePushFailure).toHaveBeenLastCalledWith(
      'Push failed', 'conflict-detected',
      { kind: 'push-failure', repoPath: '/repo/path', branch: 'main', conflict: true },
    );
  });
  
  test('attachToScheduler suppresses duplicate failures within dedup window', () => {
    PushNotificationService.attachToScheduler();
    
    droppedCb({
      mutation: { id: '1', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'foo.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(1);
    
    jest.setSystemTime(5000 + 30 * 1000);
    droppedCb({
      mutation: { id: '2', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'bar.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'still failing',
    });
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(1);
  });
  
  test('attachToScheduler notifies for different (repo, branch) independently', () => {
    PushNotificationService.attachToScheduler();
    
    droppedCb({
      mutation: { id: '1', type: 'note.upsert', params: { repo: '/repo/a', branch: 'main', filePath: 'foo.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    droppedCb({
      mutation: { id: '2', type: 'note.upsert', params: { repo: '/repo/b', branch: 'main', filePath: 'bar.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(2);
  });
  
  test('attachToScheduler re-notifies past the dedup window', () => {
    PushNotificationService.attachToScheduler();
    
    droppedCb({
      mutation: { id: '1', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'foo.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(1);
    
    jest.setSystemTime(5000 + 3 * 60 * 1000);
    droppedCb({
      mutation: { id: '2', type: 'note.upsert', params: { repo: '/repo/path', branch: 'main', filePath: 'bar.md' }, attempts: 8, createdAt: 0 },
      reason: 'exhausted',
      error: 'boom',
    });
    expect(NotificationService.schedulePushFailure).toHaveBeenCalledTimes(2);
  });
  
  test('subscribeToPushProgress fires start notification via dismissAndReschedule', async () => {
    mockGetAll.mockResolvedValue([{},{},{},{},{}]);

    PushNotificationService.subscribeToPushProgress();

    gitOpCb({ 'push-1': { id: 'push-1', kind: 'push', status: 'running', repo: 'a/repo', branch: 'main' } });
    await Promise.resolve();

    expect(NotificationService.dismissAndReschedule).toHaveBeenCalledTimes(1);
    const [id, content] = (NotificationService.dismissAndReschedule as jest.Mock).mock.calls[0] as [string, any];
    expect(id).toBe('gitnotes-push-progress');
    expect(content.title).toBe('Pushing changes…');
    expect(content.data).toEqual({ kind: 'push-progress' });
  });
  
  test('subscribeToPushProgress completion notification fires when isPushing clears', async () => {
    mockGetAll.mockResolvedValue([{},{},{}]);

    PushNotificationService.subscribeToPushProgress();

    gitOpCb({ 'push-1': { id: 'push-1', kind: 'push', status: 'running', repo: 'a/repo', branch: 'main' } });
    await Promise.resolve();

    mockGetAll.mockResolvedValue([]);
    jest.setSystemTime(6000);
    gitOpCb({});
    await Promise.resolve();

    const calls = (NotificationService.dismissAndReschedule as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1];
    const [, content] = lastCall as [string, any];
    expect(content.title).toBe('Push complete');
    expect(content.body).toBe('All staged changes pushed to GitHub');
  });
  
  test('subscribeToPushProgress no notifications fire while app is foregrounded', async () => {
    mockAppState = 'active';
    mockGetAll.mockResolvedValue([{},{},{}]);
    
    PushNotificationService.subscribeToPushProgress();
    
    gitOpCb({ 'push-1': { id: 'push-1', kind: 'push', status: 'running', repo: 'a/repo', branch: 'main' } });
    gitOpCb({});
    
    expect(NotificationService.dismissAndReschedule).not.toHaveBeenCalled();
  });
});
