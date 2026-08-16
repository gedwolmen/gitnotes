import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { NotificationService } from '../../src/services/NotificationService';

const mockedNotifications = jest.mocked(Notifications);

describe('NotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('clamps a near-past trigger at least one second into the future', async () => {
    await NotificationService.scheduleLearningNotification({
      title: 'title',
      body: 'body',
      data: {},
      trigger: new Date(Date.now() + 100),
    });

    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const trigger = mockedNotifications.scheduleNotificationAsync.mock.calls[0][0]
      .trigger as { type: string; date: Date };
    expect(trigger.type).toBe('date');
    expect(trigger.date.getTime()).toBeGreaterThanOrEqual(Date.now() + 1000);
  });

  test('returns null instead of throwing when scheduling fails', async () => {
    mockedNotifications.scheduleNotificationAsync.mockRejectedValue(
      new Error('ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE'),
    );

    const result = await NotificationService.scheduleLearningNotification({
      title: 'title',
      body: 'body',
      data: {},
      trigger: new Date(Date.now() + 60_000),
    });

    expect(result).toBeNull();
  });
});
