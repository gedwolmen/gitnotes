import { splitInlineTokens } from '../../src/utils/inlineTokens';

describe('splitInlineTokens (issue #670)', () => {
  test('returns single text node when no tokens present', () => {
    const out = splitInlineTokens('plain text only');
    expect(out).toEqual([{ type: 'text', value: 'plain text only' }]);
  });

  test('matches a single token surrounded by text', () => {
    const out = splitInlineTokens('before GITNOTES_INLINE_MATH_TOKEN_0__ after');
    expect(out).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'token', value: 'GITNOTES_INLINE_MATH_TOKEN_0__' },
      { type: 'text', value: ' after' },
    ]);
  });

  test('matches MULTIPLE tokens on one line without dropping characters', () => {
    const input =
      'when GITNOTES_INLINE_MATH_TOKEN_0__, the equation GITNOTES_INLINE_MATH_TOKEN_1__ has solutions GITNOTES_INLINE_MATH_TOKEN_2__.';
    const out = splitInlineTokens(input);

    const tokens = out.filter((s) => s.type === 'token');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].value).toBe('GITNOTES_INLINE_MATH_TOKEN_0__');
    expect(tokens[1].value).toBe('GITNOTES_INLINE_MATH_TOKEN_1__');
    expect(tokens[2].value).toBe('GITNOTES_INLINE_MATH_TOKEN_2__');

    const reconstructed = out.map((s) => s.value).join('');
    expect(reconstructed).toBe(input);
  });

  test('repeated calls do not leak state (regression for stateful global regex)', () => {
    const input = 'a GITNOTES_INLINE_MATH_TOKEN_0__ b GITNOTES_INLINE_MATH_TOKEN_1__ c';
    const first = splitInlineTokens(input);
    const second = splitInlineTokens(input);
    expect(second).toEqual(first);
    expect(second.filter((s) => s.type === 'token')).toHaveLength(2);
  });

  test('also matches GITNOTES_WIKI_LINK_TOKEN tokens', () => {
    const out = splitInlineTokens('see GITNOTES_WIKI_LINK_TOKEN_3__ for more');
    const tokens = out.filter((s) => s.type === 'token');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].value).toBe('GITNOTES_WIKI_LINK_TOKEN_3__');
  });
});
