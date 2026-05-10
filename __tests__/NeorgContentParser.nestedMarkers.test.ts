import { NeorgContentParser } from '../src/services/NeorgContentParser';

describe('NeorgContentParser nested list markers (issue #680)', () => {
  test.each([
    ['- level one', 1, 'unordered', 'level one'],
    ['-- level two', 2, 'unordered', 'level two'],
    ['--- level three', 3, 'unordered', 'level three'],
    ['---- level four', 4, 'unordered', 'level four'],
    ['~ ordered one', 1, 'ordered', 'ordered one'],
    ['~~~ ordered three', 3, 'ordered', 'ordered three'],
  ])('%p parses to %s nested', (input, expectedLevel, expectedType, expectedText) => {
    const item = NeorgContentParser.parseListItem(input);
    expect(item).not.toBeNull();
    expect(item!.type).toBe(expectedType);
    expect(item!.text).toBe(expectedText);
    expect(item!.indentLevel).toBe(expectedLevel - 1);
  });

  test('-- ( ) task is recognized as a nested task', () => {
    const item = NeorgContentParser.parseListItem('-- ( ) nested task');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('task');
    expect(item!.status).toBe('todo');
    expect(item!.text).toBe('nested task');
    expect(item!.indentLevel).toBe(1);
  });

  test('parseContent emits separate list items for -- block', () => {
    const src = [
      '- Pillar: "Deploy previews: a guide for product teams"',
      '- Supporting:',
      '-- "Deploy previews vs staging environments"',
      '-- "How to set up deploy previews for monorepos"',
      '-- "When deploy previews break (and how to fix them)"',
    ].join('\n');
    const result = NeorgContentParser.parseContent(src);
    const lists = result.blocks!.filter((b) => b.type === 'list');
    const items = lists.flatMap((b) => b.listItems ?? []);
    expect(items).toHaveLength(5);
    expect(items[2].indentLevel).toBe(1);
    expect(items[3].indentLevel).toBe(1);
    expect(items[4].indentLevel).toBe(1);

    const paragraphs = result.blocks!.filter((b) => b.type === 'paragraph');
    expect(paragraphs).toHaveLength(0);
  });

  test('preserves leading-whitespace indent on -- (combined with marker depth)', () => {
    const item = NeorgContentParser.parseListItem('    -- two spaces twice');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('unordered');
    expect(item!.text).toBe('two spaces twice');
    expect(item!.indentLevel).toBeGreaterThanOrEqual(2);
  });
});
