import {
  isJournalEntry,
  getJournalEntries,
  findJournalEntry,
  journalNoteTitle,
  formatJournalDate,
  parseJournalDateFromTitle,
  buildJournalNoteInput,
} from '../../src/services/JournalService';
import { Note } from '../../src/models/Note';

const baseNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'T',
  content: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tags: [],
  ...overrides,
});

describe('formatJournalDate', () => {
  test('formats date as YYYY-MM-DD', () => {
    const date = new Date(2026, 4, 5);
    expect(formatJournalDate(date)).toBe('2026-05-05');
  });
});

describe('journalNoteTitle', () => {
  test('prefixes formatted date with Journal', () => {
    const date = new Date(2026, 4, 5);
    expect(journalNoteTitle(date)).toBe('Journal 2026-05-05');
  });
});

describe('isJournalEntry', () => {
  test('returns true for notes under the journals folder', () => {
    const note = baseNote({ filePath: 'journals/2026-05-05.md' });
    expect(isJournalEntry(note)).toBe(true);
  });

  test('returns true for a new journal with a journals folderPath', () => {
    const note = baseNote({ folderPath: 'journals' });
    expect(isJournalEntry(note)).toBe(true);
  });

  test('keeps legacy Journal folder entries discoverable', () => {
    const note = baseNote({ filePath: 'Journal/2026-05-05.md' });
    expect(isJournalEntry(note)).toBe(true);
  });

  test('returns false for a tagged note outside the journals folder', () => {
    const note = baseNote({ tags: ['journal'], filePath: 'notes/meeting.md' });
    expect(isJournalEntry(note)).toBe(false);
  });

  test('returns false for an untagged note outside the journals folder', () => {
    const note = baseNote({ tags: [], filePath: 'notes/meeting.md' });
    expect(isJournalEntry(note)).toBe(false);
  });
});

describe('parseJournalDateFromTitle', () => {
  test('parses valid journal title', () => {
    const result = parseJournalDateFromTitle('Journal 2026-05-05');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(4);
    expect(result!.getDate()).toBe(5);
  });

  test('returns null for non-journal title', () => {
    expect(parseJournalDateFromTitle('My Note')).toBeNull();
  });

  test('returns null for journal title with invalid date', () => {
    expect(parseJournalDateFromTitle('Journal not-a-date')).toBeNull();
  });
});

describe('findJournalEntry', () => {
  test('finds existing entry for a given date', () => {
    const note = baseNote({
      title: 'Journal 2026-05-05',
      tags: ['journal'],
      filePath: 'journals/2026-05-05.md',
      createdAt: new Date(2026, 4, 5).getTime(),
    });
    const result = findJournalEntry([note], new Date(2026, 4, 5));
    expect(result).toBe(note);
  });

  test('returns undefined when no entry exists for the date', () => {
    const note = baseNote({
      title: 'Journal 2026-05-04',
      tags: ['journal'],
      filePath: 'journals/2026-05-04.md',
    });
    const result = findJournalEntry([note], new Date(2026, 4, 5));
    expect(result).toBeUndefined();
  });

  test('does not match non-journal notes with same title', () => {
    const note = baseNote({
      title: 'Journal 2026-05-05',
      tags: ['personal'],
      filePath: 'notes/Journal 2026-05-05.md',
    });
    const result = findJournalEntry([note], new Date(2026, 4, 5));
    expect(result).toBeUndefined();
  });
});

describe('getJournalEntries', () => {
  test('returns journal entries within date range', () => {
    const may3 = baseNote({
      id: 'may3',
      title: 'Journal 2026-05-03',
      tags: ['journal'],
      filePath: 'journals/2026-05-03.md',
      createdAt: new Date(2026, 4, 3).getTime(),
    });
    const may5 = baseNote({
      id: 'may5',
      title: 'Journal 2026-05-05',
      tags: ['journal'],
      filePath: 'journals/2026-05-05.md',
      createdAt: new Date(2026, 4, 5).getTime(),
    });
    const may10 = baseNote({
      id: 'may10',
      title: 'Journal 2026-05-10',
      tags: ['journal'],
      filePath: 'journals/2026-05-10.md',
      createdAt: new Date(2026, 4, 10).getTime(),
    });
    const nonJournal = baseNote({
      id: 'other',
      title: 'Some other note',
      tags: [],
      createdAt: new Date(2026, 4, 4).getTime(),
    });

    const result = getJournalEntries(
      [may3, may5, may10, nonJournal],
      new Date(2026, 4, 1),
      new Date(2026, 4, 7),
    );
    expect(result.map((n) => n.id)).toEqual(['may5', 'may3']);
  });

  test('returns empty array when no entries in range', () => {
    const note = baseNote({
      title: 'Journal 2026-01-01',
      tags: ['journal'],
      filePath: 'journals/2026-01-01.md',
      createdAt: new Date(2026, 0, 1).getTime(),
    });
    const result = getJournalEntries([note], new Date(2026, 4, 1), new Date(2026, 4, 7));
    expect(result).toEqual([]);
  });
});

describe('buildJournalNoteInput', () => {
  test('builds correct input for a date', () => {
    const date = new Date(2026, 4, 5);
    const input = buildJournalNoteInput(date);
    expect(input.title).toBe('Journal 2026-05-05');
    expect(input.tags).toEqual(['journal']);
    expect(input.folderPath).toBe('journals');
    expect(input.format).toBe('markdown');
    expect(input.content).toBe('');
  });

  test('accepts initial content', () => {
    const date = new Date(2026, 4, 5);
    const input = buildJournalNoteInput(date, 'Hello world');
    expect(input.content).toBe('Hello world');
  });
});
