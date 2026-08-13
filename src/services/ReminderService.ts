import { NotificationService } from './NotificationService';
import { useReminderStore } from '../stores/reminderStore';
import { useNoteStore } from '../stores/noteStore';
import { type ReminderItem, getNextScheduledDates } from '../models/Reminder';

export class ReminderService {
  /**
   * Schedule the next occurrence for this reminder. Idempotent: if the
   * reminder already has a `notificationId`, it is cancelled first.
   * Persists the returned notificationId back on the item.
   *
   * Returns null when no future trigger date is available (e.g. a one-time
   * reminder whose scheduled date has passed) or permissions are denied.
   */
  static async scheduleNotification(
    item: ReminderItem,
  ): Promise<string | null> {
    if (item.notificationId) {
      try {
        await NotificationService.cancelReminder(item.notificationId);
      } catch (err) {
        console.warn('[ReminderService] cancel existing failed:', err);
      }
    }

    const nextDates = getNextScheduledDates(
      item.daysOfWeek,
      item.time,
      item.repeat,
    );
    if (nextDates.length === 0) return null;
    const trigger = nextDates[0];

    const { title, body } = ReminderService.buildContent(item);

    const data: Record<string, unknown> = {
      kind: item.entityType,
      reminderId: item.id,
    };
    if (item.noteId) data.noteId = item.noteId;
    if (item.repoPath) data.repoPath = item.repoPath;
    if (item.folderPath) data.folderPath = item.folderPath;
    if (item.tag) data.tag = item.tag;

    const notificationId =
      await NotificationService.scheduleLearningNotification({
        title,
        body,
        data,
        trigger,
      });

    if (notificationId) {
      await useReminderStore.getState().updateItem(item.id, {
        notificationId,
      });
    }
    return notificationId;
  }

  static async cancelNotification(item: ReminderItem): Promise<void> {
    if (!item.notificationId) return;
    try {
      await NotificationService.cancelReminder(item.notificationId);
    } catch (err) {
      console.warn('[ReminderService] cancel failed:', err);
    }
  }

  private static buildContent(
    item: ReminderItem,
  ): { title: string; body: string } {
    switch (item.entityType) {
      case 'note': {
        const note = item.noteId
          ? useNoteStore.getState().getNoteById(item.noteId)
          : undefined;
        const noteTitle = note?.title ?? item.entityLabel;
        return { title: 'Time to read', body: noteTitle };
      }
      case 'folder':
        return { title: 'Review folder', body: item.entityLabel };
      case 'repo':
        return { title: 'Review repo', body: item.entityLabel };
      case 'tag':
        return { title: 'Review tagged notes', body: `#${item.entityLabel}` };
    }
  }
}
