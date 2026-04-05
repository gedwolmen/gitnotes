import { NeorgParser } from '../NeorgParser';

describe('NeorgParser', () => {
  describe('parseDocument', () => {
    it('should parse a complete Neorg document with metadata', () => {
      const content = `@document.meta
title: Test Note
description: A test description
author: John Doe
categories: [tag1, tag2, tag3]
created: 2021-09-05
version: 1.0
@end

This is the content of the note.
It can span multiple lines.`;

      const result = NeorgParser.parseDocument(content);

      expect(result.success).toBe(true);
      expect(result.document).toBeDefined();
      expect(result.document?.metadata.title).toBe('Test Note');
      expect(result.document?.metadata.description).toBe('A test description');
      expect(result.document?.metadata.author).toBe('John Doe');
      expect(result.document?.metadata.categories).toEqual(['tag1', 'tag2', 'tag3']);
      expect(result.document?.metadata.created).toBe('2021-09-05');
      expect(result.document?.metadata.version).toBe('1.0');
      expect(result.document?.content).toBe('This is the content of the note.\nIt can span multiple lines.');
    });

    it('should handle documents without metadata', () => {
      const content = `Just regular content
without any metadata block`;

      const result = NeorgParser.parseDocument(content);

      expect(result.success).toBe(true);
      expect(result.document?.metadata).toEqual({});
      expect(result.document?.content).toBe('Just regular content\nwithout any metadata block');
    });

    it('should validate required fields when option is set', () => {
      const content = `@document.meta
author: John Doe
@end

Content here`;

      const result = NeorgParser.parseDocument(content, { validateRequired: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required field');
    });
  });

  describe('parseMetadata', () => {
    it('should parse array values correctly', () => {
      const block = `@document.meta
categories: [neorg, notes, parser]
@end`;

      const metadata = NeorgParser.parseMetadata(block);

      expect(metadata.categories).toEqual(['neorg', 'notes', 'parser']);
    });

    it('should handle empty arrays', () => {
      const block = `@document.meta
categories: []
@end`;

      const metadata = NeorgParser.parseMetadata(block);

      expect(metadata.categories).toEqual([]);
    });

    it('should ignore custom fields by default', () => {
      const block = `@document.meta
title: Test
custom: value
@end`;

      const metadata = NeorgParser.parseMetadata(block);

      expect(metadata.title).toBe('Test');
      expect(metadata.custom).toBeUndefined();
    });

    it('should include custom fields when option is set', () => {
      const block = `@document.meta
title: Test
custom: value
@end`;

      const metadata = NeorgParser.parseMetadata(block, { includeCustomFields: true });

      expect(metadata.title).toBe('Test');
      expect(metadata.custom).toBe('value');
    });
  });

  describe('parseValue', () => {
    it('should parse array syntax', () => {
      const result = NeorgParser.parseValue('[a, b, c]');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should parse empty array', () => {
      const result = NeorgParser.parseValue('[]');
      expect(result).toEqual([]);
    });

    it('should parse string values', () => {
      const result = NeorgParser.parseValue('simple string');
      expect(result).toBe('simple string');
    });
  });

  describe('metadataToNoteProperties', () => {
    it('should convert NeorgMetadata to Note properties', () => {
      const metadata = {
        title: 'My Note',
        description: 'Note content',
        categories: ['important', 'work'],
        created: '2021-09-05',
      };

      const noteProps = NeorgParser.metadataToNoteProperties(metadata);

      expect(noteProps.title).toBe('My Note');
      expect(noteProps.content).toBe('Note content');
      expect(noteProps.tags).toEqual(['important', 'work']);
      expect(noteProps.createdAt).toBe(new Date('2021-09-05').getTime());
    });

    it('should handle missing optional fields', () => {
      const metadata = {};

      const noteProps = NeorgParser.metadataToNoteProperties(metadata);

      expect(noteProps.title).toBe('Untitled');
      expect(noteProps.content).toBe('');
      expect(noteProps.tags).toEqual([]);
      expect(noteProps.createdAt).toBeUndefined();
    });
  });
});