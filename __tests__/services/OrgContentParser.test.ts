import { OrgContentParser } from '../../src/services/OrgContentParser';

describe('OrgContentParser', () => {
  describe('Headings', () => {
    test('parses plain heading', () => {
      const result = OrgContentParser.parseContent('* Hello world');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({
        type: 'heading',
        heading: { level: 1, text: 'Hello world' },
      });
    });

    test('parses heading with TODO keyword', () => {
      const result = OrgContentParser.parseContent('* TODO Buy groceries');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        level: 1,
        text: 'Buy groceries',
        todoState: 'TODO',
      });
    });

    test('parses heading with DONE keyword', () => {
      const result = OrgContentParser.parseContent('* DONE Finish report');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        text: 'Finish report',
        todoState: 'DONE',
      });
    });

    test('parses heading with priority [#A]', () => {
      const result = OrgContentParser.parseContent('* TODO [#A] Urgent task');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        text: 'Urgent task',
        todoState: 'TODO',
        priority: 'A',
      });
    });

    test('parses heading with tags :tag1:tag2:', () => {
      const result = OrgContentParser.parseContent('* Heading :work:urgent:');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        text: 'Heading',
        tags: ['work', 'urgent'],
      });
    });

    test('parses heading with all metadata: TODO [#A] text :work:urgent:', () => {
      const result = OrgContentParser.parseContent('* TODO [#A] Critical item :work:urgent:');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        text: 'Critical item',
        todoState: 'TODO',
        priority: 'A',
        tags: ['work', 'urgent'],
      });
    });

    test('parses COMMENT heading', () => {
      const result = OrgContentParser.parseContent('* COMMENT Hidden section');
      expect(result.success).toBe(true);
      expect(result.blocks![0].heading).toMatchObject({
        text: 'Hidden section',
        commented: true,
      });
    });

    test('parses multi-level headings (** heading)', () => {
      const input = '* Level 1\n** Level 2\n*** Level 3\n**** Level 4';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      expect(result.blocks![0].heading!.level).toBe(1);
      expect(result.blocks![1].heading!.level).toBe(2);
      expect(result.blocks![2].heading!.level).toBe(3);
      expect(result.blocks![3].heading!.level).toBe(4);
    });
  });

  describe('Lists', () => {
    test('parses - unordered items', () => {
      const result = OrgContentParser.parseContent('- item one\n- item two');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({ type: 'list' });
      expect(result.blocks![0].listItems).toHaveLength(2);
      expect(result.blocks![0].listItems![0]).toMatchObject({ type: 'unordered', text: 'item one' });
    });

    test('parses + unordered items', () => {
      const result = OrgContentParser.parseContent('+ item one\n+ item two');
      expect(result.success).toBe(true);
      expect(result.blocks![0].listItems![0]).toMatchObject({ type: 'unordered', text: 'item one' });
    });

    test('parses 1. ordered items', () => {
      const result = OrgContentParser.parseContent('1. first\n2. second');
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({ type: 'list' });
      expect(result.blocks![0].listItems![0]).toMatchObject({ type: 'ordered', text: 'first' });
      expect(result.blocks![0].listItems![1]).toMatchObject({ type: 'ordered', text: 'second' });
    });

    test('parses 1) ordered items', () => {
      const result = OrgContentParser.parseContent('1) first\n2) second');
      expect(result.success).toBe(true);
      expect(result.blocks![0].listItems![0]).toMatchObject({ type: 'ordered', text: 'first' });
    });

    test('parses - Term :: definition description lists', () => {
      const result = OrgContentParser.parseContent('- Apple :: A fruit\n- Banana :: Another fruit');
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({ type: 'definition' });
      expect(result.blocks![0].definitionItems).toHaveLength(2);
      expect(result.blocks![0].definitionItems![0]).toMatchObject({ term: 'Apple', definition: 'A fruit' });
    });

    test('parses nested lists via indentation', () => {
      const input = '- top\n  - nested\n    - deep';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks![0].listItems).toHaveLength(3);
      expect(result.blocks![0].listItems![0]!.indentLevel).toBe(0);
      expect(result.blocks![0].listItems![1]!.indentLevel).toBe(1);
      expect(result.blocks![0].listItems![2]!.indentLevel).toBe(2);
    });
  });

  describe('Checklists', () => {
    test('parses - [ ] unchecked', () => {
      const result = OrgContentParser.parseContent('- [ ] Todo item');
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({ type: 'checklist' });
      expect(result.blocks![0].checklistItems![0]).toMatchObject({ text: 'Todo item', checked: false });
    });

    test('parses - [X] checked', () => {
      const result = OrgContentParser.parseContent('- [X] Done item');
      expect(result.success).toBe(true);
      expect(result.blocks![0].checklistItems![0]).toMatchObject({ text: 'Done item', checked: true });
    });

    test('parses - [-] partial', () => {
      const result = OrgContentParser.parseContent('- [-] Partial item');
      expect(result.success).toBe(true);
      expect(result.blocks![0].checklistItems![0]).toMatchObject({ text: 'Partial item', checked: false });
    });
  });

  describe('Block Elements', () => {
    test('parses #+BEGIN_SRC with language', () => {
      const input = '#+BEGIN_SRC javascript\nconsole.log("hi");\n#+END_SRC';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({
        type: 'code',
        code: { language: 'javascript', content: 'console.log("hi");' },
      });
    });

    test('parses #+BEGIN_QUOTE', () => {
      const input = '#+BEGIN_QUOTE\nTo be or not to be.\n#+END_QUOTE';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({
        type: 'quote',
        text: 'To be or not to be.',
      });
    });

    test('parses #+BEGIN_VERSE as quote', () => {
      const input = '#+BEGIN_VERSE\nRoses are red\n#+END_VERSE';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({ type: 'quote' });
    });

    test('parses #+BEGIN_EXPORT as code', () => {
      const input = '#+BEGIN_EXPORT html\n<div>hello</div>\n#+END_EXPORT';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({
        type: 'code',
        code: { language: 'html', content: '<div>hello</div>' },
      });
    });

    test('parses #+BEGIN_EXAMPLE as code', () => {
      const input = '#+BEGIN_EXAMPLE\nsome example\n#+END_EXAMPLE';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({
        type: 'code',
        code: { content: 'some example' },
      });
    });
  });

  describe('Drawers', () => {
    test('parses :PROPERTIES: drawer with key-value pairs', () => {
      const input = ':PROPERTIES:\n:CREATED: [2025-01-01]\n:END:';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({ type: 'drawer' });
      expect(result.blocks![0].drawer!.name).toBe('PROPERTIES');
      expect(result.blocks![0].drawer!.properties).toMatchObject({ CREATED: '[2025-01-01]' });
    });

    test('parses custom drawer', () => {
      const input = ':LOGBOOK:\n:Entry: Something happened\n:END:';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks![0].drawer!.name).toBe('LOGBOOK');
      expect(result.blocks![0].drawer!.properties.Entry).toBe('Something happened');
    });
  });

  describe('Timestamps', () => {
    test('parses SCHEDULED timestamp', () => {
      const result = OrgContentParser.parseContent('SCHEDULED: <2025-06-15>');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({
        type: 'timestamp',
        timestamp: { type: 'scheduled', date: '2025-06-15' },
      });
    });

    test('parses DEADLINE timestamp', () => {
      const result = OrgContentParser.parseContent('DEADLINE: <2025-12-31>');
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({
        type: 'timestamp',
        timestamp: { type: 'deadline', date: '2025-12-31' },
      });
    });

    test('parses CLOSED timestamp', () => {
      const result = OrgContentParser.parseContent('CLOSED: [2025-01-01]');
      expect(result.success).toBe(true);
      expect(result.blocks![0]).toMatchObject({
        type: 'timestamp',
        timestamp: { type: 'closed', date: '2025-01-01' },
      });
    });
  });

  describe('Skipped Elements', () => {
    test('skips # comment lines', () => {
      const result = OrgContentParser.parseContent('# This is a comment\nHello');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0].type).toBe('paragraph');
    });

    test('skips #+TITLE: lines', () => {
      const result = OrgContentParser.parseContent('#+TITLE: My Document\nHello');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0].type).toBe('paragraph');
      expect(result.blocks![0].text).toBe('Hello');
    });

    test('skips CLOCK: entries', () => {
      const result = OrgContentParser.parseContent('CLOCK: [2025-01-01 Thu 10:00]--[2025-01-01 Thu 11:00] => 1:00\nHello');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0].type).toBe('paragraph');
    });

    test('skips state change lines', () => {
      const result = OrgContentParser.parseContent('- State "DONE" from "TODO" [2025-01-01]\nHello');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0].type).toBe('paragraph');
    });
  });

  describe('Other Elements', () => {
    test('parses fixed-width : text lines', () => {
      const input = ': This is fixed-width\n: Another line';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({
        type: 'fixed-width',
        text: 'This is fixed-width\nAnother line',
      });
    });

    test('parses tables with header', () => {
      const input = '| Name | Age |\n|---+---|\n| Alice | 30 |';
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({ type: 'table' });
      expect(result.blocks![0].tableRows).toHaveLength(2);
    });

    test('parses horizontal rule ----- (5+ dashes)', () => {
      const result = OrgContentParser.parseContent('-----');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0].type).toBe('divider');
    });

    test('parses paragraphs', () => {
      const result = OrgContentParser.parseContent('This is a paragraph.');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks![0]).toMatchObject({ type: 'paragraph', text: 'This is a paragraph.' });
    });

    test('handles empty content', () => {
      const result = OrgContentParser.parseContent('');
      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(0);
    });

    test('handles mixed document', () => {
      const input = `* TODO [#A] Project :work:

SCHEDULED: <2025-06-01>

- Task one
- Task two

#+BEGIN_SRC python
print("hello")
#+END_SRC

Some paragraph text.

-----`;
      const result = OrgContentParser.parseContent(input);
      expect(result.success).toBe(true);
      const types = result.blocks!.map(b => b.type);
      expect(types).toContain('heading');
      expect(types).toContain('timestamp');
      expect(types).toContain('list');
      expect(types).toContain('code');
      expect(types).toContain('paragraph');
      expect(types).toContain('divider');
    });
  });
});
