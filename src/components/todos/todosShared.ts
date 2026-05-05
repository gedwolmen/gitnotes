import { format, isToday, isTomorrow } from 'date-fns';

import { REMINDER_OPTIONS } from '../../models/Todo';

export function formatDeadline(timestamp: number): string {
  const date = new Date(timestamp);
  const timeStr = format(date, 'h:mm a');
  if (isToday(date)) return `Today ${timeStr}`;
  if (isTomorrow(date)) return `Tomorrow ${timeStr}`;
  return `${format(date, 'MMM d')} ${timeStr}`;
}

export function findReminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `${minutes} min before`;
}
