jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { parseOrgInlineSegments } from '../../src/components/StructuredRenderer';

const ofType = (input: string, type: string) =>
  parseOrgInlineSegments(input).filter((s) => s.type === type);

describe('parseOrgInlineSegments (issue #681)', () => {
  test('does NOT match a comma-delimited clause as subscript', () => {
    const text = 'one is bleeding share, one is picking fights on price, one is repositioning upmarket.';
    expect(ofType(text, 'subscript')).toEqual([]);
  });

  test('does NOT strike on hyphenated tokens via dash-strike', () => {
    expect(ofType('time-to-value', 'strikethrough')).toEqual([]);
    expect(ofType('time-to-value', 'org-strike')).toEqual([]);
  });

  test('parses *Strength:* / *Weakness:* / *Pricing:* on one paragraph as separate bold spans', () => {
    const text = '*Strength:* Cheap, fast, big community. *Weakness:* Reliability dips, support is volunteer-led. *Pricing:* $19/seat/mo, generous free tier.';
    const bolds = ofType(text, 'bold').map((s: any) => s.content);
    expect(bolds).toEqual(['Strength:', 'Weakness:', 'Pricing:']);
  });

  test('still parses org-strike with +text+', () => {
    const out = ofType('this is +cancelled+ text', 'org-strike');
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toBe('cancelled');
  });

  test('still parses italic with /text/ at proper boundaries', () => {
    const out = ofType('an /italic/ word', 'italic');
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toBe('italic');
  });

  test('does NOT italicise a slash mid-word', () => {
    expect(ofType('time/space tradeoff', 'italic')).toEqual([]);
  });
});
