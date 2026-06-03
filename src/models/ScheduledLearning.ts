export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'monday', label: 'Monday', short: 'M' },
  { value: 'tuesday', label: 'Tuesday', short: 'T' },
  { value: 'wednesday', label: 'Wednesday', short: 'W' },
  { value: 'thursday', label: 'Thursday', short: 'T' },
  { value: 'friday', label: 'Friday', short: 'F' },
  { value: 'saturday', label: 'Saturday', short: 'S' },
  { value: 'sunday', label: 'Sunday', short: 'S' },
];

export const WORD_COUNT_OPTIONS = [
  { value: 100, label: '100 words' },
  { value: 250, label: '250 words' },
  { value: 500, label: '500 words' },
  { value: 750, label: '750 words' },
  { value: 1000, label: '1000 words' },
  { value: 1500, label: '1500 words' },
  { value: 2000, label: '2000 words' },
];

export interface ScheduledLearningItem {
  id: string;
  tags: string[];
  description: string;
  daysOfWeek: DayOfWeek[];
  time: string;
  modelId: string | null;
  folderId: string | null;
  folderName: string | null;
  folderPath: string | null;  // e.g. "notes/learning" - path within the repo
  repoPath: string | null;    // e.g. "owner/repo" - the GitHub repo
  branch: string | null;      // e.g. "main" - the branch
  wordCount: number;
  repeat: 'weekly' | 'one-time';
  isEnabled: boolean;
  lastGeneratedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledLearningCreateInput {
  tags: string[];
  description?: string;
  daysOfWeek: DayOfWeek[];
  time: string;
  modelId?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  folderPath?: string | null;
  repoPath?: string | null;
  branch?: string | null;
  wordCount: number;
  repeat?: 'weekly' | 'one-time';
}

export function createScheduledLearningItem(input: ScheduledLearningCreateInput): ScheduledLearningItem {
  const now = Date.now();
  return {
    id: generateId(),
    tags: input.tags,
    description: input.description ?? '',
    daysOfWeek: input.daysOfWeek,
    time: input.time,
    modelId: input.modelId ?? null,
    folderId: input.folderId ?? null,
    folderName: input.folderName ?? null,
    folderPath: input.folderPath ?? null,
    repoPath: input.repoPath ?? null,
    branch: input.branch ?? null,
    wordCount: input.wordCount,
    repeat: input.repeat ?? 'weekly',
    isEnabled: true,
    lastGeneratedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateScheduledLearningItem(
  existing: ScheduledLearningItem,
  updates: Partial<Omit<ScheduledLearningCreateInput, 'tags'> & { tags?: string[] }>
): ScheduledLearningItem {
  return {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };
}

function generateId(): string {
  return `sl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function getDayOfWeekIndex(day: DayOfWeek): number {
  const order: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return order.indexOf(day);
}

export function getNextScheduledDates(
  daysOfWeek: DayOfWeek[],
  time: string,
  repeat: 'weekly' | 'one-time'
): Date[] {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const dates: Date[] = [];

  const dayIndices = daysOfWeek.map(getDayOfWeekIndex).sort((a, b) => a - b);

  if (repeat === 'one-time') {
    let daysUntilClosest = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < dayIndices.length; i++) {
      const targetDayIndex = dayIndices[i];
      const currentDayIndex = (now.getDay() + 6) % 7;
      let daysUntil = targetDayIndex - currentDayIndex;
      if (daysUntil <= 0) daysUntil += 7;

      if (daysUntil < daysUntilClosest) {
        daysUntilClosest = daysUntil;
        closestIndex = i;
      }
    }

    const targetDayIndex = dayIndices[closestIndex];
    const currentDayIndex = (now.getDay() + 6) % 7;
    let daysUntilTarget = targetDayIndex - currentDayIndex;
    if (daysUntilTarget <= 0) daysUntilTarget += 7;

    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilTarget);
    nextDate.setHours(hours, minutes, 0, 0);
    dates.push(nextDate);
  } else {
    for (const targetDayIndex of dayIndices) {
      const currentDayIndex = (now.getDay() + 6) % 7;
      let daysUntil = targetDayIndex - currentDayIndex;
      if (daysUntil <= 0) daysUntil += 7;

      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      nextDate.setHours(hours, minutes, 0, 0);
      dates.push(nextDate);
    }
  }

  return dates;
}

export function formatDaysOfWeek(days: DayOfWeek[]): string {
  if (days.length === 0) return 'No days selected';
  if (days.length === 1) return DAY_OF_WEEK_OPTIONS.find((d) => d.value === days[0])?.label ?? days[0];
  if (days.length === 7) return 'Every day';
  if (days.length > 4) {
    return `${days.length} days/week`;
  }
  return days.map((d) => DAY_OF_WEEK_OPTIONS.find((opt) => opt.value === d)?.short ?? d[0]).join(', ');
}