import { markdownTestCases } from './helpers/markdownTestCases';
import { decodeHtmlEntities } from '../src/utils/htmlEntities';

describe('decodeHtmlEntities', () => {
  test('decodes ampersand', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
  });

  test('decodes angle brackets and quotes', () => {
    expect(decodeHtmlEntities('&lt;&gt;&quot;&#39;')).toBe('<>"\'');
  });

  test('decodes decimal and hex numeric entities', () => {
    expect(decodeHtmlEntities('&#60; &#x3C;')).toBe('< <');
  });

  test('decodes mixed content', () => {
    expect(decodeHtmlEntities(markdownTestCases.htmlEntities)).toBe('Hello & "World"');
  });

  test('returns original text when no entities are present', () => {
    const input = 'Plain text without entities.';
    expect(decodeHtmlEntities(input)).toBe(input);
  });

  test('does not decode inside fenced code blocks', () => {
    const input = ['Outside &amp;', '```ts', 'const label = "&amp;";', '```', 'After &lt;'].join('\n');
    const output = ['Outside &', '```ts', 'const label = "&amp;";', '```', 'After <'].join('\n');

    expect(decodeHtmlEntities(input)).toBe(output);
  });

  test('decodes nbsp and apos named entities', () => {
    expect(decodeHtmlEntities('A&nbsp;B &apos;C&apos;')).toBe('A B \'C\'');
  });
});
