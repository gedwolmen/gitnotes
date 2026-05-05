import { parseGoogleKeepTakeout } from '../../../src/services/import/GoogleKeepImporter';

describe('GoogleKeepImporter', () => {
  describe('parseGoogleKeepTakeout', () => {
    it('parses HTML note with corresponding JSON metadata', () => {
      const files = [
        {
          name: 'Shopping List.html',
          content: '<html><head><title>Shopping List</title></head><body><ul><li>Milk</li><li>Eggs</li></ul></body></html>',
        },
        {
          name: 'Shopping List.json',
          content: JSON.stringify({
            title: 'Shopping List',
            labels: [{ name: 'errands' }, { name: 'groceries' }],
            color: 'YELLOW',
            isPinned: true,
            createdTimestampUsec: '1609459200000000',
            userEditedTimestampUsec: '1612137600000000',
          }),
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Shopping List');
      expect(notes[0].tags).toEqual(['errands', 'groceries']);
      expect(notes[0].color).toBe('yellow');
      expect(notes[0].pinned).toBe(true);
      expect(notes[0].createdAt).toEqual(new Date(1609459200000));
      expect(notes[0].updatedAt).toEqual(new Date(1612137600000));
    });

    it('parses HTML note without JSON metadata', () => {
      const files = [
        {
          name: 'Quick Note.html',
          content: '<html><head><title>Quick Note</title></head><body><p>Some text</p></body></html>',
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Quick Note');
      expect(notes[0].tags).toEqual([]);
      expect(notes[0].content).toContain('Some text');
    });

    it('handles missing title by defaulting to Untitled', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><body><p>Just content</p></body></html>',
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Untitled');
    });

    it('converts labels to tags', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><head><title>T</title></head><body>Body</body></html>',
        },
        {
          name: 'note.json',
          content: JSON.stringify({
            labels: [{ name: 'work' }, { name: 'important' }],
          }),
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes[0].tags).toEqual(['work', 'important']);
    });

    it('handles malformed JSON gracefully', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><head><title>Test</title></head><body>Content</body></html>',
        },
        {
          name: 'note.json',
          content: 'not valid json{{{',
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Test');
    });

    it('maps Google Keep colors to note colors', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><head><title>A</title></head><body>B</body></html>',
        },
        {
          name: 'note.json',
          content: JSON.stringify({ color: 'RED' }),
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes[0].color).toBe('red');
    });

    it('returns empty array for no HTML files', () => {
      const files = [
        { name: 'readme.txt', content: 'hello' },
        { name: 'data.json', content: '{}' },
      ];

      expect(parseGoogleKeepTakeout(files)).toEqual([]);
    });

    it('converts HTML content to markdown', () => {
      const files = [
        {
          name: 'note.html',
          content: '<html><body><h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em></p><ul><li>Item 1</li><li>Item 2</li></ul></body></html>',
        },
      ];

      const notes = parseGoogleKeepTakeout(files);
      expect(notes[0].content).toContain('**bold**');
      expect(notes[0].content).toContain('*italic*');
    });
  });
});
