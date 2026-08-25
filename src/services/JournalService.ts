import { format, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { Note, NoteCreateInput } from '../models/Note';

const JOURNAL_TAG = 'journal';
const JOURNAL_FOLDER = 'journals';
const LEGACY_JOURNAL_FOLDER = 'journal';
const JOURNAL_TITLE_PREFIX = 'Journal ';

function isUnderJournalFolder(path: string | undefined): boolean {
  if (!path) return false;
  const normalized = path.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  return (
    normalized === JOURNAL_FOLDER ||
    normalized.startsWith(`${JOURNAL_FOLDER}/`) ||
    normalized === LEGACY_JOURNAL_FOLDER ||
    normalized.startsWith(`${LEGACY_JOURNAL_FOLDER}/`)
  );
}

export function formatJournalDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function journalNoteTitle(date: Date): string {
  return `${JOURNAL_TITLE_PREFIX}${formatJournalDate(date)}`;
}

export function isJournalEntry(note: Note): boolean {
  return isUnderJournalFolder(note.filePath) || isUnderJournalFolder(note.folderPath);
}

export function getJournalEntries(notes: Note[], startDate: Date, endDate: Date): Note[] {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  return notes
    .filter((note) => {
      if (!isJournalEntry(note)) return false;
      const noteDate = parseJournalDateFromTitle(note.title);
      if (!noteDate) return false;
      return isWithinInterval(noteDate, { start, end });
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function parseJournalDateFromTitle(title: string): Date | null {
  if (!title.startsWith(JOURNAL_TITLE_PREFIX)) return null;
  const dateStr = title.slice(JOURNAL_TITLE_PREFIX.length);
  try {
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function findJournalEntry(notes: Note[], date: Date): Note | undefined {
  const title = journalNoteTitle(date);
  return notes.find(
    (note) => isJournalEntry(note) && note.title === title,
  );
}

export function buildJournalNoteInput(date: Date, content: string = ''): NoteCreateInput {
  return {
    title: journalNoteTitle(date),
    content,
    tags: [JOURNAL_TAG],
    folderPath: JOURNAL_FOLDER,
    format: 'markdown',
  };
}

export function buildJournalEditorParams(date: Date) {
  return {
    initialTitle: journalNoteTitle(date),
    initialContent: '',
    initialTags: [JOURNAL_TAG],
    folderPath: JOURNAL_FOLDER,
    format: 'markdown' as const,
  };
}
