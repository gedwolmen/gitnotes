/**
 * Issue #688: post-#679 multi-math line still broken — math expressions
 * render twice (raw `$…$` + parsed chip), prose between them loses chars.
 *
 * Hypothesis: inside processMarkdown, parseMath() is called once and the
 * returned segments' startIndex/endIndex point into the pre-block-math-
 * substitution text. Block math is substituted FIRST (line 184), shifting
 * the text. Then inline math is substituted using STALE indices computed
 * against the original text — landing on wrong characters of the post-
 * block-substitution string. Result: original `$inline$` source remains
 * visible at its true position AND a token appears at the stale offset,
 * overwriting preceding prose chars.
 *
 * The probe note that triggers the user's repro has block math earlier in
 * the document followed by an inline-math-heavy paragraph.
 */

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
    useMarkdownWithComponents: () => null,
  };
});

import { processMarkdownForTest } from '../../src/utils/markdownRenderer';
import { INLINE_MATH_TOKEN_PREFIX } from '../../src/utils/inlineTokens';

describe('processMarkdown: block-then-inline math (issue #688)', () => {
  test('inline math after block math: substitution lands on the correct chars', () => {
    const input = [
      'Pre block math:',
      '',
      '$$E = mc^2$$',
      '',
      'Mixed: when $a \\neq 0$, the equation $ax^2 + bx + c = 0$ has solutions $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$.',
    ].join('\n');

    const result = processMarkdownForTest(input);

    // No raw `$…$` survives in the processed markdown
    expect(result.markdown).not.toMatch(/\$[^$\n]+\$/);

    // All three inline math tokens present, in source order
    expect(result.inlineMath).toHaveLength(3);
    expect(result.inlineMath[0].content).toBe('a \\neq 0');
    expect(result.inlineMath[1].content).toBe('ax^2 + bx + c = 0');
    expect(result.inlineMath[2].content).toBe('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');

    // Prose between inline math segments is preserved verbatim
    expect(result.markdown).toContain('Mixed: when ');
    expect(result.markdown).toContain(', the equation ');
    expect(result.markdown).toContain(' has solutions ');

    // Tokens appear in source order in the processed markdown
    const t0Pos = result.markdown.indexOf(`${INLINE_MATH_TOKEN_PREFIX}0`);
    const t1Pos = result.markdown.indexOf(`${INLINE_MATH_TOKEN_PREFIX}1`);
    const t2Pos = result.markdown.indexOf(`${INLINE_MATH_TOKEN_PREFIX}2`);
    expect(t0Pos).toBeGreaterThan(0);
    expect(t1Pos).toBeGreaterThan(t0Pos);
    expect(t2Pos).toBeGreaterThan(t1Pos);
  });
});
