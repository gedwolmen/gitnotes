import * as Notifications from 'expo-notifications';
import { Todo } from '../models/Todo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  static async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  private static async scheduleImmediate(
    content: Notifications.NotificationContentInput,
  ): Promise<string | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    try {
      return await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
        },
      });
    } catch (error) {
      console.warn('[NotificationService] failed to schedule notification:', error);
      return null;
    }
  }

  private static async scheduleDateTrigger(
    content: Notifications.NotificationContentInput,
    trigger: Date,
  ): Promise<string | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    if (trigger.getTime() <= Date.now()) return null;

    try {
      return await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
    } catch (error) {
      console.warn('[NotificationService] failed to schedule notification:', error);
      return null;
    }
  }

  static async scheduleReminder(todo: Todo): Promise<string | undefined> {
    if (!todo.dueDate || todo.completed) return undefined;

    const reminderMinutes = todo.reminderBeforeMinutes ?? 0;
    const triggerTime = new Date(todo.dueDate - reminderMinutes * 60 * 1000);

    if (triggerTime.getTime() <= Date.now()) return undefined;

    const notificationId = await this.scheduleDateTrigger(
      {
        title: 'Todo Reminder',
        body: todo.text,
        data: { todoId: todo.id },
        sound: true,
      },
      triggerTime,
    );

    return notificationId ?? undefined;
  }

  static async cancelReminder(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  static async rescheduleReminder(todo: Todo): Promise<string | undefined> {
    if (todo.notificationId) {
      await this.cancelReminder(todo.notificationId);
    }
    return this.scheduleReminder(todo);
  }

  static async cancelAllForTodo(todo: Todo): Promise<void> {
    if (todo.notificationId) {
      await this.cancelReminder(todo.notificationId);
    }
  }

  static async scheduleLearningNotification(params: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    trigger: Date;
  }): Promise<string | null> {
    const { title, body, data, trigger } = params;

    if (trigger.getTime() <= Date.now()) return null;

    return this.scheduleDateTrigger({ title, body, data, sound: true }, trigger);
  }

  /**
   * Immediate-ish push-progress local notification. Throttling (push starts
   * can happen back-to-back) is the caller's job.
   */
  static async schedulePushProgress(
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<string | null> {
    return this.scheduleImmediate({ title, body, data, sound: true });
  }

  static async schedulePushFailure(
    title: string,
    body: string,
    data: { kind: 'push-failure'; repoPath?: string; branch?: string; conflict: boolean },
  ): Promise<string | null> {
    return this.scheduleImmediate({ title, body, data, sound: true });
  }
}
