import {
  createNote,
  updateNote,
  sortNotesByUpdated,
  sortNotesWithPinnedFirst,
  filterNotesBySearch,
  filterNotesByFolder,
  getNotesInFolderAndSubfolders,
  getNoteFileExtension,
  isNeorgNote,
  getSupportedFileExtensions,
  isSupportedFileExtension,
  deriveFolderPath,
  Note,
} from '../src/models/Note';

const baseNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'T',
  content: '',
  createdAt: 0,
  updatedAt: 0,
  tags: [],
  ...overrides,
});

describe('createNote', () => {
  test('fills required fields and defaults', () => {
    const n = createNote({ title: 'A', content: 'body' });
    expect(n.title).toBe('A');
    expect(n.content).toBe('body');
    expect(n.tags).toEqual([]);
    expect(n.attachments).toEqual([]);
    expect(n.isPinned).toBe(false);
    expect(n.format).toBe('markdown');
    expect(n.id).toMatch(/^\d+-[a-z0-9]+$/);
    expect(n.createdAt).toBe(n.updatedAt);
  });

  test('preserves provided overrides', () => {
    const n = createNote({
      title: 'A',
      content: '',
      tags: ['x'],
      isPinned: true,
      format: 'neorg',
      repo: 'o/r',
      branch: 'dev',
    });
    expect(n.tags).toEqual(['x']);
    expect(n.isPinned).toBe(true);
    expect(n.format).toBe('neorg');
    expect(n.repo).toBe('o/r');
    expect(n.branch).toBe('dev');
  });
});

describe('updateNote', () => {
  test('overrides only the supplied fields', () => {
    const original = baseNote({ title: 'old', content: 'oldc', tags: ['a'] });
    const next = updateNote(original, { title: 'new' });
    expect(next.title).toBe('new');
    expect(next.content).toBe('oldc');
    expect(next.tags).toEqual(['a']);
  });

  test('always bumps updatedAt', () => {
    const original = baseNote({ updatedAt: 1 });
    const next = updateNote(original, {});
    expect(next.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
  });
});

describe('sort helpers', () => {
  test('sortNotesByUpdated newest first', () => {
    const notes = [
      baseNote({ id: 'a', updatedAt: 1 }),
      baseNote({ id: 'b', updatedAt: 3 }),
      baseNote({ id: 'c', updatedAt: 2 }),
    ];
    expect(sortNotesByUpdated(notes).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  test('sortNotesWithPinnedFirst pins float to top, then by updatedAt', () => {
    const notes = [
      baseNote({ id: 'old', updatedAt: 1 }),
      baseNote({ id: 'pinned-old', updatedAt: 1, isPinned: true }),
      baseNote({ id: 'new', updatedAt: 9 }),
      baseNote({ id: 'pinned-new', updatedAt: 9, isPinned: true }),
    ];
    expect(sortNotesWithPinnedFirst(notes).map((n) => n.id)).toEqual([
      'pinned-new',
      'pinned-old',
      'new',
      'old',
    ]);
  });
});

describe('filterNotesBySearch', () => {
  test('returns all when query is blank', () => {
    const notes = [baseNote({ id: 'a' }), baseNote({ id: 'b' })];
    expect(filterNotesBySearch(notes, '')).toEqual(notes);
    expect(filterNotesBySearch(notes, '   ')).toEqual(notes);
  });

  test('matches title, content, or tag (case-insensitive)', () => {
    const notes = [
      baseNote({ id: 'a', title: 'Hello world', content: '' }),
      baseNote({ id: 'b', title: '', content: 'totally relevant' }),
      baseNote({ id: 'c', title: '', content: '', tags: ['react'] }),
      baseNote({ id: 'd', title: 'unrelated', content: 'nope' }),
    ];
    expect(filterNotesBySearch(notes, 'WORLD').map((n) => n.id)).toEqual(['a']);
    expect(filterNotesBySearch(notes, 'relevant').map((n) => n.id)).toEqual(['b']);
    expect(filterNotesBySearch(notes, 'react').map((n) => n.id)).toEqual(['c']);
  });
});

describe('filterNotesByFolder', () => {
  test('returns all when folderPath is null/undefined', () => {
    const notes = [baseNote({ id: 'a', folderPath: '/foo' }), baseNote({ id: 'b' })];
    expect(filterNotesByFolder(notes, null)).toEqual(notes);
  });

  test('matches normalized paths (leading slash, trailing slash, blanks)', () => {
    const notes = [
      baseNote({ id: 'a', folderPath: '/foo' }),
      baseNote({ id: 'b', folderPath: 'foo/' }),
      baseNote({ id: 'c', folderPath: '/foo/bar' }),
      baseNote({ id: 'd' }),
    ];
    expect(filterNotesByFolder(notes, 'foo').map((n) => n.id)).toEqual(['a', 'b']);
    expect(filterNotesByFolder(notes, '/foo/').map((n) => n.id)).toEqual(['a', 'b']);
  });

  test('skips notes with no folderPath', () => {
    const notes = [baseNote({ id: 'a' }), baseNote({ id: 'b', folderPath: '/foo' })];
    expect(filterNotesByFolder(notes, '/foo').map((n) => n.id)).toEqual(['b']);
  });
});

describe('getNotesInFolderAndSubfolders', () => {
  test('matches the folder and any descendants', () => {
    const notes = [
      baseNote({ id: 'a', folderPath: '/foo' }),
      baseNote({ id: 'b', folderPath: '/foo/bar' }),
      baseNote({ id: 'c', folderPath: '/foobar' }),
      baseNote({ id: 'd', folderPath: '/other' }),
    ];
    expect(getNotesInFolderAndSubfolders(notes, '/foo').map((n) => n.id)).toEqual(['a', 'b']);
  });

  test('treats notes with no folderPath as root', () => {
    const notes = [baseNote({ id: 'a' }), baseNote({ id: 'b', folderPath: '/x' })];
    expect(getNotesInFolderAndSubfolders(notes, '/').map((n) => n.id)).toEqual(['a']);
  });
});

describe('format helpers', () => {
  test('getNoteFileExtension maps formats', () => {
    expect(getNoteFileExtension('markdown')).toBe('.md');
    expect(getNoteFileExtension('neorg')).toBe('.norg');
    expect(getNoteFileExtension('org')).toBe('.org');
    expect(getNoteFileExtension('pdf')).toBe('.pdf');
    expect(getNoteFileExtension(undefined)).toBe('.md');
  });

  test('isNeorgNote', () => {
    expect(isNeorgNote(baseNote({ format: 'neorg' }))).toBe(true);
    expect(isNeorgNote(baseNote({ format: 'markdown' }))).toBe(false);
    expect(isNeorgNote(baseNote())).toBe(false);
  });

  test('getSupportedFileExtensions / isSupportedFileExtension', () => {
    expect(getSupportedFileExtensions()).toEqual(['.md', '.norg', '.org', '.pdf', '.json']);
    expect(isSupportedFileExtension('a.md')).toBe(true);
    expect(isSupportedFileExtension('A.PDF')).toBe(true);
    expect(isSupportedFileExtension('a.txt')).toBe(false);
  });
});

describe('deriveFolderPath', () => {
  test('returns parent directory of a file path', () => {
    expect(deriveFolderPath('a/b/c.md')).toBe('a/b');
  });

  test('returns undefined for top-level files or empty input', () => {
    expect(deriveFolderPath(undefined)).toBeUndefined();
    expect(deriveFolderPath('')).toBeUndefined();
    expect(deriveFolderPath('a.md')).toBeUndefined();
    expect(deriveFolderPath('/a.md')).toBeUndefined();
  });
});
