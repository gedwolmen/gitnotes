import { markdownTestCases } from './helpers/markdownTestCases';
import { parseWikiLinks, type WikiLink } from '../src/utils/wikiLinksParser';

describe('parseWikiLinks', () => {
  const expectLink = (
    link: WikiLink,
    source: string,
    target: string,
    displayText: string,
  ) => {
    expect(link.target).toBe(target);
    expect(link.displayText).toBe(displayText);
    expect(source.slice(link.startIndex, link.endIndex)).toBe(
      displayText === target ? `[[${target}]]` : `[[${target}|${displayText}]]`,
    );
  };

  test('parses a simple wiki link', () => {
    const source = 'See [[PageName]] for details.';
    const links = parseWikiLinks(source);

    expect(links).toHaveLength(1);
    expectLink(links[0]!, source, 'PageName', 'PageName');
  });

  test('parses a wiki link with display text', () => {
    const source = markdownTestCases.wikiLinks;
    const links = parseWikiLinks(source);

    expect(links).toHaveLength(2);
    expectLink(links[0]!, source, 'PageName', 'PageName');
    expectLink(links[1]!, source, 'PageName', 'Display Text');
  });

  test('parses multiple links in one line', () => {
    const source = 'First [[Alpha]] then [[Beta|Shown Beta]] end.';
    const links = parseWikiLinks(source);

    expect(links).toHaveLength(2);
    expectLink(links[0]!, source, 'Alpha', 'Alpha');
    expectLink(links[1]!, source, 'Beta', 'Shown Beta');
  });

  test('ignores escaped wiki links', () => {
    const source = 'Escaped \\[[not a link]] and real [[Page]].';
    const links = parseWikiLinks(source);

    expect(links).toHaveLength(1);
    expectLink(links[0]!, source, 'Page', 'Page');
  });

  test('ignores wiki links inside code blocks', () => {
    const source = [
      'Outside [[Visible]].',
      '```md',
      'Inside [[Hidden]].',
      '```',
      'After [[Shown]].',
    ].join('\n');
    const links = parseWikiLinks(source);

    expect(links).toHaveLength(2);
    expectLink(links[0]!, source, 'Visible', 'Visible');
    expectLink(links[1]!, source, 'Shown', 'Shown');
  });

  test('parses links from the shared wikiLinks fixture', () => {
    const links = parseWikiLinks(markdownTestCases.wikiLinks);

    expect(links.map((link) => link.target)).toEqual(['PageName', 'PageName']);
  });
});
