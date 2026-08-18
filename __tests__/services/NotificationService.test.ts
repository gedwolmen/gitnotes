import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockSetNotificationHandler = jest.fn();
const mockGetPermissionsAsync = jest.fn(async () => ({ status: 'granted' as const }));
const mockRequestPermissionsAsync = jest.fn(async () => ({ status: 'granted' as const }));
const mockScheduleNotificationAsync = jest.fn(async () => 'notification-id');
const mockCancelScheduledNotificationAsync = jest.fn();
const mockDismissNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: mockSetNotificationHandler,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  dismissNotificationAsync: mockDismissNotificationAsync,
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
}));

import { Todo } from '../../src/models/Todo';

const NotificationService = require('../../src/services/NotificationService')
  .NotificationService as typeof import('../../src/services/NotificationService').NotificationService;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    jest.resetAllMocks();
    mockGetPermissionsAsync.mockImplementation(async () => ({ status: 'granted' }));
    mockRequestPermissionsAsync.mockImplementation(async () => ({ status: 'granted' }));
    mockScheduleNotificationAsync.mockImplementation(async () => 'notification-id');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('schedulePushProgress schedules with TIME_INTERVAL seconds:1 and returns the id', async () => {
    const id = await NotificationService.schedulePushProgress('Pushing changes…', 'Pushing', {
      kind: 'push-progress',
    });

    expect(id).toBe('notification-id');
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotificationAsync.mock.calls[0][0] as {
      content: Record<string, unknown>;
      trigger: { type: string; seconds?: number; date?: Date };
    };
    expect(call.trigger.type).toBe('timeInterval');
    expect(call.trigger.seconds).toBe(1);
    expect(call.trigger.type).not.toBe('date');
    expect(call.trigger.date).toBeUndefined();
  });

  test('schedulePushFailure schedules with TIME_INTERVAL seconds:1 and returns the id', async () => {
    const id = await NotificationService.schedulePushFailure(
      'Push failed',
      'Could not push',
      { kind: 'push-failure', repoPath: '/repo', branch: 'main', conflict: false },
    );

    expect(id).toBe('notification-id');
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotificationAsync.mock.calls[0][0] as {
      content: Record<string, unknown>;
      trigger: { type: string; seconds?: number; date?: Date };
    };
    expect(call.trigger.type).toBe('timeInterval');
    expect(call.trigger.seconds).toBe(1);
    expect(call.trigger.date).toBeUndefined();
  });

  test('scheduleLearningNotification with a future trigger schedules a DATE trigger', async () => {
    const trigger = new Date(5000);
    const id = await NotificationService.scheduleLearningNotification({
      title: 'Learn',
      body: 'Body',
      data: { noteId: 'n1' },
      trigger,
    });

    expect(id).toBe('notification-id');
    const call = mockScheduleNotificationAsync.mock.calls[0][0] as {
      trigger: { type: string; date: Date };
    };
    expect(call.trigger.type).toBe('date');
    expect(call.trigger.date).toBe(trigger);
  });

  test('scheduleLearningNotification returns null without scheduling when trigger lapses during permission await', async () => {
    const trigger = new Date(1500);
    mockGetPermissionsAsync.mockImplementation(async () => {
      jest.advanceTimersByTime(600);
      return { status: 'granted' };
    });

    const id = await NotificationService.scheduleLearningNotification({
      title: 'Learn',
      body: 'Body',
      data: {},
      trigger,
    });

    expect(id).toBeNull();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('scheduleReminder returns undefined for a past trigger without scheduling', async () => {
    const todo: Todo = {
      id: 't1',
      text: 'Buy milk',
      completed: false,
      createdAt: 0,
      updatedAt: 0,
      dueDate: 500,
      reminderBeforeMinutes: 0,
    };

    const result = await NotificationService.scheduleReminder(todo);

    expect(result).toBeUndefined();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('scheduleReminder returns undefined when the trigger lapses during permission await', async () => {
    const todo: Todo = {
      id: 't2',
      text: 'Call back',
      completed: false,
      createdAt: 0,
      updatedAt: 0,
      dueDate: 1500,
      reminderBeforeMinutes: 0,
    };
    mockGetPermissionsAsync.mockImplementation(async () => {
      jest.advanceTimersByTime(600);
      return { status: 'granted' };
    });

    const result = await NotificationService.scheduleReminder(todo);

    expect(result).toBeUndefined();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('scheduleReminder returns undefined when permission is denied', async () => {
    const todo: Todo = {
      id: 't3',
      text: 'Denied reminder',
      completed: false,
      createdAt: 0,
      updatedAt: 0,
      dueDate: 5000,
      reminderBeforeMinutes: 0,
    };
    mockGetPermissionsAsync.mockImplementation(async () => ({ status: 'denied' as const }));
    mockRequestPermissionsAsync.mockImplementation(async () => ({ status: 'denied' as const }));

    const result = await NotificationService.scheduleReminder(todo);

    expect(result).toBeUndefined();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('a scheduleNotificationAsync rejection resolves to null without throwing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE'));

    const id = await NotificationService.schedulePushProgress('Pushing', 'Pushing', {
      kind: 'push-progress',
    });

    expect(id).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('dismissAndReschedule cancels the scheduled notification and dismisses presented ones for the identifier', async () => {
    const id = await NotificationService.dismissAndReschedule('push-1', {
      title: 'Pushing 2/5 files…',
      body: 'Pushing',
      data: { kind: 'push-progress' },
    });

    expect(id).toBe('notification-id');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('push-1');
    expect(mockDismissNotificationAsync).toHaveBeenCalledWith('push-1');
  });

  test('dismissAndReschedule schedules the replacement with the SAME identifier', async () => {
    await NotificationService.dismissAndReschedule('push-1', {
      title: 'Pushing 2/5 files…',
      body: 'Pushing',
      data: { kind: 'push-progress' },
    });

    const call = mockScheduleNotificationAsync.mock.calls[0][0] as {
      identifier?: string;
      content: Record<string, unknown>;
      trigger: { type: string; seconds?: number };
    };
    expect(call.identifier).toBe('push-1');
    expect(call.trigger.type).toBe('timeInterval');
    expect(call.trigger.seconds).toBe(1);
  });

  test('dismissAndReschedule returns null without scheduling when permission is denied', async () => {
    mockGetPermissionsAsync.mockImplementation(async () => ({ status: 'denied' as const }));
    mockRequestPermissionsAsync.mockImplementation(async () => ({ status: 'denied' as const }));

    const id = await NotificationService.dismissAndReschedule('push-1', {
      title: 'Pushing',
      body: 'Pushing',
      data: {},
    });

    expect(id).toBeNull();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockDismissNotificationAsync).not.toHaveBeenCalled();
  });

  test('a dismissAndReschedule native rejection resolves to null with a console.warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockScheduleNotificationAsync.mockRejectedValueOnce(new Error('ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE'));

    const id = await NotificationService.dismissAndReschedule('push-1', {
      title: 'Pushing',
      body: 'Pushing',
      data: {},
    });

    expect(id).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
