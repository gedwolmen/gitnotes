export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const DAY_OF_WEEK_OPTIONS: {
  value: DayOfWeek;
  label: string;
  short: string;
}[] = [
  { value: 'monday', label: 'Monday', short: 'M' },
  { value: 'tuesday', label: 'Tuesday', short: 'T' },
  { value: 'wednesday', label: 'Wednesday', short: 'W' },
  { value: 'thursday', label: 'Thursday', short: 'T' },
  { value: 'friday', label: 'Friday', short: 'F' },
  { value: 'saturday', label: 'Saturday', short: 'S' },
  { value: 'sunday', label: 'Sunday', short: 'S' },
];

export type ReminderEntityType = 'note' | 'folder' | 'repo' | 'tag';
export type ReminderRepeat = 'daily' | 'weekly' | 'one-time';

/**
 * A reminder targets exactly one entity. Exactly one of the entity-
 * identifying fields is non-null based on `entityType`:
 *   - note   → noteId
 *   - folder → repoPath + folderPath
 *   - repo   → repoPath
 *   - tag    → tag
 *
 * The factory `createReminder` enforces this constraint at runtime.
 */
export interface ReminderItem {
  id: string;
  entityType: ReminderEntityType;
  noteId: string | null;
  repoPath: string | null;
  folderPath: string | null;
  tag: string | null;
  /** Human-readable label shown in the list row / notification body. */
  entityLabel: string;
  /** "HH:MM" in 24-hour form. */
  time: string;
  repeat: ReminderRepeat;
  daysOfWeek: DayOfWeek[];
  isEnabled: boolean;
  notificationId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderCreateInput {
  entityType: ReminderEntityType;
  noteId?: string;
  repoPath?: string;
  folderPath?: string;
  tag?: string;
  entityLabel: string;
  time: string;
  repeat?: ReminderRepeat;
  daysOfWeek?: DayOfWeek[];
}

const DAY_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function getDayOfWeekIndex(day: DayOfWeek): number {
  return DAY_ORDER.indexOf(day);
}

function generateId(): string {
  return `rem-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function validateInput(input: ReminderCreateInput): void {
  switch (input.entityType) {
    case 'note':
      if (!input.noteId) {
        throw new Error('[Reminder] note entity requires noteId');
      }
      break;
    case 'folder':
      if (!input.repoPath || !input.folderPath) {
        throw new Error('[Reminder] folder entity requires repoPath and folderPath');
      }
      break;
    case 'repo':
      if (!input.repoPath) {
        throw new Error('[Reminder] repo entity requires repoPath');
      }
      break;
    case 'tag':
      if (!input.tag) {
        throw new Error('[Reminder] tag entity requires tag');
      }
      break;
  }
  if (!input.time || !/^\d{1,2}:\d{2}$/.test(input.time)) {
    throw new Error('[Reminder] time must be in HH:MM format');
  }
}

export function createReminder(input: ReminderCreateInput): ReminderItem {
  validateInput(input);
  const now = Date.now();
  return {
    id: generateId(),
    entityType: input.entityType,
    noteId: input.entityType === 'note' ? (input.noteId ?? null) : null,
    repoPath:
      input.entityType === 'folder' || input.entityType === 'repo'
        ? (input.repoPath ?? null)
        : null,
    folderPath:
      input.entityType === 'folder' ? (input.folderPath ?? null) : null,
    tag: input.entityType === 'tag' ? (input.tag ?? null) : null,
    entityLabel: input.entityLabel,
    time: input.time,
    repeat: input.repeat ?? 'weekly',
    daysOfWeek: input.daysOfWeek ?? ['monday'],
    isEnabled: true,
    notificationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateReminder(
  existing: ReminderItem,
  updates: Partial<ReminderCreateInput>,
): ReminderItem {
  return {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
}

export function getNextScheduledDates(
  daysOfWeek: DayOfWeek[],
  time: string,
  repeat: ReminderRepeat,
): Date[] {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const dates: Date[] = [];

  if (repeat === 'daily') {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
    dates.push(next);
    return dates;
  }

  const dayIndices = daysOfWeek.map(getDayOfWeekIndex).sort((a, b) => a - b);
  if (dayIndices.length === 0) return dates;

  const currentDayIndex = (now.getDay() + 6) % 7;

  if (repeat === 'one-time') {
    let daysUntilClosest = Infinity;
    let closestIdx = -1;
    for (let i = 0; i < dayIndices.length; i++) {
      let until = dayIndices[i] - currentDayIndex;
      if (until <= 0) until += 7;
      if (until < daysUntilClosest) {
        daysUntilClosest = until;
        closestIdx = i;
      }
    }
    const targetDayIndex = dayIndices[closestIdx];
    let daysUntil = targetDayIndex - currentDayIndex;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    next.setHours(hours, minutes, 0, 0);
    dates.push(next);
    return dates;
  }

  // weekly
  for (const targetDayIndex of dayIndices) {
    let daysUntil = targetDayIndex - currentDayIndex;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    next.setHours(hours, minutes, 0, 0);
    dates.push(next);
  }
  return dates;
}

export function formatReminderSchedule(item: ReminderItem): string {
  const timeStr = formatTime12h(item.time);
  if (item.repeat === 'daily') {
    return `Every day at ${timeStr}`;
  }
  if (item.repeat === 'one-time') {
    const dayLabel =
      item.daysOfWeek.length > 0
        ? DAY_OF_WEEK_OPTIONS.find((d) => d.value === item.daysOfWeek[0])
            ?.label ?? item.daysOfWeek[0]
        : '—';
    return `One-time ${dayLabel} at ${timeStr}`;
  }
  const dayLabel = formatDaysOfWeekList(item.daysOfWeek);
  return `${dayLabel} at ${timeStr}`;
}

function formatDaysOfWeekList(days: DayOfWeek[]): string {
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  return days
    .map(
      (d) => DAY_OF_WEEK_OPTIONS.find((opt) => opt.value === d)?.short ?? d[0],
    )
    .join(', ');
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  const minute = `${m}`.padStart(2, '0');
  return `${hour12}:${minute} ${period}`;
}
