jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-marked', () => {
  class Renderer {
    getKey() {
      return Math.random().toString(36).slice(2);
    }
  }
  return {
    Renderer,
    ReactComponentRegistryProvider: ({ children }: any) => children,
    useMarkdown: () => null,
  };
});

import { parseMath } from '../../src/utils/mathParser';
import { splitInlineTokens, INLINE_MATH_TOKEN_PREFIX } from '../../src/utils/inlineTokens';

function replaceSegments<T extends { startIndex: number; endIndex: number }>(
  text: string,
  segments: T[],
  replacement: (segment: T, index: number) => string,
): string {
  return [...segments]
    .sort((left, right) => right.startIndex - left.startIndex)
    .reduce((output, segment, reverseIndex) => {
      const forwardIndex = segments.length - reverseIndex - 1;
      return `${output.slice(0, segment.startIndex)}${replacement(segment, forwardIndex)}${output.slice(segment.endIndex)}`;
    }, text);
}

describe('multi-math token roundtrip (issue #688)', () => {
  test('three inline math segments survive parse → replace → split intact', () => {
    const input =
      'Mixed: when $a \\neq 0$, the equation $ax^2 + bx + c = 0$ has solutions $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$.';

    const parsed = parseMath(input);
    const inline = parsed.filter((s) => s.type === 'inline');
    expect(inline).toHaveLength(3);

    const embeds = inline.map((s, i) => ({
      ...s,
      token: `${INLINE_MATH_TOKEN_PREFIX}${i}`,
    }));

    const replaced = replaceSegments(input, inline, (_seg, idx) => embeds[idx].token);

    // The replaced text should NOT contain any raw '$' delimiters anymore
    expect(replaced).not.toMatch(/\$/);

    // splitInlineTokens should recover all three tokens in order
    const tokens = splitInlineTokens(replaced).filter((s) => s.type === 'token');
    expect(tokens.map((t) => t.value)).toEqual([
      `${INLINE_MATH_TOKEN_PREFIX}0`,
      `${INLINE_MATH_TOKEN_PREFIX}1`,
      `${INLINE_MATH_TOKEN_PREFIX}2`,
    ]);

    // Reconstructing tokens back into math content yields the original prose
    const reconstructed = splitInlineTokens(replaced)
      .map((s) =>
        s.type === 'token'
          ? `$${embeds.find((e) => e.token === s.value)!.content}$`
          : s.value,
      )
      .join('');
    expect(reconstructed).toBe(input);
  });

  test('prose between math segments is preserved verbatim', () => {
    const input = 'A $x$ B $y$ C $z$ D';
    const inline = parseMath(input).filter((s) => s.type === 'inline');
    const embeds = inline.map((s, i) => ({
      ...s,
      token: `${INLINE_MATH_TOKEN_PREFIX}${i}`,
    }));
    const replaced = replaceSegments(input, inline, (_, idx) => embeds[idx].token);
    const split = splitInlineTokens(replaced);
    const textParts = split.filter((s) => s.type === 'text').map((s) => s.value);
    expect(textParts).toEqual(['A ', ' B ', ' C ', ' D']);
  });
});
