import { createNote, sortNotesByUpdated } from '../../src/models/Note';

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
