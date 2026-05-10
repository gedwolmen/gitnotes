import { splitInlineTokens } from '../../src/utils/inlineTokens';

describe('splitInlineTokens (issue #670)', () => {
  test('returns single text node when no tokens present', () => {
    const out = splitInlineTokens('plain text only');
    expect(out).toEqual([{ type: 'text', value: 'plain text only' }]);
  });

  test('matches a single token surrounded by text', () => {
    const out = splitInlineTokens('before GITNOTESINLINEMATHTOKEN0 after');
    expect(out).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'token', value: 'GITNOTESINLINEMATHTOKEN0' },
      { type: 'text', value: ' after' },
    ]);
  });

  test('matches MULTIPLE tokens on one line without dropping characters', () => {
    const input =
      'when GITNOTESINLINEMATHTOKEN0, the equation GITNOTESINLINEMATHTOKEN1 has solutions GITNOTESINLINEMATHTOKEN2.';
    const out = splitInlineTokens(input);

    const tokens = out.filter((s) => s.type === 'token');
    expect(tokens).toHaveLength(3);
    expect(tokens[0].value).toBe('GITNOTESINLINEMATHTOKEN0');
    expect(tokens[1].value).toBe('GITNOTESINLINEMATHTOKEN1');
    expect(tokens[2].value).toBe('GITNOTESINLINEMATHTOKEN2');

    const reconstructed = out.map((s) => s.value).join('');
    expect(reconstructed).toBe(input);
  });

  test('repeated calls do not leak state (regression for stateful global regex)', () => {
    const input = 'a GITNOTESINLINEMATHTOKEN0 b GITNOTESINLINEMATHTOKEN1 c';
    const first = splitInlineTokens(input);
    const second = splitInlineTokens(input);
    expect(second).toEqual(first);
    expect(second.filter((s) => s.type === 'token')).toHaveLength(2);
  });

  test('also matches GITNOTESWIKILINKTOKEN tokens', () => {
    const out = splitInlineTokens('see GITNOTESWIKILINKTOKEN3 for more');
    const tokens = out.filter((s) => s.type === 'token');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].value).toBe('GITNOTESWIKILINKTOKEN3');
  });
});
