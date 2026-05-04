import {
  toggleBold,
  toggleItalic,
  toggleHeading,
  toggleList,
  toggleChecklist,
  toggleCode,
  insertLink,
  addTab,
} from '../src/utils/markdownFormatting';

describe('toggleBold', () => {
  it('wraps selected text with **', () => {
    const result = toggleBold('hello world', { start: 0, end: 5 });
    expect(result.text).toBe('**hello** world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(9);
  });

  it('unwraps ** when selection includes markers', () => {
    const result = toggleBold('**hello** world', { start: 0, end: 9 });
    expect(result.text).toBe('hello world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(5);
  });

  it('wraps a single word', () => {
    const result = toggleBold('foo bar', { start: 4, end: 7 });
    expect(result.text).toBe('foo **bar**');
    expect(result.selection.start).toBe(4);
    expect(result.selection.end).toBe(11);
  });
});

describe('toggleItalic', () => {
  it('wraps selected text with *', () => {
    const result = toggleItalic('hello world', { start: 0, end: 5 });
    expect(result.text).toBe('*hello* world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(7);
  });

  it('unwraps * when selection includes markers', () => {
    const result = toggleItalic('*hello* world', { start: 0, end: 7 });
    expect(result.text).toBe('hello world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(5);
  });
});

describe('toggleHeading', () => {
  it('adds H1 prefix to current line', () => {
    const result = toggleHeading('my text\nmore', { start: 0, end: 0 }, 1);
    expect(result.text).toBe('# my text\nmore');
    expect(result.selection.start).toBe(2);
  });

  it('removes H1 prefix when already present', () => {
    const result = toggleHeading('# my text', { start: 0, end: 0 }, 1);
    expect(result.text).toBe('my text');
  });

  it('adds H2 prefix', () => {
    const result = toggleHeading('my text', { start: 0, end: 0 }, 2);
    expect(result.text).toBe('## my text');
  });

  it('replaces H1 with H2', () => {
    const result = toggleHeading('# my text', { start: 0, end: 0 }, 2);
    expect(result.text).toBe('## my text');
  });

  it('works on second line when cursor is there', () => {
    const result = toggleHeading('first\nsecond', { start: 6, end: 6 }, 1);
    expect(result.text).toBe('first\n# second');
  });
});

describe('toggleList', () => {
  it('adds - prefix to current line', () => {
    const result = toggleList('hello', { start: 0, end: 0 });
    expect(result.text).toBe('- hello');
  });

  it('removes - prefix when already present', () => {
    const result = toggleList('- hello', { start: 0, end: 0 });
    expect(result.text).toBe('hello');
  });
});

describe('toggleChecklist', () => {
  it('adds - [ ] prefix to current line', () => {
    const result = toggleChecklist('hello', { start: 0, end: 0 });
    expect(result.text).toBe('- [ ] hello');
  });

  it('removes - [ ] prefix when already present', () => {
    const result = toggleChecklist('- [ ] hello', { start: 0, end: 0 });
    expect(result.text).toBe('hello');
  });

  it('removes - [x] prefix (checked item)', () => {
    const result = toggleChecklist('- [x] hello', { start: 0, end: 0 });
    expect(result.text).toBe('hello');
  });
});

describe('toggleCode', () => {
  it('wraps selected text with backticks', () => {
    const result = toggleCode('hello world', { start: 0, end: 5 });
    expect(result.text).toBe('`hello` world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(7);
  });

  it('unwraps backticks when selection includes them', () => {
    const result = toggleCode('`hello` world', { start: 0, end: 7 });
    expect(result.text).toBe('hello world');
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(5);
  });
});

describe('insertLink', () => {
  it('inserts [text](url) template at cursor', () => {
    const result = insertLink('hello ', { start: 6, end: 6 });
    expect(result.text).toBe('hello [text](url)');
  });

  it('wraps selected text as link label', () => {
    const result = insertLink('hello world', { start: 6, end: 11 });
    expect(result.text).toBe('hello [world](url)');
  });
});

describe('addTab', () => {
  it('inserts two spaces at start of current line', () => {
    const result = addTab('hello', { start: 0, end: 0 });
    expect(result.text).toBe('  hello');
  });

  it('inserts two spaces at start of line when cursor is mid-line', () => {
    const result = addTab('hello', { start: 3, end: 3 });
    expect(result.text).toBe('  hello');
  });

  it('inserts at correct line when multiline', () => {
    const result = addTab('first\nsecond', { start: 6, end: 6 });
    expect(result.text).toBe('first\n  second');
  });
});
