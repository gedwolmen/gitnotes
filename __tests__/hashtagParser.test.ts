import { parseHashtags } from '../src/utils/hashtagParser';

describe('parseHashtags', () => {
  test('extracts a basic hashtag', () => {
    expect(parseHashtags('Working on #project').tags).toEqual(['project']);
  });

  test('extracts multiple hashtags in order', () => {
    expect(parseHashtags('#alpha #beta').tags).toEqual(['alpha', 'beta']);
  });

  test('supports dashes in tags', () => {
    expect(parseHashtags('#project-alpha').tags).toEqual(['project-alpha']);
  });

  test('ignores hashtags inside fenced code blocks', () => {
    expect(parseHashtags('```\n#notatag\n```\n#real').tags).toEqual(['real']);
  });

  test('ignores hashtags inside inline code', () => {
    expect(parseHashtags('`#notatag` #real').tags).toEqual(['real']);
  });

  test('ignores markdown headings', () => {
    expect(parseHashtags('# Heading\n#tag').tags).toEqual(['tag']);
  });

  test('ignores hex colors', () => {
    expect(parseHashtags('color #fff and #abcdef').tags).toEqual([]);
  });

  test('ignores numeric hashes', () => {
    expect(parseHashtags('#123').tags).toEqual([]);
  });

  test('supports punctuation boundaries', () => {
    expect(parseHashtags('#tag, #tag.').tags).toEqual(['tag']);
  });

  test('normalizes tags to lowercase', () => {
    expect(parseHashtags('#Project #project').tags).toEqual(['project']);
  });

  test('returns positions for every extracted occurrence', () => {
    const result = parseHashtags('Alpha #tag beta #Tag');

    expect(result.tags).toEqual(['tag']);
    expect(result.positions).toEqual([
      { start: 6, end: 10, tag: 'tag' },
      { start: 16, end: 20, tag: 'tag' },
    ]);
  });

  test('ignores url fragments', () => {
    expect(parseHashtags('http://example.com#frag and #real').tags).toEqual(['real']);
  });

  test('ignores hash fragments inside markdown anchor links', () => {
    expect(
      parseHashtags(
        '- [Chapter 1: PetDesk](#chapter-1-petdesk-what-the-company-actually-does)\n#real',
      ).tags,
    ).toEqual(['real']);
  });

  test('ignores cross-file fragments in markdown links', () => {
    expect(
      parseHashtags('See [details](other.md#deep-dive) for more.\n#actual').tags,
    ).toEqual(['actual']);
  });

  test('ignores hashes inside image link URLs', () => {
    expect(parseHashtags('![alt](pic.png#variant) #actual').tags).toEqual(['actual']);
  });
});
