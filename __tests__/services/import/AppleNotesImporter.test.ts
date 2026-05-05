import { parseAppleNotesExport } from '../../../src/services/import/AppleNotesImporter';

describe('AppleNotesImporter', () => {
  describe('parseAppleNotesExport', () => {
    it('parses plain text file with title from first line', () => {
      const files = [
        {
          name: 'Meeting Notes.txt',
          content: 'Team Standup\nDiscussed project timeline\nAction items: finish API',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Team Standup');
      expect(notes[0].content).toBe('Discussed project timeline\nAction items: finish API');
    });

    it('parses HTML file with title from title tag', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><head><title>My Note</title></head><body><p>Hello world</p></body></html>',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('My Note');
      expect(notes[0].content).toContain('Hello world');
    });

    it('uses filename as title when content is empty', () => {
      const files = [
        {
          name: 'Random Thoughts.txt',
          content: '',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].title).toBe('Random Thoughts');
    });

    it('uses first line as title for single-line text files', () => {
      const files = [
        {
          name: 'Random Thoughts.txt',
          content: 'Just some thoughts',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].title).toBe('Just some thoughts');
    });

    it('extracts folder from relative path as tag', () => {
      const files = [
        {
          name: 'note.txt',
          content: 'Title\nContent',
          relativePath: 'Work Projects/note.txt',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].tags).toEqual(['Work Projects']);
      expect(notes[0].folder).toBe('Work Projects');
    });

    it('handles nested folder paths', () => {
      const files = [
        {
          name: 'note.txt',
          content: 'Title\nContent',
          relativePath: 'Work/Projects/note.txt',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].folder).toBe('Work/Projects');
      expect(notes[0].tags).toEqual(['Work/Projects']);
    });

    it('ignores unsupported file types', () => {
      const files = [
        { name: 'photo.jpg', content: 'binary' },
        { name: 'data.pdf', content: 'binary' },
      ];

      expect(parseAppleNotesExport(files)).toEqual([]);
    });

    it('converts HTML content to markdown', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><body><h2>Section</h2><p>Text with <a href="https://example.com">link</a></p></body></html>',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].content).toContain('## Section');
      expect(notes[0].content).toContain('[link](https://example.com)');
    });

    it('handles empty text file', () => {
      const files = [
        { name: 'empty.txt', content: '' },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('empty');
    });

    it('parses multiple files', () => {
      const files = [
        { name: 'note1.txt', content: 'First\nContent 1' },
        { name: 'note2.txt', content: 'Second\nContent 2' },
        { name: 'note3.html', content: '<html><head><title>Third</title></head><body><p>Content 3</p></body></html>' },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes).toHaveLength(3);
      expect(notes.map((n) => n.title)).toEqual(['First', 'Second', 'Third']);
    });

    it('handles .htm extension', () => {
      const files = [
        {
          name: 'old-note.htm',
          content: '<html><head><title>Old</title></head><body><p>Legacy</p></body></html>',
        },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Old');
    });

    it('has no tags when no folder', () => {
      const files = [
        { name: 'note.txt', content: 'Title\nBody' },
      ];

      const notes = parseAppleNotesExport(files);
      expect(notes[0].tags).toEqual([]);
    });
  });
});
