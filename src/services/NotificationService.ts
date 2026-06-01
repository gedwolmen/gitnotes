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

  static async scheduleReminder(todo: Todo): Promise<string | undefined> {
    if (!todo.dueDate || todo.completed) return undefined;

    const reminderMinutes = todo.reminderBeforeMinutes ?? 0;
    const triggerTime = new Date(todo.dueDate - reminderMinutes * 60 * 1000);

    if (triggerTime.getTime() <= Date.now()) return undefined;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return undefined;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Todo Reminder',
        body: todo.text,
        data: { todoId: todo.id },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerTime,
      },
    });

    return notificationId;
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

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
      },
    });

    return notificationId;
  }
}
