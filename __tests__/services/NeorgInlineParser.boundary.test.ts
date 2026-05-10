import { NeorgInlineParser } from '../../src/services/NeorgInlineParser';

const strikeMarkups = (input: string) =>
  NeorgInlineParser.parseInline(input)
    .segments.filter((s) => s.type === 'markup' && s.markup?.type === 'strikethrough');

describe('NeorgInlineParser strikethrough boundaries (issue #659)', () => {
  test.each([
    ['Win-Back (Day 60+ inactive)', 'hyphenated noun phrase'],
    ['Re-sending broadcasts to non-openers', 'multiple in-word hyphens'],
    ['time-to-value', 'multi-hyphen identifier'],
    ['2026-05-30', 'ISO date'],
    ['drop-in replacement', 'compound modifier with following word'],
  ])('does NOT strike %p (%s)', (input) => {
    expect(strikeMarkups(input)).toHaveLength(0);
  });

  test('still strikes proper -word- with surrounding whitespace', () => {
    const segments = strikeMarkups('this is -gone- already');
    expect(segments).toHaveLength(1);
    expect(segments[0].markup!.content).toBe('gone');
  });

  test('still strikes -multi word- phrase with surrounding whitespace', () => {
    const segments = strikeMarkups('and -this whole phrase- is struck');
    expect(segments).toHaveLength(1);
    expect(segments[0].markup!.content).toBe('this whole phrase');
  });

  test('strikes at line start', () => {
    const segments = strikeMarkups('-leading- word');
    expect(segments).toHaveLength(1);
    expect(segments[0].markup!.content).toBe('leading');
  });

  test('strikes before punctuation', () => {
    const segments = strikeMarkups('the word -trailing-, then more');
    expect(segments).toHaveLength(1);
    expect(segments[0].markup!.content).toBe('trailing');
  });

  test('does not over-eat across the rest of a sentence', () => {
    const out = NeorgInlineParser.toMarkdown(
      NeorgInlineParser.parseInline('Win-Back (Day 60+ inactive) Three lifecycle stages'),
    );
    expect(out).toBe('Win-Back (Day 60+ inactive) Three lifecycle stages');
  });

  test('preserves an ISO date inside a longer paragraph', () => {
    const out = NeorgInlineParser.toMarkdown(
      NeorgInlineParser.parseInline('audit by 2026-05-30 and ship'),
    );
    expect(out).toBe('audit by 2026-05-30 and ship');
  });
});
