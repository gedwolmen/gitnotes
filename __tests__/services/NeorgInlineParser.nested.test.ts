import { NeorgInlineParser } from '../../src/services/NeorgInlineParser';

describe('NeorgInlineParser - Nested Markup', () => {
  test('parses */bold italic/* as bold wrapping italic', () => {
    const result = NeorgInlineParser.parseInline('*/bold italic/*');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.type).toBe('bold');
    expect(markups[0].markup!.content).toBe('/bold italic/');
    expect(markups[0].markup!.children).toBeDefined();
    expect(markups[0].markup!.children![0].type).toBe('italic');
  });

  test('parses _/underline italic/_ as underline wrapping italic', () => {
    const result = NeorgInlineParser.parseInline('_/underline italic/_');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.type).toBe('underline');
    expect(markups[0].markup!.children).toBeDefined();
    expect(markups[0].markup!.children![0].type).toBe('italic');
  });

  test('handles escape: \\*not bold\\* renders literal', () => {
    const result = NeorgInlineParser.parseInline('this is \\*not bold\\* ok');
    const fullText = result.segments.map(s => s.type === 'text' ? s.text : s.markup?.content).join('');
    expect(fullText).toContain('not bold');
  });

  test('handles escape: \\/not italic\\/ renders literal', () => {
    const result = NeorgInlineParser.parseInline('this is \\/not italic\\/ ok');
    const fullText = result.segments.map(s => s.type === 'text' ? s.text : s.markup?.content).join('');
    expect(fullText).toContain('not italic');
  });

  test('single-level markup still works', () => {
    const result = NeorgInlineParser.parseInline('*just bold*');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.type).toBe('bold');
    expect(markups[0].markup!.content).toBe('just bold');
  });

  test('handles empty markup gracefully', () => {
    const result = NeorgInlineParser.parseInline('before ** after');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(0);
  });

  test('handles unclosed markup as text', () => {
    const result = NeorgInlineParser.parseInline('this *is not closed');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(0);
    expect(result.segments[0].text).toBe('this *is not closed');
  });

  test('parses nested bold-italic with surrounding text', () => {
    const result = NeorgInlineParser.parseInline('hello */nested world/* bye');
    const textSegs = result.segments.filter(s => s.type === 'text');
    expect(textSegs[0].text).toBe('hello ');
    expect(textSegs[1].text).toBe(' bye');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.children).toBeDefined();
  });

  test('toMarkdown converts bold', () => {
    const result = NeorgInlineParser.parseInline('*hello*');
    const md = NeorgInlineParser.toMarkdown(result);
    expect(md).toBe('**hello**');
  });

  test('toMarkdown converts code', () => {
    const result = NeorgInlineParser.parseInline('`code`');
    const md = NeorgInlineParser.toMarkdown(result);
    expect(md).toBe('`code`');
  });
});
