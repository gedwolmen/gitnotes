import { Note } from '../src/models/Note';
import { buildBacklinkIndex, computeBacklinks } from '../src/services/BacklinksService';

function createNote(overrides: Partial<Note> & Pick<Note, 'id' | 'title' | 'content'>): Note {
  return {
    id: overrides.id,
    title: overrides.title,
    content: overrides.content,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    tags: overrides.tags ?? [],
    filePath: overrides.filePath,
    folderPath: overrides.folderPath,
    format: overrides.format ?? 'markdown',
  };
}

describe('BacklinksService', () => {
  it('computes basic reciprocal backlinks between notes', () => {
    const notes = [
      createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'See [[B]]' }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: 'See [[A]]' }),
    ];

    expect(computeBacklinks(notes, 'A.md')).toEqual([
      expect.objectContaining({
        sourceNoteId: 'b',
        sourceNoteTitle: 'B',
        linkText: 'A',
        snippet: 'See [[A]]',
      }),
    ]);

    expect(computeBacklinks(notes, 'B.md')).toEqual([
      expect.objectContaining({
        sourceNoteId: 'a',
        sourceNoteTitle: 'A',
        linkText: 'B',
        snippet: 'See [[B]]',
      }),
    ]);
  });

  it('returns empty backlinks when no note links to the target', () => {
    const notes = [
      createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'No links here' }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: 'Still nothing' }),
    ];

    expect(computeBacklinks(notes, 'B.md')).toEqual([]);
  });

  it('skips broken links gracefully', () => {
    const notes = [
      createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'Points to [[Missing Page]]' }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: 'Still nothing' }),
    ];

    expect(buildBacklinkIndex(notes).get('b')).toEqual([]);
  });

  it('excludes self-links from backlinks', () => {
    const notes = [createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'Self [[A]]' })];

    expect(computeBacklinks(notes, 'A.md')).toEqual([]);
  });

  it('tracks alias links and preserves the display text', () => {
    const notes = [
      createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'Link to [[B|display text]]' }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: '' }),
    ];

    expect(computeBacklinks(notes, 'B.md')).toEqual([
      expect.objectContaining({
        sourceNoteId: 'a',
        linkText: 'display text',
        snippet: 'Link to [[B|display text]]',
      }),
    ]);
  });

  it('tracks multiple matching links independently', () => {
    const notes = [
      createNote({
        id: 'a',
        title: 'A',
        filePath: 'A.md',
        content: 'First [[B]]\nSecond [[B|Beta]]',
      }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: '' }),
    ];

    expect(computeBacklinks(notes, 'B.md')).toEqual([
      expect.objectContaining({ sourceNoteId: 'a', linkText: 'B', snippet: 'First [[B]]' }),
      expect.objectContaining({ sourceNoteId: 'a', linkText: 'Beta', snippet: 'Second [[B|Beta]]' }),
    ]);
  });

  it('uses the first duplicate title match ordered by file path', () => {
    const notes = [
      createNote({ id: 'late', title: 'Alpha', filePath: 'zeta/Alpha.md', content: '' }),
      createNote({ id: 'source', title: 'Source', filePath: 'Source.md', content: 'Points at [[Alpha]]' }),
      createNote({ id: 'early', title: 'Alpha', filePath: 'alpha/Alpha.md', content: '' }),
    ];

    const index = buildBacklinkIndex(notes);

    expect(index.get('early')).toEqual([
      expect.objectContaining({ sourceNoteId: 'source', sourceNoteTitle: 'Source' }),
    ]);
    expect(index.get('late')).toEqual([]);
  });

  it('matches backlinks by filename and title case-insensitively', () => {
    const notes = [
      createNote({ id: 'a', title: 'Entry', filePath: 'folder/Entry.md', content: 'See [[target note]]' }),
      createNote({ id: 'b', title: 'Target Note', filePath: 'Target Note.md', content: '' }),
    ];

    expect(computeBacklinks(notes, 'Target Note.md')).toEqual([
      expect.objectContaining({ sourceNoteId: 'a', sourceNoteTitle: 'Entry' }),
    ]);
  });

  it('includes the source line snippet and truncates it to 120 characters', () => {
    const longPrefix = 'x'.repeat(150);
    const notes = [
      createNote({
        id: 'a',
        title: 'A',
        filePath: 'A.md',
        content: `${longPrefix} [[B]] trailing text`,
      }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: '' }),
    ];

    const [backlink] = computeBacklinks(notes, 'B.md');

    expect(backlink.snippet.length).toBeLessThanOrEqual(120);
    expect(backlink.snippet.endsWith('...')).toBe(true);
    expect(backlink.snippet).toContain('x');
  });
});
