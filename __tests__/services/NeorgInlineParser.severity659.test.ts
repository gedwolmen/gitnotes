import { NeorgInlineParser } from '../../src/services/NeorgInlineParser';

const strikes = (input: string) =>
  NeorgInlineParser.parseInline(input)
    .segments.filter((s) => s.type === 'markup' && s.markup?.type === 'strikethrough')
    .map((s) => s.markup!.content);

describe('NeorgInlineParser severity #659 examples', () => {
  test('paid-influencer in long sentence stays unstruck', () => {
    const out = strikes('This is a paid-influencer program in the lifestyle sense.');
    expect(out).toEqual([]);
  });

  test('two italic-with-dash sentences do not chain a strike between them', () => {
    const out = strikes(
      "This is /not/ a paid-influencer program in the lifestyle sense.\n" +
      "It's a /creator/-partnership effort with builders our audience already trusts.",
    );
    expect(out).toEqual([]);
  });

  test('follow-for-follow keeps both hyphens', () => {
    expect(strikes('follow-for-follow')).toEqual([]);
  });

  test('engagement-bait or AI-spam keeps both hyphens', () => {
    expect(strikes('engagement-bait or AI-spam')).toEqual([]);
  });

  test('/creator/-partnership construction yields no strike', () => {
    expect(strikes('It is a /creator/-partnership.')).toEqual([]);
  });
});
