export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

import type { GitHostProvider } from '../services/git/GitHost';

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

export type ScheduledLearningType = 'learn' | 'questioner';
export type ScheduledLearningRepeat = 'daily' | 'weekly' | 'one-time';
export type QuestionerSource = 'tags' | 'prompt' | 'folder';

export const SCHEDULED_LEARNING_TYPE_OPTIONS: { value: ScheduledLearningType; label: string; description: string; icon: string }[] = [
  { value: 'learn', label: 'Learning Notes', description: 'AI generates educational content on your topics', icon: 'school-outline' },
  { value: 'questioner', label: 'Questioner Notes', description: 'AI creates questions you can answer and get graded', icon: 'help-circle-outline' },
];

export const QUESTIONER_SOURCE_OPTIONS: { value: QuestionerSource; label: string; description: string }[] = [
  { value: 'tags', label: 'From Tags', description: 'Generate questions based on topic tags' },
  { value: 'prompt', label: 'From Prompt', description: 'Generate questions from a custom prompt' },
  { value: 'folder', label: 'From Note Folder', description: 'Generate questions from notes in a folder' },
];

export interface QuestionerFolderSelection {
  repoPath: string;
  folderPath: string;
  /** Host the repo lives on; defaults to 'github' for legacy entries. */
  provider?: GitHostProvider;
}

export interface ScheduledLearningItem {
  id: string;
  type: ScheduledLearningType;
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
  repeat: ScheduledLearningRepeat;
  isEnabled: boolean;
  lastGeneratedAt: number | null;  // Legacy: overall last generation time (still used for one-time)
  // Per-day tracking: which days have had their most recent generation.
  // Key is DayOfWeek value, value is timestamp of last generation for that day.
  dayLastGeneratedAt: Partial<Record<DayOfWeek, number>>;
  questionerSource: QuestionerSource | null;
  questionerPrompts: string[];
  questionerFolders: QuestionerFolderSelection[];
  questionerNoteFolder: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledLearningCreateInput {
  type?: ScheduledLearningType;
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
  repeat?: ScheduledLearningRepeat;
  questionerSource?: QuestionerSource | null;
  questionerPrompts?: string[];
  questionerFolders?: QuestionerFolderSelection[];
  questionerPrompt?: string;
  questionerNoteFolder?: string | null;
}

export function createScheduledLearningItem(input: ScheduledLearningCreateInput): ScheduledLearningItem {
  const now = Date.now();
  const legacyPrompt = (input.questionerPrompt ?? '').trim();
  const questionerPrompts = input.questionerPrompts
    ? input.questionerPrompts.map((p) => p.trim()).filter((p) => p.length > 0)
    : legacyPrompt.length > 0
      ? [legacyPrompt]
      : [];
  const questionerFolders = (input.questionerFolders ?? []).filter(
    (f) => !!f.repoPath && !!f.folderPath,
  );
  return {
    id: generateId(),
    type: input.type ?? 'learn',
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
    dayLastGeneratedAt: {},
    questionerSource: input.questionerSource ?? null,
    questionerPrompts,
    questionerFolders,
    questionerNoteFolder: input.questionerNoteFolder ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateScheduledLearningItem(
  existing: ScheduledLearningItem,
  updates: Partial<Omit<ScheduledLearningCreateInput, 'tags'> & { tags?: string[] }>
): ScheduledLearningItem {
  const safeExisting = {
    ...existing,
    questionerPrompts: existing.questionerPrompts ?? [],
    questionerFolders: existing.questionerFolders ?? [],
  };
  const next: ScheduledLearningItem = {
    ...safeExisting,
    ...updates,
    updatedAt: Date.now(),
  };
  if (updates.questionerPrompts) {
    next.questionerPrompts = updates.questionerPrompts
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  } else if (
    updates.questionerPrompt !== undefined &&
    safeExisting.questionerPrompts.length === 0
  ) {
    const legacy = updates.questionerPrompt.trim();
    if (legacy.length > 0) {
      next.questionerPrompts = [legacy];
    }
  }
  if (updates.questionerFolders) {
    next.questionerFolders = updates.questionerFolders.filter(
      (f) => !!f.repoPath && !!f.folderPath,
    );
  }
  return next;
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
  repeat: ScheduledLearningRepeat
): Date[] {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const dates: Date[] = [];

  const dayIndices = daysOfWeek.map(getDayOfWeekIndex).sort((a, b) => a - b);

  if (repeat !== 'daily' && dayIndices.length === 0) {
    return dates;
  }

  if (repeat === 'daily') {
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + 1);
    nextDate.setHours(hours, minutes, 0, 0);
    dates.push(nextDate);
  } else if (repeat === 'one-time') {
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

export function formatDaysOfWeek(days: DayOfWeek[], repeat?: ScheduledLearningRepeat): string {
  if (repeat === 'daily') return 'Every day';
  if (days.length === 0) return 'No days selected';
  if (days.length === 1) return DAY_OF_WEEK_OPTIONS.find((d) => d.value === days[0])?.label ?? days[0];
  if (days.length === 7) return 'Every day';
  if (days.length > 4) {
    return `${days.length} days/week`;
  }
  return days.map((d) => DAY_OF_WEEK_OPTIONS.find((opt) => opt.value === d)?.short ?? d[0]).join(', ');
}

export function getQuestionerPrompts(item: ScheduledLearningItem): string[] {
  const prompts = Array.isArray(item.questionerPrompts) ? item.questionerPrompts : [];
  if (prompts.length > 0) return prompts;
  const legacyField = (item as unknown as { questionerPrompt?: unknown }).questionerPrompt;
  const legacy = typeof legacyField === 'string' && !item.questionerNoteFolder ? legacyField : '';
  return legacy.trim().length > 0 ? [legacy.trim()] : [];
}

export function getQuestionerFolders(item: ScheduledLearningItem): QuestionerFolderSelection[] {
  const folders = Array.isArray(item.questionerFolders) ? item.questionerFolders : [];
  if (folders.length > 0) return folders;
  if (item.questionerNoteFolder && item.repoPath) {
    return [{ repoPath: item.repoPath, folderPath: item.questionerNoteFolder }];
  }
  return [];
}