export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAY_OF_WEEK_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
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
  dayOfWeek: DayOfWeek;
  time: string; // HH:mm format
  modelId: string | null;
  folderId: string | null;
  folderName: string | null; // For display
  wordCount: number;
  isEnabled: boolean;
  lastGeneratedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledLearningCreateInput {
  tags: string[];
  dayOfWeek: DayOfWeek;
  time: string;
  modelId?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  wordCount: number;
}

export function createScheduledLearningItem(input: ScheduledLearningCreateInput): ScheduledLearningItem {
  const now = Date.now();
  return {
    id: generateId(),
    tags: input.tags,
    dayOfWeek: input.dayOfWeek,
    time: input.time,
    modelId: input.modelId ?? null,
    folderId: input.folderId ?? null,
    folderName: input.folderName ?? null,
    wordCount: input.wordCount,
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

export function getNextScheduledDate(dayOfWeek: DayOfWeek, time: string): Date {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);

  const targetDayIndex = getDayOfWeekIndex(dayOfWeek);
  const currentDayIndex = (now.getDay() + 6) % 7; // Monday = 0

  let daysUntilTarget = targetDayIndex - currentDayIndex;
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7;
  }

  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntilTarget);
  nextDate.setHours(hours, minutes, 0, 0);

  return nextDate;
}