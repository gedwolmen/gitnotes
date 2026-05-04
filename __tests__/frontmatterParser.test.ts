import { markdownTestCases } from './helpers/markdownTestCases';
import { parseFrontmatter, type FrontmatterResult } from '../src/utils/frontmatterParser';

describe('parseFrontmatter', () => {
  test('parses basic frontmatter and returns body text', () => {
    const input = '---\ntitle: Hello\ntags: [a, b]\n---\nContent';
    const result = parseFrontmatter(input);

    expect(result).toMatchObject<FrontmatterResult>({
      frontmatter: { title: 'Hello', tags: ['a', 'b'] },
      body: 'Content',
      frontmatterStart: 0,
      frontmatterEnd: input.indexOf('Content'),
    });
  });

  test('returns empty frontmatter when none exists', () => {
    const input = 'Just body text\nwith multiple lines';
    const result = parseFrontmatter(input);

    expect(result).toEqual({
      frontmatter: {},
      body: input,
      frontmatterStart: -1,
      frontmatterEnd: -1,
    });
  });

  test('parses numbers, booleans, and dates', () => {
    const input = [
      '---',
      'count: 12.5',
      'published: 2024-01-02T03:04:05.000Z',
      'enabled: true',
      '---',
      'Body',
    ].join('\n');

    const result = parseFrontmatter(input);

    expect(result.frontmatter).toEqual({
      count: 12.5,
      published: new Date('2024-01-02T03:04:05.000Z'),
      enabled: true,
    });
  });

  test('treats malformed unclosed frontmatter as body text', () => {
    const input = '---\ntitle: Broken\nbody line';
    const result = parseFrontmatter(input);

    expect(result).toEqual({
      frontmatter: {},
      body: input,
      frontmatterStart: -1,
      frontmatterEnd: -1,
    });
  });

  test('parses empty frontmatter block', () => {
    const input = '---\n---\nBody';
    const result = parseFrontmatter(input);

    expect(result).toEqual({
      frontmatter: {},
      body: 'Body',
      frontmatterStart: 0,
      frontmatterEnd: input.indexOf('Body'),
    });
  });

  test('parses helper frontmatter fixture', () => {
    const result = parseFrontmatter(markdownTestCases.frontmatter);

    expect(result.frontmatter).toEqual({
      title: 'Test',
      tags: ['a', 'b'],
    });
    expect(result.body).toBe('Body text');
  });
});
