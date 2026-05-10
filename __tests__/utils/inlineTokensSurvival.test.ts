import {
  INLINE_MATH_TOKEN_PREFIX,
  WIKI_LINK_TOKEN_PREFIX,
  INLINE_TOKEN_REGEX,
  splitInlineTokens,
} from '../../src/utils/inlineTokens';

const buildMathToken = (n: number) => `${INLINE_MATH_TOKEN_PREFIX}${n}`;
const buildWikiToken = (n: number) => `${WIKI_LINK_TOKEN_PREFIX}${n}`;

describe('inline tokens markdown-safety (issue #675)', () => {
  test.each([
    ['math token', buildMathToken(0)],
    ['math token at index 999', buildMathToken(999)],
    ['wiki token', buildWikiToken(3)],
  ])('%s contains no markdown-active characters', (_label, token) => {
    expect(token).not.toMatch(/[_*~`\[\]()<>$]/);
  });

  test('INLINE_TOKEN_REGEX matches the safe token format', () => {
    expect(buildMathToken(0)).toMatch(INLINE_TOKEN_REGEX);
    expect(buildMathToken(42)).toMatch(INLINE_TOKEN_REGEX);
    expect(buildWikiToken(5)).toMatch(INLINE_TOKEN_REGEX);
  });

  test('three tokens on one line all match', () => {
    const t0 = buildMathToken(0);
    const t1 = buildMathToken(1);
    const t2 = buildMathToken(2);
    const text = `when ${t0}, the equation ${t1} has solutions ${t2}.`;
    const tokens = splitInlineTokens(text).filter((s) => s.type === 'token');
    expect(tokens.map((t) => t.value)).toEqual([t0, t1, t2]);
  });

  test('emphasis-style markdown patterns do not match the token regex', () => {
    expect('an _italic_ word'.match(INLINE_TOKEN_REGEX)).toBeNull();
    expect('a __bold__ word'.match(INLINE_TOKEN_REGEX)).toBeNull();
  });

  test('a doubly-underscored word would NOT survive marked italic/bold parsing — guard against regression', () => {
    const wouldGetEatenByMarked = /_[A-Za-z0-9]+_/g;
    expect(buildMathToken(0)).not.toMatch(wouldGetEatenByMarked);
    expect(buildWikiToken(0)).not.toMatch(wouldGetEatenByMarked);
  });
});
