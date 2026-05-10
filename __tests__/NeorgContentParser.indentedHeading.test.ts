import { NeorgContentParser } from '../src/services/NeorgContentParser';

describe('NeorgContentParser indented headings (issue #659)', () => {
  test('parses leading-whitespace *** as heading', () => {
    const heading = NeorgContentParser.parseHeading('    *** Win-Back (Day 60+ inactive)');
    expect(heading).not.toBeNull();
    expect(heading!.level).toBe(3);
    expect(heading!.text).toBe('Win-Back (Day 60+ inactive)');
  });

  test('parses tab-indented heading', () => {
    const heading = NeorgContentParser.parseHeading('\t** Sub-section');
    expect(heading).not.toBeNull();
    expect(heading!.level).toBe(2);
    expect(heading!.text).toBe('Sub-section');
  });

  test('indented heading + indented body produces two blocks (heading then paragraph)', () => {
    const src = [
      '    *** Win-Back (Day 60+ inactive)',
      '        Three-email sequence. If no reply, soft-suppress for 90 days.',
    ].join('\n');
    const result = NeorgContentParser.parseContent(src);
    const headings = result.blocks!.filter((b) => b.type === 'heading');
    expect(headings).toHaveLength(1);
    expect(headings[0].heading?.text).toBe('Win-Back (Day 60+ inactive)');

    const paragraphs = result.blocks!.filter((b) => b.type === 'paragraph');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(paragraphs[0].text).toContain('Three-email sequence');
  });

  test('zero-indent heading still works (no regression)', () => {
    const heading = NeorgContentParser.parseHeading('*** Heading');
    expect(heading?.level).toBe(3);
    expect(heading?.text).toBe('Heading');
  });

  test('does not match a star inside a paragraph', () => {
    expect(NeorgContentParser.parseHeading('paragraph with * inside')).toBeNull();
  });
});
