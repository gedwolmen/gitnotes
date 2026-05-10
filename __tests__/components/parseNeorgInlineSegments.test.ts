jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

import { parseNeorgInlineSegments } from '../../src/components/StructuredRenderer';

const segmentsOf = (input: string, type: string) =>
  parseNeorgInlineSegments(input).filter((s) => s.type === type);

describe('parseNeorgInlineSegments strike (issue #659/#660)', () => {
  test.each([
    'Win-Back (Day 60+ inactive)',
    'Re-sending broadcasts to non-openers',
    'time-to-value',
    'time-to-first-value',
    'side-by-side',
    'Bottom-of-funnel',
    'Self-hosted',
    '2026-05-30',
    'paid-influencer program in the lifestyle sense.',
  ])('does NOT strike %p', (input) => {
    expect(segmentsOf(input, 'strikethrough')).toEqual([]);
  });

  test('still strikes proper -gone- with whitespace boundaries', () => {
    const out = segmentsOf('this is -gone- already', 'strikethrough');
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toBe('gone');
  });

  test('Three-email + Win-Back across newline does not chain a strike', () => {
    const text = '*** Win-Back (Day 60+ inactive) Three-email sequence';
    expect(segmentsOf(text, 'strikethrough')).toEqual([]);
  });

  test('multi-line paragraph with hyphenated tokens leaves them all alone', () => {
    const text = [
      'Compare onboarding flows side-by-side',
      'time-to-value matters more than features.',
      'Walk through each competitor signup; time-to-first-value should be < 90s.',
    ].join('\n');
    expect(segmentsOf(text, 'strikethrough')).toEqual([]);
  });
});

describe('parseNeorgInlineSegments subscript (issue #660 comma-list bug)', () => {
  test('does NOT subscript a comma-delimited clause inside a sentence', () => {
    const text = 'one is bleeding share, one is picking fights on price, one is repositioning upmarket.';
    expect(segmentsOf(text, 'subscript')).toEqual([]);
  });

  test('does NOT subscript a list of items separated by commas', () => {
    const text = 'apple, banana, cherry, date.';
    expect(segmentsOf(text, 'subscript')).toEqual([]);
  });

  test('still subscripts properly delimited ,sub, with whitespace boundaries', () => {
    const out = segmentsOf('the index ,i, refers to row', 'subscript');
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toBe('i');
  });
});
