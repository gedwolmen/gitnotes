import { createNote, filterNotesBySearch, sortNotesByUpdated } from '../../src/models/Note';

describe('filterNotesBySearch', () => {
  const makeNote = (overrides: Partial<Parameters<typeof createNote>[0]> = {}): ReturnType<typeof createNote> =>
    createNote({ title: 'Test Note', content: 'test content', tags: ['tag1'], ...overrides });

  describe('empty and whitespace queries', () => {
    it('returns all notes unchanged when query is empty string', () => {
      const notes = [makeNote({ title: 'A' }), makeNote({ title: 'B' })];
      expect(filterNotesBySearch(notes, '')).toEqual(notes);
    });

    it('returns all notes unchanged when query is only whitespace', () => {
      const notes = [makeNote({ title: 'A' }), makeNote({ title: 'B' })];
      expect(filterNotesBySearch(notes, '   ')).toEqual(notes);
    });
  });

  describe('title matching', () => {
    it('matches title substring case-insensitively', () => {
      const notes = [makeNote({ title: 'Meeting Notes' }), makeNote({ title: 'Shopping List' })];
      expect(filterNotesBySearch(notes, 'meet')).toHaveLength(1);
      expect(filterNotesBySearch(notes, 'meet')[0].title).toBe('Meeting Notes');
    });

    it('matches title for PDF format notes', () => {
      const notes = [makeNote({ title: 'Annual Report', format: 'pdf' }), makeNote({ title: 'Draft', format: 'pdf' })];
      expect(filterNotesBySearch(notes, 'annual')).toHaveLength(1);
      expect(filterNotesBySearch(notes, 'annual')[0].title).toBe('Annual Report');
    });
  });

  describe('tag matching', () => {
    it('matches tag substring case-insensitively', () => {
      const notes = [makeNote({ tags: ['work', 'urgent'] }), makeNote({ tags: ['home'] })];
      expect(filterNotesBySearch(notes, 'work')).toHaveLength(1);
    });

    it('matches tag for PDF format notes', () => {
      const notes = [makeNote({ tags: ['invoice', '2024'], format: 'pdf' }), makeNote({ tags: ['memo'], format: 'pdf' })];
      expect(filterNotesBySearch(notes, 'invoice')).toHaveLength(1);
    });
  });

  describe('content matching', () => {
    it('matches body content for markdown notes', () => {
      const notes = [makeNote({ content: 'The quarterly results are positive', format: 'markdown' })];
      expect(filterNotesBySearch(notes, 'quarterly')).toHaveLength(1);
    });

    it('matches body content for neorg notes', () => {
      const notes = [makeNote({ content: 'Project planning discussion', format: 'neorg' })];
      expect(filterNotesBySearch(notes, 'planning')).toHaveLength(1);
    });

    it('matches body content for org notes', () => {
      const notes = [makeNote({ content: 'TODO: review pull requests', format: 'org' })];
      expect(filterNotesBySearch(notes, 'review')).toHaveLength(1);
    });

    it('matches body content for txt (default) notes', () => {
      const notes = [makeNote({ content: 'Plain text note', format: undefined })];
      expect(filterNotesBySearch(notes, 'plain')).toHaveLength(1);
    });
  });

  describe('PDF format defensive skip', () => {
    it('does NOT match PDF body content even when query is present', () => {
      const pdfNote = makeNote({
        title: 'Binary Doc',
        content: '%PDF-1.4 s3cr3t+b1n4ry+d4t4+h3r3',
        format: 'pdf',
      });
      const markdownNote = makeNote({ content: 'normal markdown content' });
      const notes = [pdfNote, markdownNote];

      expect(filterNotesBySearch(notes, 's3cr3t')).toHaveLength(0);
    });

    it('matches PDF note when title contains query even if body would also match', () => {
      const pdfNote = makeNote({
        title: 'Secret PDF',
        content: '%PDF-1.4 s3cr3t+b1n4ry+d4t4',
        format: 'pdf',
      });
      expect(filterNotesBySearch([pdfNote], 'secret')).toHaveLength(1);
    });

    it('matches PDF note when tag contains query even if body would also match', () => {
      const pdfNote = makeNote({
        title: 'Data File',
        content: '%PDF-1.4 s3cr3t+b1n4ry',
        tags: ['secret-tag'],
        format: 'pdf',
      });
      expect(filterNotesBySearch([pdfNote], 'secret')).toHaveLength(1);
    });

    it('performance: does not iterate over large PDF body content', () => {
      const largePdfContent = '%PDF-1.4\n' + 'x'.repeat(1_000_000);
      const pdfNote = makeNote({
        title: 'Large PDF',
        content: largePdfContent,
        format: 'pdf',
        tags: [],
      });
      const query = 'notpresentanywhere';
      const result = filterNotesBySearch([pdfNote], query);
      expect(result).toHaveLength(0);
    });
  });
});

describe('Note timestamps', () => {
  it('preserves timestamps supplied by an import', () => {
    const createdAt = Date.parse('2024-01-15T10:00:00.000Z');
    const updatedAt = Date.parse('2025-02-20T12:00:00.000Z');

    const note = createNote({
      title: 'Imported note',
      content: 'content',
      createdAt,
      updatedAt,
    });

    expect(note.createdAt).toBe(createdAt);
    expect(note.updatedAt).toBe(updatedAt);
  });

  it('sorts notes by last-modified timestamp', () => {
    const older = createNote({ title: 'Older', content: '', updatedAt: 100 });
    const newer = createNote({ title: 'Newer', content: '', updatedAt: 200 });

    expect(sortNotesByUpdated([older, newer]).map((note) => note.title)).toEqual(['Newer', 'Older']);
  });
});
