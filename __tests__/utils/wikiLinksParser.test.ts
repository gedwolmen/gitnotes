import { parseWikiLinks } from '../../src/utils/wikiLinksParser';

describe('parseWikiLinks', () => {
  test('parses basic wiki link', () => {
    const links = parseWikiLinks('[[My Note]]');
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBeUndefined();
  });
  
  test('parses block anchor wiki link', () => {
    const links = parseWikiLinks('[[My Note#^abc123]]');
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBe('abc123');
  });
  
  test('parses block anchor with display text', () => {
    const links = parseWikiLinks('[[My Note#^abc123|Click here]]');
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBe('abc123');
    expect(links[0].displayText).toBe('Click here');
  });
  
  test('parses heading plus block anchor', () => {
    const links = parseWikiLinks('[[My Note#Heading#^abc123]]');
    expect(links[0].target).toBe('My Note');
    expect(links[0].blockAnchor).toBe('abc123');
  });
});