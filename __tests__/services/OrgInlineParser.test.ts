import { OrgInlineParser } from '../../src/services/OrgInlineParser';

describe('OrgInlineParser', () => {
  test('parses +strikethrough+', () => {
    const result = OrgInlineParser.parseInline('some +deleted+ text');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'org-strike', content: 'deleted' });
  });

  test('parses =verbatim=', () => {
    const result = OrgInlineParser.parseInline('this is =code= here');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'verbatim', content: 'code' });
  });

  test('parses ~code~', () => {
    const result = OrgInlineParser.parseInline('use ~console.log~ here');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'org-code', content: 'console.log' });
  });

  test('parses *bold*', () => {
    const result = OrgInlineParser.parseInline('this is *bold* text');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'bold', content: 'bold' });
  });

  test('parses /italic/', () => {
    const result = OrgInlineParser.parseInline('this is /italic/ text');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'italic', content: 'italic' });
  });

  test('parses _underline_', () => {
    const result = OrgInlineParser.parseInline('this is _underlined_ text');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup).toMatchObject({ type: 'underline', content: 'underlined' });
  });

  test('parses [[url][text]] link', () => {
    const result = OrgInlineParser.parseInline('click [[https://example.com][here]] now');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.content).toBe('here');
  });

  test('parses [[url]] link', () => {
    const result = OrgInlineParser.parseInline('visit [[https://example.com]] now');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.content).toBe('https://example.com');
  });

  test('parses [fn:1] footnote ref', () => {
    const result = OrgInlineParser.parseInline('see [fn:1] for details');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(1);
    expect(markups[0].markup!.content).toBe('[fn:1]');
  });

  test('respects PRE/POST boundary rules', () => {
    const result = OrgInlineParser.parseInline('word*notbold*word');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(0);
  });

  test('handles mixed markup', () => {
    const result = OrgInlineParser.parseInline('*bold* and /italic/ and =verbatim=');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(3);
    expect(markups[0].markup!.type).toBe('bold');
    expect(markups[1].markup!.type).toBe('italic');
    expect(markups[2].markup!.type).toBe('verbatim');
  });

  test('handles text with no markup', () => {
    const result = OrgInlineParser.parseInline('just plain text');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].type).toBe('text');
    expect(result.segments[0].text).toBe('just plain text');
  });

  test('handles escape: \\*not bold\\* renders literal', () => {
    const result = OrgInlineParser.parseInline('this is \\*not bold\\* text');
    const markups = result.segments.filter(s => s.type === 'markup');
    expect(markups).toHaveLength(0);
  });

  test('toMarkdown converts bold', () => {
    const result = OrgInlineParser.parseInline('*hello*');
    const md = OrgInlineParser.toMarkdown(result);
    expect(md).toBe('**hello**');
  });

  test('toMarkdown converts italic', () => {
    const result = OrgInlineParser.parseInline('/hello/');
    const md = OrgInlineParser.toMarkdown(result);
    expect(md).toBe('*hello*');
  });

  test('toReactNativeProps returns correct styles', () => {
    const result = OrgInlineParser.parseInline('*bold*');
    const props = OrgInlineParser.toReactNativeProps(result);
    expect(props).toHaveLength(1);
    expect(props[0].style).toContain('bold');
  });
});
